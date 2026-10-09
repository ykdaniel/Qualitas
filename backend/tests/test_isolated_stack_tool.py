"""scripts/verification/isolated_stack.py — lifecycle safety of the manual acceptance stack.

The tool builds every child environment with tests/isolation.py::isolated_env (same rules as the tests). Its
`down` must be unable to signal or delete anything it did not start:
  * the run directory, tool marker and state file are validated BEFORE any PID is read for use, before any
    signal, before any deletion;
  * a process is stopped only after its identity (start time + this run's id in its command line) is confirmed,
    re-confirmed immediately before EVERY signal; PID reuse or an unconfirmable identity => no signal, no delete;
  * startup-failure cleanup uses the Popen handles and removes the directory only after the processes ended.

Signals are intercepted (os.kill is replaced by a recorder/raiser) — no real foreign process can be signalled.
Real processes are used only where the TEST creates a harmless `sleep` child itself, and only if `ps` works.
No server is started (no socket is bound); nothing touches the development DB, backups or logs.
"""
import importlib.util
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

import isolation
from core import startup_guard as guard

BACKEND = Path(__file__).resolve().parents[1]
_REAL_KILL = os.kill                # captured before any test replaces it: used ONLY for children the tests create themselves
_REAL_POPEN = subprocess.Popen
_REAL_RMTREE = shutil.rmtree
_spec = importlib.util.spec_from_file_location("isolated_stack", BACKEND / "scripts" / "verification" / "isolated_stack.py")
stack = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(stack)


class _Args:
    port = 8099
    vite_script = None
    vite_port = 3099
    env = None
    log_dir = None


class _Down:
    def __init__(self, root):
        self.root = str(root)


@pytest.fixture
def run(monkeypatch):
    """A valid, marked run directory with a state file listing one fake backend process — plus a signal recorder
    and a hard failure if anything reaches os.kill directly (bypassing the tool's single sender)."""
    root, run_id = stack._new_run_dir()
    state = {"ok": True, "run_id": run_id, "root": str(root), "db": str(root / "stack.db"), "log_dir": str(root / "logs"),
             "processes": {"backend": {"pid": 424242, "started": "Sun Sep 20 13:16:58 2026"}}, "backend_port": 8099, "vite_port": None}
    (root / stack.STATE).write_text(json.dumps(state))
    sent = []
    monkeypatch.setattr(stack, "_send_signal", lambda pid, sig: sent.append((pid, sig)))
    monkeypatch.setattr(os, "kill", lambda *a, **k: (_ for _ in ()).throw(AssertionError(f"os.kill reached directly: {a}")))
    monkeypatch.setattr(stack, "TERM_WAIT", 0.3)
    info_calls = []
    real_info = stack._proc_info

    def spy(pid):
        info_calls.append(pid)
        return real_info(pid)
    monkeypatch.setattr(stack, "_proc_info", spy)
    ns = type("Run", (), {})()
    ns.root, ns.run_id, ns.state, ns.sent, ns.info_calls, ns.real_info = root, run_id, state, sent, info_calls, real_info
    yield ns
    shutil.rmtree(root, ignore_errors=True)


def _rewrite_state(run, **changes):
    st = {**run.state, **changes}
    (run.root / stack.STATE).write_text(json.dumps(st))


def _assert_untouched(run, capsys, rc, expected_rc=2):
    out = json.loads(capsys.readouterr().out)
    assert rc == expected_rc and out["ok"] is False
    assert run.sent == [] and run.info_calls == []                      # ZERO signals, and no PID was even looked at
    assert run.root.exists() and (run.root / stack.STATE).exists()      # ZERO deletions
    return out


# ══ 1. validation happens BEFORE any process is read, signalled or anything deleted ══════════════════

def test_down_on_a_directory_without_the_tool_marker_sends_nothing_reads_no_pid_and_deletes_nothing(run, capsys):
    (run.root / stack.MARKER).unlink()                                   # only stack-state.json with a fake PID remains
    out = _assert_untouched(run, capsys, stack.cmd_down(_Down(run.root)))
    assert "marker" in out["refused"]


@pytest.mark.parametrize("how", ["marker_garbage", "marker_wrong_tool", "marker_short_id", "marker_symlink", "state_missing", "state_symlink",
                                 "state_not_json", "state_wrong_run", "state_wrong_root", "no_processes", "empty_processes"])
