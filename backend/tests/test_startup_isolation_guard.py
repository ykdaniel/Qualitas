"""Tests may only start the application against a throwaway database (2026-09-20).

Background: a bare `import main` from a checking command ran the whole start-up against the
developer's own backend/qualitas.db — backup, backup rotation (two old backups were deleted),
migrations, seeding. core.startup_guard defines what a test database may be; tests/isolation.py is
the shared entry point every start-up-capable test uses; main.py re-checks first thing (when asked)
before logging, backups, migrations, seeding, the scheduler or any request.

NOTHING here touches the real qualitas.db or backups/: refusals are proven with fake/decoy databases
in temp directories, and cases that name the development database are only ever passed to the pure
check function or to a child that imports core.startup_guard alone (never `main`).
"""
import hashlib
import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

import isolation
from core import startup_guard as guard
from core.startup_guard import UnsafeDatabaseError, check_isolated_database

BACKEND = Path(__file__).resolve().parents[1]


def _url(path) -> str:
    return f"sqlite:///{path}"


@pytest.fixture
def run_dir():
    d = isolation.make_run_dir()
    yield d
    import shutil
    shutil.rmtree(d, ignore_errors=True)


# ── 1. what counts as an isolated database ───────────────────────────────

def test_memory_databases_and_files_inside_the_run_directory_are_accepted(run_dir):
    assert check_isolated_database("sqlite://", None) is None
    assert check_isolated_database("sqlite:///:memory:", None) is None
    p = check_isolated_database(_url(run_dir / "t.db"), str(run_dir))
    assert p == run_dir / "t.db"
    (run_dir / "sub").mkdir()
    assert check_isolated_database(_url(run_dir / "sub" / "t.db"), str(run_dir)) == run_dir / "sub" / "t.db"


@pytest.mark.parametrize("url", [None, "", "   "])
def test_missing_or_empty_database_url_is_refused(url, run_dir):
    with pytest.raises(UnsafeDatabaseError, match="missing"):
        check_isolated_database(url, str(run_dir))


def test_non_sqlite_urls_are_refused(run_dir):
    for url in ("postgresql://u:p@localhost/db", "mysql://x/y"):
        with pytest.raises(UnsafeDatabaseError, match="SQLite"):
            check_isolated_database(url, str(run_dir))


@pytest.mark.parametrize("url", ["sqlite:///./qualitas.db", "sqlite:///qualitas.db", "sqlite:///./tmp-looking.db", "sqlite:///../x.db"])
def test_relative_paths_are_refused_even_if_they_look_harmless(url, run_dir):
    with pytest.raises(UnsafeDatabaseError, match="relative"):
        check_isolated_database(url, str(run_dir))


def test_the_development_database_and_anything_in_the_project_tree_is_refused(run_dir):
    dev = BACKEND / "qualitas.db"                                     # only ever passed to the pure check; never opened
    for path in (dev, BACKEND / "qualitas.db-wal", BACKEND / "backups" / "x.db", BACKEND.parent / "other.db"):
        with pytest.raises(UnsafeDatabaseError):
            check_isolated_database(_url(path), str(run_dir))


def test_a_path_that_resolves_outside_the_run_directory_is_refused(run_dir):
    other = isolation.make_run_dir()
    try:
        with pytest.raises(UnsafeDatabaseError, match="outside"):
            check_isolated_database(_url(other / "t.db"), str(run_dir))                        # another temp dir
        with pytest.raises(UnsafeDatabaseError, match="outside"):
            check_isolated_database(_url(run_dir / ".." / other.name / "t.db"), str(run_dir))  # '..' traversal
        (run_dir / "link").symlink_to(other, target_is_directory=True)
        with pytest.raises(UnsafeDatabaseError, match="outside"):
            check_isolated_database(_url(run_dir / "link" / "t.db"), str(run_dir))              # symlink out
    finally:
        import shutil
        shutil.rmtree(other, ignore_errors=True)


def test_symlink_pointing_into_the_project_is_refused(run_dir):
    (run_dir / "sneaky").symlink_to(BACKEND, target_is_directory=True)
    with pytest.raises(UnsafeDatabaseError):
        check_isolated_database(_url(run_dir / "sneaky" / "qualitas.db"), str(run_dir))


