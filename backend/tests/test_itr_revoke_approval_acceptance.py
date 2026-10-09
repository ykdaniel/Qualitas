"""Acceptance tests for the "Revoke Approval" flow (2026-09-19).

Unlike the earlier e2e file, NOTHING about identity is mocked here: each
actor logs in through the real POST /api/auth/login (real password hashing,
real httpOnly cookies, real JWT decode in `get_current_user`), with its own
TestClient/cookie jar and its own role row in the DB — not Admin, not a
dependency-override user. Every request gets its own DB session (as in
production), and audit checks re-read through a brand-new session after the
request sessions are closed.

Two modes:
  * default: minimal FastAPI app (auth/itr/checklist routers) on an
    in-memory DB — fast, runs in the normal suite.
  * ACCEPT_FULLSTACK=1 (with DATABASE_URL pointing at a THROWAWAY file
    DB): drives the real `main.app` instead — CSRF middleware, migrations
    and seeder included. Never point DATABASE_URL at real data.
"""
import json
import os
import re
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from core import perms
from core.security import get_password_hash

FULLSTACK = os.environ.get("ACCEPT_FULLSTACK") == "1"
PW = "Accept-Test-1234"
_LOGIN_CACHE = {}


class Env:
    def __init__(self, app, session_factory):
        self.app = app
        self.Session = session_factory
        self.clients = {}

    def login(self, username):
        # The real app rate-limits /auth/login per IP (429). In full-stack
        # mode reuse one real session per account across tests instead of
        # re-logging in every test — still a genuine login, just done once.
        if FULLSTACK and username in _LOGIN_CACHE:
            self.clients[username] = _LOGIN_CACHE[username]
            return _LOGIN_CACHE[username]
        client = TestClient(self.app)
        r = client.post("/api/auth/login", data={"username": username, "password": PW})
        assert r.status_code == 200, r.text
        csrf = client.cookies.get("csrf_token")
        if csrf:
            client.headers["X-CSRF-Token"] = csrf
        self.clients[username] = client
        if FULLSTACK:
            _LOGIN_CACHE[username] = client
        return client

    def anonymous(self):
        return TestClient(self.app)


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


def _seed(Session):
    db = Session()
    if db.query(models.Role).filter_by(name="AcceptEditor").first():
        db.close()  # full-stack mode reuses one throwaway DB across tests
        return
    base = [perms.ITR_VIEW, perms.ITR_CREATE, perms.ITR_UPDATE,
            perms.CHECKLIST_VIEW, perms.CHECKLIST_CREATE, perms.CHECKLIST_UPDATE]
    roles = {
        # can do everything on ITR/Checklist EXCEPT approve and reopen-closed
        "AcceptEditor": base,
        # approver: ITR_APPROVE but deliberately NOT CHECKLIST_CLOSE
        "AcceptApprover": base + [perms.ITR_APPROVE],
        # closer: CHECKLIST_CLOSE but deliberately NOT ITR_APPROVE
        "AcceptCloser": base + [perms.CHECKLIST_CLOSE],
    }
    for name, codes in roles.items():
        role = models.Role(name=name)
        role.permissions_rel = [_get_or_create_perm(db, c) for c in codes]
        db.add(role)
        db.flush()
        uname = name.replace("Accept", "acc_").lower()
        db.add(models.User(
            username=uname, email=f"{uname}@example.com", is_active=True,
            hashed_password=get_password_hash(PW), role_id=role.id,
        ))
    db.add(models.Contractor(id="ACC-V1", name="Accept Co", abbreviation="ACC"))
    db.commit()
    db.close()


