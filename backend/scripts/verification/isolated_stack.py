"""Isolated manual stack: backend (+ optional Vite dev server) + seeding for browser acceptance.

WHY: a hand-started `uvicorn main:app` or `import main` seed script that sets only DATABASE_URL still
writes app.log into the project's logs/ (the file the developer's own server appends to) — found
2026-09-20. Manual acceptance must go through the SAME isolation the tests use, not a hand-made subset:

    every process this tool starts gets the environment built by tests/isolation.py::isolated_env —
    DATABASE_URL, LOG_DIR and the run directory (QUALITAS_TEST_DB_ROOT) inside ONE freshly created
    temp directory, plus QUALITAS_REQUIRE_ISOLATED_DB=1 — validated by core.startup_guard in THIS
    process before anything is spawned, and re-checked by main.py itself before it creates a log,
    a backup, a migration or seed data. Normal development / production start-up is untouched.

Usage (from backend/):
    python scripts/verification/isolated_stack.py up   [--port 8099] [--vite-script X.mjs --vite-port 3099]
                                                       [--env KEY=VALUE ...] [--log-dir DIR]
    python scripts/verification/isolated_stack.py seed --root RUN_DIR --script seed.py [args...]
    python scripts/verification/isolated_stack.py down --root RUN_DIR
    python scripts/verification/isolated_stack.py selftest        # proves bad LOG_DIRs are refused, using decoy dirs

`up` prints one JSON line with the run directory, database and log paths (never a password). `down` FIRST
validates the run directory, the tool marker and the state file, and only then — re-confirming each process's
identity (start time + this run's id in its command line) immediately before every signal — stops the
processes this run started and removes the directory. If a process's identity cannot be confirmed (PID reused,
`ps` unavailable, ...) it sends nothing, deletes nothing and says a person must look. No process-group kills.
"""
import argparse
import contextlib
import io
import json
import os
import secrets
import shutil
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "tests"))

import isolation                                         # noqa: E402  (the one shared environment builder)
from core.startup_guard import (                        # noqa: E402
    ENV_REQUIRE, ENV_ROOT, UnsafeDatabaseError, check_run_root,
)

MARKER = ".qualitas-isolated-run"
STATE = "stack-state.json"
PASSWORD_FILE = "admin-password"
_UNKNOWN = object()                                      # "could not find out" — never treated as "not ours" or "gone"
TERM_WAIT = 10.0                                         # seconds to wait after SIGTERM before the (re-confirmed) escalation


class Refused(Exception):
    """The run directory / marker / state file failed validation: nothing was signalled or deleted."""


class NeedsPerson(Exception):
    """A process's identity could not be confirmed (or it would not stop): nothing further was signalled or deleted."""


# ── run directory, marker, state: validated BEFORE anything is read for use, signalled or removed ──────────

def _new_run_dir():
    root = isolation.make_run_dir("qualitas-manual-")
    run_id = uuid.uuid4().hex
    (root / MARKER).write_text(json.dumps({"tool": "isolated_stack", "run_id": run_id}))
    return root, run_id


def _validated_root(path) -> tuple:
    """(resolved root, run_id) or Refused. Checks, in this order: not a symlink itself, strict temp sub-directory
    outside the project (symlinks resolved), marker is a regular file with a run id."""
    raw = Path(path)
    if raw.is_symlink():
        raise Refused(f"{raw} is a symbolic link.")
    try:
        root = check_run_root(str(raw))
    except UnsafeDatabaseError as e:
        raise Refused(str(e)) from e
    if not root.is_dir():
        raise Refused(f"{root} is not a directory.")
    marker = root / MARKER
    if marker.is_symlink() or not marker.is_file():
        raise Refused(f"{root} has no tool marker: it was not created by this tool.")
    try:
        meta = json.loads(marker.read_text())
        run_id = meta["run_id"]
        assert meta.get("tool") == "isolated_stack" and isinstance(run_id, str) and len(run_id) == 32
    except Exception as e:
        raise Refused(f"{marker} is not a valid tool marker.") from e
    return root, run_id


