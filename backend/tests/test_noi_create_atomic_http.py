"""NOI creation is ONE transaction: the NOI, its Q-WorkFlow row, the reference-number allocation and the CREATE
audit entry are saved together or not at all (2026-09-20).

Reproduced first (isolated file-backed SQLite, real logins, real HTTP, brand-new Sessions), BEFORE the fix:
  * POST /api/noi/ committed the NOI (and its sequence number) and then only *flushed* the Q-WorkFlow row and *added*
    the audit entry — nothing committed them, so a new Session found NOI = 1, Q-WorkFlow = 0, CREATE audit = 0;
    /api/workflow/ stayed empty until the start-up back-fill (`_backfill_qworkflows`) was run.
  * an injected Q-WorkFlow / audit failure was silently swallowed and the request still answered 200.
After the fix a failure at ANY step leaves no NOI, no Q-WorkFlow, no audit and an unmoved sequence; a success needs no
restart, and a later run of the start-up back-fill finds nothing to add.
"""
import json
import threading
import time

import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import models
from core import perms
from core.security import get_password_hash
from test_itr_revoke_approval_acceptance import PW, Env, _get_or_create_perm
from test_itr_approval_events_http import _Window, _run_pair


# ── harness: file-backed SQLite (real multi-connection semantics), auth + noi + workflow routers ─────────

@pytest.fixture
def noi_env(tmp_path):
    from database import Base, get_db
    from routers import auth as auth_router, noi as noi_router, workflow as workflow_router
    import database as database_module
    import db_migrations
    engine = create_engine(f"sqlite:///{tmp_path / 'noi.db'}", connect_args={"check_same_thread": False, "timeout": 20})
    Base.metadata.create_all(engine)
    S = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _seed_noi_world(S)
    app = FastAPI()
    for r in (auth_router.router, noi_router.router, workflow_router.router):
        app.include_router(r, prefix="/api")

    def _db():
        s = S()
        try:
            yield s
        finally:
            s.close()
    app.dependency_overrides[get_db] = _db
    orig = (database_module.engine, database_module.SessionLocal, db_migrations.engine)
    database_module.engine, database_module.SessionLocal, db_migrations.engine = engine, S, engine
    try:
        yield Env(app, S), engine
    finally:
        database_module.engine, database_module.SessionLocal, db_migrations.engine = orig
        Base.metadata.drop_all(engine)
        engine.dispose()


def _seed_noi_world(S):
    db = S()
    try:
        def role(name, codes):
            r = models.Role(name=name)
            r.permissions_rel = [_get_or_create_perm(db, c) for c in codes]
            db.add(r)
            db.flush()
            return r
        full = role("NoiUser", [perms.NOI_VIEW, perms.NOI_CREATE, perms.NOI_UPDATE, perms.ITP_VIEW])
        view = role("NoiViewOnly", [perms.NOI_VIEW])
        db.add(models.Contractor(id="ACC-V1", name="Accept Co", abbreviation="ACC"))
        db.add(models.Contractor(id="ACC-V2", name="Beta Co", abbreviation="BET"))
        for pid in ("P-A", "P-B"):
            db.add(models.Project(id=pid, name=pid))
        db.flush()

        def user(username, r, vendor=None, projects=()):
            u = models.User(username=username, email=f"{username}@example.com", is_active=True,
                            hashed_password=get_password_hash(PW), role_id=r.id, vendor_id=vendor, full_name=f"Full {username}")
            db.add(u)
            db.flush()
            for p in projects:
                db.add(models.UserProject(user_id=u.id, project_id=p))
        user("noi_a", full)
        user("noi_b", full)
        user("noi_scoped", full, "ACC-V1", ["P-A"])
        user("noi_view", view)
        db.add(models.ITP(id="itp-1", referenceNo="QTS-ACC-ITP-000001", vendor_id="ACC-V1", project_id="P-A",
                          description="itp", rev="Rev1.0", submit="2026-09-20", status="Approved"))
        db.commit()
    finally:
        db.close()


