"""MATERIAL-SUBMITTAL M1 — named migration for the material schema (db_migrations step 21; spec §3.6 / §9.1 / §9.4).

"Boots" are fresh Python processes that import `main` (create tables → run_migrations → seeding, exactly a server
start) against a throwaway file database inside a run directory under the system temp dir. The "old code" is the
backend tree at BASE_COMMIT (before any material code), exported with `git archive` into the run directory.
Nothing here reads or writes the development database.
"""
import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import io
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect

import models
from database import Base
from db_migrations import _MATERIAL_DDL, MATERIAL_INDEXES, MATERIAL_TABLES
from isolation import BACKEND, isolated_env, make_run_dir, run_python

BASE_COMMIT = "056c245ca3ff630f74bfc7af86233e7cbc7dc51b"     # last commit without any material code
ENV = {"INITIAL_ADMIN_PASSWORD": "Material-Migration-Pw-123456", "ENVIRONMENT": "staging"}


# ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────
@pytest.fixture
def run_dir():
    root = make_run_dir("qualitas-material-mig-")
    yield root
    shutil.rmtree(root, ignore_errors=True)


def boot(db_path, check=True):
    r = run_python("import main", db_path, extra_env=ENV, timeout=240, check=check)
    return r.returncode, r.stdout + r.stderr


