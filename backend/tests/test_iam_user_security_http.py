"""IAM account security and traceability (Phase 1, 2026-09-20).

Closes, and regression-tests, what the 2026-09-20 account audit found:

* create-account had no role-management check -> an account manager holding
  only iam:user:manage could mint an Admin;
* the "last admin" guard compared the role name case-sensitively ("Admin"
  while the seeder creates "admin") and counted with a cross join, so it never
  fired; it also could not survive two concurrent requests;
* accounts could be hard-deleted (ids are reused by SQLite afterwards, and
  audit / ownership rows point at users by number);
* account create/update/deactivate wrote their audit row AFTER the repository
  had committed, with a logger that does not commit -> the row was lost.

Real everything except the network, as in test_iam_role_audit_http.py: real
routes, real login per account (real password hashing and cookies), one
SQLAlchemy Session PER REQUEST, and every assertion is made through a
brand-new session after the request sessions have closed. Failure injection
patches the audit call / Session.commit for exactly one request.
"""
import json
import threading
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import models
from core import perms
from core.security import get_password_hash

PW = "Iam-User-Pw-123456"
NEW_PW = "Brand-New-Pw-654321"
ADMIN_SPELLINGS = ["admin", "Admin", "ADMIN"]      # seeder creates "admin"; some databases also carry the others


class Env:
    def __init__(self, app, factory, admin_role_name):
        self.app, self.Session, self.admin_role_name = app, factory, admin_role_name

    # ── clients ──────────────────────────────────────────────────────────
    def login_response(self, username, password=PW, client=None):
        c = client or TestClient(self.app, raise_server_exceptions=False)   # a failed request must come back as a 500, not raise here
        return c, c.post("/api/auth/login", data={"username": username, "password": password})

    def login(self, username, password=PW):
        c, r = self.login_response(username, password)
        assert r.status_code == 200, r.text
        return c

    def anonymous(self):
        return TestClient(self.app, raise_server_exceptions=False)

    # ── brand-new-session reads ──────────────────────────────────────────
    def role_id(self, name):
        db = self.Session()
        try:
            return db.query(models.Role).filter(models.Role.name == name).one().id
        finally:
            db.close()

    def user_id(self, username):
        db = self.Session()
        try:
            return db.query(models.User).filter_by(username=username).one().id
        finally:
            db.close()

    def state(self):
        """Everything an account change touches, read through a brand-new session."""
        db = self.Session()
        try:
            users = {u.username: {"id": u.id, "email": u.email, "full_name": u.full_name, "company_name": u.company_name,
                                  "role_id": u.role_id, "is_active": u.is_active,
                                  "hashed_password": u.hashed_password, "tokens_valid_after": u.tokens_valid_after}
                     for u in db.query(models.User).all()}
            audits = [a for a in db.query(models.AuditLog).filter_by(entity_type="User").order_by(models.AuditLog.id).all()
                      if not a.action.startswith(("LOGIN", "LOGOUT", "ACCOUNT_LOCKED"))]
            roles = {r.name: {"id": r.id, "perms": sorted(p.code for p in r.permissions_rel)}
                     for r in db.query(models.Role).all()}
            return {"users": users, "audits": audits, "roles": roles}
        finally:
            db.close()


def _build(engine, admin_role_name):
    from database import Base, get_db
    from routers import auth as auth_router, iam as iam_router
    Base.metadata.create_all(engine)
    Session_ = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = Session_()
    codes = [perms.USER_MANAGE, perms.USER_VIEW, perms.ROLE_MANAGE, perms.ROLE_VIEW]
    prows = {c: models.Permission(code=c, description=c) for c in codes}
    db.add_all(prows.values()); db.flush()
    holders = {
        admin_role_name: codes,                                       # full set, as the seeder gives the admin role
        "UserMgr": [perms.USER_MANAGE, perms.USER_VIEW],              # plain account manager: NO role management
        "RoleUserMgr": [perms.USER_MANAGE, perms.USER_VIEW, perms.ROLE_MANAGE, perms.ROLE_VIEW],
        "Ordinary": [perms.USER_VIEW],
    }
    for name, held in holders.items():
        role = models.Role(name=name); role.permissions_rel = [prows[c] for c in held]; db.add(role); db.flush()
    admin_rid = db.query(models.Role).filter_by(name=admin_role_name).one().id
    for uname, rname in [("theadmin", admin_role_name), ("usermgr", "UserMgr"),
                         ("roleusermgr", "RoleUserMgr"), ("ordinary", "Ordinary")]:
        rid = db.query(models.Role).filter_by(name=rname).one().id
        db.add(models.User(username=uname, email=f"{uname}@example.com", full_name=uname.title(), is_active=True,
                           hashed_password=get_password_hash(PW), role_id=rid))
    db.commit(); db.close()
    assert admin_rid

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
    return Env(app, Session_, admin_role_name), orig


