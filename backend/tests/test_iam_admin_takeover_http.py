"""Admin-account takeover through IAM is closed (2026-09-20).

Independently reproduced before the fix: an account holding only
iam:user:manage could PUT a new password onto an Admin account, log in as that
Admin with it, and reach role management — for every spelling of the admin role
(admin / Admin / ADMIN). These tests are that reproduction turned into reverse
assertions, plus the surrounding cases.

The rule (conservative, no role hierarchy, no implicit authorisation):
  * through IAM only an Admin may set a password (for anyone);
  * only an Admin may change an Admin account, on ANY field — decided on the
    real before/after values, so a form that resends unchanged fields is not a
    modification;
  * "Admin" = the acting/target user's role NAME compared case-insensitively,
    read from the database — never the username, never the request body, and
    holding iam:role:manage / iam:user:manage does not make anyone an Admin.

Same harness as test_iam_user_security_http.py (real routes and logins, one
Session per request, brand-new-session assertions).
"""
import json
import time

import pytest
from sqlalchemy.orm import Session

from test_iam_user_security_http import (   # noqa: F401  (env is a fixture, re-exported on purpose)
    NEW_PW, PW, _add_user, _boom, _same, env,
)

NON_ADMIN_ACTORS = ["usermgr", "roleusermgr"]        # plain account manager / account manager WITH role management


def _login_ok(env, username, password):
    return env.anonymous().post("/api/auth/login", data={"username": username, "password": password}).status_code == 200


# ── 1. the reproduced takeover, now refused ──────────────────────────────

@pytest.mark.parametrize("actor", NON_ADMIN_ACTORS)
def test_non_admin_cannot_reset_an_admin_password_and_cannot_log_in_with_it(env, actor):
    mgr = env.login(actor)
    aid = env.user_id("theadmin")
    before = env.state()
    r = mgr.put(f"/api/iam/users/{aid}/", json={"password": NEW_PW, "reason": "takeover attempt"})
    assert r.status_code == 403 and "Admin" in r.json()["detail"]
    _same(env.state(), before)                                              # hash, session cutoff, every field, audits: untouched
    assert not _login_ok(env, "theadmin", NEW_PW)                            # the attacker's password does not work...
    assert _login_ok(env, "theadmin", PW)                                    # ...and the real one still does
    stolen = env.anonymous().post("/api/auth/login", data={"username": "theadmin", "password": NEW_PW})
    assert stolen.status_code == 401 and "access_token" not in stolen.cookies


@pytest.mark.parametrize("actor", NON_ADMIN_ACTORS)
@pytest.mark.parametrize("body", [
    {"email": "attacker@example.com"},                       # login identity
    {"username": "not_the_admin_any_more"},                  # login identity
    {"full_name": "Renamed"},
    {"company_name": "Evil Corp"},
    {"is_active": False},
    {"role_id": "ORDINARY"},                                 # placeholder, resolved below
    {"role_id": "USERMGR"},
    {"password": NEW_PW},
    {"password": NEW_PW, "email": "attacker@example.com", "is_active": True},
])
def test_non_admin_cannot_change_any_field_of_an_admin_account(env, actor, body):
    _add_user(env, "admin2", env.admin_role_name)                            # a second admin, so the last-admin rule is not what refuses
    body = {k: (env.role_id({"ORDINARY": "Ordinary", "USERMGR": "UserMgr"}[v]) if k == "role_id" else v) for k, v in body.items()}
    mgr = env.login(actor)
    before = env.state()
    r = mgr.put(f"/api/iam/users/{env.user_id('admin2')}/", json={**body, "reason": "attempt"})
    assert r.status_code == 403, r.text
    _same(env.state(), before)


@pytest.mark.parametrize("actor", NON_ADMIN_ACTORS)
def test_reactivating_an_inactive_admin_is_also_an_admin_only_change(env, actor):
    _add_user(env, "dormant_admin", env.admin_role_name, active=False)
    mgr = env.login(actor)
    before = env.state()
    assert mgr.put(f"/api/iam/users/{env.user_id('dormant_admin')}/", json={"is_active": True}).status_code == 403
    _same(env.state(), before)


@pytest.mark.parametrize("actor", NON_ADMIN_ACTORS)
def test_a_resend_of_unchanged_values_on_an_admin_account_is_not_refused_and_changes_nothing(env, actor):
    mgr = env.login(actor)
    before = env.state()
    u = before["users"]["theadmin"]
    r = mgr.put(f"/api/iam/users/{u['id']}/", json={"username": "theadmin", "email": u["email"], "full_name": u["full_name"],
                                                     "is_active": True, "role_id": u["role_id"], "reason": "resave"})
    assert r.status_code == 200, r.text
    _same(env.state(), before)