@pytest.fixture(scope="module")
def old_backend(tmp_path_factory):
    """The backend tree at BASE_COMMIT, unpacked into a temp directory (the tests' 'old application')."""
    repo = BACKEND.parent
    try:
        data = subprocess.run(["git", "-C", str(repo), "archive", BASE_COMMIT, "backend"], capture_output=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        pytest.skip(f"base commit {BASE_COMMIT} not available: {e}")
    dest = tmp_path_factory.mktemp("old-code")
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        tar.extractall(dest, filter="data")
    old = dest / "backend"
    assert not (old / "routers" / "materials.py").exists()
    return old


def old_python(old_backend, db_path, code, check=True):
    """Run `code` with the OLD backend on sys.path / as cwd, against the same kind of isolated environment."""
    env = isolated_env(db_path, Path(db_path).parent, ENV)
    env["PYTHONPATH"] = str(old_backend)
    prelude = "from core.startup_guard import guard_if_required\nguard_if_required()\n"
    r = subprocess.run([sys.executable, "-c", prelude + code], cwd=old_backend, env=env, capture_output=True, text=True, timeout=240)
    if check:
        assert r.returncode == 0, r.stdout[-1500:] + r.stderr[-3000:]
    return r


def sql(db_path, query, params=()):
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute(query, params).fetchall()
        con.commit()
        return rows
    finally:
        con.close()


def norm_where(s):
    """Test-side comparison, deliberately NOT the production tokenizer: only runs of whitespace are collapsed.
    Case, quoting and the string literals ('Draft', 'Submitted') are compared exactly (M1 review R1)."""
    return None if s is None else re.sub(r"\s+", " ", s).strip()


def index_defs(db_path):
    """{name: (table, columns, unique, where)} for every named (non-autoindex) index on the material tables."""
    out = {}
    for table in MATERIAL_TABLES:
        for _, name, unique, *_ in sql(db_path, f"PRAGMA index_list({table})"):
            if name.startswith("sqlite_autoindex"):
                continue
            cols = tuple(r[2] for r in sorted(sql(db_path, f"PRAGMA index_info({name})")))
            ddl = sql(db_path, "SELECT sql FROM sqlite_master WHERE type='index' AND name=?", (name,))[0][0] or ""
            m = re.search(r"\bWHERE\b(.*)$", ddl, re.I | re.S)
            out[name] = (table, cols, bool(unique), norm_where(m.group(1)) if m else None)
    return out


EXPECTED_INDEXES = {name: (table, cols, unique, norm_where(where)) for name, table, cols, unique, where in MATERIAL_INDEXES}


def schema_objects(db_path):
    return sorted(sql(db_path, "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"))


def business_rows(db_path):
    return {t: sql(db_path, f"SELECT * FROM {t} ORDER BY 1") for t in ("projects", "contractors", "ncr", "audit_logs")}


def seed_business_rows(db_path):
    sql(db_path, "INSERT INTO projects (id, name, code) VALUES ('old-p', 'Old project', 'OP')")
    sql(db_path, "INSERT INTO ncr (id, documentNumber, status) VALUES ('ncr-old', 'NCR-OLD-1', 'Open')")
    sql(db_path, "INSERT INTO audit_logs (timestamp, action, entity_type, entity_id, entity_name, user_id, username) "
                 "VALUES ('2026-09-01T00:00:00', 'UPDATE', 'NCR', 'ncr-old', 'NCR-OLD-1', 1, 'legacy')")


def old_database(old_backend, run_dir, name="old.db"):
    db = run_dir / name
    old_python(old_backend, db, "import main")
    assert not sql(db, "SELECT name FROM sqlite_master WHERE name='materials'")
    assert "material_reply_days" not in {r[1] for r in sql(db, "PRAGMA table_info(projects)")}
    seed_business_rows(db)
    return db


# ── AC-R3-1 empty database ───────────────────────────────────────────────────────────────────────────────────
def test_fresh_database_gets_full_schema(run_dir):
    db = run_dir / "fresh.db"
    rc, out = boot(db)
    assert index_defs(db) == EXPECTED_INDEXES
    assert len(EXPECTED_INDEXES) == len(MATERIAL_INDEXES) == 12
    # spec §9.1, written out here independently of MATERIAL_INDEXES so a change to the list itself is caught too
    defs = index_defs(db)
    assert defs["ux_msr_one_open"] == ("material_submittal_revisions", ("submittal_id",), True, norm_where("status IN ('Draft','Submitted')"))
    assert defs["ux_msr_submittal_rev"] == ("material_submittal_revisions", ("submittal_id", "rev_no"), True, None)
    assert defs["ux_msre_revision_seq"] == ("material_submittal_result_entries", ("revision_id", "seq"), True, None)
    assert defs["ux_material_submittals_document_number"] == ("material_submittals", ("document_number",), True, None)
    assert defs["ux_material_submittals_client_request"] == ("material_submittals", ("project_id", "client_request_id"), True, None)
    for table in MATERIAL_TABLES:
        cols = {r[1]: r for r in sql(db, f"PRAGMA table_info({table})")}
        for col in Base.metadata.tables[table].columns:
            assert col.name in cols, (table, col.name)
            assert bool(cols[col.name][3]) == ((not col.nullable) or col.primary_key), (table, col.name)
            assert bool(cols[col.name][5]) == bool(col.primary_key), (table, col.name)
    reply = {r[1]: r for r in sql(db, "PRAGMA table_info(projects)")}["material_reply_days"]
    assert "INT" in reply[2].upper() and reply[3] == 0


def test_material_tables_are_not_created_by_startup_create_all():
    engine = create_engine("sqlite:///:memory:")
    models.create_all_except_migration_owned(bind=engine)
    tables = set(inspect(engine).get_table_names())
    assert not tables & set(MATERIAL_TABLES)
    for table in MATERIAL_TABLES:
        assert Base.metadata.tables[table].info.get("migration_owned") is True


# ── AC-M1-8 model Index() declarations == the migration's single list ─────────────────────────────────────────
def test_model_indexes_match_the_migration_list(run_dir):
    db = run_dir / "create_all.db"
    engine = create_engine(f"sqlite:///{db}")
    Base.metadata.create_all(engine, tables=[Base.metadata.tables[t] for t in MATERIAL_TABLES]
                             + [Base.metadata.tables[t] for t in ("projects", "contractors")])
    engine.dispose()
    assert index_defs(db) == EXPECTED_INDEXES


# ── AC-R3-2 old database upgrade ─────────────────────────────────────────────────────────────────────────────
def test_old_database_is_upgraded_without_touching_existing_data(old_backend, run_dir):
    db = old_database(old_backend, run_dir)
    old_project_cols = [r[1] for r in sql(db, "PRAGMA table_info(projects)")]
    before = business_rows(db)
    boot(db)
    assert index_defs(db) == EXPECTED_INDEXES
    after = business_rows(db)
    assert after["contractors"] == before["contractors"] and after["ncr"] == before["ncr"]
    assert after["audit_logs"][:len(before["audit_logs"])] == before["audit_logs"]       # start-up may only append
    cols = ", ".join(old_project_cols)
    assert sql(db, f"SELECT {cols} FROM projects ORDER BY 1") == before["projects"]
    assert sql(db, "SELECT material_reply_days FROM projects WHERE id='old-p'") == [(None,)]


# ── AC-R3-3 re-running changes nothing ───────────────────────────────────────────────────────────────────────
def test_second_start_changes_no_schema(run_dir):
    db = run_dir / "twice.db"
    boot(db)
    first = schema_objects(db)
    rc, out = boot(db)
    assert rc == 0
    assert schema_objects(db) == first


# ── AC-R3-4 a wrongly shaped existing schema stops start-up and keeps data ───────────────────────────────────
def _expect_abort(db, needle):
    rc, out = boot(db, check=False)
    assert rc != 0, out[-2000:]
    assert "MigrationError" in out and "material submittal schema" in out, out[-2000:]
    assert needle in out, out[-3000:]


def test_existing_table_missing_a_column_aborts(old_backend, run_dir):
    db = old_database(old_backend, run_dir)
    sql(db, "CREATE TABLE materials (id VARCHAR NOT NULL PRIMARY KEY, project_id VARCHAR NOT NULL, category VARCHAR, "
            "name VARCHAR NOT NULL, brand VARCHAR, model VARCHAR, specification VARCHAR, manufacturer VARCHAR, "
            "created_by VARCHAR, created_at VARCHAR, updated_by VARCHAR, updated_at VARCHAR)")
    sql(db, "INSERT INTO materials (id, project_id, name) VALUES ('keep-me', 'old-p', 'Existing row')")
    _expect_abort(db, "materials.supplier is missing")
    assert sql(db, "SELECT id, name FROM materials") == [("keep-me", "Existing row")]


def test_existing_column_without_required_not_null_aborts(old_backend, run_dir):
    db = old_database(old_backend, run_dir)
    sql(db, "CREATE TABLE materials (id VARCHAR NOT NULL PRIMARY KEY, project_id VARCHAR, category VARCHAR, "
            "name VARCHAR NOT NULL, brand VARCHAR, model VARCHAR, specification VARCHAR, manufacturer VARCHAR, supplier VARCHAR, "
            "created_by VARCHAR, created_at VARCHAR, updated_by VARCHAR, updated_at VARCHAR)")
    sql(db, "INSERT INTO materials (id, project_id, name) VALUES ('keep-me', NULL, 'Existing row')")
    _expect_abort(db, "materials.project_id NOT NULL is False")
    assert sql(db, "SELECT id, project_id FROM materials") == [("keep-me", None)]


def test_same_named_index_on_wrong_columns_aborts(run_dir):
    db = run_dir / "wrong-index.db"
    boot(db)
    sql(db, "DROP INDEX ux_msr_submittal_rev")
    sql(db, "CREATE UNIQUE INDEX ux_msr_submittal_rev ON material_submittal_revisions (submittal_id)")
    _expect_abort(db, "index ux_msr_submittal_rev covers ('submittal_id',)")
    assert index_defs(db)["ux_msr_submittal_rev"][1] == ("submittal_id",)                       # reported, not replaced


def test_one_open_index_without_where_aborts(run_dir):
    db = run_dir / "no-where.db"
    boot(db)
    sql(db, "DROP INDEX ux_msr_one_open")
    sql(db, "CREATE UNIQUE INDEX ux_msr_one_open ON material_submittal_revisions (submittal_id)")
    _expect_abort(db, "index ux_msr_one_open condition is none")


def test_unique_index_made_non_unique_aborts(run_dir):
    db = run_dir / "not-unique.db"
    boot(db)
    sql(db, "DROP INDEX ux_material_submittals_document_number")
    sql(db, "CREATE INDEX ux_material_submittals_document_number ON material_submittals (document_number)")
    _expect_abort(db, "index ux_material_submittals_document_number unique=False, expected True")


# ── AC-R3-5 code rollback keeps the data; re-upgrade finds it ───────────────────────────────────────────────
def test_old_code_runs_on_upgraded_database_and_data_survives(old_backend, run_dir):
    db = run_dir / "rollback.db"
    boot(db)
    sql(db, "INSERT INTO projects (id, name, material_reply_days) VALUES ('p-new', 'New project', 14)")
    sql(db, "INSERT INTO materials (id, project_id, name) VALUES ('mat-1', 'p-new', 'Kept material')")
    old_python(old_backend, db,
               "import main, models\n"
               "from database import SessionLocal\n"
               "db = SessionLocal()\n"
               "db.add(models.Project(id='p-old-code', name='Created by old code')); db.commit()\n"
               "p = db.get(models.Project, 'p-new'); p.owner = 'Old code owner'; db.commit()\n"
               "print('OLD-CODE-OK')\n")
    assert sql(db, "SELECT id, material_reply_days, owner FROM projects WHERE id IN ('p-new', 'p-old-code') ORDER BY id") == [
        ("p-new", 14, "Old code owner"), ("p-old-code", None, None)]
    boot(db)
    assert sql(db, "SELECT id, project_id, name FROM materials") == [("mat-1", "p-new", "Kept material")]
    assert index_defs(db) == EXPECTED_INDEXES


# ── M1 review R1: partial-index condition — literals are data ───────────────────────────────────────────────
def _replace_one_open(db, where):
    sql(db, "DROP INDEX ux_msr_one_open")
    sql(db, f"CREATE UNIQUE INDEX ux_msr_one_open ON material_submittal_revisions (submittal_id) WHERE {where}")


def _revision(db, rid, rev_no, status, submittal="S1"):
    sql(db, "INSERT INTO material_submittal_revisions (id, submittal_id, project_id, vendor_id, rev_no, status) "
            "VALUES (?, ?, 'P', 'V', ?, ?)", (rid, submittal, rev_no, status))


@pytest.mark.parametrize("where", ["status IN ('draft','submitted')",        # literal case changed (review's probe)
                                   "status IN ('Submitted','Draft')",        # equivalent order — not provable here, so refused
                                   "status IN ('Draft')",                    # literal content changed
                                   "\"status\" IN ('Draft','Submitted')"])   # other quoting — refused (conservative)
def test_one_open_index_with_any_other_condition_aborts_and_keeps_data(run_dir, where):
    db = run_dir / "bad-where.db"
    boot(db)
    _replace_one_open(db, where)
    _revision(db, "keep-1", 0, "Approved")
    _expect_abort(db, "index ux_msr_one_open condition is")
    assert sql(db, "SELECT sql FROM sqlite_master WHERE name='ux_msr_one_open'")[0][0].endswith(where)   # reported, not replaced
    assert sql(db, "SELECT id, status FROM material_submittal_revisions") == [("keep-1", "Approved")]


def test_one_open_index_whitespace_and_keyword_case_only_is_adopted(run_dir):
    db = run_dir / "spacing.db"
    boot(db)
    _replace_one_open(db, "status  in (  'Draft' ,'Submitted' )")
    rc, out = boot(db)
    assert rc == 0


def test_one_open_index_blocks_a_second_open_revision(run_dir):
    db = run_dir / "behaviour.db"
    boot(db)
    _revision(db, "r0", 0, "Draft")
    for rid, rev, status in (("r1a", 1, "Draft"), ("r1b", 1, "Submitted")):
        with pytest.raises(sqlite3.IntegrityError):
            _revision(db, rid, rev, status)
    _revision(db, "r1c", 1, "Approved")                          # closed revisions do not count
    _revision(db, "other", 0, "Draft", submittal="S2")            # another submittal is independent
    sql(db, "UPDATE material_submittal_revisions SET status='ReviseAndResubmit' WHERE id='r0'")
    _revision(db, "r2", 2, "Submitted")                           # the only open one now
    with pytest.raises(sqlite3.IntegrityError):
        sql(db, "UPDATE material_submittal_revisions SET status='Draft' WHERE id='r1c'")
    assert sorted(sql(db, "SELECT id FROM material_submittal_revisions WHERE submittal_id='S1' AND status IN ('Draft','Submitted')")) == [("r2",)]


# ── M1 review R2: exact column types ──────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("bad_type", ["NUMERIC", "REAL", "BLOB", "", "INT", "NVARCHAR"])
def test_text_column_with_wrong_type_aborts_and_keeps_data(old_backend, run_dir, bad_type):
    db = old_database(old_backend, run_dir)
    ddl = _MATERIAL_DDL[0].replace("name VARCHAR NOT NULL", f"name {bad_type} NOT NULL".replace("  ", " "))
    assert ddl != _MATERIAL_DDL[0]
    sql(db, ddl)
    sql(db, "INSERT INTO materials (id, project_id, name) VALUES ('keep-me', 'old-p', '00123')")
    before = sql(db, "SELECT id, name, typeof(name) FROM materials")
    _expect_abort(db, "materials.name type")
    assert sql(db, "SELECT id, name, typeof(name) FROM materials") == before


def test_integer_primary_key_must_be_exactly_integer(old_backend, run_dir):
    db = old_database(old_backend, run_dir)
    ddl = _MATERIAL_DDL[3].replace("id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT", "id INT NOT NULL PRIMARY KEY")
    assert ddl != _MATERIAL_DDL[3]
    sql(db, ddl)
    _expect_abort(db, "material_submittal_result_entries.id type INT does not match INTEGER")


def test_reply_days_column_with_other_integer_type_aborts(old_backend, run_dir):
    db = old_database(old_backend, run_dir)
    sql(db, "ALTER TABLE projects ADD COLUMN material_reply_days BIGINT")
    _expect_abort(db, "projects.material_reply_days must be a nullable INTEGER (found BIGINT")
    assert sql(db, "SELECT id FROM projects WHERE id='old-p'") == [("old-p",)]


# ── M6 R2: request-id column on a material table made before it existed (e.g. an M5 rehearsal database) ─────────────
PRE_R2_SUBMITTALS = """CREATE TABLE material_submittals (
        id VARCHAR NOT NULL PRIMARY KEY, project_id VARCHAR NOT NULL REFERENCES projects (id),
        vendor_id VARCHAR NOT NULL REFERENCES contractors (id), material_id VARCHAR NOT NULL REFERENCES materials (id),
        document_number VARCHAR NOT NULL, latest_rev_no INTEGER NOT NULL, latest_status VARCHAR NOT NULL,
        current_approved_rev_no INTEGER, current_approved_result VARCHAR,
        created_by VARCHAR, created_at VARCHAR, updated_at VARCHAR)"""


def test_pre_r2_material_table_gets_the_request_id_column_and_keeps_its_rows(old_backend, run_dir):
    db = old_database(old_backend, run_dir)
    for ddl in _MATERIAL_DDL:
        sql(db, PRE_R2_SUBMITTALS if "material_submittals (" in ddl.split("\n")[0] else ddl)
    assert "client_request_id" not in {r[1] for r in sql(db, "PRAGMA table_info(material_submittals)")}
    sql(db, "INSERT INTO contractors (id, name) VALUES ('old-v', 'Old vendor')")
    sql(db, "INSERT INTO materials (id, project_id, name) VALUES ('m-old', 'old-p', 'Old material')")
    sql(db, "INSERT INTO material_submittals (id, project_id, vendor_id, material_id, document_number, latest_rev_no, latest_status) "
            "VALUES ('s-old', 'old-p', 'old-v', 'm-old', 'OLD-1', 0, 'Approved')")
    boot(db)
    assert index_defs(db) == EXPECTED_INDEXES
    assert sql(db, "SELECT id, document_number, client_request_id FROM material_submittals") == [("s-old", "OLD-1", None)]
    first = schema_objects(db)
    boot(db)
    assert schema_objects(db) == first                                                            # second start: no change


# ── M6 R2 (review R7): the retired record_result permission on an existing database ─────────────────────────────
RETIRED = "material:record_result:all"


def test_retired_record_result_permission_is_removed_and_every_other_grant_is_kept(run_dir):
    db = run_dir / "perm.db"
    boot(db)
    # an M1–M5 database: the old permission exists, old descriptions, and roles hold it next to other grants
    sql(db, "INSERT INTO permissions (code, description) VALUES (?, '登錄送審結果')", (RETIRED,))
    sql(db, "UPDATE permissions SET description = '查看材料與送審' WHERE code = 'material:view:all'")
    pid = {c: i for i, c in sql(db, "SELECT id, code FROM permissions")}
    sql(db, "INSERT INTO roles (name, description) VALUES ('QA lead', 'x'), ('Result only', 'y')")
    role = {n: i for i, n in sql(db, "SELECT id, name FROM roles")}
    grants = [("QA lead", c) for c in (RETIRED, "material:view:all", "material:manage:all", "ncr:view:all")] + [("Result only", RETIRED)]
    for r, c in grants:
        sql(db, "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)", (role[r], pid[c]))
    sql(db, "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)", (role["admin"], pid[RETIRED]))
    users_before = sql(db, "SELECT id, username, role_id FROM users ORDER BY id")
    other_before = sql(db, "SELECT role_id, permission_id FROM role_permissions WHERE permission_id != ? ORDER BY 1, 2", (pid[RETIRED],))

    boot(db)
    assert sql(db, "SELECT code FROM permissions WHERE code LIKE 'material:%' ORDER BY code") == [("material:manage:all",), ("material:view:all",)]
    assert sql(db, "SELECT count(*) FROM role_permissions WHERE permission_id = ?", (pid[RETIRED],)) == [(0,)]
    held = lambda r: sorted(c for (c,) in sql(db, "SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id "
                                                  "WHERE rp.role_id = ?", (role[r],)))
    assert held("QA lead") == ["material:manage:all", "material:view:all", "ncr:view:all"]
    assert held("Result only") == []                                    # the old code alone grants nothing new
    assert sorted(n for (n,) in sql(db, "SELECT name FROM roles")) == sorted(role)          # no role deleted
    assert sql(db, "SELECT id, username, role_id FROM users ORDER BY id") == users_before    # no user changed
    assert sql(db, "SELECT role_id, permission_id FROM role_permissions WHERE permission_id != ? ORDER BY 1, 2", (pid[RETIRED],)) == other_before
    assert sql(db, "SELECT description FROM permissions WHERE code = 'material:view:all'") == [("查看核准材料",)]
    assert sql(db, "SELECT description FROM permissions WHERE code = 'material:manage:all'") == [("登錄與編輯核准材料",)]
    snapshot = (sql(db, "SELECT * FROM permissions ORDER BY id"), sql(db, "SELECT * FROM role_permissions ORDER BY 1, 2"))
    boot(db)
    assert (sql(db, "SELECT * FROM permissions ORDER BY id"), sql(db, "SELECT * FROM role_permissions ORDER BY 1, 2")) == snapshot