def test_down_refuses_malformed_markers_and_states_with_zero_signals_and_zero_deletions(run, capsys, how, tmp_path):
    marker, state = run.root / stack.MARKER, run.root / stack.STATE
    if how == "marker_garbage":
        marker.write_text("not json")
    elif how == "marker_wrong_tool":
        marker.write_text(json.dumps({"tool": "someone_else", "run_id": run.run_id}))
    elif how == "marker_short_id":
        marker.write_text(json.dumps({"tool": "isolated_stack", "run_id": "abc"}))
    elif how == "marker_symlink":
        real = tmp_path / "real-marker"; real.write_text(marker.read_text()); marker.unlink(); marker.symlink_to(real)
    elif how == "state_missing":
        state.unlink()
    elif how == "state_symlink":
        real = tmp_path / "real-state"; real.write_text(state.read_text()); state.unlink(); state.symlink_to(real)
    elif how == "state_not_json":
        state.write_text("{nope")
    elif how == "state_wrong_run":
        _rewrite_state(run, run_id="0" * 32)
    elif how == "state_wrong_root":
        _rewrite_state(run, root="/somewhere/else")
    elif how == "no_processes":
        _rewrite_state(run, processes=None)
    elif how == "empty_processes":
        _rewrite_state(run, processes={})
    rc = stack.cmd_down(_Down(run.root))
    out = json.loads(capsys.readouterr().out)
    assert rc == 2 and out["ok"] is False and run.sent == [] and run.info_calls == [] and run.root.exists()


@pytest.mark.parametrize("bad_pid", [0, 1, -5, "4242", True, 4.5, None, 10 ** 12, "self", "parent"])
def test_down_refuses_invalid_or_dangerous_pids_before_touching_any_process(run, capsys, bad_pid):
    if bad_pid == "self":
        bad_pid = os.getpid()
    elif bad_pid == "parent":
        bad_pid = os.getppid()
    _rewrite_state(run, processes={"backend": {"pid": bad_pid, "started": "Sun Sep 20 13:16:58 2026"}})
    _assert_untouched(run, capsys, stack.cmd_down(_Down(run.root)))


@pytest.mark.parametrize("entry", [{"pid": 4242}, {"pid": 4242, "started": ""}, {"started": "x"}, "not-a-dict"])
def test_down_refuses_process_entries_without_identity_data(run, capsys, entry):
    _rewrite_state(run, processes={"backend": entry})
    _assert_untouched(run, capsys, stack.cmd_down(_Down(run.root)))


def test_down_refuses_unknown_process_names(run, capsys):
    _rewrite_state(run, processes={"postgres": {"pid": 4242, "started": "x"}})
    _assert_untouched(run, capsys, stack.cmd_down(_Down(run.root)))


def test_down_refuses_paths_outside_the_temp_area_and_symlinked_run_directories(run, capsys, tmp_path):
    for bad in (BACKEND, BACKEND / "logs", Path("/private/tmp"), Path("/")):
        assert stack.cmd_down(_Down(bad)) == 2
        assert json.loads(capsys.readouterr().out)["ok"] is False
    link = tmp_path / "link-to-run"
    link.symlink_to(run.root, target_is_directory=True)                  # a symlink to a VALID marked run dir is still refused
    assert stack.cmd_down(_Down(link)) == 2
    assert run.sent == [] and run.info_calls == [] and run.root.exists()


# ══ 2. process identity: PID reuse / unconfirmable => no signal, and no deletion unless provably not ours ══

def test_a_reused_pid_is_never_signalled_and_the_run_directory_is_then_safe_to_remove(run, monkeypatch, capsys):
    monkeypatch.setattr(stack, "_proc_info", lambda pid: ("Mon Sep 21 09:00:00 2026", "/usr/bin/some-stranger --arg"))   # different start time
    rc = stack.cmd_down(_Down(run.root))
    assert rc == 0 and json.loads(capsys.readouterr().out)["ok"] is True
    assert run.sent == [] and not run.root.exists()                      # our process is gone (its PID belongs to a stranger): nothing to signal