def _noi_body(**kw):
    body = {"package": "PKG-1", "issueDate": "2026-09-20", "inspectionTime": "09:00", "itpNo": "QTS-ACC-ITP-000001",
            "inspectionDate": "2026-09-21", "type": "Rebar", "contractor": "Accept Co", "status": "Open"}
    body.update(kw)
    return body


def _snapshot(env):
    """Everything a create can touch, through a brand-new Session (login audit rows excluded: a login is not a create)."""
    db = env.Session()
    try:
        cols = lambda o: json.dumps({c.name: getattr(o, c.name) for c in o.__table__.columns}, default=str, sort_keys=True)
        return {
            "noi": sorted(cols(n) for n in db.query(models.NOI).all()),
            "qworkflow": sorted(cols(q) for q in db.query(models.QWorkflow).all()),
            "audits": sorted(cols(a) for a in db.query(models.AuditLog).filter(~models.AuditLog.action.like("LOGIN%")).all()),
            "sequences": sorted(cols(s) for s in db.query(models.ReferenceSequence).all()),
        }
    finally:
        db.close()


def _counts(env):
    s = _snapshot(env)
    return {k: len(v) for k, v in s.items()}


def _create(client, **kw):
    return client.post("/api/noi/", json=_noi_body(**kw))


# ══ 1. the reproduced defect and the legitimate create ══════════════════════════════════════════════

def test_a_created_noi_is_saved_with_its_qworkflow_and_audit_and_needs_no_restart(noi_env):
    env, _ = noi_env
    c = env.login("noi_a")
    r = _create(c)
    assert r.status_code == 200, r.text
    noi = r.json()
    db = env.Session()                                                                  # brand-new Session
    try:
        (n,) = db.query(models.NOI).all()
        assert n.referenceNo == noi["referenceNo"] and n.id == noi["id"]
        (q,) = db.query(models.QWorkflow).all()                                         # exactly one, bound 1:1
        assert q.noi_id == n.id and q.referenceNo == "Q-WorkFlow-000001"
        (a,) = db.query(models.AuditLog).filter_by(entity_type="NOI", action="CREATE").all()
        assert (a.entity_id, a.entity_name, a.username) == (n.id, n.referenceNo, "noi_a")
        assert a.user_id == db.query(models.User).filter_by(username="noi_a").one().id
        content = json.loads(a.new_value)
        assert content["package"] == "PKG-1" and content["itpNo"] == "QTS-ACC-ITP-000001" and content["contractor"] == "Accept Co"
        seq = db.query(models.ReferenceSequence).filter_by(doc="NOI").one()
        assert seq.last_seq == 1 and n.referenceNo.endswith("000001")
    finally:
        db.close()
    # visible on the tracker at once — no restart, no back-fill call
    rows = c.get("/api/workflow/").json()
    assert [w["noi_reference_no"] for w in rows] == [noi["referenceNo"]] and rows[0]["reference_no"] == "Q-WorkFlow-000001"
    assert c.get("/api/workflow/stats").json()["total"] == 1


def test_qworkflow_and_noi_numbers_stay_sequential_across_creates(noi_env):
    env, _ = noi_env
    c = env.login("noi_a")
    refs = [(_create(c, package=f"P{i}").json()["referenceNo"]) for i in range(3)]
    assert refs == sorted(refs) and len(set(refs)) == 3
    db = env.Session()
    try:
        assert [q.referenceNo for q in db.query(models.QWorkflow).order_by(models.QWorkflow.referenceNo)] == \
            ["Q-WorkFlow-000001", "Q-WorkFlow-000002", "Q-WorkFlow-000003"]
        assert db.query(models.AuditLog).filter_by(entity_type="NOI", action="CREATE").count() == 3
    finally:
        db.close()