@pytest.fixture(params=ADMIN_SPELLINGS)
def env(request):
    from database import Base
    import database as database_module
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    e, orig = _build(engine, request.param)
    try:
        yield e
    finally:
        database_module.engine, database_module.SessionLocal = orig
        Base.metadata.drop_all(engine)


# ── small helpers ────────────────────────────────────────────────────────

def _new_user_body(env, username="newbie", role="Ordinary", **extra):
    body = {"username": username, "email": f"{username}@example.com", "password": PW, "is_active": True}
    if role is not None:
        body["role_id"] = env.role_id(role)
    body.update(extra)
    return body


def _add_user(env, username, role_name, active=True):
    """Test setup only (direct write, no audit) — an extra account in a given role."""
    db = env.Session()
    try:
        rid = db.query(models.Role).filter_by(name=role_name).one().id
        db.add(models.User(username=username, email=f"{username}@example.com", is_active=active,
                           hashed_password=get_password_hash(PW), role_id=rid))
        db.commit()
    finally:
        db.close()


def _user_audits(env, action=None):
    rows = env.state()["audits"]
    return [a for a in rows if action is None or a.action == action]


def _same(a, b):
    """State snapshots equal, ignoring nothing — used for 'refused => nothing changed'."""
    assert a["users"] == b["users"]
    assert len(a["audits"]) == len(b["audits"])
    assert a["roles"] == b["roles"]


# ── 1. create-account privilege escalation ───────────────────────────────

def test_plain_account_manager_cannot_create_an_admin(env):
    mgr = env.login("usermgr")                                   # iam:user:manage only
    before = env.state()
    r = mgr.post("/api/iam/users/", json=_new_user_body(env, "evil", role=env.admin_role_name))
    assert r.status_code == 403 and "iam:role:manage" in r.json()["detail"]
    _same(env.state(), before)
    assert "evil" not in env.state()["users"]


def test_plain_account_manager_cannot_specify_any_role_at_creation(env):
    mgr = env.login("usermgr")
    before = env.state()
    r = mgr.post("/api/iam/users/", json=_new_user_body(env, "ord2", role="Ordinary"))
    assert r.status_code == 403                                   # same rule as the update path: naming a role needs role management
    _same(env.state(), before)


def test_plain_account_manager_cannot_promote_an_existing_account_either(env):
    mgr = env.login("usermgr")
    before = env.state()
    uid = env.user_id("ordinary")
    r = mgr.put(f"/api/iam/users/{uid}/", json={"role_id": env.role_id(env.admin_role_name)})
    assert r.status_code == 403
    _same(env.state(), before)


def test_omitted_role_creates_a_roleless_account_with_no_default_privilege(env):
    mgr = env.login("usermgr")
    r = mgr.post("/api/iam/users/", json=_new_user_body(env, "nobody", role=None))
    assert r.status_code == 200 and r.json()["role_id"] is None and r.json()["permissions"] == []
    assert env.state()["users"]["nobody"]["role_id"] is None      # persisted roleless: the backend assigns no default role
    nobody = env.login("nobody")                                  # can authenticate...
    assert nobody.get("/api/iam/users/").status_code == 403       # ...but holds no permission at all
    assert nobody.post("/api/iam/users/", json=_new_user_body(env, "x", role=None)).status_code == 403


