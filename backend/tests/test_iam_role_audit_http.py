"""IAM role changes and their audit entries commit atomically (2026-09-19).

The bug: user_service.create_role/update_role/delete_role called the repository
(which committed) and only THEN logged the audit entry with a logger that just
`db.add()`s — the entry was never committed and vanished when the request's
session closed, so administrators' grants/revocations left no trace.

Real everything except the network: real routes, real login per account (real
password hashing and cookies), a real SQLAlchemy DB with one session PER
REQUEST as in production, and all assertions made through a brand-new session
after the request sessions have closed. Failure injection patches the audit
call / Session.commit for exactly one request.
"""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import models
from core import perms
from core.security import get_password_hash

PW = "Iam-Audit-Pw-123456"
CLOSE, UPDATE = "checklist:close:all", "checklist:update:all"


class Env:
    def __init__(self, app, factory):
        self.app, self.Session = app, factory

    def login(self, username):
        c = TestClient(self.app, raise_server_exceptions=False)     # a failed request must come back as a 500, not raise here
        r = c.post("/api/auth/login", data={"username": username, "password": PW})
        assert r.status_code == 200, r.text
        return c

    def anonymous(self):
        return TestClient(self.app, raise_server_exceptions=False)

    def state(self):
        """Everything a role change touches, read through a brand-new session."""
        db = self.Session()
        try:
            roles = {r.name: {"id": r.id, "description": r.description,
                              "perms": sorted(p.code for p in r.permissions_rel)}
                     for r in db.query(models.Role).all()}
            links = db.execute(text("select count(*) from role_permissions")).scalar()
            audits = db.query(models.AuditLog).filter_by(entity_type="Role").order_by(models.AuditLog.id).all()
            return {"roles": roles, "links": links, "audits": audits}
        finally:
            db.close()


def _codes(*extra):
    return sorted({perms.CHECKLIST_VIEW, UPDATE, *extra})


@pytest.fixture
def env():
    from database import Base, get_db
    from routers import auth as auth_router, iam as iam_router
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session_ = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = Session_()
    codes = [perms.ROLE_MANAGE, perms.ROLE_VIEW, perms.USER_VIEW, perms.CHECKLIST_VIEW, UPDATE, CLOSE, perms.ITR_VIEW]
    prows = {c: models.Permission(code=c, description=c) for c in codes}
    db.add_all(prows.values()); db.flush()
    for name, held in {"IamAdmin": [perms.ROLE_MANAGE, perms.ROLE_VIEW, perms.USER_VIEW],
                       "IamViewer": [perms.ROLE_VIEW]}.items():
        role = models.Role(name=name); role.permissions_rel = [prows[c] for c in held]; db.add(role); db.flush()
        u = name.lower()
        db.add(models.User(username=u, email=f"{u}@example.com", is_active=True,
                           hashed_password=get_password_hash(PW), role_id=role.id))
    db.commit(); db.close()

    app = FastAPI()
    for r in (auth_router.router, iam_router.router):
        app.include_router(r, prefix="/api")

    def _db():
        s = Session_()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    import database as database_module
    orig = (database_module.engine, database_module.SessionLocal)
    database_module.engine, database_module.SessionLocal = engine, Session_
    try:
        yield Env(app, Session_)
    finally:
        database_module.engine, database_module.SessionLocal = orig
        Base.metadata.drop_all(engine)


def _admin(env):
    return env.login("iamadmin")


def _create(client, name="Plain", description="d", permissions=None, reason=None):
    r = client.post("/api/iam/roles/", json={"name": name, "description": description, "reason": reason,
                                              "permissions": permissions if permissions is not None else _codes()})
    assert r.status_code == 200, r.text
    return r.json()


def _operator_id(env, username="iamadmin"):
    db = env.Session()
    try:
        return db.query(models.User).filter_by(username=username).one().id
    finally:
        db.close()


# ── 1. create ────────────────────────────────────────────────────────────

def test_created_role_and_its_create_audit_are_both_persisted(env):
    admin = _admin(env)
    role = _create(admin, "Plain", "plain updater", [CLOSE, UPDATE, perms.CHECKLIST_VIEW], reason="new updater role")       # deliberately unsorted
    st = env.state()
    assert st["roles"]["Plain"]["perms"] == sorted([CLOSE, UPDATE, perms.CHECKLIST_VIEW])
    rows = [a for a in st["audits"] if a.action == "CREATE" and a.entity_name == "Plain"]
    assert len(rows) == 1
    a = rows[0]
    assert a.entity_id == str(role["id"]) and a.user_id == _operator_id(env) and a.username == "iamadmin" and a.timestamp
    assert a.reason == "new updater role"                                    # the reason the IAM form requires is kept
    new = json.loads(a.new_value)
    assert new == {"id": role["id"], "name": "Plain", "description": "plain updater",
                   "permissions": sorted([CLOSE, UPDATE, perms.CHECKLIST_VIEW])}    # stable order