@pytest.fixture
def env():
    if FULLSTACK:
        from isolation import require_isolated_fullstack
        require_isolated_fullstack()          # refuses (before main is imported) unless DATABASE_URL is a throwaway test DB
        import main
        import database
        _seed(database.SessionLocal)
        yield Env(main.app, database.SessionLocal)
        return

    from database import Base, get_db
    from routers import auth as auth_router, itr as itr_router, checklist as checklist_router
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _seed(Session)

    app = FastAPI()
    for r in (auth_router.router, itr_router.router, checklist_router.router):
        app.include_router(r, prefix="/api")

    def _db():
        s = Session()  # one session per request, closed afterwards
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    # auth helpers (token blacklist etc.) may open their own session via
    # database.SessionLocal — point it at this in-memory DB too.
    import database as database_module
    orig = (database_module.engine, database_module.SessionLocal)
    database_module.engine, database_module.SessionLocal = engine, Session
    try:
        yield Env(app, Session)
    finally:
        database_module.engine, database_module.SessionLocal = orig
        Base.metadata.drop_all(engine)


ITEM = {"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""}


def _mk_itr(env, status="In Progress"):
    db = env.Session()
    import uuid
    itr = models.ITR(
        id=uuid.uuid4().hex, vendor_id="ACC-V1", documentNumber=f"ITR-ACC-{uuid.uuid4().hex[:6]}",
        description="accept", rev="Rev1.0", submit="2026-09-19", status=status, raiseDate="2026-09-19",
    )
    db.add(itr)
    db.commit()
    itr_id = itr.id
    db.close()
    return itr_id


def _approved_itr(env):
    """editor builds template + links + fills Pass; approver approves."""
    editor = env.login("acc_editor")
    approver = env.login("acc_approver")
    itr_id = _mk_itr(env)
    tpl = editor.post("/api/checklist/", json={
        "activity": "Rebar", "date": "2026-09-19", "status": "Ongoing",
        "detail_data": json.dumps({"items": [ITEM]}),
    })
    assert tpl.status_code == 200, tpl.text
    r = editor.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": tpl.json()["id"]})
    assert r.status_code == 200, r.text
    db = env.Session()
    inst_id = db.query(models.Checklist).filter_by(itrId=itr_id).one().id
    db.close()
    filled = json.dumps({"items": [{**ITEM, "situation": "Measured 150mm", "result": "O"}]})
    r = editor.put(f"/api/checklist/{inst_id}/", json={
        "status": "Pass", "passCount": 1, "failCount": 0, "detail_data": filled})
    assert r.status_code == 200, r.text
    r = approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Approved"
    return itr_id, inst_id


# ── 1. permissions ───────────────────────────────────────────────────────

def test_button_permission_source_and_api_gate(env):
    """The revoke button renders iff /user/profile lists itr:approve:all
    (AuthContext.hasPermission). Check that source per real account, then
    prove the API itself refuses everyone else."""
    itr_id, _ = _approved_itr(env)
    approver, editor = env.clients["acc_approver"], env.clients["acc_editor"]

    assert perms.ITR_APPROVE in approver.get("/api/user/profile").json()["permissions"]
    assert perms.ITR_APPROVE not in editor.get("/api/user/profile").json()["permissions"]

    body = {"new_status": "In Progress", "reason": "should be refused"}
    assert editor.post(f"/api/itr/{itr_id}/revoke-approval", json=body).status_code == 403
    closer = env.login("acc_closer")  # has CHECKLIST_CLOSE, still no ITR_APPROVE
    assert closer.post(f"/api/itr/{itr_id}/revoke-approval", json=body).status_code == 403
    assert env.anonymous().post(f"/api/itr/{itr_id}/revoke-approval", json=body).status_code in (401, 403)

    db = env.Session()
    assert db.get(models.ITR, itr_id).status == "Approved"  # data unchanged
    db.close()


# ── 2. revoke operation ──────────────────────────────────────────────────

@pytest.mark.parametrize("reason", ["", "   ", "\t\n"])
def test_blank_reason_rejected_by_backend(env, reason):
    itr_id, _ = _approved_itr(env)
    r = env.clients["acc_approver"].post(
        f"/api/itr/{itr_id}/revoke-approval", json={"new_status": "In Progress", "reason": reason})
    assert r.status_code == 400
    db = env.Session()
    assert db.get(models.ITR, itr_id).status == "Approved"
    assert db.query(models.AuditLog).filter_by(
        entity_type="ITR", entity_id=itr_id, action="REVOKE_APPROVAL").count() == 0  # nothing half-written
    db.close()


def test_missing_reason_rejected(env):
    itr_id, _ = _approved_itr(env)
    r = env.clients["acc_approver"].post(f"/api/itr/{itr_id}/revoke-approval", json={"new_status": "In Progress"})
    assert r.status_code == 422


def test_revoke_success_then_reread_is_in_progress(env):
    itr_id, _ = _approved_itr(env)
    approver = env.clients["acc_approver"]
    r = approver.post(f"/api/itr/{itr_id}/revoke-approval",
                      json={"new_status": "In Progress", "reason": "Wrong rebar grade found"})
    assert r.status_code == 200, r.text
    assert approver.get(f"/api/itr/{itr_id}").json()["status"] == "In Progress"
    # a different actor also sees the persisted state
    assert env.login("acc_editor").get(f"/api/itr/{itr_id}").json()["status"] == "In Progress"


def test_revoke_on_not_approved_or_void_itr_rejected(env):
    approver = env.login("acc_approver")
    in_progress = _mk_itr(env)
    r = approver.post(f"/api/itr/{in_progress}/revoke-approval", json={"new_status": "In Progress", "reason": "x"})
    assert r.status_code == 400
    void = _mk_itr(env, status="Void")
    r = approver.post(f"/api/itr/{void}/revoke-approval", json={"new_status": "In Progress", "reason": "x"})
    assert r.status_code == 400
    db = env.Session()
    assert db.get(models.ITR, void).status == "Void"
    db.close()


def test_normal_update_cannot_bypass_revoke_flow(env):
    itr_id, _ = _approved_itr(env)
    approver = env.clients["acc_approver"]
    for target in ("In Progress", "Reject", "Void"):
        r = approver.put(f"/api/itr/{itr_id}", json={"status": target})
        assert r.status_code == 400, (target, r.text)
    assert approver.get(f"/api/itr/{itr_id}").json()["status"] == "Approved"


# ── 3. checklist's own lock ──────────────────────────────────────────────

def test_revoke_does_not_reopen_checklist_or_relax_its_lock(env):
    itr_id, inst_id = _approved_itr(env)
    editor, approver, closer = env.clients["acc_editor"], env.clients["acc_approver"], env.login("acc_closer")

    # While Approved: even a CHECKLIST_CLOSE holder is frozen out.
    r = closer.put(f"/api/checklist/{inst_id}/", json={"status": "Ongoing"})
    assert r.status_code == 400

    assert approver.post(f"/api/itr/{itr_id}/revoke-approval",
                         json={"new_status": "In Progress", "reason": "Recheck"}).status_code == 200

    # Revoking did not touch the checklist.
    db = env.Session()
    chk = db.get(models.Checklist, inst_id)
    assert chk.status == "Pass" and chk.passCount == 1
    db.close()

    # Still governed by the original Reopen permission/flow:
    edit = {"detail_data": json.dumps({"items": [{**ITEM, "situation": "Measured 250mm", "result": "X"}]}),
            "status": "Fail", "passCount": 0, "failCount": 1}
    assert editor.put(f"/api/checklist/{inst_id}/", json=edit).status_code == 403      # no CHECKLIST_CLOSE
    assert approver.put(f"/api/checklist/{inst_id}/", json=edit).status_code == 403    # ITR_APPROVE != CLOSE
    # direct result rewrite while still Pass is refused even for the closer (needs Reopen first)
    assert closer.put(f"/api/checklist/{inst_id}/", json=edit).status_code == 400
    # the sanctioned path: Reopen, then edit
    assert closer.put(f"/api/checklist/{inst_id}/", json={"status": "Ongoing"}).status_code == 200
    assert closer.put(f"/api/checklist/{inst_id}/", json=edit).status_code == 200


# ── 4. audit preservation ────────────────────────────────────────────────

def test_audit_entry_persisted_and_snapshot_immutable_afterwards(env):
    itr_id, inst_id = _approved_itr(env)
    approver, closer = env.clients["acc_approver"], env.login("acc_closer")
    reason = "Rebar grade mismatch found in mill cert"
    assert approver.post(f"/api/itr/{itr_id}/revoke-approval",
                         json={"new_status": "In Progress", "reason": reason}).status_code == 200

    def read_entry():
        s = env.Session()  # brand-new session; all request sessions are already closed
        try:
            approver_user = s.query(models.User).filter_by(username="acc_approver").one()
            rows = s.query(models.AuditLog).filter(
                models.AuditLog.entity_type == "ITR", models.AuditLog.entity_id == itr_id,
                models.AuditLog.reason == reason).all()
            assert len(rows) == 1, [(r.action, r.reason) for r in rows]
            row = rows[0]
            return approver_user.id, row.user_id, row.username, row.timestamp, row.reason, row.old_value, row.new_value
        finally:
            s.close()

    uid, row_uid, row_uname, ts, row_reason, old_json, new_json = read_entry()
    assert row_uid == uid and row_uname == "acc_approver"          # operator
    assert row_reason == reason                                     # reason
    assert re.match(r"\d{4}-\d{2}-\d{2}T", ts)                       # time
    old = json.loads(old_json)
    assert old["status"] == "Approved"                              # original approval state
    assert "approvedBy" in old and "approvedAt" in old              # original approval info carried
    snap = old["checklists"]                                        # checklist result snapshot
    assert len(snap) == 1 and snap[0]["id"] == inst_id and snap[0]["status"] == "Pass"
    assert snap[0]["items"][0]["result"] == "O" and snap[0]["items"][0]["situation"] == "Measured 150mm"
    assert json.loads(new_json)["status"] == "In Progress"

    # Legitimate later edit: Reopen + rewrite the results.
    assert closer.put(f"/api/checklist/{inst_id}/", json={"status": "Ongoing"}).status_code == 200
    assert closer.put(f"/api/checklist/{inst_id}/", json={
        "detail_data": json.dumps({"items": [{**ITEM, "situation": "Re-measured 260mm", "result": "X"}]}),
        "status": "Fail", "passCount": 0, "failCount": 1}).status_code == 200

    # Live checklist changed, saved snapshot did not.
    s = env.Session()
    live = json.loads(s.get(models.Checklist, inst_id).detail_data)["items"][0]
    s.close()
    assert live["result"] == "X"
    assert read_entry()[5] == old_json


# ── 5. UI messages (source-level; no browser here) ───────────────────────

def _translations():
    src = (Path(__file__).resolve().parents[2] / "react-app/src/context/LanguageContext.tsx").read_text(encoding="utf-8")
    def grab(key):
        return re.findall(rf"'{re.escape(key)}': '((?:[^'\\]|\\.)*)'", src)  # [en, zh]
    return grab


@pytest.mark.parametrize("key_prefix", ["checklist.lockedNote", "itr.lockedMsg"])
def test_lock_messages_approved_points_to_revoke_void_does_not(key_prefix):
    grab = _translations()
    approved_key = key_prefix + ("Approved" if key_prefix == "checklist.lockedNote" else "")
    void_key = key_prefix + "Void"
    approved, void = grab(approved_key), grab(void_key)
    assert len(approved) == 2 and len(void) == 2, (approved_key, void_key)   # en + zh each
    en_a, zh_a = approved
    en_v, zh_v = void
    assert "revoke" in en_a.lower() and "撤回" in zh_a
    assert "revoke" not in en_v.lower() and "撤回" not in zh_v
    assert "void" in en_v.lower() and "已作廢" in zh_v
    assert "edit" in en_v.lower() and ("不可" in zh_v)