def test_role_manager_can_still_create_with_a_role_and_it_is_audited(env):
    boss = env.login("roleusermgr")
    r = boss.post("/api/iam/users/", json=_new_user_body(env, "worker", role="Ordinary", full_name="Wendy Worker",
                                                          company_name="Acme Ltd", reason="new hire"))
    assert r.status_code == 200, r.text
    st = env.state()
    u = st["users"]["worker"]
    assert u["role_id"] == env.role_id("Ordinary") and u["is_active"] is True
    rows = [a for a in st["audits"] if a.action == "CREATE"]
    assert len(rows) == 1
    a = rows[0]
    assert a.entity_id == str(u["id"]) and a.entity_name == "worker"
    assert a.user_id == env.user_id("roleusermgr") and a.username == "roleusermgr" and a.timestamp
    assert a.reason == "new hire"
    new = json.loads(a.new_value)
    assert new == {"id": u["id"], "username": "worker", "email": "worker@example.com", "full_name": "Wendy Worker",
                   "company_name": "Acme Ltd", "role_id": env.role_id("Ordinary"), "role_name": "Ordinary",
                   "is_active": True, "password_changed": True}
    blob = json.dumps([a.old_value, a.new_value, a.reason, a.details]).lower()
    assert PW.lower() not in blob and u["hashed_password"].lower() not in blob and "$2b$" not in blob


def test_creating_with_a_role_that_does_not_exist_is_refused(env):
    boss = env.login("roleusermgr")
    before = env.state()
    r = boss.post("/api/iam/users/", json=_new_user_body(env, "ghostrole", role=None, role_id=99999))
    assert r.status_code == 400
    _same(env.state(), before)


# ── 2. last-admin protection ─────────────────────────────────────────────

def test_sole_admin_cannot_deactivate_itself_even_with_other_active_ordinary_accounts(env):
    admin = env.login("theadmin")
    before = env.state()
    assert sum(1 for u in before["users"].values() if u["is_active"]) == 4          # other ordinary active accounts exist
    r = admin.put(f"/api/iam/users/{env.user_id('theadmin')}/", json={"is_active": False, "reason": "try"})
    assert r.status_code == 400 and "last active Admin" in r.json()["detail"]
    _same(env.state(), before)


def test_sole_admin_cannot_be_demoted_by_anyone_through_the_api(env):
    """Two independent rules stop it: the Admin cannot change their own role (403), and a
    non-Admin cannot touch an Admin account at all (403). Nothing changes either way."""
    before = env.state()
    aid, ordinary = env.user_id("theadmin"), env.role_id("Ordinary")
    assert env.login("theadmin").put(f"/api/iam/users/{aid}/", json={"role_id": ordinary}).status_code == 403
    assert env.login("roleusermgr").put(f"/api/iam/users/{aid}/", json={"role_id": ordinary}).status_code == 403
    _same(env.state(), before)


def test_last_admin_rule_itself_still_refuses_a_demotion_when_reached_directly(env):
    """Defence in depth: the service-level guard (used if a future caller reaches it
    without the router's checks) refuses to move the last active Admin to a non-Admin role."""
    from fastapi import HTTPException
    from repositories.user_repository import UserRepository
    from services.user_service import UserService
    import schemas
    aid = env.user_id("theadmin")
    db = env.Session()
    try:
        svc = UserService(UserRepository(db))
        with pytest.raises(HTTPException) as e:
            svc.update_user(aid, schemas.UserUpdate(role_id=env.role_id("Ordinary")), current_user_id=aid)   # actor = the admin itself
        assert e.value.status_code == 400 and "last active Admin" in e.value.detail
    finally:
        db.close()
    assert env.state()["users"]["theadmin"]["role_id"] == env.role_id(env.admin_role_name)


def test_renaming_the_admin_role_away_from_admin_is_refused_while_it_would_leave_no_admin(env):
    boss = env.login("theadmin")             # only an Admin may rename the Admin role at all (see test_iam_admin_role_boundary_http.py)
    before = env.state()
    r = boss.put(f"/api/iam/roles/{env.role_id(env.admin_role_name)}/", json={"name": "Boss"})
    assert r.status_code == 400 and "no active Admin" in r.json()["detail"]
    _same(env.state(), before)
    # a rename that stays an admin name (different spelling) is untouched by the guard
    other = "aDmIn" if env.admin_role_name != "aDmIn" else "admin"
    assert boss.put(f"/api/iam/roles/{env.role_id(env.admin_role_name)}/", json={"name": other}).status_code == 200