def test_same_start_time_but_not_this_runs_command_line_is_unconfirmable_so_nothing_is_sent_or_deleted(run, monkeypatch, capsys):
    monkeypatch.setattr(stack, "_proc_info", lambda pid: (run.state["processes"]["backend"]["started"], "/usr/bin/other --no-run-id"))
    rc = stack.cmd_down(_Down(run.root))
    out = json.loads(capsys.readouterr().out)
    assert rc == 4 and out["ok"] is False and "manual" in out and run.sent == [] and run.root.exists()


def test_when_ps_itself_fails_nothing_is_sent_and_nothing_is_deleted(run, monkeypatch, capsys):
    monkeypatch.setattr(stack, "_proc_info", lambda pid: stack._UNKNOWN)
    rc = stack.cmd_down(_Down(run.root))
    assert rc == 4 and json.loads(capsys.readouterr().out)["ok"] is False and run.sent == [] and run.root.exists()


def test_an_already_exited_process_is_handled_without_any_signal(run, monkeypatch, capsys):
    monkeypatch.setattr(stack, "_proc_info", lambda pid: None)
    assert stack.cmd_down(_Down(run.root)) == 0
    assert run.sent == [] and not run.root.exists()


def _fake_live_process(run, monkeypatch, *, dies_on_term=True, replaced_after_term=False):
    """A scripted process table: alive (ours) until signalled; records every signal through the tool's sender."""
    rec = run.state["processes"]["backend"]
    ours = (rec["started"], f"/usr/bin/python -c ... # qualitas-stack-run:{run.run_id} ...")
    alive = {"v": True, "replaced": False}

    def info(pid):
        if alive["replaced"]:
            return ("Tue Sep 22 10:00:00 2026", "/usr/bin/stranger")
        return ours if alive["v"] else None

    def send(pid, sig):
        run.sent.append((pid, sig))
        if sig == signal.SIGTERM and replaced_after_term:
            alive["replaced"] = True                                     # the PID is handed to a stranger right after our TERM
        elif sig == signal.SIGKILL or (sig == signal.SIGTERM and dies_on_term):
            alive["v"] = False
    monkeypatch.setattr(stack, "_proc_info", info)
    monkeypatch.setattr(stack, "_send_signal", send)


def test_a_genuine_run_process_is_terminated_once_and_the_directory_removed(run, monkeypatch, capsys):
    _fake_live_process(run, monkeypatch)
    assert stack.cmd_down(_Down(run.root)) == 0
    assert run.sent == [(424242, signal.SIGTERM)] and not run.root.exists()


def test_a_process_that_ignores_term_is_escalated_to_kill_after_reconfirmation(run, monkeypatch, capsys):
    _fake_live_process(run, monkeypatch, dies_on_term=False)
    assert stack.cmd_down(_Down(run.root)) == 0
    assert run.sent == [(424242, signal.SIGTERM), (424242, signal.SIGKILL)] and not run.root.exists()


def test_the_kill_is_not_sent_if_the_pid_was_taken_over_after_the_term(run, monkeypatch, capsys):
    _fake_live_process(run, monkeypatch, dies_on_term=False, replaced_after_term=True)
    assert stack.cmd_down(_Down(run.root)) == 0
    assert run.sent == [(424242, signal.SIGTERM)]                          # NO SIGKILL to the stranger


def test_a_process_that_will_not_die_leaves_the_directory_in_place_and_asks_for_a_person(run, monkeypatch, capsys):
    rec = run.state["processes"]["backend"]
    ours = (rec["started"], f"python # qualitas-stack-run:{run.run_id}")
    monkeypatch.setattr(stack, "_proc_info", lambda pid: ours)              # immortal
    rc = stack.cmd_down(_Down(run.root))
    assert rc == 4 and json.loads(capsys.readouterr().out)["ok"] is False and run.root.exists()
    assert [s for _, s in run.sent] == [signal.SIGTERM, signal.SIGKILL]


# ══ 3. with a REAL, harmless child that this test creates itself (needs a working `ps`) ═══════════════

def _reap(child):
    """Kill a child THIS TEST created (with the real os.kill, which the fixture replaced for everything else)."""
    if child.poll() is None:
        _REAL_KILL(child.pid, signal.SIGKILL)
        child.wait()