def test_the_allowed_directory_itself_must_be_a_strict_temp_subdirectory_outside_the_project():
    import tempfile
    with pytest.raises(UnsafeDatabaseError, match="strict sub-directory"):
        check_isolated_database(_url(Path(tempfile.gettempdir()) / "t.db"), tempfile.gettempdir())      # the temp dir itself
    with pytest.raises(UnsafeDatabaseError):
        check_isolated_database(_url(BACKEND / "t.db"), str(BACKEND))                                   # the project
    with pytest.raises(UnsafeDatabaseError):
        check_isolated_database(_url("/private/t.db"), "/private")                                      # elsewhere on disk
    with pytest.raises(UnsafeDatabaseError, match="No directory was created"):
        check_isolated_database(_url("/tmp/whatever.db"), None)                                         # a file DB needs a directory


# ── 2. the shared entry point validates BEFORE spawning, with an explicit environment ──

def test_run_python_refuses_an_unsafe_database_before_spawning_anything(run_dir, monkeypatch):
    def no_spawn(*a, **k):
        raise AssertionError("a process was spawned for an unsafe database")
    monkeypatch.setattr(subprocess, "run", no_spawn)
    other = isolation.make_run_dir()
    try:
        for bad in (BACKEND / "qualitas.db", other / "elsewhere.db", Path("relative.db")):
            with pytest.raises(UnsafeDatabaseError):
                isolation.run_python("import main", bad, root=run_dir)
    finally:
        import shutil
        shutil.rmtree(other, ignore_errors=True)


def test_the_child_environment_is_explicit_and_never_inherits_application_settings(run_dir, monkeypatch):
    for k, v in {"DATABASE_URL": "sqlite:///./qualitas.db", "LOG_DIR": "logs", "INITIAL_ADMIN_PASSWORD": "inherited-secret",
                 "SECRET_KEY": "inherited-key", "ENVIRONMENT": "production", "QUALITAS_TEST_DB_ROOT": "/nowhere",
                 "CORS_ORIGINS": "https://evil.example"}.items():
        monkeypatch.setenv(k, v)
    env = isolation.isolated_env(run_dir / "t.db", run_dir)
    assert env["DATABASE_URL"] == _url(run_dir / "t.db")
    assert env[guard.ENV_ROOT] == str(run_dir) and env[guard.ENV_REQUIRE] == "1"
    assert env["LOG_DIR"] == str(run_dir / "logs")
    for inherited in ("INITIAL_ADMIN_PASSWORD", "SECRET_KEY", "ENVIRONMENT", "CORS_ORIGINS"):
        assert inherited not in env                                                # only what the test passes explicitly
    # explicit per-test settings are honoured, but the isolation variables cannot be overridden
    env2 = isolation.isolated_env(run_dir / "t.db", run_dir, {"ENVIRONMENT": "staging", "DATABASE_URL": "sqlite:///./qualitas.db", guard.ENV_REQUIRE: "0"})
    assert env2["ENVIRONMENT"] == "staging" and env2["DATABASE_URL"] == _url(run_dir / "t.db") and env2[guard.ENV_REQUIRE] == "1"


def test_a_child_started_through_the_helper_uses_the_test_database_and_the_run_log_directory(run_dir):
    r = isolation.run_python("import os; print('DB=' + os.environ['DATABASE_URL']); print('LOG=' + os.environ['LOG_DIR'])",
                             run_dir / "t.db", extra_env={"ENVIRONMENT": "staging"})
    assert f"DB={_url(run_dir / 't.db')}" in r.stdout and f"LOG={run_dir / 'logs'}" in r.stdout


# ── 3. in-process full-stack mode ────────────────────────────────────────

