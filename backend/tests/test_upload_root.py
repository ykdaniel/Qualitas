"""Where attachments are stored (2026-09-20): configurable, default unchanged, and never the project's uploads/ in an isolated process.

Covers core/uploads.py::upload_root and core/startup_guard.py::check_upload_root, the environment tests/isolation.py builds, and the
"refuse BEFORE anything is written" behaviour of the application itself.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

import isolation
from core import startup_guard as guard
from core.startup_guard import UnsafeDatabaseError, check_upload_root
from core.uploads import DEFAULT_UPLOAD_ROOT, upload_root

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture
def run_dir():
    d = isolation.make_run_dir()
    yield d
    import shutil
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for k in (guard.ENV_REQUIRE, guard.ENV_ROOT, guard.ENV_UPLOAD_ROOT):
        monkeypatch.delenv(k, raising=False)


# ── normal start-up: unchanged ─────────────────────────────────────────────────────────────────────────────────────────────────

def test_default_location_is_unchanged():
    assert upload_root() == str(BACKEND / "uploads") == DEFAULT_UPLOAD_ROOT


def test_an_absolute_setting_moves_it_and_a_relative_one_is_refused(tmp_path, monkeypatch):
    monkeypatch.setenv(guard.ENV_UPLOAD_ROOT, str(tmp_path / "vol"))
    assert upload_root() == os.path.realpath(tmp_path / "vol")
    monkeypatch.setenv(guard.ENV_UPLOAD_ROOT, "uploads")
    with pytest.raises(ValueError, match="absolute"):
        upload_root()
    monkeypatch.setenv(guard.ENV_UPLOAD_ROOT, "   ")                   # blank counts as unset
    assert upload_root() == DEFAULT_UPLOAD_ROOT


def test_upload_root_is_read_on_every_call_not_at_import(tmp_path, monkeypatch):
    monkeypatch.setenv(guard.ENV_UPLOAD_ROOT, str(tmp_path / "one"))
    first = upload_root()
    monkeypatch.setenv(guard.ENV_UPLOAD_ROOT, str(tmp_path / "two"))
    assert upload_root() != first


# ── isolated process: mandatory and confined ─────────────────────────────────────────────────────────────────────────────────────

def test_check_upload_root_accepts_only_a_strict_subdirectory_of_the_run_directory(run_dir):
    assert check_upload_root(str(run_dir / "uploads"), str(run_dir)) == run_dir / "uploads"
    assert check_upload_root(str(run_dir / "a" / "b" / "uploads"), str(run_dir)) == run_dir / "a" / "b" / "uploads"
    (run_dir / "sneaky").symlink_to(BACKEND, target_is_directory=True)
    other = isolation.make_run_dir()
    try:
        for bad in (None, "", "   ", "uploads", "./uploads", str(BACKEND / "uploads"), str(BACKEND / "uploads" / "km"), str(run_dir),
                    str(other / "uploads"), str(run_dir / ".." / "elsewhere"), str(run_dir / "sneaky" / "uploads")):
            with pytest.raises(UnsafeDatabaseError):
                check_upload_root(bad, str(run_dir))
        with pytest.raises(UnsafeDatabaseError):
            check_upload_root(str(run_dir / "uploads"), None)          # no run directory at all
    finally:
        import shutil
        shutil.rmtree(other, ignore_errors=True)


def test_isolated_env_always_sets_the_upload_root_inside_the_run_directory_and_ignores_the_parents_value(run_dir, monkeypatch):
    monkeypatch.setenv(guard.ENV_UPLOAD_ROOT, str(BACKEND / "uploads"))          # inherited from the parent: must be ignored
    for db in (None, run_dir / "t.db"):
        env = isolation.isolated_env(db, run_dir)
        assert env[guard.ENV_UPLOAD_ROOT] == str(run_dir / "uploads")
    assert isolation.isolated_env(None, run_dir, {guard.ENV_UPLOAD_ROOT: str(run_dir / "x" / "up")})[guard.ENV_UPLOAD_ROOT] == str(run_dir / "x" / "up")
    for bad in (str(BACKEND / "uploads"), "uploads", "/tmp/elsewhere-upload-root"):
        with pytest.raises(UnsafeDatabaseError):
            isolation.isolated_env(None, run_dir, {guard.ENV_UPLOAD_ROOT: bad})


def test_upload_root_refuses_in_an_isolated_process_when_missing_or_outside(run_dir, monkeypatch):
    monkeypatch.setenv(guard.ENV_REQUIRE, "1")
    monkeypatch.setenv(guard.ENV_ROOT, str(run_dir))
    with pytest.raises(UnsafeDatabaseError, match="missing"):                     # unset: the DEFAULT (the developer's folder) is never used
        upload_root()
    monkeypatch.setenv(guard.ENV_UPLOAD_ROOT, str(BACKEND / "uploads"))
    with pytest.raises(UnsafeDatabaseError, match="project tree"):
        upload_root()
    monkeypatch.setenv(guard.ENV_UPLOAD_ROOT, str(run_dir / "uploads"))
    assert upload_root() == str(run_dir / "uploads")


def test_the_application_refuses_at_start_up_without_an_upload_root_before_creating_anything(run_dir):
    env = isolation.isolated_env(None, run_dir)
    env.pop(guard.ENV_UPLOAD_ROOT)                                               # a caller that forgot it
    code = isolation._CHILD_PRELUDE + "import main\n"
    r = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120)
    assert r.returncode != 0 and guard.ENV_UPLOAD_ROOT in r.stderr
    assert sorted(p.name for p in run_dir.iterdir()) == []                        # no logs/, no uploads/, no backup: nothing was created


def test_a_child_started_through_the_helper_gets_a_private_upload_root_and_creates_it_only_inside_the_run_directory(run_dir):
    r = isolation.run_python("import main, os\nprint('UP=' + os.environ['QUALITAS_UPLOAD_ROOT'])\nfrom core.uploads import upload_root\nprint('R=' + upload_root())",
                             None, root=run_dir, extra_env={"INITIAL_ADMIN_PASSWORD": "Guard-Test-Pw-123456"})
    assert f"UP={run_dir / 'uploads'}" in r.stdout and f"R={run_dir / 'uploads'}" in r.stdout
    assert (run_dir / "uploads").is_dir()                                          # main.py created it — inside the run directory