def test_an_inactive_admin_does_not_count_as_an_admin(env):
    _add_user(env, "sleepy", env.admin_role_name, active=False)                     # inactive admin: must not be counted
    admin = env.login("theadmin")
    before = env.state()
    r = admin.put(f"/api/iam/users/{env.user_id('theadmin')}/", json={"is_active": False})
    assert r.status_code == 400
    _same(env.state(), before)


def test_with_a_second_active_admin_one_can_be_deactivated_and_then_the_last_is_protected(env):
    _add_user(env, "admin2", env.admin_role_name)
    admin2 = env.login("admin2")
    r = admin2.put(f"/api/iam/users/{env.user_id('theadmin')}/", json={"is_active": False, "reason": "left the company"})
    assert r.status_code == 200 and r.json()["is_active"] is False
    me = env.user_id("admin2")
    assert admin2.put(f"/api/iam/users/{me}/", json={"is_active": False}).status_code == 400
    assert admin2.put(f"/api/iam/users/{me}/", json={"role_id": env.role_id("Ordinary")}).status_code == 403   # own role: never
    st = env.state()
    assert st["users"]["theadmin"]["is_active"] is False and st["users"]["admin2"]["is_active"] is True


def test_admins_are_recognised_across_role_name_spellings(env):
    """A database can carry several spellings of the admin role at once; they all count."""
    other = next(n for n in ADMIN_SPELLINGS if n != env.admin_role_name)
    db = env.Session()
    try:
        r = models.Role(name=other)
        r.permissions_rel = list(db.query(models.Role).filter_by(name=env.admin_role_name).one().permissions_rel)   # same power, other spelling
        db.add(r); db.commit()
    finally:
        db.close()
    _add_user(env, "admin_other_spelling", other)
    other_admin = env.login("admin_other_spelling")
    assert other_admin.put(f"/api/iam/users/{env.user_id('theadmin')}/", json={"is_active": False}).status_code == 200      # another admin exists
    assert other_admin.put(f"/api/iam/users/{env.user_id('admin_other_spelling')}/", json={"is_active": False}).status_code == 400


def test_ordinary_accounts_are_unaffected_by_the_admin_rule(env):
    boss = env.login("roleusermgr")
    uid = env.user_id("ordinary")
    assert boss.put(f"/api/iam/users/{uid}/", json={"is_active": False}).status_code == 200
    assert boss.put(f"/api/iam/users/{uid}/", json={"is_active": True}).status_code == 200
    assert boss.put(f"/api/iam/users/{uid}/", json={"role_id": env.role_id("UserMgr")}).status_code == 200


def test_two_concurrent_requests_cannot_remove_both_admins(tmp_path):
    """Check-then-write race: Admin A deactivates Admin B while (at the same moment)
    deactivating themself. The delay is injected right after the admin COUNT so that,
    without the write lock, both requests would see "another admin exists"."""
    from database import Base
    import database as database_module
    engine = create_engine(f"sqlite:///{tmp_path / 'race.db'}", connect_args={"check_same_thread": False, "timeout": 15})
    e, orig = _build(engine, "admin")
    _add_user(e, "admin2", "admin")
    delayed = {"n": 0}

    @event.listens_for(engine, "after_cursor_execute")
    def _slow_count(conn, cursor, statement, parameters, context, executemany):
        s = statement.lower()
        if "count(" in s and "join roles" in s:
            delayed["n"] += 1
            time.sleep(0.8)

    try:
        a = e.login("theadmin")
        ida, idb = e.user_id("theadmin"), e.user_id("admin2")
        results = {}

        def hit(name, target):
            results[name] = a.put(f"/api/iam/users/{target}/", json={"is_active": False}).status_code

        t1 = threading.Thread(target=hit, args=("other", idb))
        t2 = threading.Thread(target=hit, args=("self", ida))
        t1.start(); time.sleep(0.2); t2.start(); t1.join(30); t2.join(30)
        assert delayed["n"] >= 1                                       # the race window was really opened
        assert sorted(results.values()) == [200, 400], results          # exactly one wins
        active_admins = [u for u in e.state()["users"].values() if u["is_active"] and u["role_id"] == e.role_id("admin")]
        assert len(active_admins) == 1                                  # never zero
    finally:
        event.remove(engine, "after_cursor_execute", _slow_count)
        database_module.engine, database_module.SessionLocal = orig
        Base.metadata.drop_all(engine)
        engine.dispose()