def _load_state(root: Path, run_id: str) -> dict:
    """The state file, fully validated (regular file inside the root, schema, run id, sane PIDs)."""
    f = root / STATE
    if f.is_symlink() or not f.is_file():
        raise Refused(f"{f} is missing or not a regular file.")
    try:
        st = json.loads(f.read_text())
    except Exception as e:
        raise Refused(f"{f} is not valid JSON.") from e
    if not isinstance(st, dict) or st.get("run_id") != run_id or st.get("root") != str(root):
        raise Refused("State file does not belong to this run directory.")
    procs = st.get("processes")
    if not isinstance(procs, dict) or not procs:
        raise Refused("State file lists no processes.")
    forbidden = {0, 1, os.getpid(), os.getppid()}
    for name, rec in procs.items():
        pid = rec.get("pid") if isinstance(rec, dict) else None
        if name not in ("backend", "vite") or type(pid) is not int or pid <= 1 or pid in forbidden or pid > 4194304:
            raise Refused(f"State file has an invalid process entry ({name!r}).")
        if not isinstance(rec.get("started"), str) or not rec["started"].strip():
            raise Refused(f"State file has no start time for {name!r}.")
    return st


# ── process identity: PID + start time + this run's id in the command line ──────────────────────────────

def _ps(field: str, pid: int):
    try:
        r = subprocess.run(["ps", "-o", f"{field}=", "-p", str(pid)], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return _UNKNOWN
    out = r.stdout.strip()
    if r.returncode == 0 and out:
        return out
    if not out and not r.stderr.strip():
        return None                                        # ps ran fine and found no such process
    return _UNKNOWN                                        # ps itself failed (permission, missing, ...)


def _proc_info(pid: int):
    """(started, command), None if no such process, or _UNKNOWN if that could not be determined."""
    started = _ps("lstart", pid)
    if started is _UNKNOWN:
        return _UNKNOWN
    if started is None:
        return None
    stat = _ps("stat", pid)
    if stat is _UNKNOWN:
        return _UNKNOWN
    if stat is None or stat.startswith("Z"):
        return None                                        # exited; only waiting to be reaped by its parent — it is gone
    command = _ps("command", pid)
    if command is _UNKNOWN:
        return _UNKNOWN
    if command is None:
        return None
    return started, command


def _identity(rec: dict, run_id: str) -> str:
    """'ours' | 'gone' | 'reused' (a different process now has that PID) | 'unknown' (cannot tell — never guess)."""
    info = _proc_info(rec["pid"])
    if info is _UNKNOWN:
        return "unknown"
    if info is None:
        return "gone"
    started, command = info
    if started != rec["started"]:
        return "reused"                                    # a process's start time cannot change: it is not the one we started
    return "ours" if run_id in command else "unknown"


def _send_signal(pid: int, sig) -> None:                   # the ONLY place a signal leaves this tool
    os.kill(pid, sig)


def _stop_recorded(processes: dict, run_id: str, term_wait=None, poll: float = 0.25) -> None:
    """Stop every recorded process that is still ours. Identity is re-confirmed immediately before EACH signal.
    'gone' and 'reused' need nothing. 'unknown' at any point => NeedsPerson, nothing further is sent."""
    term_wait = TERM_WAIT if term_wait is None else term_wait
    for name, rec in processes.items():
        state = _identity(rec, run_id)
        if state in ("gone", "reused"):
            continue
        if state == "unknown":
            raise NeedsPerson(f"Cannot confirm that PID {rec['pid']} ({name}) is this run's process; sent nothing.")
        _send_signal(rec["pid"], signal.SIGTERM)
        end = time.time() + term_wait
        while time.time() < end:
            state = _identity(rec, run_id)
            if state != "ours":
                break
            time.sleep(poll)
        state = _identity(rec, run_id)
        if state == "ours":                                # did not exit on TERM: escalate, after re-confirming once more
            _send_signal(rec["pid"], signal.SIGKILL)
            time.sleep(poll)
            state = _identity(rec, run_id)
        if state == "unknown" or state == "ours":
            raise NeedsPerson(f"{name} (PID {rec['pid']}) did not stop or could not be re-confirmed; not removing the run directory.")


def _stop_handles(handles) -> bool:
    """Stop processes THIS invocation started, using their Popen handles (immune to PID reuse). Every handle is
    attempted even if one raises; True only if ALL of them have really ended."""
    for p in handles:
        try:
            if p.poll() is None:
                p.terminate()
                try:
                    p.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    p.kill()
                    try:
                        p.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        pass
        except Exception:                                  # keep going: the remaining handles must still be stopped
            continue
    try:
        return all(p.poll() is not None for p in handles)
    except Exception:
        return False


def _remove_run_dir(root, run_id=None):
    root, marker_run_id = _validated_root(root)            # re-validated at the moment of deletion
    if run_id is not None and run_id != marker_run_id:
        raise Refused("Run id mismatch; not removing.")
    shutil.rmtree(root)


def _parse_env(pairs):
    out = {}
    for p in pairs or []:
        k, sep, v = p.partition("=")
        if not k or not sep:
            raise SystemExit(f"--env expects KEY=VALUE, got {p!r}")
        out[k] = v
    return out


def _wait_for(path: Path, needle: str, timeout: float, proc=None) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if path.exists() and needle in path.read_text(errors="ignore"):
            return True
        if proc is not None and proc.poll() is not None:
            return False
        time.sleep(0.5)
    return False


class _StartupFailed(Exception):
    """A readiness / identity failure inside `up`; carries the report fields."""
    def __init__(self, **info):
        super().__init__(str(info))
        self.info = info


def _redact(text: str, secrets_to_hide) -> str:
    for secret in secrets_to_hide:
        if secret:
            text = text.replace(secret, "***")
    return text


def _fail(root, run_id, handles, redact=(), **info):
    """THE failure boundary for `up`: make sure every process THIS run started has ended, and only then remove the
    directory. If a process will not stop (or the cleanup itself fails) the directory is LEFT in place and the report
    says so — cleanup is never claimed. The original failure fields are always included; secrets are masked."""
    try:
        stopped = _stop_handles(handles)
    except Exception as e:                                 # never let cleanup trouble hide the original failure
        stopped, info["cleanup_error"] = False, f"{type(e).__name__}: {e}"
    removed = False
    if stopped:
        try:
            _remove_run_dir(root, run_id)
            removed = True
        except Exception as e:
            info["cleanup_error"] = f"could not remove the run directory: {type(e).__name__}: {e}"
    if not removed:
        info["manual"] = (f"Cleanup is NOT complete: {'a process did not stop' if not stopped else 'the run directory could not be removed'}; "
                          f"the run directory {root} was left in place for a person to inspect and remove.")
    print(_redact(json.dumps({"ok": False, "cleaned_up": removed, **info}), redact))
    return 3


def _up(a, root, run_id, handles, secret_holder):
    db = root / "stack.db"
    admin_password = _parse_env(a.env).pop("INITIAL_ADMIN_PASSWORD", None) or secrets.token_urlsafe(24)   # per run, never fixed
    secret_holder.append(admin_password)
    pw_file = root / PASSWORD_FILE
    pw_file.write_text(admin_password)
    os.chmod(pw_file, 0o600)
    extra = {**_parse_env(a.env), "INITIAL_ADMIN_PASSWORD": admin_password}
    if a.log_dir:
        extra["LOG_DIR"] = a.log_dir
    try:
        env = isolation.isolated_env(db, root, extra)     # validated BEFORE anything is spawned
    except UnsafeDatabaseError as e:
        _remove_run_dir(root, run_id)
        print(json.dumps({"ok": False, "refused": str(e)}))
        return 2
    out = root / "uvicorn.out"
    # The run id sits in the command line so `down` can tell this process from a stranger that reused its PID.
    code = (isolation._CHILD_PRELUDE
            + f"# qualitas-stack-run:{run_id}\nimport uvicorn\nuvicorn.run('main:app', host='127.0.0.1', port={int(a.port)}, log_level='info')\n")
    with open(out, "w") as fh:
        server = subprocess.Popen([sys.executable, "-c", code], cwd=BACKEND, env=env, stdout=fh, stderr=subprocess.STDOUT)
    handles.append(server)                                 # from this line on, ANY failure stops it
    if not _wait_for(out, "Application startup complete", 120, server):
        raise _StartupFailed(failed_to_start=out.read_text(errors="ignore")[-800:])
    vite = None
    if a.vite_script:
        venv = {k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR") if k in os.environ}      # the dev server touches no DB or app log
        with open(root / "vite.out", "w") as fh:
            vite = subprocess.Popen(["node", a.vite_script, f"qualitas-stack-run={run_id}"], cwd=BACKEND.parent / "react-app",
                                    env=venv, stdout=fh, stderr=subprocess.STDOUT)
        handles.append(vite)
        if not _wait_for(root / "vite.out", "vite up", 60, vite):
            raise _StartupFailed(vite_failed=True)
    processes = {}
    for name, proc in (("backend", server), ("vite", vite)):
        if proc is None:
            continue
        info = _proc_info(proc.pid)
        if info is _UNKNOWN or info is None:
            raise _StartupFailed(identity_unavailable=f"Cannot record the identity of {name} (PID {proc.pid}); "
                                 "it would not be safe to stop later, so the stack was stopped and removed.")
        processes[name] = {"pid": proc.pid, "started": info[0]}
    state = {"ok": True, "run_id": run_id, "root": str(root), "db": str(db), "log_dir": env["LOG_DIR"], "processes": processes,
             "backend_port": a.port, "vite_port": a.vite_port if a.vite_script else None}
    (root / STATE).write_text(json.dumps(state))
    print(json.dumps(state))                              # no password in the output
    return 0


def cmd_up(a):
    """From the moment the run directory exists until the state file is written, ONE boundary owns cleanup: whatever
    raises (a Popen that cannot start, an output file that cannot be opened, an identity read, the state write, a
    readiness failure, Ctrl-C) first stops every process this run already started, and only after they have ended
    removes the directory. The original cause is always reported (never swallowed); passwords are masked."""
    root, run_id = _new_run_dir()
    handles, secret_holder = [], []
    try:
        return _up(a, root, run_id, handles, secret_holder)
    except _StartupFailed as e:
        return _fail(root, run_id, handles, redact=secret_holder, **e.info)
    except BaseException as e:                             # includes KeyboardInterrupt / SystemExit
        rc = _fail(root, run_id, handles, redact=secret_holder, error=f"{type(e).__name__}: {e}")
        if isinstance(e, (KeyboardInterrupt, SystemExit)):
            raise                                          # the interrupt is honoured — after the cleanup attempt
        return rc


def cmd_seed(a):
    try:
        root, run_id = _validated_root(a.root)
        st = _load_state(root, run_id)
    except Refused as e:
        print(json.dumps({"ok": False, "refused": str(e)}))
        return 2
    admin_password = (root / PASSWORD_FILE).read_text()
    extra = {**_parse_env(a.env)}
    extra.setdefault("INITIAL_ADMIN_PASSWORD", admin_password)                  # the SAME per-run credential `up` used
    env = isolation.isolated_env(st["db"], root, extra)
    code = (isolation._CHILD_PRELUDE
            + "import runpy, sys\nsys.argv = sys.argv[1:]\nrunpy.run_path(sys.argv[0], run_name='__main__')\n")
    r = subprocess.run([sys.executable, "-c", code, a.script, *a.args], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=600)
    sys.stdout.write(r.stdout.replace(admin_password, "***"))
    if r.returncode:
        sys.stderr.write(r.stderr[-2000:].replace(admin_password, "***"))
    return r.returncode


def cmd_down(a):
    # 1. EVERYTHING is validated first — before any PID is read for use, before any signal, before any deletion.
    try:
        root, run_id = _validated_root(a.root)
        st = _load_state(root, run_id)
    except Refused as e:
        print(json.dumps({"ok": False, "refused": str(e)}))
        return 2
    # 2. Stop only processes whose identity is re-confirmed right before each signal.
    try:
        _stop_recorded(st["processes"], run_id)
    except NeedsPerson as e:
        print(json.dumps({"ok": False, "manual": str(e), "left_in_place": str(root)}))
        return 4
    # 3. Only now the directory (validated again at the moment of removal).
    try:
        _remove_run_dir(root, run_id)
    except Refused as e:
        print(json.dumps({"ok": False, "refused": str(e)}))
        return 2
    print(json.dumps({"ok": True, "removed": str(root)}))
    return 0


def cmd_selftest(_a):
    """Bad LOG_DIRs are refused — in this process (before any spawn) AND by the application itself (before any
    log/backup/migration). Uses decoy temp directories only; never the development database, backups or logs."""
    results = []
    root, decoy = isolation.make_run_dir("qualitas-selftest-"), isolation.make_run_dir("qualitas-decoy-")
    try:
        (root / "logs_link").symlink_to(decoy, target_is_directory=True)
        for label, log_dir in (("outside the run dir", str(decoy / "logs")), ("relative", "logs"),
                               ("project logs/", str(BACKEND / "logs")), ("symlink out", str(root / "logs_link"))):
            try:
                isolation.isolated_env(root / "t.db", root, {"LOG_DIR": log_dir})
                results.append((f"parent check: {label}", False))
            except UnsafeDatabaseError:
                results.append((f"parent check: {label}", True))
        for label, log_dir in (("outside", str(decoy / "logs")), ("symlink", str(root / "logs_link"))):
            env = {k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR") if k in os.environ}
            env.update({"PYTHONPATH": str(BACKEND), "DATABASE_URL": "sqlite:///:memory:", ENV_REQUIRE: "1",
                        ENV_ROOT: str(root), "LOG_DIR": log_dir, "INITIAL_ADMIN_PASSWORD": secrets.token_urlsafe(12)})
            r = subprocess.run([sys.executable, "-c", "import main"], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120)
            ok = r.returncode != 0 and "UnsafeDatabaseError" in r.stderr and not any(decoy.iterdir())
            results.append((f"application refuses at start-up, nothing created: {label}", ok))
        # `down` on an unmarked directory: refused, and NOT ONE signal was attempted (checked by intercepting the sender)
        plain = root / "not-ours"
        plain.mkdir()
        (plain / STATE).write_text(json.dumps({"processes": {"backend": {"pid": 999999, "started": "x"}}}))
        sent = []
        real = globals()["_send_signal"]
        globals()["_send_signal"] = lambda pid, sig: sent.append((pid, sig))
        try:
            with contextlib.redirect_stdout(io.StringIO()):          # keep the refusal JSON out of the self-test report
                rc = cmd_down(argparse.Namespace(root=str(plain)))
        finally:
            globals()["_send_signal"] = real
        results.append(("`down` on an unmarked directory: refused, zero signals, nothing deleted", rc == 2 and not sent and plain.exists()))
    finally:
        shutil.rmtree(root, ignore_errors=True)
        shutil.rmtree(decoy, ignore_errors=True)
    for name, ok in results:
        print(("PASS " if ok else "FAIL ") + name)
    return 0 if all(ok for _, ok in results) else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    up = sub.add_parser("up"); up.add_argument("--port", type=int, default=8099); up.add_argument("--vite-script"); up.add_argument("--vite-port", type=int, default=3099)
    up.add_argument("--env", action="append"); up.add_argument("--log-dir")
    sd = sub.add_parser("seed"); sd.add_argument("--root", required=True); sd.add_argument("--script", required=True); sd.add_argument("--env", action="append"); sd.add_argument("args", nargs="*")
    dn = sub.add_parser("down"); dn.add_argument("--root", required=True)
    sub.add_parser("selftest")
    a = ap.parse_args(argv)
    return {"up": cmd_up, "seed": cmd_seed, "down": cmd_down, "selftest": cmd_selftest}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