def _real_child(run):
    child = _REAL_POPEN([sys.executable, "-c", f"import time\n# qualitas-stack-run:{run.run_id}\ntime.sleep(120)\n"])
    info = run.real_info(child.pid)
    if info is stack._UNKNOWN or info is None:
        _reap(child)
        pytest.skip("`ps` is unavailable here (platform/sandbox limitation): real-process lifecycle not exercisable")
    return child, info


def test_real_child_is_stopped_by_down_and_the_directory_cleaned(run, monkeypatch, capsys):
    child, info = _real_child(run)
    try:
        # the tool's single sender, limited to THIS test's own child (the fixture made os.kill raise for everything else)
        monkeypatch.setattr(stack, "_send_signal", lambda pid, sig: _REAL_KILL(pid, sig) if pid == child.pid else pytest.fail(f"foreign pid {pid}"))
        _rewrite_state(run, processes={"backend": {"pid": child.pid, "started": info[0]}})
        assert stack.cmd_down(_Down(run.root)) == 0
        assert child.wait(timeout=10) is not None and not run.root.exists()
    finally:
        _reap(child)


def test_real_child_whose_recorded_start_time_differs_is_treated_as_pid_reuse_and_left_alone(run, monkeypatch, capsys):
    child, info = _real_child(run)
    try:
        _rewrite_state(run, processes={"backend": {"pid": child.pid, "started": "Sat Jan  1 00:00:00 2000"}})
        assert stack.cmd_down(_Down(run.root)) == 0
        assert run.sent == [] and child.poll() is None                    # the "stranger" was NOT touched
    finally:
        _reap(child)


# ══ 4. startup failure: same cleanup discipline, directory removed only after the processes ended ═════════

class _Handle:
    def __init__(self, root, ends_on="terminate", checks=None):
        self.root, self.ends_on, self.ended, self.calls, self.pid = root, ends_on, False, [], 31337
        self.dir_existed_when_waited = None

    def poll(self):
        return 0 if self.ended else None

    def terminate(self):
        self.calls.append("terminate")
        if self.ends_on == "terminate":
            self.ended = True

    def kill(self):
        self.calls.append("kill")
        if self.ends_on in ("terminate", "kill"):
            self.ended = True

    def wait(self, timeout=None):
        self.calls.append("wait")
        self.dir_existed_when_waited = self.root.exists()
        if not self.ended:
            raise subprocess.TimeoutExpired("x", timeout)
        return 0


def test_start_up_failure_stops_the_process_and_removes_the_directory_only_afterwards(run, capsys):
    h = _Handle(run.root)
    rc = stack._fail(run.root, run.run_id, [h], failed_to_start="boom")
    assert rc == 3 and h.ended and h.dir_existed_when_waited is True and not run.root.exists()
    assert h.calls[0] == "terminate"


def test_a_stubborn_process_gets_kill_and_the_directory_stays_if_it_never_ends(run, capsys):
    stubborn = _Handle(run.root, ends_on="kill")
    assert stack._fail(run.root, run.run_id, [stubborn], failed_to_start="x") == 3
    assert stubborn.calls[:2] == ["terminate", "wait"] and "kill" in stubborn.calls and not run.root.exists()
    immortal = _Handle(run.root, ends_on="never")
    root2, run_id2 = stack._new_run_dir()
    try:
        assert stack._fail(root2, run_id2, [immortal], failed_to_start="x") == 3
        assert root2.exists()                                              # NOT removed: a process may still be running
        assert "manual" in json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    finally:
        shutil.rmtree(root2, ignore_errors=True)


def test_an_already_exited_process_does_not_stop_the_other_cleanup(run, capsys):
    exited, other = _Handle(run.root), _Handle(run.root)
    exited.ended = True                                                    # e.g. the backend crashed on its own
    assert stack._fail(run.root, run.run_id, [exited, other], failed_to_start="x") == 3
    assert exited.calls == [] and other.ended and not run.root.exists()   # the second process was still stopped; directory removed once