# ── 3. no hard delete; identity survives deactivation ────────────────────

def test_hard_delete_is_refused_and_is_not_a_silent_deactivation(env):
    boss = env.login("roleusermgr")
    before = env.state()
    uid = env.user_id("ordinary")
    r = boss.delete(f"/api/iam/users/{uid}/", params={"reason": "cleanup, please"})
    assert r.status_code == 405 and "Deactivate" in r.json()["detail"] and "GET" in r.headers["allow"]
    after = env.state()
    _same(after, before)
    assert after["users"]["ordinary"]["is_active"] is True and after["users"]["ordinary"]["id"] == uid
    assert boss.delete("/api/iam/users/99999/").status_code == 405                       # not a 404 that would hint at a working delete
    assert env.anonymous().delete(f"/api/iam/users/{uid}/").status_code in (401, 403)
    assert env.login("ordinary").delete(f"/api/iam/users/{uid}/").status_code == 403     # permission is still checked first


def test_a_deactivated_account_keeps_its_id_and_historical_attribution(env):
    boss = env.login("roleusermgr")
    worker = boss.post("/api/iam/users/", json=_new_user_body(env, "worker", role="Ordinary", reason="hire")).json()
    # the worker's own account does something audited under their name
    db = env.Session()
    try:
        from core.utils import log_audit
        log_audit(db, "UPDATE", "Checklist", "CHK-1", "CHK-1", user_id=worker["id"], username="worker", reason="work")
        db.commit()
    finally:
        db.close()
    assert boss.put(f"/api/iam/users/{worker['id']}/", json={"is_active": False, "reason": "left"}).status_code == 200

    db = env.Session()
    try:
        row = db.query(models.AuditLog).filter_by(entity_type="Checklist", entity_id="CHK-1").one()
        who = db.query(models.User).filter_by(id=row.user_id).one()          # the audit's user_id still resolves...
        assert who.username == "worker" == row.username and who.is_active is False and who.id == worker["id"]   # ...to the SAME person
    finally:
        db.close()
    # and a later account can never inherit the number, because nothing is deleted
    later = boss.post("/api/iam/users/", json=_new_user_body(env, "later", role="Ordinary")).json()
    assert later["id"] > worker["id"]


# ── 4. audit of account changes: atomic, complete, credential-free ───────

def test_update_records_before_after_operator_time_and_reason_for_every_tracked_field(env):
    boss = env.login("roleusermgr")
    uid = env.user_id("ordinary")
    r = boss.put(f"/api/iam/users/{uid}/", json={"username": "ordinary_renamed", "full_name": "Renamed Person",
                                                  "company_name": "Acme Ltd", "role_id": env.role_id("UserMgr"),
                                                  "reason": "reorganisation"})
    assert r.status_code == 200, r.text
    rows = _user_audits(env, "UPDATE")
    assert len(rows) == 1
    a = rows[0]
    assert a.entity_id == str(uid) and a.entity_name == "ordinary_renamed" and a.reason == "reorganisation"
    assert a.user_id == env.user_id("roleusermgr") and a.username == "roleusermgr" and a.timestamp
    old, new = json.loads(a.old_value), json.loads(a.new_value)
    assert old["username"] == "ordinary" and new["username"] == "ordinary_renamed"
    assert old["full_name"] == "Ordinary" and new["full_name"] == "Renamed Person"
    assert old["company_name"] is None and new["company_name"] == "Acme Ltd"
    assert (old["role_id"], old["role_name"]) == (env.role_id("Ordinary"), "Ordinary")
    assert (new["role_id"], new["role_name"]) == (env.role_id("UserMgr"), "UserMgr")
    assert old["is_active"] is True and new["is_active"] is True
    assert "password_changed" not in new


def test_deactivate_and_activate_are_recorded_as_their_own_actions(env):
    boss = env.login("roleusermgr")
    uid = env.user_id("ordinary")
    assert boss.put(f"/api/iam/users/{uid}/", json={"is_active": False, "reason": "left the project"}).status_code == 200
    assert boss.put(f"/api/iam/users/{uid}/", json={"is_active": True, "reason": "came back"}).status_code == 200
    rows = _user_audits(env)
    assert [a.action for a in rows] == ["DEACTIVATE", "ACTIVATE"]
    d, ac = rows
    assert (json.loads(d.old_value)["is_active"], json.loads(d.new_value)["is_active"]) == (True, False)
    assert (json.loads(ac.old_value)["is_active"], json.loads(ac.new_value)["is_active"]) == (False, True)
    assert d.reason == "left the project" and ac.reason == "came back"
    assert d.user_id == env.user_id("roleusermgr") and d.entity_id == str(uid)


