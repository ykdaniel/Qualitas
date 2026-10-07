"""The ONE way tests start the application, or a process that imports it (2026-09-20).

`import main` runs start-up: database backup (+ rotation that deletes old backups),
migrations, seeding. Without an explicit throwaway DATABASE_URL it does all of that to the
developer's own database (backend/qualitas.db) — which is what happened on 2026-09-20.

Use these helpers for every subprocess that imports `main` (or the seeder / migrations) and
call `require_isolated_fullstack()` before an in-process `import main`:

* the database URL is validated here, in the PARENT, before anything is spawned, using the same
  rules the application enforces itself (core.startup_guard): in-memory, or a file whose fully
  resolved path is inside the directory created for this run (a strict sub-directory of the temp
  dir, outside the project tree). Missing / relative / development DB / resolves elsewhere: refused;
* the child gets an EXPLICIT, minimal environment — no inherited DATABASE_URL, LOG_DIR,
  INITIAL_ADMIN_PASSWORD, ENVIRONMENT, SECRET_KEY or other application settings — with its own
  database, its own log directory under the run's directory, and QUALITAS_REQUIRE_ISOLATED_DB=1,
  which makes main.py itself re-check first thing, before logging, backup, migrations or seeding.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

from core.startup_guard import (
    ENV_REQUIRE, ENV_ROOT, ENV_UPLOAD_ROOT, UnsafeDatabaseError, check_isolated_database, check_log_dir, check_run_root, check_upload_root,
)

BACKEND = Path(__file__).resolve().parents[1]

# Only these are passed through from the parent: they say how to run Python, not what to run against.
_PASS_THROUGH = ("PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT",
                 "VIRTUAL_ENV", "PYTHONHASHSEED")

_CHILD_PRELUDE = (
    "from core.startup_guard import guard_if_required\n"
    "guard_if_required()\n"
)


def make_run_dir(prefix: str = "qualitas-test-") -> Path:
    """A fresh directory for one test run (strict sub-directory of the system temp dir)."""
    return Path(os.path.realpath(tempfile.mkdtemp(prefix=prefix)))


MEMORY_URL = "sqlite:///:memory:"


def sqlite_url(db_path) -> str:
    """URL for a file database, or the standard in-memory URL when db_path is None."""
    return MEMORY_URL if db_path is None else f"sqlite:///{db_path}"


def isolated_env(db_path, root, extra: Optional[dict] = None) -> dict:
    """The complete environment for a test child process. Validates first; raises UnsafeDatabaseError.

    `db_path=None` = in-memory database. Either way `root` (a directory created for this run) is
    required: it holds LOG_DIR, and the file database if there is one. LOG_DIR is always set by us to
    <root>/logs; a caller's `extra` may only give a LOG_DIR that itself resolves inside `root` —
    nothing inherited from the parent environment is ever used."""
    url = sqlite_url(db_path)
    check_isolated_database(url, str(root))
    log_dir = str(Path(root) / "logs")
    requested = (extra or {}).get("LOG_DIR")
    if requested is not None:
        log_dir = requested
    check_log_dir(log_dir, str(root))                  # before any process exists, before any file exists
    upload_root = str((extra or {}).get(ENV_UPLOAD_ROOT) or Path(root) / "uploads")
    check_upload_root(upload_root, str(root))          # attachments too: never the project's uploads/ folder
    env = {k: os.environ[k] for k in _PASS_THROUGH if k in os.environ}
    env["PYTHONPATH"] = str(BACKEND)
    env.update(extra or {})                             # per-test settings (INITIAL_ADMIN_PASSWORD, ENVIRONMENT, ...)
    env.update({                                        # the isolation variables always win
        "DATABASE_URL": url,
        ENV_ROOT: str(root),
        ENV_REQUIRE: "1",
        "LOG_DIR": log_dir,
        ENV_UPLOAD_ROOT: upload_root,
    })
    return env


def run_python(code: str, db_path, *args: str, root=None, extra_env: Optional[dict] = None,
               timeout: int = 300, check: bool = True) -> subprocess.CompletedProcess:
    """Run `python -c code args...` (cwd = backend, so `import main` works) against a validated
    throwaway database. The guard runs again inside the child before `code`.

    `db_path` is a file inside `root` (default: its directory) or None for in-memory (then `root` is required)."""
    if root is None:
        if db_path is None:
            raise UnsafeDatabaseError("An in-memory run still needs its own run directory (for LOG_DIR): pass root=.")
        root = Path(db_path).parent
    env = isolated_env(db_path, root, extra_env)
    r = subprocess.run([sys.executable, "-c", _CHILD_PRELUDE + code, *args], cwd=BACKEND, env=env,
                       capture_output=True, text=True, timeout=timeout)
    if check:
        assert r.returncode == 0, r.stdout[-1500:] + r.stderr[-3000:]
    return r


def require_isolated_fullstack() -> Path:
    """Call before an in-process `import main` (ACCEPT_FULLSTACK mode). Returns the run directory.

    * DATABASE_URL must be the standard in-memory URL or a file inside a dedicated sub-directory of the
      system temp dir (that directory is the run directory);
    * in-memory mode gets a run directory created here — logs must not fall back to the project's logs/;
    * LOG_DIR is set to <run directory>/logs and QUALITAS_UPLOAD_ROOT to <run directory>/uploads. A value already in the
      environment is accepted only if it already resolves inside the run directory; anything else (relative, project,
      elsewhere, symlink out) is refused. Everything is verified BEFORE main can be imported."""
    url = os.environ.get("DATABASE_URL")
    preset_root = os.environ.get(ENV_ROOT) or None
    created = False
    name = None
    if url and url.strip().startswith("sqlite"):
        from core.startup_guard import _parse_sqlite       # the same URL semantics the app will connect with
        name = _parse_sqlite(url.strip()).database
    if name and name not in (":memory:",) and os.path.isabs(name):
        root = Path(os.path.realpath(name)).parent
    elif preset_root:
        root = Path(os.path.realpath(preset_root))
    elif url and check_isolated_database(url, None) is None:
        root, created = make_run_dir(), True               # in-memory: its own run directory, for the logs
    else:
        root = None                                        # let the check below refuse with the precise reason
    try:
        check_isolated_database(url, str(root) if root else None)
        root = check_run_root(str(root))
        log_dir = os.environ.get("LOG_DIR") or str(root / "logs")
        check_log_dir(log_dir, str(root))
        upload_dir = os.environ.get(ENV_UPLOAD_ROOT) or str(root / "uploads")
        check_upload_root(upload_dir, str(root))
    except UnsafeDatabaseError:
        if created:                                        # never leave a directory behind for a refused configuration
            import shutil
            shutil.rmtree(root, ignore_errors=True)
        raise
    os.environ.update({ENV_REQUIRE: "1", ENV_ROOT: str(root), "LOG_DIR": log_dir, ENV_UPLOAD_ROOT: upload_dir})
    return root


__all__ = ["UnsafeDatabaseError", "isolated_env", "make_run_dir", "require_isolated_fullstack", "run_python", "sqlite_url"]
