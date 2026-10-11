"""AUDIT-TEMPLATES-2026-001 — start-up: the audit_templates table, the four initial templates (db_migrations step 24,
flag audit_templates_initial_v1) and the new audit:template:manage permission.

"Boots" are fresh Python processes that import `main` (create tables → run_migrations → seeding, exactly a server start)
against a throwaway file database. The "old code" is the backend tree at BASE_COMMIT (before the template library),
exported with `git archive`, so the "existing database" is one a real older server produced. The step's own edge cases
run in-process on the suite's db_session. Nothing here reads or writes the development database.
"""
import io
import json
import shutil
import sqlite3
import subprocess
import sys
import tarfile
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import text

import db_migrations
import models
from core.perms import AUDIT_TEMPLATE_MANAGE
from isolation import BACKEND, isolated_env, make_run_dir, run_python
from services.audit_template_service import INITIAL_AUDIT_TEMPLATES, ISO_9001_ITEMS_FILE

BASE_COMMIT = "cd71bb26111a3c44902873cceab556511aecb959"     # last commit without the template library
ENV = {"INITIAL_ADMIN_PASSWORD": "Audit-Templates-Migration-Pw-123456", "ENVIRONMENT": "staging"}
NAMES = ["ISO 9001:2015", "ISO 45001", "品質管理程序書", "供應商評鑑表"]
FLAG = "audit_templates_initial_v1"


@pytest.fixture
def run_dir():
    root = make_run_dir("qualitas-audit-tpl-mig-")
    yield root
    shutil.rmtree(root, ignore_errors=True)