# ── 2. who counts as an Admin ────────────────────────────────────────────

def test_admin_is_decided_by_role_name_not_by_username(env):
    _add_user(env, "admin", "UserMgr")                       # username "admin" but NOT in an admin role
    impostor = env.login("admin")
    before = env.state()
    assert impostor.put(f"/api/iam/users/{env.user_id('theadmin')}/", json={"password": NEW_PW}).status_code == 403
    assert impostor.put(f"/api/iam/users/{env.user_id('theadmin')}/", json={"email": "x@example.com"}).status_code == 403
    _same(env.state(), before)


def test_admin_is_not_decided_by_anything_the_request_says(env):
    mgr = env.login("roleusermgr")
    before = env.state()
    r = mgr.put(f"/api/iam/users/{env.user_id('theadmin')}/",
                json={"password": NEW_PW, "role_name": env.admin_role_name, "permissions": ["iam:role:manage"],
                      "is_admin": True, "actor_role": env.admin_role_name})
    assert r.status_code == 403
    r2 = mgr.put(f"/api/iam/users/{env.user_id('theadmin')}/", headers={"X-Role": "admin", "X-Is-Admin": "1"}, json={"password": NEW_PW})
    assert r2.status_code == 403
    _same(env.state(), before)


def test_role_management_does_not_make_anyone_an_admin(env):
    """iam:role:manage is not Admin: the role-managing account may still not touch an Admin."""
    boss = env.login("roleusermgr")
    assert boss.get("/api/iam/roles/").status_code == 200                                   # really holds role management
    assert boss.put(f"/api/iam/users/{env.user_id('theadmin')}/", json={"full_name": "x"}).status_code == 403
    assert boss.put(f"/api/iam/users/{env.user_id('ordinary')}/", json={"password": NEW_PW}).status_code == 403   # nor set anyone's password


def test_an_admin_in_any_role_spelling_is_recognised_as_the_actor(env):
    other = next(n for n in ("admin", "Admin", "ADMIN") if n != env.admin_role_name)
    db = env.Session()
    try:
        from repositories.user_repository import UserRepository  # noqa: F401
        import models
        r = models.Role(name=other)
        r.permissions_rel = list(db.query(models.Role).filter_by(name=env.admin_role_name).one().permissions_rel)
        db.add(r); db.commit()
    finally:
        db.close()
    _add_user(env, "other_spelling_admin", other)
    a = env.login("other_spelling_admin")
    assert a.put(f"/api/iam/users/{env.user_id('theadmin')}/", json={"full_name": "By other spelling"}).status_code == 200
    assert a.put(f"/api/iam/users/{env.user_id('ordinary')}/", json={"password": NEW_PW}).status_code == 200


# ── 3. passwords through IAM: Admin only, for anyone ─────────────────────

@pytest.mark.parametrize("actor", NON_ADMIN_ACTORS)
def test_non_admin_cannot_set_anyones_password_including_their_own_through_iam(env, actor):
    mgr = env.login(actor)
    before = env.state()
    assert mgr.put(f"/api/iam/users/{env.user_id('ordinary')}/", json={"password": NEW_PW}).status_code == 403     # someone else
    assert mgr.put(f"/api/iam/users/{env.user_id(actor)}/", json={"password": NEW_PW}).status_code == 403          # themself
    _same(env.state(), before)


@pytest.mark.parametrize("actor", NON_ADMIN_ACTORS)
def test_non_admin_can_still_manage_ordinary_accounts(env, actor):
    mgr = env.login(actor)
    uid = env.user_id("ordinary")
    r = mgr.put(f"/api/iam/users/{uid}/", json={"full_name": "Renamed", "company_name": "Acme", "reason": "tidy"})
    assert r.status_code == 200 and r.json()["full_name"] == "Renamed"
    assert mgr.put(f"/api/iam/users/{uid}/", json={"is_active": False}).status_code == 200
    assert mgr.put(f"/api/iam/users/{uid}/", json={"is_active": True}).status_code == 200


def test_non_admin_cannot_change_an_admin_accounts_data_scope(env):
    mgr = env.login("roleusermgr")
    aid = env.user_id("theadmin")
    before = env.state()
    assert mgr.put(f"/api/iam/users/{aid}/scope", json={"project_ids": ["P-1"], "vendor_id": None}).status_code == 403
    assert mgr.put(f"/api/iam/users/{aid}/scope", json={"project_ids": [], "vendor_id": "V-1"}).status_code == 403
    _same(env.state(), before)
    assert mgr.put(f"/api/iam/users/{aid}/scope", json={"project_ids": [], "vendor_id": None}).status_code == 200     # unchanged resend: no modification
    assert mgr.put(f"/api/iam/users/{env.user_id('ordinary')}/scope", json={"project_ids": [], "vendor_id": None}).status_code == 200