# ── 2. grant / revoke ────────────────────────────────────────────────────

def test_grant_then_revoke_records_exact_before_and_after_with_the_operator(env):
    admin = _admin(env)
    role = _create(admin, "Plain", "d", _codes())
    rid = role["id"]
    assert admin.put(f"/api/iam/roles/{rid}/", json={"permissions": [CLOSE, UPDATE, perms.CHECKLIST_VIEW], "reason": "grant reopen"}).status_code == 200   # grant
    assert admin.put(f"/api/iam/roles/{rid}/", json={"permissions": _codes()}).status_code == 200                                # revoke
    st = env.state()
    assert st["roles"]["Plain"]["perms"] == _codes()
    ups = [a for a in st["audits"] if a.action == "UPDATE" and a.entity_id == str(rid)]
    assert len(ups) == 2
    grant, revoke = ups
    assert grant.reason == "grant reopen"
    assert json.loads(grant.old_value)["permissions"] == _codes()
    assert json.loads(grant.new_value)["permissions"] == _codes(CLOSE)
    assert json.loads(revoke.old_value)["permissions"] == _codes(CLOSE)
    assert json.loads(revoke.new_value)["permissions"] == _codes()
    for a in ups:
        assert a.user_id == _operator_id(env) and a.username == "iamadmin" and a.timestamp
        assert json.loads(a.old_value)["id"] == rid and json.loads(a.new_value)["name"] == "Plain"


def test_name_and_description_changes_are_recorded_and_reordering_is_not_a_change(env):
    admin = _admin(env)
    rid = _create(admin, "Plain", "old text", _codes(CLOSE))["id"]
    assert admin.put(f"/api/iam/roles/{rid}/", json={"name": "Renamed", "description": "new text"}).status_code == 200
    a = [x for x in env.state()["audits"] if x.action == "UPDATE"][-1]
    old, new = json.loads(a.old_value), json.loads(a.new_value)
    assert (old["name"], old["description"], new["name"], new["description"]) == ("Plain", "old text", "Renamed", "new text")
    assert old["permissions"] == new["permissions"]                          # untouched permissions: identical lists
    # same set in a different order -> identical before/after lists, no phantom diff
    assert admin.put(f"/api/iam/roles/{rid}/", json={"permissions": list(reversed(_codes(CLOSE)))}).status_code == 200
    b = [x for x in env.state()["audits"] if x.action == "UPDATE"][-1]
    assert json.loads(b.old_value)["permissions"] == json.loads(b.new_value)["permissions"] == _codes(CLOSE)


def test_audit_entries_carry_no_credentials(env):
    admin = _admin(env)
    rid = _create(admin, "Plain")["id"]
    admin.put(f"/api/iam/roles/{rid}/", json={"permissions": _codes(CLOSE)})
    admin.delete(f"/api/iam/roles/{rid}/")
    blob = json.dumps([[a.old_value, a.new_value, a.reason, a.details] for a in env.state()["audits"]]).lower()
    for word in ("password", "token", "cookie", "hashed", "secret"):
        assert word not in blob


# ── 3. failures roll the WHOLE change back ───────────────────────────────

def _boom(*a, **k):
    raise RuntimeError("audit backend down")


def test_audit_failure_rolls_back_create(env):
    admin = _admin(env)
    before = env.state()
    import services.user_service as us
    with pytest.MonkeyPatch.context() as m:
        m.setattr(us, "strict_log_audit", _boom)
        r = admin.post("/api/iam/roles/", json={"name": "Ghost", "description": "d", "permissions": _codes(CLOSE)})
    assert r.status_code == 500
    after = env.state()
    assert "Ghost" not in after["roles"] and after["roles"] == before["roles"]
    assert after["links"] == before["links"] and len(after["audits"]) == len(before["audits"])


def test_audit_failure_rolls_back_permission_change_including_the_links(env):
    admin = _admin(env)
    rid = _create(admin, "Plain", "keep me", _codes(CLOSE))["id"]
    before = env.state()
    import services.user_service as us
    with pytest.MonkeyPatch.context() as m:
        m.setattr(us, "strict_log_audit", _boom)
        r = admin.put(f"/api/iam/roles/{rid}/", json={"name": "Changed", "description": "changed", "permissions": _codes()})
    assert r.status_code == 500
    after = env.state()
    assert after["roles"] == before["roles"] and after["roles"]["Plain"]["perms"] == _codes(CLOSE)   # name, description AND links unchanged
    assert after["links"] == before["links"] and len(after["audits"]) == len(before["audits"])