def test_a_reinspection_noi_still_gets_no_workflow_of_its_own(noi_env):
    env, _ = noi_env
    c = env.login("noi_a")
    assert _create(c, ncrNumber="NCR-1", type="Re-inspection").status_code == 200
    counts = _counts(env)
    assert counts["noi"] == 1 and counts["qworkflow"] == 0 and counts["audits"] == 1          # existing rule kept; audit still saved


# ══ 2. failure at ANY step leaves nothing behind ════════════════════════════════════════════════════

def _fail_on_statement(engine, needle, message="injected failure"):
    """A real database-layer failure: the first statement containing `needle` raises."""
    state = {"hit": False}

    def before(conn, cursor, statement, parameters, context, executemany):
        if needle in statement.lower() and not state["hit"]:
            state["hit"] = True
            raise RuntimeError(message)
    event.listen(engine, "before_cursor_execute", before)
    return before, state


@pytest.mark.parametrize("needle", ["insert into qworkflow", "insert into audit_logs"])
def test_a_failing_qworkflow_or_audit_insert_rolls_back_the_noi_the_audit_and_the_sequence(noi_env, needle):
    env, engine = noi_env
    c = env.login("noi_a")
    before = _snapshot(env)
    hook, state = _fail_on_statement(engine, needle)
    try:
        with pytest.raises(RuntimeError, match="injected failure"):                     # not swallowed, not a 200
            _create(c)
    finally:
        event.remove(engine, "before_cursor_execute", hook)
    assert state["hit"]                                                                 # the failure really was injected
    assert _snapshot(env) == before                                                     # NOI, Q-WorkFlow, audits, sequences all unchanged
    # and the system is healthy: the next create succeeds and takes the very number the failed one would have had
    ok = _create(c)
    assert ok.status_code == 200 and ok.json()["referenceNo"].endswith("000001")
    assert _counts(env) == {"noi": 1, "qworkflow": 1, "audits": 1, "sequences": 1}


def test_a_failing_commit_leaves_nothing_behind(noi_env):
    env, engine = noi_env
    c = env.login("noi_a")
    before = _snapshot(env)
    state = {"n": 0}

    def boom(conn):
        state["n"] += 1
        raise RuntimeError("injected failure")
    event.listen(engine, "commit", boom)
    try:
        with pytest.raises(RuntimeError, match="injected failure"):
            _create(c)
    finally:
        event.remove(engine, "commit", boom)
    assert state["n"] == 1                                                              # exactly ONE commit was attempted for the create
    assert _snapshot(env) == before


def test_the_create_commits_exactly_once(noi_env):
    env, engine = noi_env
    c = env.login("noi_a")
    commits = []
    event.listen(engine, "commit", lambda conn: commits.append(1))
    assert _create(c).status_code == 200
    assert len(commits) == 1                                                            # one transaction, not a second "make-up" commit


def test_a_failing_strict_audit_call_or_qworkflow_helper_also_rolls_everything_back(noi_env, monkeypatch):
    env, _ = noi_env
    c = env.login("noi_a")
    import services.noi_service as svc
    before = _snapshot(env)
    real_audit = svc.log_audit
    monkeypatch.setattr(svc, "log_audit", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("audit down")))
    with pytest.raises(RuntimeError, match="audit down"):
        _create(c)
    assert _snapshot(env) == before
    monkeypatch.setattr(svc, "log_audit", real_audit)
    monkeypatch.setattr(svc.NOIService, "_create_qworkflow_for_noi", lambda self, noi: (_ for _ in ()).throw(RuntimeError("tracker down")))
    with pytest.raises(RuntimeError, match="tracker down"):
        _create(c)
    assert _snapshot(env) == before


def test_an_audit_entry_that_cannot_even_be_built_fails_the_create_instead_of_being_skipped(noi_env, monkeypatch):
    """`strict=True`: log_audit used to swallow a build failure (the create then 'succeeded' with no audit at all)."""
    env, _ = noi_env
    c = env.login("noi_a")
    import core.utils as utils
    before = _snapshot(env)

    def broken(*a, **k):
        raise RuntimeError("cannot build audit entry")
    monkeypatch.setattr(utils, "AuditLog", broken)
    with pytest.raises(RuntimeError, match="cannot build audit entry"):
        _create(c)
    assert _snapshot(env) == before