# ── 4. the legitimate Admin reset ────────────────────────────────────────

@pytest.mark.parametrize("target", ["ordinary", "admin2"])
def test_admin_reset_works_invalidates_old_credentials_and_is_audited_without_secrets(env, target):
    _add_user(env, "admin2", env.admin_role_name)
    admin = env.login("theadmin")
    victim = env.login(target)                                              # holds valid access + refresh cookies
    assert victim.get("/api/iam/users/").status_code == 200
    tid = env.user_id(target)
    before = env.state()
    old_hash = before["users"][target]["hashed_password"]

    r = admin.put(f"/api/iam/users/{tid}/", json={"password": NEW_PW, "reason": "forgot password (ticket 42)"})
    assert r.status_code == 200, r.text

    st = env.state()
    u = st["users"][target]
    assert u["hashed_password"] != old_hash and u["tokens_valid_after"] is not None          # hash + cutoff committed together
    (a,) = [a for a in st["audits"] if a.action == "UPDATE" and a.entity_id == str(tid)]
    assert a.user_id == env.user_id("theadmin") and a.username == "theadmin" and a.timestamp
    assert a.reason == "forgot password (ticket 42)" and a.entity_name == target
    old, new = json.loads(a.old_value), json.loads(a.new_value)
    assert new["password_changed"] is True and "password_changed" not in old
    blob = json.dumps([a.old_value, a.new_value, a.reason, a.details])
    for secret in (NEW_PW, PW, u["hashed_password"], old_hash, "$2b$"):
        assert secret not in blob

    # every credential the target held before the reset is dead
    assert victim.get("/api/iam/users/").status_code == 401                  # access token
    assert victim.post("/api/auth/refresh").status_code == 401               # refresh token
    assert not _login_ok(env, target, PW)                                    # old password
    time.sleep(1.1)                                                          # token iat has 1-second resolution (existing mechanism)
    fresh = env.login(target, NEW_PW)                                        # new password logs in normally
    assert fresh.get("/api/iam/users/").status_code == 200
    if target == "admin2":
        assert fresh.get("/api/iam/roles/").status_code == 200               # and the reset Admin really is an Admin again


@pytest.mark.parametrize("fail", ["audit", "commit"])
def test_a_failed_reset_rolls_back_hash_cutoff_and_audit_and_leaves_the_old_credentials_working(env, fail):
    admin = env.login("theadmin")
    victim = env.login("ordinary")
    uid = env.user_id("ordinary")
    before = env.state()
    import services.user_service as us
    with pytest.MonkeyPatch.context() as m:
        if fail == "audit":
            m.setattr(us, "strict_log_audit", _boom)
        else:
            def failing_commit(self, *a, **k):
                raise RuntimeError("disk full")
            m.setattr(Session, "commit", failing_commit)
        r = admin.put(f"/api/iam/users/{uid}/", json={"password": NEW_PW, "reason": "x"})
    assert r.status_code == 500
    after = env.state()
    _same(after, before)
    assert after["users"]["ordinary"]["tokens_valid_after"] is None          # the cutoff rolled back with the hash
    assert victim.get("/api/iam/users/").status_code == 200                  # existing session untouched
    assert _login_ok(env, "ordinary", PW) and not _login_ok(env, "ordinary", NEW_PW)


def test_admin_editing_another_admin_in_ordinary_fields_is_allowed_and_audited(env):
    _add_user(env, "admin2", env.admin_role_name)
    admin = env.login("theadmin")
    r = admin.put(f"/api/iam/users/{env.user_id('admin2')}/", json={"full_name": "Second Admin", "reason": "name fix"})
    assert r.status_code == 200
    (a,) = [a for a in env.state()["audits"] if a.action == "UPDATE"]
    assert json.loads(a.new_value)["full_name"] == "Second Admin" and a.username == "theadmin"


def test_refused_takeover_attempts_leave_no_audit_row_and_no_state_change(env):
    _add_user(env, "admin2", env.admin_role_name)
    before = env.state()
    for actor in NON_ADMIN_ACTORS:
        mgr = env.login(actor)
        for body in ({"password": NEW_PW}, {"email": "a@b.co"}, {"is_active": False}):
            assert mgr.put(f"/api/iam/users/{env.user_id('admin2')}/", json=body).status_code == 403
    assert env.anonymous().put(f"/api/iam/users/{env.user_id('admin2')}/", json={"password": NEW_PW}).status_code in (401, 403)
    _same(env.state(), before)