def test_password_change_is_a_flag_only_and_never_an_unchanged_snapshot(env):
    boss = env.login("theadmin")                                       # only an Admin may set a password through IAM
    uid = env.user_id("ordinary")
    old_hash = env.state()["users"]["ordinary"]["hashed_password"]
    r = boss.put(f"/api/iam/users/{uid}/", json={"password": NEW_PW, "reason": "forgot password"})
    assert r.status_code == 200, r.text
    st = env.state()
    assert st["users"]["ordinary"]["hashed_password"] != old_hash            # really changed
    (a,) = [a for a in st["audits"] if a.action == "UPDATE"]
    old, new = json.loads(a.old_value), json.loads(a.new_value)
    assert new["password_changed"] is True and "password_changed" not in old   # the event is visible in the entry itself
    blob = json.dumps([a.old_value, a.new_value, a.reason, a.details])
    assert NEW_PW not in blob and PW not in blob and st["users"]["ordinary"]["hashed_password"] not in blob and old_hash not in blob
    assert env.anonymous().post("/api/auth/login", data={"username": "ordinary", "password": NEW_PW}).status_code == 200
    assert env.anonymous().post("/api/auth/login", data={"username": "ordinary", "password": PW}).status_code == 401


def test_a_save_that_changes_nothing_writes_no_audit_row(env):
    boss = env.login("roleusermgr")
    uid = env.user_id("ordinary")
    before = env.state()
    r = boss.put(f"/api/iam/users/{uid}/", json={"username": "ordinary", "email": "ordinary@example.com",
                                                  "is_active": True, "role_id": env.role_id("Ordinary"),
                                                  "reason": "resave"})            # what the UI resends on every save
    assert r.status_code == 200
    _same(env.state(), before)


def test_duplicate_username_or_email_on_update_is_a_clean_400(env):
    boss = env.login("roleusermgr")
    before = env.state()
    uid = env.user_id("ordinary")
    assert boss.put(f"/api/iam/users/{uid}/", json={"username": "usermgr"}).status_code == 400
    assert boss.put(f"/api/iam/users/{uid}/", json={"email": "usermgr@example.com"}).status_code == 400
    _same(env.state(), before)


def test_own_role_change_is_still_refused_even_with_role_management(env):
    boss = env.login("roleusermgr")
    before = env.state()
    r = boss.put(f"/api/iam/users/{env.user_id('roleusermgr')}/", json={"role_id": env.role_id(env.admin_role_name)})
    assert r.status_code == 403 and "own role" in r.json()["detail"]
    _same(env.state(), before)


# ── 5. failures roll the WHOLE account change back ───────────────────────

def _boom(*a, **k):
    raise RuntimeError("audit backend down")


def test_audit_failure_rolls_back_account_creation(env):
    boss = env.login("roleusermgr")
    before = env.state()
    import services.user_service as us
    with pytest.MonkeyPatch.context() as m:
        m.setattr(us, "strict_log_audit", _boom)
        r = boss.post("/api/iam/users/", json=_new_user_body(env, "ghost", role="Ordinary", reason="x"))
    assert r.status_code == 500
    after = env.state()
    assert "ghost" not in after["users"]
    _same(after, before)


def test_audit_failure_rolls_back_role_change_deactivation_and_password(env):
    boss = env.login("theadmin")
    uid = env.user_id("ordinary")
    before = env.state()
    import services.user_service as us
    with pytest.MonkeyPatch.context() as m:
        m.setattr(us, "strict_log_audit", _boom)
        r = boss.put(f"/api/iam/users/{uid}/", json={"role_id": env.role_id("UserMgr"), "is_active": False,
                                                      "full_name": "Changed", "password": NEW_PW})
    assert r.status_code == 500
    after = env.state()
    _same(after, before)
    u = after["users"]["ordinary"]                                     # role link, active flag, name, password hash, session cutoff: all untouched
    assert u["role_id"] == env.role_id("Ordinary") and u["is_active"] is True and u["full_name"] == "Ordinary"
    assert u["hashed_password"] == before["users"]["ordinary"]["hashed_password"] and u["tokens_valid_after"] is None
    assert env.anonymous().post("/api/auth/login", data={"username": "ordinary", "password": PW}).status_code == 200