def test_commit_failure_rolls_back_role_links_and_audit(env):
    admin = _admin(env)
    rid = _create(admin, "Plain", "d", _codes(CLOSE))["id"]
    before = env.state()
    real_commit = Session.commit
    def failing_commit(self, *a, **k):
        raise RuntimeError("disk full")
    with pytest.MonkeyPatch.context() as m:
        m.setattr(Session, "commit", failing_commit)
        r_update = admin.put(f"/api/iam/roles/{rid}/", json={"permissions": _codes()})
        r_create = admin.post("/api/iam/roles/", json={"name": "Ghost2", "description": "d", "permissions": _codes()})
    assert r_update.status_code == 500 and r_create.status_code == 500
    after = env.state()
    assert after["roles"] == before["roles"] and "Ghost2" not in after["roles"]
    assert after["links"] == before["links"] and len(after["audits"]) == len(before["audits"])
    assert Session.commit is real_commit                                      # (patch really was scoped)


# ── 4. delete (the existing, restricted path) ────────────────────────────

def test_delete_success_keeps_the_audit_and_removes_role_and_links(env):
    admin = _admin(env)
    rid = _create(admin, "Deletable", "d", _codes(CLOSE))["id"]
    links_before = env.state()["links"]
    r = admin.delete(f"/api/iam/roles/{rid}/", params={"reason": "cleanup"})
    assert r.status_code == 200
    st = env.state()
    assert "Deletable" not in st["roles"] and st["links"] == links_before - len(_codes(CLOSE))
    d = [a for a in st["audits"] if a.action == "DELETE"][-1]
    assert d.entity_id == str(rid) and d.entity_name == "Deletable" and d.reason == "cleanup"
    assert d.username == "iamadmin" and d.user_id == _operator_id(env) and d.timestamp
    assert json.loads(d.old_value) == {"id": rid, "name": "Deletable", "description": "d", "permissions": _codes(CLOSE)}


def test_delete_failure_leaves_role_links_and_audit_untouched(env):
    admin = _admin(env)
    rid = _create(admin, "Deletable", "d", _codes(CLOSE))["id"]
    before = env.state()
    import services.user_service as us
    with pytest.MonkeyPatch.context() as m:
        m.setattr(us, "strict_log_audit", _boom)
        r = admin.delete(f"/api/iam/roles/{rid}/")
    assert r.status_code == 500
    after = env.state()
    assert after["roles"] == before["roles"] and after["roles"]["Deletable"]["perms"] == _codes(CLOSE)
    assert after["links"] == before["links"] and len(after["audits"]) == len(before["audits"])


def test_existing_delete_restriction_is_unchanged_role_in_use_cannot_be_deleted(env):
    admin = _admin(env)
    before = env.state()
    in_use = before["roles"]["IamViewer"]["id"]                     # has a user assigned
    r = admin.delete(f"/api/iam/roles/{in_use}/")
    assert r.status_code == 400
    after = env.state()
    assert after["roles"] == before["roles"] and after["links"] == before["links"] and len(after["audits"]) == len(before["audits"])
    assert admin.delete("/api/iam/roles/99999/").status_code == 404


# ── 5. no permission => nothing changes, nothing recorded ────────────────

def test_requests_without_role_manage_change_nothing(env):
    admin = _admin(env)
    rid = _create(admin, "Plain", "d", _codes())["id"]
    before = env.state()
    viewer = env.login("iamviewer")                                  # has iam:role:view only
    assert viewer.get("/api/iam/roles/").status_code == 200          # (the account really can log in and read)
    assert viewer.post("/api/iam/roles/", json={"name": "Nope", "description": "", "permissions": _codes()}).status_code == 403
    assert viewer.put(f"/api/iam/roles/{rid}/", json={"permissions": _codes(CLOSE)}).status_code == 403
    assert viewer.delete(f"/api/iam/roles/{rid}/").status_code == 403
    anon = env.anonymous()
    assert anon.post("/api/iam/roles/", json={"name": "Nope", "description": "", "permissions": []}).status_code in (401, 403)
    assert anon.put(f"/api/iam/roles/{rid}/", json={"permissions": _codes(CLOSE)}).status_code in (401, 403)
    after = env.state()
    assert after["roles"] == before["roles"] and after["links"] == before["links"]
    assert len(after["audits"]) == len(before["audits"])             # no "success" entries for refused requests


# ── the repository default behaviour is unchanged for any other caller ───

def test_repository_defaults_still_commit_immediately(env):
    from repositories.user_repository import UserRepository
    db = env.Session()
    try:
        repo = UserRepository(db)
        role = repo.create_role(models.Role(name="Direct"))          # historical call shape, no commit flag
        db2 = env.Session()
        assert db2.query(models.Role).filter_by(name="Direct").count() == 1     # visible to another session => committed
        db2.close()
        repo.delete_role(role)
        db3 = env.Session()
        assert db3.query(models.Role).filter_by(name="Direct").count() == 0
        db3.close()
    finally:
        db.close()