def test_cmd_up_failure_end_to_end_leaves_no_process_and_no_directory(monkeypatch, capsys):
    """Real harmless children stand in for uvicorn / vite; the readiness wait is forced to fail."""
    spawned = []

    def fake_popen(argv, **kw):
        p = _REAL_POPEN([sys.executable, "-c", "import time; time.sleep(120)"])
        spawned.append(p)
        return p
    monkeypatch.setattr(stack.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(stack, "_wait_for", lambda *a, **k: False)
    before = set(p.name for p in Path(__import__("tempfile").gettempdir()).glob("qualitas-manual-*"))
    try:
        assert stack.cmd_up(_Args()) == 3
        assert spawned and all(p.poll() is not None for p in spawned)      # the process was stopped BEFORE the function returned
        assert set(p.name for p in Path(__import__("tempfile").gettempdir()).glob("qualitas-manual-*")) == before
    finally:
        for p in spawned:
            _reap(p)


def test_cmd_up_refuses_when_a_process_identity_cannot_be_recorded_and_cleans_up(monkeypatch, capsys):
    spawned = []

    def fake_popen(argv, **kw):
        p = _REAL_POPEN([sys.executable, "-c", "import time; time.sleep(120)"])
        spawned.append(p)
        return p
    monkeypatch.setattr(stack.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(stack, "_wait_for", lambda *a, **k: True)
    monkeypatch.setattr(stack, "_proc_info", lambda pid: stack._UNKNOWN)
    try:
        assert stack.cmd_up(_Args()) == 3
        out = json.loads(capsys.readouterr().out)
        assert "identity_unavailable" in out and all(p.poll() is not None for p in spawned)
    finally:
        for p in spawned:
            _reap(p)


# ══ 5. no fixed password ═══════════════════════════════════════════════════════════════════════════════

def test_the_tool_contains_no_fixed_credential_and_generates_a_different_one_each_run(monkeypatch, capsys):
    assert "Stack-Admin-Pw" not in (BACKEND / "scripts" / "verification" / "isolated_stack.py").read_text()
    seen_env, roots = [], []

    def fake_popen(argv, **kw):
        seen_env.append(kw.get("env", {}))
        return _Handle(Path("/nonexistent"))
    monkeypatch.setattr(stack.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(stack, "_wait_for", lambda *a, **k: True)
    monkeypatch.setattr(stack, "_proc_info", lambda pid: ("Sun Sep 20 13:16:58 2026", "cmd"))
    passwords = []
    try:
        for _ in range(2):
            assert stack.cmd_up(_Args()) == 0
            out = capsys.readouterr().out
            st = json.loads(out)
            roots.append(Path(st["root"]))
            pw = (Path(st["root"]) / stack.PASSWORD_FILE).read_text()
            passwords.append(pw)
            assert pw not in out and len(pw) >= 24                          # never printed
            assert oct((Path(st["root"]) / stack.PASSWORD_FILE).stat().st_mode & 0o777) == "0o600"
            assert seen_env[-1]["INITIAL_ADMIN_PASSWORD"] == pw             # the child got exactly this one
        assert passwords[0] != passwords[1]
    finally:
        for r in roots:
            shutil.rmtree(r, ignore_errors=True)


def test_seed_uses_the_same_credential_as_up_and_masks_it_in_output(monkeypatch, capsys, run):
    (run.root / stack.PASSWORD_FILE).write_text("per-run-secret-value-0123")
    seen = {}

    class R:
        returncode = 0
        stdout = "SEED ok per-run-secret-value-0123\n"
        stderr = ""

    def fake_run(argv, **kw):
        seen["env"] = kw["env"]
        return R()
    monkeypatch.setattr(stack.subprocess, "run", fake_run)
    assert stack.cmd_seed(type("A", (), {"root": str(run.root), "script": "x.py", "env": None, "args": []})()) == 0
    assert seen["env"]["INITIAL_ADMIN_PASSWORD"] == "per-run-secret-value-0123"
    out = capsys.readouterr().out
    assert "per-run-secret-value-0123" not in out and "***" in out


def test_seed_refuses_an_unvalidated_run_directory_before_spawning(run, monkeypatch, capsys):
    (run.root / stack.MARKER).unlink()
    monkeypatch.setattr(stack.subprocess, "run", lambda *a, **k: pytest.fail("spawned"))
    assert stack.cmd_seed(type("A", (), {"root": str(run.root), "script": "x.py", "env": None, "args": []})()) == 2


# ══ 6. earlier guarantees (kept) ═══════════════════════════════════════════════════════════════════════

def _temp_dirs_with_prefix(prefix):
    import tempfile
    return {p.name for p in Path(tempfile.gettempdir()).glob(prefix + "*")}


@pytest.mark.parametrize("bad", ["logs", str(BACKEND / "logs"), "/private/var/nowhere/logs"])
def test_up_refuses_a_bad_log_dir_before_spawning_and_leaves_no_run_directory(bad, monkeypatch, capsys):
    monkeypatch.setattr(stack.subprocess, "Popen", lambda *a, **k: pytest.fail("spawned"))
    before = _temp_dirs_with_prefix("qualitas-manual-")
    a = _Args(); a.log_dir = bad
    assert stack.cmd_up(a) == 2
    out = json.loads(capsys.readouterr().out)
    assert out["ok"] is False and "LOG_DIR" in out["refused"]
    assert _temp_dirs_with_prefix("qualitas-manual-") == before


def test_the_child_environment_is_the_shared_isolated_env_not_a_hand_made_subset(monkeypatch):
    seen = []
    real = isolation.isolated_env
    monkeypatch.setattr(isolation, "isolated_env", lambda *a, **k: (seen.append((a, k)), real(*a, **k))[1])
    monkeypatch.setattr(stack.subprocess, "Popen", lambda *a, **k: pytest.fail("spawned"))
    a = _Args(); a.log_dir = "logs"
    stack.cmd_up(a)
    assert seen and seen[0][0][0].name == "stack.db"
    root = isolation.make_run_dir()
    try:
        env = real(root / "stack.db", root, {"INITIAL_ADMIN_PASSWORD": "x"})
        assert env[guard.ENV_REQUIRE] == "1" and env[guard.ENV_ROOT] == str(root) and env["LOG_DIR"] == str(root / "logs")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_selftest_proves_refusals_including_zero_signals_for_an_unmarked_directory(capsys):
    rc = stack.cmd_selftest(None)
    out = capsys.readouterr().out
    assert rc == 0 and "FAIL" not in out and out.count("PASS") == 7


# ══ 7. ONE failure boundary from run-directory creation to state-file write ═══════════════════════════

class _Handles:
    """Factory for a scripted Popen: each call yields the next behaviour ('ok' handle or an exception to raise)."""
    def __init__(self, script):
        self.script, self.made, self.envs = list(script), [], []

    def __call__(self, argv, **kw):
        self.envs.append(kw.get("env"))
        step = self.script.pop(0)
        if isinstance(step, BaseException):
            raise step
        h = step if isinstance(step, _Handle) else _Handle(Path("/unset"))
        self.made.append(h)
        return h


@pytest.fixture
def boundary(monkeypatch):
    """cmd_up with scripted processes: readiness/identity succeed unless a test changes them; nothing is really started."""
    monkeypatch.setattr(stack, "_wait_for", lambda *a, **k: True)
    monkeypatch.setattr(stack, "_proc_info", lambda pid: ("Sun Sep 20 13:16:58 2026", "cmd"))
    before = _temp_dirs_with_prefix("qualitas-manual-")

    class B:
        pass
    b = B()
    b.before = before

    def install(script):
        f = _Handles(script)
        monkeypatch.setattr(stack.subprocess, "Popen", f)
        return f
    b.install = install
    b.leftover = lambda: _temp_dirs_with_prefix("qualitas-manual-") - before
    yield b
    import tempfile
    for name in list(b.leftover()):                                       # never leak a run dir out of a test
        _REAL_RMTREE(Path(tempfile.gettempdir()) / name, ignore_errors=True)


def _last_json(capsys):
    return json.loads(capsys.readouterr().out.strip().splitlines()[-1])


def test_first_process_cannot_be_created_no_run_directory_is_left(boundary, capsys):
    boundary.install([FileNotFoundError(2, "No such file or directory: 'python-missing'")])
    assert stack.cmd_up(_Args()) == 3
    out = _last_json(capsys)
    assert out["ok"] is False and out["cleaned_up"] is True and "FileNotFoundError" in out["error"]      # original cause kept
    assert boundary.leftover() == set()


def test_backend_started_then_vite_cannot_be_created_backend_is_stopped_before_the_directory_goes(boundary, capsys):
    """The reproduced gap: the second Popen raises FileNotFoundError (no `node`) — the running backend used to be abandoned."""
    backend = _Handle(Path("/unset"))
    f = boundary.install([backend, FileNotFoundError(2, "No such file or directory: 'node'")])
    a = _Args(); a.vite_script = "vite.mjs"
    assert stack.cmd_up(a) == 3
    out = _last_json(capsys)
    assert backend.calls[:2] == ["terminate", "wait"] and backend.ended                              # stopped, and waited for
    assert out["cleaned_up"] is True and "FileNotFoundError" in out["error"] and "node" in out["error"]
    assert boundary.leftover() == set() and len(f.made) == 1


def test_directory_removal_happens_only_after_the_process_has_ended(boundary, capsys, monkeypatch):
    order = []
    backend = _Handle(Path("/unset"))
    real_wait = backend.wait

    def wait(timeout=None):
        order.append(("wait", bool(_temp_dirs_with_prefix("qualitas-manual-") - boundary.before)))     # is the run dir still there?
        return real_wait(timeout)
    backend.wait = wait
    monkeypatch.setattr(stack.shutil, "rmtree", lambda *a, **k: (order.append(("rmtree", backend.ended)), _REAL_RMTREE(*a, **k))[1])
    boundary.install([backend, FileNotFoundError("node")])
    a = _Args(); a.vite_script = "vite.mjs"
    stack.cmd_up(a)
    assert order[0] == ("wait", True) and order[-1] == ("rmtree", True)                                # waited while the dir existed; removed after it ended


def test_both_processes_started_but_the_state_file_cannot_be_written_both_are_cleaned(boundary, capsys, monkeypatch):
    real_write = Path.write_text

    def write_text(self, *a, **k):
        if self.name == stack.STATE:
            raise OSError(28, "No space left on device")
        return real_write(self, *a, **k)
    monkeypatch.setattr(Path, "write_text", write_text)
    f = boundary.install([_Handle(Path("/unset")), _Handle(Path("/unset"))])
    a = _Args(); a.vite_script = "vite.mjs"
    assert stack.cmd_up(a) == 3
    out = _last_json(capsys)
    assert len(f.made) == 2 and all(h.ended for h in f.made) and out["cleaned_up"] is True and "No space left" in out["error"]
    assert boundary.leftover() == set()


def test_reading_a_process_identity_that_raises_still_cleans_up_both(boundary, capsys, monkeypatch):
    monkeypatch.setattr(stack, "_proc_info", lambda pid: (_ for _ in ()).throw(RuntimeError("ps exploded")))
    f = boundary.install([_Handle(Path("/unset")), _Handle(Path("/unset"))])
    a = _Args(); a.vite_script = "vite.mjs"
    assert stack.cmd_up(a) == 3
    assert all(h.ended for h in f.made) and "RuntimeError" in _last_json(capsys)["error"] and boundary.leftover() == set()


@pytest.mark.parametrize("which", ["uvicorn.out", "vite.out"])
def test_an_output_file_that_cannot_be_opened_is_inside_the_same_boundary(boundary, capsys, monkeypatch, which):
    real_new = stack._new_run_dir

    def new_run_dir():
        root, run_id = real_new()
        (root / which).mkdir()                                           # opening it for writing will raise IsADirectoryError
        return root, run_id
    monkeypatch.setattr(stack, "_new_run_dir", new_run_dir)
    f = boundary.install([_Handle(Path("/unset")), _Handle(Path("/unset"))])
    a = _Args(); a.vite_script = "vite.mjs"
    assert stack.cmd_up(a) == 3
    out = _last_json(capsys)
    assert "IsADirectoryError" in out["error"] and all(h.ended for h in f.made) and out["cleaned_up"] is True and boundary.leftover() == set()
    assert len(f.made) == (0 if which == "uvicorn.out" else 1)          # vite.out: the backend WAS already running and was stopped


@pytest.mark.parametrize("where", ["readiness_wait", "second_popen"])
def test_ctrl_c_during_start_up_stops_what_was_started_then_the_interrupt_propagates(boundary, capsys, monkeypatch, where):
    backend = _Handle(Path("/unset"))
    if where == "readiness_wait":
        boundary.install([backend])
        monkeypatch.setattr(stack, "_wait_for", lambda *a, **k: (_ for _ in ()).throw(KeyboardInterrupt()))
        a = _Args()
    else:
        boundary.install([backend, KeyboardInterrupt()])
        a = _Args(); a.vite_script = "vite.mjs"
    with pytest.raises(KeyboardInterrupt):
        stack.cmd_up(a)
    assert backend.ended and backend.calls[0] == "terminate" and boundary.leftover() == set()
    assert _last_json(capsys)["cleaned_up"] is True


def test_when_the_cleanup_itself_fails_the_directory_stays_the_cause_is_kept_and_success_is_not_claimed(boundary, capsys):
    immortal = _Handle(Path("/unset"), ends_on="never")
    boundary.install([immortal, FileNotFoundError(2, "No such file or directory: 'node'")])
    a = _Args(); a.vite_script = "vite.mjs"
    assert stack.cmd_up(a) == 3
    out = _last_json(capsys)
    assert out["cleaned_up"] is False and "NOT complete" in out["manual"] and "FileNotFoundError" in out["error"]      # cause AND failure both reported
    assert len(boundary.leftover()) == 1                                    # the run directory is kept for a person


def test_a_removal_failure_after_the_processes_ended_is_reported_not_hidden(boundary, capsys, monkeypatch):
    boundary.install([_Handle(Path("/unset")), FileNotFoundError("node")])
    monkeypatch.setattr(stack.shutil, "rmtree", lambda *a, **k: (_ for _ in ()).throw(PermissionError(13, "denied")))
    a = _Args(); a.vite_script = "vite.mjs"
    assert stack.cmd_up(a) == 3
    out = _last_json(capsys)
    assert out["cleaned_up"] is False and "could not remove" in out["cleanup_error"] and "FileNotFoundError" in out["error"]
    assert len(boundary.leftover()) == 1


def test_one_handle_that_raises_while_stopping_does_not_prevent_stopping_the_others(boundary, capsys, monkeypatch):
    class Angry(_Handle):
        def terminate(self):
            raise PermissionError(1, "not permitted")
    angry, calm = Angry(Path("/unset")), _Handle(Path("/unset"))
    boundary.install([angry, calm])
    real_write = Path.write_text
    monkeypatch.setattr(Path, "write_text", lambda self, *x, **k: (_ for _ in ()).throw(OSError("disk")) if self.name == stack.STATE else real_write(self, *x, **k))
    a = _Args(); a.vite_script = "vite.mjs"
    assert stack.cmd_up(a) == 3                                             # both started; the state write fails, so BOTH are in `handles`
    out = _last_json(capsys)
    assert calm.ended and not angry.ended and out["cleaned_up"] is False and "NOT complete" in out["manual"]


def test_no_temporary_password_appears_in_a_failure_report(boundary, capsys, monkeypatch):
    seen = {}

    def leaky(argv, **kw):
        seen["pw"] = kw["env"]["INITIAL_ADMIN_PASSWORD"]
        raise RuntimeError(f"cannot start with credentials {seen['pw']}")
    monkeypatch.setattr(stack.subprocess, "Popen", leaky)
    assert stack.cmd_up(_Args()) == 3
    out = capsys.readouterr().out
    assert seen["pw"] not in out and "***" in out and "RuntimeError" in out and boundary.leftover() == set()


def test_real_harmless_child_is_stopped_when_the_second_process_cannot_be_created(boundary, capsys, monkeypatch):
    """Same reproduction with a REAL child (created by the test, harmless) — handle-based, so no `ps` is needed."""
    made = []

    def factory(argv, **kw):
        if made:
            raise FileNotFoundError(2, "No such file or directory: 'node'")
        p = _REAL_POPEN([sys.executable, "-c", "import time; time.sleep(120)"])
        made.append(p)
        return p
    monkeypatch.setattr(stack.subprocess, "Popen", factory)
    a = _Args(); a.vite_script = "vite.mjs"
    try:
        assert stack.cmd_up(a) == 3
        assert made and made[0].poll() is not None                          # really ended before cmd_up returned
        assert _last_json(capsys)["cleaned_up"] is True and boundary.leftover() == set()
    finally:
        for p in made:
            if p.poll() is None:
                _REAL_KILL(p.pid, signal.SIGKILL); p.wait()
