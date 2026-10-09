"""The `itr_approval_events` table is created by a named migration, not by create_all (2026-09-20).

Migration step: db_migrations._create_itr_approval_events_table (run_migrations step 20).
Start-up (main.py and the seeder) calls models.create_all_except_migration_owned, which skips
this table, so its schema always comes from the migration — on brand-new and old databases.

"Boots" are fresh Python processes that import `main` (create tables -> run_migrations ->
seeding, exactly a server start) against a throwaway file database under tmp_path; nothing
here reads or writes a real database.
"""
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from isolation import run_python
from sqlalchemy import create_engine, event, inspect

BACKEND = Path(__file__).resolve().parents[1]
TABLE = "itr_approval_events"
INDEX = "ix_itr_approval_events_itr_id"


def _boot(db_path: Path):
    r = run_python("import main", db_path, extra_env={"INITIAL_ADMIN_PASSWORD": "Migration-Test-Pw-123456",
                                                      "ENVIRONMENT": "staging"}, timeout=240)     # shared isolation entry point
    return r.stdout + r.stderr


def _sql(db_path, query, params=()):
    con = sqlite3.connect(db_path)
    try:
        cur = con.execute(query, params)
        rows = cur.fetchall()
        con.commit()
        return rows
    finally:
        con.close()


