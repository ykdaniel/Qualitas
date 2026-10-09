"""Test-isolation guard for anything that starts the application (2026-09-20).

Why: `import main` is not a harmless import — it runs the whole start-up: a backup of
the database (with rotation that DELETES old backups), migrations and seeding. With no
DATABASE_URL the default is `sqlite:///./qualitas.db`, i.e. the developer's own database.
On 2026-09-20 a bare `import main` from a checking command did exactly that.

This module is the single definition of "a database a test may start the app against":

* an in-memory SQLite database — one of exactly three URL forms, decided from how SQLAlchemy itself
  parses the URL, not from string prefixes: `sqlite://`, `sqlite:///:memory:`, or `sqlite:///` (empty
  database name). Only the plain `sqlite` / `sqlite+pysqlite` drivers are accepted, with no query
  parameters. So `sqlite:///:memory:probe.db`, which is a FILE in the working directory, is not
  "memory"; or
* a SQLite file whose fully resolved path (symlinks and `..` followed) lies inside a
  directory created for this run — a strict sub-directory of the system temp dir —
  and never inside the project tree / the development database's own location.

Everything else — missing or empty value, non-SQLite URL or any other driver (e.g. aiosqlite),
relative path, query parameters or `file:` URI forms, host / credentials in the URL, the project's
development database, anything resolving outside the allowed directory — is refused.

DATABASE isolation and LOG isolation are separate checks and both always apply: the application
writes app.log / error.log to LOG_DIR (default `logs` = backend/logs) at start-up, whatever the
database is, so LOG_DIR must also be set, absolute and resolve inside the run's directory.

The application itself only enforces this when it is asked to (QUALITAS_REQUIRE_ISOLATED_DB=1,
set by the test helpers for every process they start); normal development and production
start-up is untouched. ATTACHMENTS are a third thing that must stay out of the project: the upload root (QUALITAS_UPLOAD_ROOT, read by
core/uploads.py) must likewise be set and lie inside the run's directory. When enforced, the check runs FIRST in main.py — before logging,
backup, backup rotation, migrations, seeding, the scheduler or any request handling.
"""
import os
import tempfile
from pathlib import Path
from typing import Optional

ENV_REQUIRE = "QUALITAS_REQUIRE_ISOLATED_DB"     # "1": this process must pass the check below
ENV_ROOT = "QUALITAS_TEST_DB_ROOT"               # the only directory a database may live in
ENV_UPLOAD_ROOT = "QUALITAS_UPLOAD_ROOT"         # where attachments are stored (see core/uploads.py); default backend/uploads

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


class UnsafeDatabaseError(RuntimeError):
    """The configured database is not an isolated test database; nothing was started."""


def _real(p) -> Path:
    return Path(os.path.realpath(str(p)))


def _inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _parse_sqlite(url: str):
    """Parse the URL the way SQLAlchemy will connect with it — not by string prefixes.

    Returns the SQLAlchemy URL object, or raises UnsafeDatabaseError. For SQLite, SQLAlchemy takes
    `url.database` verbatim as the file name unless it is None / "" / ":memory:" (then: in-memory).
    So "sqlite:///:memory:probe.db" is the FILE ':memory:probe.db' (in the working directory) and
    "sqlite:///file::memory:" is the FILE 'file::memory:' — neither is an in-memory database."""
    from sqlalchemy.engine import make_url
    from sqlalchemy.exc import ArgumentError
    try:
        parsed = make_url(url)
    except ArgumentError as e:
        raise UnsafeDatabaseError(f"Unparseable DATABASE_URL: {e}") from e
    if parsed.get_backend_name() != "sqlite" or parsed.drivername not in ("sqlite", "sqlite+pysqlite"):
        raise UnsafeDatabaseError(f"Only the plain SQLite driver is allowed here (got {parsed.drivername!r}).")
    if parsed.query:
        raise UnsafeDatabaseError(
            "Query parameters / URI-style options are not supported for test databases "
            f"({sorted(parsed.query)}): they change how SQLAlchemy opens the database."
        )
    if parsed.host or parsed.username or parsed.password or parsed.port:
        raise UnsafeDatabaseError("Unrecognised SQLite URL form (host / credentials present).")
    return parsed


def check_run_root(root: Optional[str]) -> Path:
    """The directory created for this run: a strict sub-directory of the system temp dir, outside the project."""
    if not root:
        raise UnsafeDatabaseError("No directory was created for this test run (it holds the log directory and any database file).")
    real_root = _real(root)
    temp = _real(tempfile.gettempdir())
    if real_root == temp or not _inside(real_root, temp):
        raise UnsafeDatabaseError(f"The run directory must be a strict sub-directory of the system temp dir ({temp}).")
    if _inside(real_root, _real(PROJECT_DIR)) or _inside(_real(PROJECT_DIR), real_root):
        raise UnsafeDatabaseError("The run directory overlaps the project tree.")
    return real_root