def test_commit_failure_rolls_back_account_changes_and_audit(env):
    boss = env.login("roleusermgr")
    uid = env.user_id("ordinary")
    before = env.state()
    real_commit = Session.commit

    def failing_commit(self, *a, **k):
        raise RuntimeError("disk full")

    with pytest.MonkeyPatch.context() as m:
        m.setattr(Session, "commit", failing_commit)
        r_update = boss.put(f"/api/iam/users/{uid}/", json={"role_id": env.role_id("UserMgr"), "is_active": False})
        r_create = boss.post("/api/iam/users/", json=_new_user_body(env, "ghost2", role="Ordinary"))
    assert r_update.status_code == 500 and r_create.status_code == 500
    after = env.state()
    _same(after, before)
    assert "ghost2" not in after["users"] and Session.commit is real_commit


def test_refused_requests_leave_no_success_audit_entries(env):
    mgr = env.login("usermgr")
    ordinary = env.login("ordinary")
    before = env.state()
    assert mgr.post("/api/iam/users/", json=_new_user_body(env, "nope", role="Ordinary")).status_code == 403
    assert ordinary.post("/api/iam/users/", json=_new_user_body(env, "nope2", role=None)).status_code == 403
    assert ordinary.put(f"/api/iam/users/{env.user_id('usermgr')}/", json={"is_active": False}).status_code == 403
    assert env.anonymous().put(f"/api/iam/users/{env.user_id('usermgr')}/", json={"is_active": False}).status_code in (401, 403)
    _same(env.state(), before)


# ── 6. a deactivated account gets no new valid credential ────────────────

def test_deactivated_account_cannot_use_an_old_session_log_in_or_refresh(env):
    boss = env.login("roleusermgr")
    victim = env.login("ordinary")                                     # holds valid access + refresh cookies
    assert victim.get("/api/iam/users/").status_code == 200
    uid = env.user_id("ordinary")
    assert boss.put(f"/api/iam/users/{uid}/", json={"is_active": False}).status_code == 200

    assert victim.get("/api/iam/users/").status_code == 401            # existing session dead at once
    fresh, r = env.login_response("ordinary")
    assert r.status_code == 401 and "deactivated" in r.json()["detail"]
    assert not r.cookies and "access_token" not in fresh.cookies       # no credential was issued
    assert victim.post("/api/auth/refresh").status_code == 401         # the old refresh token buys nothing
    assert env.state()["users"]["ordinary"]["tokens_valid_after"] is not None


def test_reactivation_does_not_resurrect_sessions_issued_before_the_deactivation(env):
    boss = env.login("roleusermgr")
    victim = env.login("ordinary")
    uid = env.user_id("ordinary")
    assert boss.put(f"/api/iam/users/{uid}/", json={"is_active": False}).status_code == 200
    time.sleep(1.1)                                                    # token iat has 1-second resolution
    assert boss.put(f"/api/iam/users/{uid}/", json={"is_active": True}).status_code == 200
    assert victim.get("/api/iam/users/").status_code == 401            # old access token: predates the cutoff
    assert victim.post("/api/auth/refresh").status_code == 401         # old refresh token: same rule
    assert env.login("ordinary").get("/api/iam/users/").status_code == 200      # a fresh login works normally


# ── the repository defaults are unchanged for any other caller ───────────

def test_repository_defaults_still_commit_immediately(env):
    from repositories.user_repository import UserRepository
    db = env.Session()
    try:
        repo = UserRepository(db)
        user = repo.create(models.User(username="direct", email="direct@example.com", hashed_password="x", is_active=True))
        db2 = env.Session()
        assert db2.query(models.User).filter_by(username="direct").count() == 1    # visible to another session => committed
        db2.close()
        repo.update(user, {"full_name": "Direct"})
        db3 = env.Session()
        assert db3.query(models.User).filter_by(username="direct").one().full_name == "Direct"
        db3.close()
    finally:
        db.close()