@pytest.fixture(autouse=True)
def _isolation_variables_are_restored_exactly():
    """conftest points QUALITAS_UPLOAD_ROOT at a temp directory for the whole suite; these tests build their own run directories and must
    start from a clean slate (an upload root outside the run directory is — correctly — refused by require_isolated_fullstack).
    require_isolated_fullstack() writes os.environ DIRECTLY, which monkeypatch does not know about — so the variables are snapshotted here
    and put back exactly (set again, or removed) after every test, whatever the test did. (This fixture deliberately does NOT request
    `monkeypatch`: its teardown must run AFTER monkeypatch's undo, or the undo would put stale values back.) (This fixture deliberately does NOT request
    `monkeypatch`: its teardown must run AFTER monkeypatch's undo, or the undo would put stale values back.) (Before this, three tests left
    QUALITAS_REQUIRE_ISOLATED_DB=1 behind for whatever ran next.)"""
    keys = (guard.ENV_REQUIRE, guard.ENV_ROOT, guard.ENV_UPLOAD_ROOT, "LOG_DIR")
    saved = {k: os.environ.get(k) for k in keys}
    for k in keys:
        os.environ.pop(k, None)
    try:
        yield
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def test_require_isolated_fullstack_accepts_only_a_dedicated_temp_database(run_dir, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(UnsafeDatabaseError, match="missing"):
        isolation.require_isolated_fullstack()
    for bad in ("sqlite:///./qualitas.db", _url(BACKEND / "qualitas.db"), "postgresql://x/y", _url(Path("/private/tmp") / "loose.db")):
        monkeypatch.setenv("DATABASE_URL", bad)
        with pytest.raises(UnsafeDatabaseError):
            isolation.require_isolated_fullstack()
    monkeypatch.setenv("DATABASE_URL", _url(run_dir / "full.db"))
    monkeypatch.delenv("LOG_DIR", raising=False)
    isolation.require_isolated_fullstack()
    assert os.environ[guard.ENV_REQUIRE] == "1" and os.environ["LOG_DIR"] == str(run_dir / "logs")
    assert os.environ[guard.ENV_UPLOAD_ROOT] == str(run_dir / "uploads")
    for k in (guard.ENV_REQUIRE, guard.ENV_ROOT, "LOG_DIR", guard.ENV_UPLOAD_ROOT):
        monkeypatch.delenv(k, raising=False)


# ── 4. the application refuses on its own — before ANY side effect ───────

def _child_env(db_url, root, cwd_probe=None):
    base = {k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR", "LANG") if k in os.environ}
    base.update({"PYTHONPATH": str(BACKEND), guard.ENV_REQUIRE: "1", guard.ENV_ROOT: str(root),
                 "LOG_DIR": str(root / "logs"), guard.ENV_UPLOAD_ROOT: str(root / "uploads"),
                 "INITIAL_ADMIN_PASSWORD": "Guard-Test-Pw-123456", "ENVIRONMENT": "staging"})
    if db_url is not None:
        base["DATABASE_URL"] = db_url
    return base


def _sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def test_import_main_against_a_database_outside_the_allowed_directory_is_refused_with_no_side_effects():
    """A DECOY database (fake data, temp dir) stands in for 'someone else's database': the child is started with the
    guard ON and pointed at it. If the guard were late or missing, the decoy would get a backup directory, tables,
    a journal and a log — none of that may appear."""
    allowed, decoy_dir = isolation.make_run_dir(), isolation.make_run_dir()
    try:
        decoy = decoy_dir / "someone_elses.db"
        import sqlite3
        con = sqlite3.connect(decoy); con.execute("CREATE TABLE precious (v TEXT)"); con.execute("INSERT INTO precious VALUES ('keep')"); con.commit(); con.close()
        before = (_sha(decoy), decoy.stat().st_mtime_ns, sorted(p.name for p in decoy_dir.iterdir()))

        r = subprocess.run([sys.executable, "-c", "import main"], cwd=BACKEND, env=_child_env(_url(decoy), allowed),
                           capture_output=True, text=True, timeout=120)
        assert r.returncode != 0 and "UnsafeDatabaseError" in r.stderr and "outside" in r.stderr
        assert (_sha(decoy), decoy.stat().st_mtime_ns, sorted(p.name for p in decoy_dir.iterdir())) == before   # no backup dir, no journal, no tables
        assert not (decoy_dir / "backups").exists() and not (allowed / "logs").exists()
        con = sqlite3.connect(decoy)
        assert [r[0] for r in con.execute("select name from sqlite_master")] == ["precious"]
        con.close()
        for marker in ("Running database migrations", "Running database seeding", "Database backed up", "Removed old backup"):
            assert marker not in r.stdout + r.stderr
    finally:
        import shutil
        shutil.rmtree(allowed, ignore_errors=True); shutil.rmtree(decoy_dir, ignore_errors=True)


def test_import_main_with_a_relative_database_url_is_refused_and_creates_nothing_in_the_project():
    allowed = isolation.make_run_dir()
    probe = f"guard_probe_{uuid.uuid4().hex}.db"                        # would be created in backend/ if start-up ran
    backups = BACKEND / "backups"
    listing_before = sorted(os.listdir(backups)) if backups.exists() else None      # names only, read-only
    try:
        r = subprocess.run([sys.executable, "-c", "import main"], cwd=BACKEND, env=_child_env(f"sqlite:///./{probe}", allowed),
                           capture_output=True, text=True, timeout=120)
        assert r.returncode != 0 and "UnsafeDatabaseError" in r.stderr and "relative" in r.stderr
        assert not (BACKEND / probe).exists() and not (allowed / "logs").exists()
        assert (sorted(os.listdir(backups)) if backups.exists() else None) == listing_before             # no backup taken, none rotated away
    finally:
        import shutil
        shutil.rmtree(allowed, ignore_errors=True)
        (BACKEND / probe).unlink(missing_ok=True)


@pytest.mark.parametrize("db_url", [None, "sqlite:///./qualitas.db", _url(BACKEND / "qualitas.db"), "  "])
def test_a_missing_or_development_database_url_is_refused_by_the_guard_itself(db_url):
    """Child imports ONLY core.startup_guard (never `main`), so the development database cannot be touched even if this failed."""
    allowed = isolation.make_run_dir()
    try:
        r = subprocess.run([sys.executable, "-c", "from core.startup_guard import guard_if_required; guard_if_required()"], cwd=BACKEND,
                           env=_child_env(db_url, allowed), capture_output=True, text=True, timeout=60)
        assert r.returncode != 0 and "UnsafeDatabaseError" in r.stderr
    finally:
        import shutil
        shutil.rmtree(allowed, ignore_errors=True)


def test_without_the_flag_the_guard_is_a_no_op_so_normal_start_up_is_unchanged():
    r = subprocess.run([sys.executable, "-c", "from core.startup_guard import guard_if_required; guard_if_required(); print('ok')"], cwd=BACKEND,
                       env={"PATH": os.environ.get("PATH", ""), "PYTHONPATH": str(BACKEND)}, capture_output=True, text=True, timeout=60)
    assert r.returncode == 0 and "ok" in r.stdout


def test_the_guard_runs_before_everything_else_in_main_py():
    """Ordering, checked structurally: the guard call precedes every import that could reach a database, the logging
    set-up, the backup function's use, create_all, migrations and seeding."""
    src = (BACKEND / "main.py").read_text()
    call = src.index("\nguard_if_required()\n")
    for later in ("from fastapi import", "import db_migrations", "import db_seeder", "import models", "from database import",
                  "RotatingFileHandler(", "_backup_database()", "create_all_except_migration_owned(",
                  "db_migrations.run_migrations()", "db_seeder.run_seeding()"):
        assert src.index(later) > call, later
    assert src.index("import asyncio") < call
    # and the backup function checks again right before it copies / rotates anything
    body = src[src.index("def _backup_database"):]
    assert body.index("guard_if_required()") < body.index("shutil.copy2") < body.index("os.remove")


# ══ 5. in-memory detection follows SQLAlchemy's real semantics (2026-09-20, second review) ══

MEMORY_LOOKALIKES = [
    "sqlite:///:memory:probe.db",                       # a FILE named ':memory:probe.db' in the working directory
    "sqlite:///:memory:.db",
    "sqlite:///file::memory:",                          # a FILE named 'file::memory:' unless uri=true is passed
    "sqlite:///file::memory:?cache=shared",
    "sqlite:///file::memory:?cache=shared&uri=true",
    "sqlite:///:memory:?cache=shared",
    "sqlite:///:MEMORY:",
    "sqlite:////:memory:",                              # absolute path '/:memory:'
    "sqlite:///./:memory:",
]


@pytest.mark.parametrize("url", ["sqlite://", "sqlite:///:memory:", "sqlite:///", "  sqlite:///:memory:  "])
def test_only_the_standard_memory_urls_are_treated_as_memory(url):
    assert check_isolated_database(url, None) is None


@pytest.mark.parametrize("url", MEMORY_LOOKALIKES)
def test_memory_lookalikes_are_files_or_unsupported_and_go_through_the_file_rules(url, run_dir):
    with pytest.raises(UnsafeDatabaseError):
        check_isolated_database(url, str(run_dir))
    with pytest.raises(UnsafeDatabaseError):
        check_isolated_database(url, None)               # without a run directory they can never pass either


@pytest.mark.parametrize("name", [":memory:probe.db", "file::memory:", ":memory:.db"])
def test_a_memory_looking_file_name_is_accepted_only_as_a_file_inside_the_run_directory(name, run_dir):
    resolved = check_isolated_database(_url(run_dir / name), str(run_dir))
    assert resolved == run_dir / name                    # a real file path, not the memory exception
    other = isolation.make_run_dir()
    try:
        with pytest.raises(UnsafeDatabaseError, match="outside"):
            check_isolated_database(_url(other / name), str(run_dir))
    finally:
        import shutil
        shutil.rmtree(other, ignore_errors=True)


def test_sqlalchemy_really_treats_the_lookalikes_as_files_not_memory(run_dir, monkeypatch):
    """The claim behind the rule, verified in a TEMP working directory (never the project): connecting with the
    lookalike URLs creates a file there, connecting with the standard memory URL does not."""
    from sqlalchemy import create_engine
    monkeypatch.chdir(run_dir)
    for url, created in (("sqlite:///:memory:probe.db", ":memory:probe.db"), ("sqlite:///file::memory:", "file::memory:")):
        eng = create_engine(url)
        with eng.connect():
            pass
        eng.dispose()
        assert (run_dir / created).exists(), url
    before = sorted(p.name for p in run_dir.iterdir())
    eng = create_engine("sqlite:///:memory:")
    with eng.connect():
        pass
    eng.dispose()
    assert sorted(p.name for p in run_dir.iterdir()) == before


@pytest.mark.parametrize("url", ["sqlite:///x.db?mode=ro", "sqlite:///file:x.db?uri=true", "sqlite+aiosqlite:///:memory:", "sqlite://user:pw@host/db"])
def test_uri_query_and_other_driver_forms_are_refused_explicitly(url, run_dir):
    with pytest.raises(UnsafeDatabaseError):
        check_isolated_database(url, str(run_dir))


# ══ 6. LOG isolation is separate from database isolation and always applies ══

def test_log_dir_must_be_set_absolute_and_resolve_inside_the_run_directory(run_dir):
    (run_dir / "sub").mkdir()
    assert guard.check_log_dir(str(run_dir / "logs"), str(run_dir)) == run_dir / "logs"
    assert guard.check_log_dir(str(run_dir / "sub" / "deep" / "logs"), str(run_dir)) == run_dir / "sub" / "deep" / "logs"
    other = isolation.make_run_dir()
    (run_dir / "to_project").symlink_to(BACKEND, target_is_directory=True)
    (run_dir / "to_other").symlink_to(other, target_is_directory=True)
    try:
        for bad, why in ((None, "missing"), ("", "missing"), ("   ", "missing"), ("logs", "relative"), ("./logs", "relative"),
                         (str(BACKEND / "logs"), "project"), (str(BACKEND.parent / "logs"), "project"),
                         (str(other / "logs"), "outside"), (str(run_dir / ".." / other.name / "logs"), "outside"),
                         (str(run_dir / "to_project" / "logs"), "project"), (str(run_dir / "to_other" / "logs"), "outside")):
            with pytest.raises(UnsafeDatabaseError, match=why):
                guard.check_log_dir(bad, str(run_dir))
        with pytest.raises(UnsafeDatabaseError):
            guard.check_log_dir(str(run_dir / "logs"), None)              # no run directory at all
    finally:
        import shutil
        shutil.rmtree(other, ignore_errors=True)


def test_isolated_env_sets_log_dir_for_memory_and_file_modes_and_refuses_overrides_outside_the_run_directory(run_dir, monkeypatch):
    monkeypatch.setenv("LOG_DIR", str(BACKEND / "logs"))                # inherited value: must be ignored
    for db in (None, run_dir / "t.db"):
        env = isolation.isolated_env(db, run_dir)
        assert env["LOG_DIR"] == str(run_dir / "logs")
        assert env["DATABASE_URL"] == ("sqlite:///:memory:" if db is None else _url(db))
    assert isolation.isolated_env(None, run_dir, {"LOG_DIR": str(run_dir / "elsewhere" / "logs")})["LOG_DIR"] == str(run_dir / "elsewhere" / "logs")
    other = isolation.make_run_dir()
    (run_dir / "link").symlink_to(BACKEND / "logs" if (BACKEND / "logs").exists() else BACKEND, target_is_directory=True)
    try:
        for bad in (str(BACKEND / "logs"), "logs", str(other / "logs"), str(run_dir / "link"), str(run_dir / "link" / "x")):
            for db in (None, run_dir / "t.db"):
                with pytest.raises(UnsafeDatabaseError):
                    isolation.isolated_env(db, run_dir, {"LOG_DIR": bad})
    finally:
        import shutil
        shutil.rmtree(other, ignore_errors=True)


def test_an_in_memory_run_still_needs_its_own_run_directory(monkeypatch):
    def no_spawn(*a, **k):
        raise AssertionError("spawned")
    monkeypatch.setattr(subprocess, "run", no_spawn)
    with pytest.raises(UnsafeDatabaseError, match="run directory"):
        isolation.run_python("print(1)", None)


def _project_log_files():
    return [BACKEND / "logs" / n for n in ("app.log", "error.log") if (BACKEND / "logs" / n).exists()]


def _mentions(path: Path, needle: str) -> bool:
    return needle.encode() in path.read_bytes()                       # read-only; the needle is a unique temp path


def test_a_memory_mode_start_up_writes_its_logs_under_the_run_directory_and_not_into_the_project(run_dir):
    backups = BACKEND / "backups"
    listing = sorted(os.listdir(backups)) if backups.exists() else None
    r = isolation.run_python("import main; print('STARTED')", None, root=run_dir,
                             extra_env={"INITIAL_ADMIN_PASSWORD": "Guard-Test-Pw-123456", "ENVIRONMENT": "staging"}, timeout=240)
    assert "STARTED" in r.stdout
    log = run_dir / "logs" / "app.log"
    assert log.exists() and str(run_dir / "logs") in log.read_text()   # the app logged its own (isolated) directory
    assert not any(_mentions(f, str(run_dir)) for f in _project_log_files())      # nothing of this run reached backend/logs
    assert (sorted(os.listdir(backups)) if backups.exists() else None) == listing


def test_a_file_mode_start_up_also_logs_only_under_the_run_directory(run_dir):
    r = isolation.run_python("import main; print('STARTED')", run_dir / "t.db",
                             extra_env={"INITIAL_ADMIN_PASSWORD": "Guard-Test-Pw-123456", "ENVIRONMENT": "staging"}, timeout=240)
    assert "STARTED" in r.stdout and (run_dir / "logs" / "app.log").exists()
    assert not any(_mentions(f, str(run_dir)) for f in _project_log_files())


def _guarded_child(code, env_overrides, root, db_url="sqlite:///:memory:"):
    env = _child_env(db_url, root)
    env.update(env_overrides)
    return subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120)


@pytest.mark.parametrize("log_dir_factory", ["project_logs", "relative", "missing"])
def test_the_guard_refuses_a_project_relative_or_missing_log_dir_in_memory_mode_before_anything_is_written(log_dir_factory, run_dir):
    """Guard-only child (never imports main): a project logs/ path is only ever a string handed to the check."""
    overrides = {"project_logs": {"LOG_DIR": str(BACKEND / "logs")}, "relative": {"LOG_DIR": "logs"}, "missing": {}}[log_dir_factory]
    env = _child_env("sqlite:///:memory:", run_dir)
    env.pop("LOG_DIR", None)
    env.update(overrides)
    r = subprocess.run([sys.executable, "-c", "from core.startup_guard import guard_if_required; guard_if_required()"], cwd=BACKEND,
                       env=env, capture_output=True, text=True, timeout=60)
    assert r.returncode != 0 and "UnsafeDatabaseError" in r.stderr and "LOG_DIR" in r.stderr


@pytest.mark.parametrize("mode", ["outside", "symlink"])
def test_import_main_with_an_external_or_symlinked_log_dir_is_refused_before_logging_starts(mode, run_dir):
    """Decoy targets in temp dirs stand in for 'somewhere else': if the guard were late, logs would appear there."""
    decoy = isolation.make_run_dir()
    try:
        if mode == "outside":
            log_dir = decoy / "logs"
        else:
            (run_dir / "logs").symlink_to(decoy, target_is_directory=True)
            log_dir = run_dir / "logs"
        r = _guarded_child("import main", {"LOG_DIR": str(log_dir)}, run_dir)
        assert r.returncode != 0 and "UnsafeDatabaseError" in r.stderr and "LOG_DIR" in r.stderr
        assert list(decoy.iterdir()) == []                                     # no app.log / error.log / directory was created there
        for marker in ("Running database migrations", "Database backed up"):
            assert marker not in r.stdout + r.stderr
    finally:
        import shutil
        shutil.rmtree(decoy, ignore_errors=True)


def test_require_isolated_fullstack_in_memory_mode_creates_and_verifies_a_run_directory_and_log_dir(monkeypatch):
    for k in ("LOG_DIR", guard.ENV_ROOT, guard.ENV_REQUIRE, guard.ENV_UPLOAD_ROOT):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    root = isolation.require_isolated_fullstack()
    try:
        assert root.is_dir() and guard.check_run_root(str(root)) == root
        assert os.environ["LOG_DIR"] == str(root / "logs") and os.environ[guard.ENV_ROOT] == str(root) and os.environ[guard.ENV_REQUIRE] == "1"
        guard.enforce_from_environment()                                        # the application's own check passes for it
    finally:
        for k in (guard.ENV_REQUIRE, guard.ENV_ROOT, "LOG_DIR", guard.ENV_UPLOAD_ROOT):
            monkeypatch.delenv(k, raising=False)
        import shutil
        shutil.rmtree(root, ignore_errors=True)


def test_require_isolated_fullstack_refuses_bad_log_dirs_in_both_modes_without_changing_the_environment(run_dir, monkeypatch):
    other = isolation.make_run_dir()
    (run_dir / "sneaky").symlink_to(BACKEND, target_is_directory=True)
    try:
        for db_url in ("sqlite:///:memory:", _url(run_dir / "full.db")):
            for bad in ("logs", str(BACKEND / "logs"), str(other / "logs"), str(run_dir / "sneaky" / "logs")):
                for k in (guard.ENV_ROOT, guard.ENV_REQUIRE, guard.ENV_UPLOAD_ROOT):
                    monkeypatch.delenv(k, raising=False)
                monkeypatch.setenv("DATABASE_URL", db_url)
                monkeypatch.setenv("LOG_DIR", bad)
                with pytest.raises(UnsafeDatabaseError):
                    isolation.require_isolated_fullstack()
                assert os.environ.get(guard.ENV_REQUIRE) is None                 # nothing was armed / changed on refusal
                assert os.environ["LOG_DIR"] == bad
        # file mode with LOG_DIR unset: it is set inside the database's directory
        monkeypatch.delenv("LOG_DIR", raising=False)
        monkeypatch.setenv("DATABASE_URL", _url(run_dir / "full.db"))
        root = isolation.require_isolated_fullstack()
        assert root == run_dir and os.environ["LOG_DIR"] == str(run_dir / "logs")
    finally:
        for k in (guard.ENV_REQUIRE, guard.ENV_ROOT, "LOG_DIR", guard.ENV_UPLOAD_ROOT):
            monkeypatch.delenv(k, raising=False)
        import shutil
        shutil.rmtree(other, ignore_errors=True)