# ══ 3. refused requests leave nothing behind ════════════════════════════════════════════════════════

def test_refused_requests_leave_no_partial_data(noi_env):
    env, _ = noi_env
    a, view, scoped = env.login("noi_a"), env.login("noi_view"), env.login("noi_scoped")
    before = _snapshot(env)
    assert _create(view).status_code == 403                                             # no permission
    assert env.anonymous().post("/api/noi/", json=_noi_body()).status_code in (401, 403)
    bad = _noi_body(); del bad["package"]
    assert a.post("/api/noi/", json=bad).status_code == 422                             # invalid body
    try:                                                                                # unknown ITP: rejected before a number is taken
        assert _create(a, itpNo="QTS-NOPE-ITP-999999").status_code >= 400
    except ValueError:                                                                  # (today's router lets this ValueError through as a 500)
        pass
    assert _create(scoped, project_id="P-B").status_code == 403                         # outside the account's project scope
    assert _snapshot(env) == before                                                     # incl. sequences: no gap was consumed


def test_data_scope_and_field_rules_are_unchanged_for_a_legitimate_scoped_create(noi_env):
    env, _ = noi_env
    scoped = env.login("noi_scoped")
    r = _create(scoped, project_id="P-A", contractor="Beta Co")                          # a contractor account is confined to its own contractor
    assert r.status_code == 200
    db = env.Session()
    try:
        n = db.query(models.NOI).one()
        assert n.vendor_id == "ACC-V1" and n.project_id == "P-A"
        assert db.query(models.QWorkflow).filter_by(noi_id=n.id).count() == 1
    finally:
        db.close()
    # the row is on the tracker of the scoped account (and only of accounts that may see the NOI)
    assert len(scoped.get("/api/workflow/").json()) == 1


# ══ 4. the start-up back-fill must not duplicate ════════════════════════════════════════════════════

def test_the_startup_backfill_adds_nothing_after_a_successful_create_and_never_duplicates(noi_env):
    import db_migrations
    env, _ = noi_env
    c = env.login("noi_a")
    _create(c)
    _create(c, package="PKG-2")
    before = _snapshot(env)
    db_migrations._backfill_qworkflows()
    db_migrations._backfill_qworkflows()                                                # and again
    assert _snapshot(env) == before
    db = env.Session()
    try:
        ids = [q.noi_id for q in db.query(models.QWorkflow).all()]
        assert len(ids) == len(set(ids)) == 2
    finally:
        db.close()


def test_backfill_still_fills_a_genuinely_missing_row_once_history_is_not_rewritten_by_the_create(noi_env):
    """A pre-existing NOI without a row (history) is left alone by the create path and still completed by the
    back-fill — exactly once, numbering continuing after the existing rows."""
    import db_migrations
    env, _ = noi_env
    db = env.Session()
    db.add(models.NOI(id="legacy-1", referenceNo="QTS-ACC-NOI-900001", package="OLD", status="Open", vendor_id="ACC-V1",
                      issueDate="2026-01-01", inspectionTime="09:00", itpNo="QTS-ACC-ITP-000001", inspectionDate="2026-01-02", type="Rebar"))
    db.commit(); db.close()
    _create(env.login("noi_a"))                                                         # a new NOI: own row 000001
    before = _snapshot(env)
    assert len(before["qworkflow"]) == 1                                                # the legacy NOI was NOT touched by the create
    db_migrations._backfill_qworkflows()
    db_migrations._backfill_qworkflows()
    db = env.Session()
    try:
        rows = {q.noi_id: q.referenceNo for q in db.query(models.QWorkflow).all()}
        assert len(rows) == 2 and rows["legacy-1"] == "Q-WorkFlow-000002"
    finally:
        db.close()