@pytest.fixture(scope="module")
def old_backend(tmp_path_factory):
    repo = BACKEND.parent
    try:
        data = subprocess.run(["git", "-C", str(repo), "archive", BASE_COMMIT, "backend"], capture_output=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        pytest.skip(f"base commit {BASE_COMMIT} not available: {e}")
    dest = tmp_path_factory.mktemp("old-code")
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        tar.extractall(dest, filter="data")
    old = dest / "backend"
    assert not (old / "services" / "audit_template_service.py").exists()
    return old


def boot(db_path):
    r = run_python("import main", db_path, extra_env=ENV, timeout=240, check=False)
    assert r.returncode == 0, (r.stdout + r.stderr)[-3000:]
    return r.stdout + r.stderr


def old_boot(old_backend, db_path):
    env = isolated_env(db_path, Path(db_path).parent, ENV)
    env["PYTHONPATH"] = str(old_backend)
    prelude = "from core.startup_guard import guard_if_required\nguard_if_required()\n"
    r = subprocess.run([sys.executable, "-c", prelude + "import main"], cwd=old_backend, env=env, capture_output=True,
                       text=True, timeout=240)
    assert r.returncode == 0, r.stdout[-1500:] + r.stderr[-3000:]


def sql(db_path, query, params=()):
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute(query, params).fetchall()
        con.commit()
        return rows
    finally:
        con.close()


def templates(db_path):
    return sql(db_path, "SELECT id, name, description, version, is_active, items FROM audit_templates ORDER BY id")


def role_perms(db_path, role):
    return {r[0] for r in sql(db_path, "SELECT p.code FROM roles r JOIN role_permissions rp ON rp.role_id = r.id "
                                       "JOIN permissions p ON p.id = rp.permission_id WHERE lower(r.name) = lower(?)", (role,))}


def assert_initial_templates(db_path):
    rows = templates(db_path)
    assert [r[1] for r in rows] == NAMES
    assert all(r[4] == 1 for r in rows)
    iso = json.loads(rows[0][5])
    with open(ISO_9001_ITEMS_FILE, encoding="utf-8") as f:
        assert iso == json.load(f)                     # the company checklist, byte-for-byte as shipped
    assert len(iso) == 116 and len({i["id"] for i in iso}) == 116
    assert (iso[0]["no"], iso[-1]["no"]) == ("4.1", "10.3")
    assert iso[0]["title"] == "Understanding the organization and its context" and all(i["title"] for i in iso)
    assert max(len(i["clause"]) for i in iso) > 1000  # long requirement texts survive (the column is TEXT)
    assert all(json.loads(r[5]) == [] for r in rows[1:])
    assert sql(db_path, "SELECT count(*) FROM migration_flags WHERE flag_name = ?", (FLAG,)) == [(1,)]


# ── start-up order ───────────────────────────────────────────────────────────────────────────────────────────
def test_fresh_database_gets_the_table_the_four_templates_and_admin_gets_the_permission(run_dir):
    db = run_dir / "fresh.db"
    boot(db)
    assert_initial_templates(db)
    assert AUDIT_TEMPLATE_MANAGE in role_perms(db, "admin")
    assert sql(db, "SELECT description FROM permissions WHERE code = ?", (AUDIT_TEMPLATE_MANAGE,)) == [("管理稽核模板",)]
    holders = sql(db, "SELECT r.name FROM roles r JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p "
                      "ON p.id = rp.permission_id WHERE p.code = ?", (AUDIT_TEMPLATE_MANAGE,))
    assert [h[0].lower() for h in holders] == ["admin"]


def test_existing_database_without_the_table_is_upgraded_and_only_admin_is_synced(old_backend, run_dir):
    db = run_dir / "old.db"
    old_boot(old_backend, db)
    assert not sql(db, "SELECT name FROM sqlite_master WHERE name = 'audit_templates'")
    # a production-like QA_MANAGER role holding the audit permissions it has today
    sql(db, "INSERT INTO roles (name, description) VALUES ('QA_MANAGER', 'QA manager')")
    sql(db, "INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r, permissions p "
            "WHERE r.name = 'QA_MANAGER' AND p.code LIKE 'audit:%'")
    qa_before = role_perms(db, "QA_MANAGER")
    audits_before = sql(db, "SELECT * FROM audits ORDER BY 1")

    boot(db)

    assert_initial_templates(db)
    assert AUDIT_TEMPLATE_MANAGE in role_perms(db, "admin")
    assert role_perms(db, "QA_MANAGER") == qa_before and AUDIT_TEMPLATE_MANAGE not in qa_before   # assigned by hand later
    assert sql(db, "SELECT * FROM audits ORDER BY 1") == audits_before


def test_restarts_never_duplicate_or_bring_back_initial_templates(run_dir):
    db = run_dir / "twice.db"
    boot(db)
    first = templates(db)
    boot(db)
    assert templates(db) == first
    # the user renames one, deactivates one and (by hand) removes one
    sql(db, "UPDATE audit_templates SET name = 'ISO 45001:2018' WHERE name = 'ISO 45001'")
    sql(db, "UPDATE audit_templates SET is_active = 0, items = '[]' WHERE name = 'ISO 9001:2015'")
    sql(db, "DELETE FROM audit_templates WHERE name = '供應商評鑑表'")
    edited = templates(db)
    boot(db)
    assert templates(db) == edited
    assert [r[1] for r in edited] == ["ISO 9001:2015", "ISO 45001:2018", "品質管理程序書"]


# ── step 24 in-process ───────────────────────────────────────────────────────────────────────────────────────
def _run(db):
    with patch("db_migrations.engine", db.get_bind()):
        db_migrations._create_migration_flags_table()
        db_migrations._seed_initial_audit_templates()


def _names(db):
    db.expire_all()
    return [(t.name, t.is_active) for t in db.query(models.AuditTemplate).order_by(models.AuditTemplate.id)]


def test_a_template_already_named_like_an_initial_one_is_left_alone(db_session):
    db = db_session
    db.add(models.AuditTemplate(name=" iso 45001 ", description="mine", version="v9", is_active=False, items="[]"))
    db.commit()
    _run(db)
    assert _names(db) == [(" iso 45001 ", False), ("ISO 9001:2015", True), ("品質管理程序書", True), ("供應商評鑑表", True)]
    assert db.query(models.AuditTemplate).filter_by(description="mine").one().version == "v9"


def test_the_step_runs_once_even_when_every_template_was_removed(db_session):
    db = db_session
    _run(db)
    db.query(models.AuditTemplate).delete()
    db.commit()
    _run(db)
    assert _names(db) == []


def test_a_failure_writes_nothing_and_the_next_start_tries_again(db_session):
    db = db_session
    bad = [*INITIAL_AUDIT_TEMPLATES[:2], {"name": None, "version": "", "items": []}]   # the third insert fails
    with patch("services.audit_template_service.INITIAL_AUDIT_TEMPLATES", bad):
        _run(db)
    assert _names(db) == []
    assert db.execute(text("SELECT count(*) FROM migration_flags WHERE flag_name = :f"), {"f": FLAG}).scalar() == 0
    _run(db)
    assert [n for n, _ in _names(db)] == NAMES