def _table_sql(db_path):
    rows = _sql(db_path, "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (TABLE,))
    return rows[0][0] if rows else None


def _has_index(db_path):
    return bool(_sql(db_path, "SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (INDEX,)))


def _insert_event(db_path, itr_id="itr-x", seq=1, event_type="APPROVED", actor="someone"):
    _sql(db_path, f"INSERT INTO {TABLE} (itr_id, document_number, sequence, event_type, occurred_at, actor_user_id, actor_username, "
                  "itr_snapshot, checklists_snapshot, snapshot_sha256) VALUES (?,?,?,?,?,?,?,?,?,?)",
         (itr_id, "ITR-X", seq, event_type, "2026-09-20T00:00:00+00:00", 7, actor, '{"a": 1}', '[{"b": 2}]', "abc"))


def _events(db_path):
    return _sql(db_path, f"SELECT * FROM {TABLE} ORDER BY id")


def _business_data(db_path):
    """Everything the migration must NOT touch: ITR, Checklist, audit and user rows, verbatim."""
    out = {}
    for t in ("itr", "checklist", "audit_logs", "users", "roles"):
        out[t] = _sql(db_path, f"SELECT * FROM {t} ORDER BY 1")
    return out


def _seed_business_rows(db_path):
    _sql(db_path, "INSERT INTO itr (id, documentNumber, status, approvedBy, approvedAt) VALUES ('itr-old', 'ITR-OLD-1', 'Approved', NULL, NULL)")
    _sql(db_path, "INSERT INTO checklist (id, recordsNo, status, passCount, failCount, itrId, detail_data) "
                  "VALUES ('chk-old', 'CHK-OLD-1', 'Pass', 1, 0, 'itr-old', '{\"items\": []}')")
    _sql(db_path, "INSERT INTO audit_logs (timestamp, action, entity_type, entity_id, entity_name, user_id, username) "
                  "VALUES ('2026-09-01T00:00:00', 'UPDATE', 'ITR', 'itr-old', 'ITR-OLD-1', 1, 'legacy')")


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "mig.db"


# ── 1. an old database without the table ─────────────────────────────────

def test_an_old_database_without_the_table_gets_it_and_keeps_every_existing_row(db_path):
    _boot(db_path)                                                  # build a complete schema
    _seed_business_rows(db_path)
    _sql(db_path, f"DROP TABLE {TABLE}")                            # = a database from before this feature
    assert _table_sql(db_path) is None
    before = _business_data(db_path)

    _boot(db_path)
    assert _table_sql(db_path) is not None and _has_index(db_path)
    assert _events(db_path) == []                                   # nothing backfilled: history stays unknown
    assert _business_data(db_path) == before                       # ITR / Checklist / audit / users / roles: verbatim
    assert before["itr"][0][0] == "itr-old"                         # (and the rows were really there to compare)


# ── 2. a brand-new database ──────────────────────────────────────────────

def test_a_brand_new_database_initialises_normally_through_the_migration(db_path):
    out = _boot(db_path)
    sql = _table_sql(db_path)
    assert sql is not None and "AUTOINCREMENT" in sql.upper() and _has_index(db_path)
    assert _events(db_path) == []
    assert "STARTUP ABORTED" not in out and "is missing column" not in out
    # the schema the migration made is the schema the model writes to
    eng = create_engine(f"sqlite:///{db_path}")
    try:
        import models
        cols = {c["name"]: c for c in inspect(eng).get_columns(TABLE)}
        model_cols = {c.name: c for c in models.ITRApprovalEvent.__table__.columns}
        assert set(cols) == set(model_cols)
        for name, mc in model_cols.items():
            assert cols[name]["nullable"] == (mc.nullable and not mc.primary_key), name
        assert {i["name"] for i in inspect(eng).get_indexes(TABLE)} == {INDEX}
    finally:
        eng.dispose()


def test_start_up_create_all_skips_the_table_but_a_plain_create_all_does_not(tmp_path):
    import models
    from database import Base
    eng = create_engine(f"sqlite:///{tmp_path / 'skip.db'}")
    try:
        models.create_all_except_migration_owned(eng)
        assert TABLE not in inspect(eng).get_table_names() and "itr" in inspect(eng).get_table_names()
        Base.metadata.create_all(eng)                                # what every other test does
        assert TABLE in inspect(eng).get_table_names()
    finally:
        eng.dispose()


# ── 3. restarts neither recreate nor empty it; ids are never reused ──────

def test_repeated_starts_keep_the_table_and_every_event(db_path):
    _boot(db_path)
    _insert_event(db_path, seq=1)
    _insert_event(db_path, seq=2, event_type="REVOKED")
    snapshot = _events(db_path)
    sql_before = _table_sql(db_path)
    for _ in range(3):
        _boot(db_path)
        assert _events(db_path) == snapshot
    assert _table_sql(db_path) == sql_before and _has_index(db_path)


def test_event_ids_are_never_reused(db_path):
    _boot(db_path)
    _insert_event(db_path, seq=1)
    _insert_event(db_path, seq=2)
    _sql(db_path, f"DELETE FROM {TABLE} WHERE id = 2")
    _boot(db_path)
    _insert_event(db_path, seq=3)
    assert [r[0] for r in _events(db_path)] == [1, 3]               # the deleted id 2 does not come back


# ── 4. a development database made by the earlier create_all ─────────────

def test_a_table_an_earlier_build_made_with_create_all_and_already_holding_events_is_adopted(db_path):
    _boot(db_path)
    _sql(db_path, f"DROP TABLE {TABLE}")
    import models
    eng = create_engine(f"sqlite:///{db_path}")
    try:
        models.ITRApprovalEvent.__table__.create(eng)              # exactly what the old start-up create_all did
    finally:
        eng.dispose()
    _insert_event(db_path, seq=1, actor="dev-approver")
    _insert_event(db_path, seq=2, event_type="REVOKED")
    snapshot = _events(db_path)
    old_sql = _table_sql(db_path)

    out = _boot(db_path)
    assert _events(db_path) == snapshot                             # untouched
    assert _table_sql(db_path) == old_sql                           # not dropped / recreated
    assert _has_index(db_path)
    assert "STARTUP ABORTED" not in out and "is missing column" not in out


def test_an_existing_table_with_the_wrong_shape_stops_the_migration_and_is_left_untouched(db_path, caplog):
    _boot(db_path)
    _sql(db_path, f"DROP TABLE {TABLE}")
    _sql(db_path, f"CREATE TABLE {TABLE} (id INTEGER PRIMARY KEY, itr_id VARCHAR)")      # an incompatible leftover ...
    _sql(db_path, f"INSERT INTO {TABLE} (itr_id) VALUES ('precious-history')")           # ... that already holds a row
    eng = create_engine(f"sqlite:///{db_path}")
    import db_migrations
    real = db_migrations.engine
    db_migrations.engine = eng
    try:
        with caplog.at_level("ERROR"), pytest.raises(db_migrations.MigrationError, match="missing column") as exc:
            db_migrations._create_itr_approval_events_table()
    finally:
        db_migrations.engine = real
        eng.dispose()
    assert "STARTUP ABORTED" in caplog.text and "sequence" in caplog.text
    assert "may already have created the missing index" in str(exc.value)          # honest: a partial schema step is possible
    assert INDEX in {r[0] for r in _sql(db_path, "SELECT name FROM sqlite_master WHERE type='index'")}   # ... and here it did happen
    # no table dropped, rebuilt or rewritten; no event row touched
    assert _sql(db_path, f"SELECT id, itr_id FROM {TABLE}") == [(1, "precious-history")]
    assert "sequence" not in (_table_sql(db_path) or "")


# ── 5. a failed migration retries safely and never marks itself done ─────

class _Fault:
    """Raise once when a statement containing `needle` is about to run."""
    def __init__(self, engine, needle):
        self.engine, self.needle, self.fired = engine, needle, False
        event.listen(engine, "before_cursor_execute", self._listen)

    def _listen(self, conn, cursor, statement, parameters, context, executemany):
        if not self.fired and self.needle in statement:
            self.fired = True
            raise RuntimeError("injected migration failure")


@pytest.fixture
def mig_engine(tmp_path, monkeypatch):
    import db_migrations
    eng = create_engine(f"sqlite:///{tmp_path / 'retry.db'}")
    monkeypatch.setattr(db_migrations, "engine", eng)
    yield eng
    eng.dispose()


def _tables(eng):
    return set(inspect(eng).get_table_names())


def test_failure_before_the_table_exists_aborts_leaves_nothing_and_the_retry_succeeds(mig_engine, caplog):
    import db_migrations
    fault = _Fault(mig_engine, "CREATE TABLE IF NOT EXISTS itr_approval_events")
    with caplog.at_level("ERROR"), pytest.raises(db_migrations.MigrationError, match="could not be created or verified"):
        db_migrations._create_itr_approval_events_table()           # start-up must STOP, not log-and-continue
    assert fault.fired and "STARTUP ABORTED" in caplog.text
    assert TABLE not in _tables(mig_engine)
    assert "migration_flags" not in _tables(mig_engine)             # nothing was recorded as done
    db_migrations._create_itr_approval_events_table()               # next start
    assert TABLE in _tables(mig_engine) and INDEX in {i["name"] for i in inspect(mig_engine).get_indexes(TABLE)}


def test_failure_between_table_and_index_aborts_then_completes_on_retry_and_keeps_rows(mig_engine, caplog):
    import db_migrations
    fault = _Fault(mig_engine, "CREATE INDEX IF NOT EXISTS ix_itr_approval_events_itr_id")
    with caplog.at_level("ERROR"), pytest.raises(db_migrations.MigrationError, match="partial schema"):
        db_migrations._create_itr_approval_events_table()
    assert fault.fired and "STARTUP ABORTED" in caplog.text
    assert TABLE in _tables(mig_engine)                             # half-done: table yes, index no ...
    assert INDEX not in {i["name"] for i in inspect(mig_engine).get_indexes(TABLE)}
    with mig_engine.begin() as conn:                                # ... and something already wrote a row in that state
        conn.exec_driver_sql(f"INSERT INTO {TABLE} (itr_id, sequence, event_type, occurred_at) VALUES ('i', 1, 'APPROVED', 't')")
    db_migrations._create_itr_approval_events_table()               # retry completes the job, keeps the row
    assert INDEX in {i["name"] for i in inspect(mig_engine).get_indexes(TABLE)}
    with mig_engine.connect() as conn:
        assert conn.exec_driver_sql(f"SELECT COUNT(*) FROM {TABLE}").scalar() == 1
    db_migrations._create_itr_approval_events_table()               # and a third run is a no-op
    with mig_engine.connect() as conn:
        assert conn.exec_driver_sql(f"SELECT COUNT(*) FROM {TABLE}").scalar() == 1


def test_the_migration_reads_and_writes_nothing_but_its_own_table(mig_engine):
    import db_migrations
    with mig_engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE itr (id VARCHAR PRIMARY KEY, status VARCHAR, approvedBy VARCHAR)")
        conn.exec_driver_sql("INSERT INTO itr VALUES ('a', 'Approved', NULL)")
    statements = []

    @event.listens_for(mig_engine, "before_cursor_execute")
    def _spy(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    db_migrations._create_itr_approval_events_table()
    touched = " ".join(s.lower() for s in statements if not s.lstrip().upper().startswith("PRAGMA"))
    assert "itr_approval_events" in touched
    import re
    assert not re.search(r"\b(itr|checklist|audit_logs|users|insert|update|delete)\b", touched.replace("itr_approval_events", ""))
    with mig_engine.connect() as conn:
        assert conn.exec_driver_sql("SELECT id, status, approvedBy FROM itr").fetchall() == [("a", "Approved", None)]


# ── 6. a failing approval-events migration stops START-UP (2026-09-20) ────

def _seeder_would_repair_marker(db_path):
    """Make a change that the seeder, if it ran, would undo (it re-syncs the admin role's permissions on every start)."""
    _sql(db_path, "DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE lower(name)='admin') "
                  "AND permission_id = (SELECT MIN(id) FROM permissions)")
    return _sql(db_path, "SELECT COUNT(*) FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE lower(name)='admin')")


def _break_the_table(db_path):
    _sql(db_path, f"DROP TABLE {TABLE}")
    _sql(db_path, f"CREATE TABLE {TABLE} (id INTEGER PRIMARY KEY, itr_id VARCHAR)")
    _sql(db_path, f"INSERT INTO {TABLE} (itr_id) VALUES ('history-that-must-survive')")


def test_start_up_aborts_before_seeding_when_the_table_is_incompatible_and_changes_nothing(db_path):
    _boot(db_path)
    marker = _seeder_would_repair_marker(db_path)
    _break_the_table(db_path)
    business = _business_data(db_path)
    sql_before = _table_sql(db_path)

    r = run_python("import main", db_path, extra_env={"INITIAL_ADMIN_PASSWORD": "Migration-Test-Pw-123456", "ENVIRONMENT": "staging"},
                   timeout=240, check=False)
    text = r.stdout + r.stderr
    assert r.returncode != 0                                                        # the process did not start
    assert "MigrationError" in text and "itr_approval_events" in text and "missing column" in text and "STARTUP ABORTED" in text
    # the seeder never ran (it would have restored the admin role's permission) and nothing else moved
    assert _sql(db_path, "SELECT COUNT(*) FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE lower(name)='admin')") == marker
    assert "Running database seeding" not in text and "Seeding completed" not in text
    assert _business_data(db_path) == business
    # the incompatible table and its row were not dropped, rebuilt or rewritten
    assert _table_sql(db_path) == sql_before and _sql(db_path, f"SELECT itr_id FROM {TABLE}") == [("history-that-must-survive",)]


def test_a_server_process_with_a_failing_migration_exits_without_starting_or_accepting_requests(db_path):
    _boot(db_path)
    _break_the_table(db_path)
    server = ("import uvicorn\n"
              "uvicorn.run('main:app', host='127.0.0.1', port=8, log_level='info')\n")     # port 8: it must never get as far as binding
    r = run_python(server, db_path, extra_env={"INITIAL_ADMIN_PASSWORD": "Migration-Test-Pw-123456", "ENVIRONMENT": "staging"},
                   timeout=240, check=False)
    text = r.stdout + r.stderr
    assert r.returncode != 0
    assert "MigrationError" in text
    for started in ("Application startup complete", "Uvicorn running on", "Started server process", "Background scheduler started", "Scheduler] Next run"):
        assert started not in text                                                  # no lifespan, no scheduler, no listening socket


def test_the_next_start_after_the_cause_is_fixed_succeeds_and_keeps_the_history(db_path):
    _boot(db_path)
    _break_the_table(db_path)
    assert run_python("import main", db_path, extra_env={"INITIAL_ADMIN_PASSWORD": "x-Migration-Pw-1", "ENVIRONMENT": "staging"},
                      check=False, timeout=240).returncode != 0
    # a person fixes the table by hand, keeping the row (add the missing columns)
    for col, ddl in [("document_number", "VARCHAR"), ("sequence", "INTEGER NOT NULL DEFAULT 1"), ("event_type", "VARCHAR NOT NULL DEFAULT 'APPROVED'"),
                     ("occurred_at", "VARCHAR NOT NULL DEFAULT ''"), ("actor_user_id", "INTEGER"), ("actor_username", "VARCHAR"),
                     ("actor_full_name", "VARCHAR"), ("status_before", "VARCHAR"), ("status_after", "VARCHAR"), ("reason", "TEXT"),
                     ("approval_event_id", "INTEGER"), ("itr_snapshot", "TEXT"), ("checklists_snapshot", "TEXT"), ("snapshot_sha256", "VARCHAR")]:
        _sql(db_path, f"ALTER TABLE {TABLE} ADD COLUMN {col} {ddl}")
    out = _boot(db_path)                                                            # now compatible: adopted, index added, start-up completes
    assert "STARTUP ABORTED" not in out and _has_index(db_path)
    assert _sql(db_path, f"SELECT itr_id FROM {TABLE}") == [("history-that-must-survive",)]