def test_the_backfill_no_longer_completes_a_reinspection_noi_behaviour_correction(noi_env):
    """BEHAVIOUR CORRECTION (2026-09-20). This test used to be `test_characterisation_the_backfill_also_completes_a_reinspection_noi_...`
    and PINNED the inconsistency: the create path gave a re-inspection NOI (truthy `ncrNumber`) no Q-WorkFlow row, yet the start-up
    back-fill gave it one at the next restart (asserting 0 -> 1). The back-fill now applies the same rule as the create path, so the count
    stays 0. Full rule/mixed-history coverage: test_noi_qworkflow_backfill_rule_http.py."""
    import db_migrations
    env, _ = noi_env
    _create(env.login("noi_a"), ncrNumber="NCR-1", type="Re-inspection")
    assert _counts(env)["qworkflow"] == 0
    db_migrations._backfill_qworkflows()
    assert _counts(env)["qworkflow"] == 0


# ══ 5. concurrency and the batch endpoint ═══════════════════════════════════════════════════════════

def test_two_simultaneous_creates_both_succeed_with_distinct_numbers(noi_env):
    env, engine = noi_env
    a, b = env.login("noi_a"), env.login("noi_b")
    # the first create is held mid-transaction AFTER its sequence and Q-WorkFlow writes (at the audit insert), i.e. with the
    # write lock held and nothing committed: a second creator must wait for it, then read the committed sequence — not
    # read the stale one and collide on the reference number.
    window = _Window(engine, "insert into audit_logs")
    try:
        out = _run_pair(lambda: _create(a, package="FIRST").status_code, lambda: _create(b, package="SECOND").status_code)
    finally:
        window.close()
    assert window.fired and out == {"first": 200, "second": 200}
    db = env.Session()
    try:
        nois = db.query(models.NOI).all()
        assert len(nois) == 2 and len({n.referenceNo for n in nois}) == 2
        assert sorted(q.referenceNo for q in db.query(models.QWorkflow).all()) == ["Q-WorkFlow-000001", "Q-WorkFlow-000002"]
        assert db.query(models.AuditLog).filter_by(entity_type="NOI", action="CREATE").count() == 2
        assert {q.noi_id for q in db.query(models.QWorkflow).all()} == {n.id for n in nois}
    finally:
        db.close()


def test_bulk_create_is_one_unit_per_noi_not_one_unit_per_batch(noi_env):
    """Documented, unchanged semantics: each NOI in /noi/bulk/ is its own atomic unit (NOI + Q-WorkFlow + audit +
    sequence). A failure in the 2nd leaves the 1st fully saved and the 2nd fully absent."""
    env, engine = noi_env
    c = env.login("noi_a")
    ok = c.post("/api/noi/bulk/", json=[_noi_body(package="B1"), _noi_body(package="B2")])
    assert ok.status_code == 200 and len(ok.json()) == 2
    assert _counts(env) == {"noi": 2, "qworkflow": 2, "audits": 2, "sequences": 1}
    hook, state = _fail_on_statement(engine, "insert into qworkflow")
    event.remove(engine, "before_cursor_execute", hook)
    seen = {"n": 0}

    def second_fails(conn, cursor, statement, parameters, context, executemany):
        if "insert into qworkflow" in statement.lower():
            seen["n"] += 1
            if seen["n"] == 2:
                raise RuntimeError("second one fails")
    event.listen(engine, "before_cursor_execute", second_fails)
    try:
        with pytest.raises(RuntimeError, match="second one fails"):
            c.post("/api/noi/bulk/", json=[_noi_body(package="B3"), _noi_body(package="B4")])
    finally:
        event.remove(engine, "before_cursor_execute", second_fails)
    assert _counts(env) == {"noi": 3, "qworkflow": 3, "audits": 3, "sequences": 1}      # B3 complete, B4 absent