def check_log_dir(log_dir: Optional[str], allowed_root: Optional[str]) -> Path:
    """LOG_DIR must be set, absolute, and — after resolving symlinks and '..' — inside the run directory.
    (The application's own default is the relative 'logs', i.e. backend/logs.)"""
    if not log_dir or not log_dir.strip():
        raise UnsafeDatabaseError("LOG_DIR is missing: the application would write its logs to the project's logs/ directory.")
    if not os.path.isabs(log_dir):
        raise UnsafeDatabaseError(f"LOG_DIR {log_dir!r} is a relative path: it would resolve inside the project.")
    root = check_run_root(allowed_root)
    real_log = _real(log_dir)                          # symlinks and '..' resolved BEFORE comparing
    if _inside(real_log, _real(PROJECT_DIR)):
        raise UnsafeDatabaseError("LOG_DIR points into the project tree.")
    if not _inside(real_log, root):
        raise UnsafeDatabaseError(f"LOG_DIR resolves outside the directory created for this run ({root}).")
    return real_log


def check_upload_root(upload_root: Optional[str], allowed_root: Optional[str]) -> Path:
    """QUALITAS_UPLOAD_ROOT must be set, absolute, and — after resolving symlinks and '..' — a strict sub-directory of the run directory.
    (Unset means the application's default, backend/uploads: the developer's own attachments.) Checked before any file is written."""
    if not upload_root or not upload_root.strip():
        raise UnsafeDatabaseError(f"{ENV_UPLOAD_ROOT} is missing: the application would store attachments in the project's uploads/ directory.")
    if not os.path.isabs(upload_root):
        raise UnsafeDatabaseError(f"{ENV_UPLOAD_ROOT} {upload_root!r} is a relative path: it would resolve inside the project.")
    root = check_run_root(allowed_root)
    real_up = _real(upload_root)                       # symlinks and '..' resolved BEFORE comparing
    if _inside(real_up, _real(PROJECT_DIR)):
        raise UnsafeDatabaseError(f"{ENV_UPLOAD_ROOT} points into the project tree.")
    if real_up == root or not _inside(real_up, root):
        raise UnsafeDatabaseError(f"{ENV_UPLOAD_ROOT} must be a strict sub-directory of the directory created for this run ({root}).")
    return real_up


def check_isolated_database(url: Optional[str], allowed_root: Optional[str]) -> Optional[Path]:
    """Return the resolved database file path (None for in-memory) or raise UnsafeDatabaseError.

    Only three URL forms mean "in memory": `sqlite://`, `sqlite:///:memory:` and `sqlite:///` (empty
    database name) — plain `sqlite` / `sqlite+pysqlite` driver, no query, no suffix (SQLAlchemy's own
    definition: database in None / "" / ":memory:"). EVERY other SQLite URL is a file and must be an absolute path that, fully resolved, lies inside
    `allowed_root` (see check_run_root)."""
    if not url or not url.strip():
        raise UnsafeDatabaseError(
            "DATABASE_URL is missing: the application would fall back to the development "
            "database (sqlite:///./qualitas.db). Refusing to start."
        )
    url = url.strip()
    if not url.startswith("sqlite"):
        raise UnsafeDatabaseError(f"Only SQLite test databases are allowed here (got scheme {url.split(':', 1)[0]!r}).")
    parsed = _parse_sqlite(url)
    name = parsed.database
    if name in (None, "", ":memory:"):
        return None                                    # SQLAlchemy's own definition of an in-memory SQLite database
    if name.startswith("file:"):
        raise UnsafeDatabaseError("SQLite 'file:' URI names are not supported for test databases.")
    if not os.path.isabs(name):
        raise UnsafeDatabaseError(
            f"DATABASE_URL {url!r} is a relative path: it would resolve inside the working directory "
            "(the project), not in a throwaway directory."
        )

    root = check_run_root(allowed_root)
    db = _real(name)                                  # symlinks and '..' resolved BEFORE comparing
    if db == _real(BACKEND_DIR / "qualitas.db") or _inside(db, _real(PROJECT_DIR)):
        raise UnsafeDatabaseError("DATABASE_URL points into the project tree (the development database lives there).")
    if not _inside(db, root):
        raise UnsafeDatabaseError(f"DATABASE_URL resolves outside the directory created for this run ({root}).")
    return db


def enforce_from_environment() -> None:
    """Check THIS process's own environment (not the settings default). Called first thing by
    main.py / migrations / seeding when QUALITAS_REQUIRE_ISOLATED_DB is set."""
    root = os.environ.get(ENV_ROOT)
    check_isolated_database(os.environ.get("DATABASE_URL"), root)
    check_log_dir(os.environ.get("LOG_DIR"), root)      # in-memory or file: the logs still must not land in the project
    check_upload_root(os.environ.get(ENV_UPLOAD_ROOT), root)   # ... and neither may uploaded files


def guard_if_required() -> None:
    """No-op unless the process was started as an isolated test process."""
    if os.environ.get(ENV_REQUIRE) == "1":
        enforce_from_environment()
