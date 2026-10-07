"""Who may create an Admin identity (2026-09-20).

Independently reproduced before this fix: a NON-Admin who held iam:user:manage
plus iam:role:manage could create an account carrying the Admin role, log in as
it, and reset the original Admin's password — for admin / Admin / ADMIN alike.
Closing the direct password-reset route (see test_iam_admin_takeover_http.py)
did not close that detour, because "who may mint an Admin" was unrestricted.

The boundary (no role hierarchy — ordinary role management is unchanged):
  * only an active Admin may create an account WITH the Admin role, or assign
    the Admin role to an existing account;
  * only an active Admin may create a role that reads as "admin", rename any role
    to one, or modify (name / description / permissions) or delete the Admin role;
  * roles are judged BEFORE and AFTER the change; changes are judged on real
    before/after values (a form that resends the Admin role unchanged is not a
    modification); the acting user and the roles are re-read inside the locked
    transaction that also writes the strict audit entry.

Same harness as test_iam_user_security_http.py.
"""
import json

import pytest
from sqlalchemy.orm import Session

import models
from test_iam_user_security_http import (   # noqa: F401  (env is a fixture, re-exported on purpose)
    NEW_PW, PW, _add_user, _boom, _new_user_body, env,
)

NON_ADMIN_ACTORS = ["usermgr", "roleusermgr"]
ADMIN_LOOKING_NAMES = ["admin", "Admin", "ADMIN", "aDmIn", " Admin ", "admin\t", "ＡＤＭＩＮ"]     # incl. whitespace / full-width variants


def _snap(env):
    """Everything this boundary protects, through a brand-new session."""
    st = env.state()
    db = env.Session()
    try:
        st["role_rows"] = {r.id: (r.name, r.description, sorted(p.code for p in r.permissions_rel))
                           for r in db.query(models.Role).all()}
        st["role_audits"] = db.query(models.AuditLog).filter_by(entity_type="Role").count()
    finally:
        db.close()
    return st


def _unchanged(env, before):
    after = _snap(env)
    assert after["users"] == before["users"]
    assert after["role_rows"] == before["role_rows"]
    assert len(after["audits"]) == len(before["audits"]) and after["role_audits"] == before["role_audits"]


def _can_login(env, username, password=PW):
    return env.anonymous().post("/api/auth/login", data={"username": username, "password": password}).status_code == 200


# ── 1. the reproduced chain: mint an Admin, then take over the original ──

@pytest.mark.parametrize("actor", NON_ADMIN_ACTORS)
def test_the_reproduced_chain_stops_at_its_first_step(env, actor):
    mgr = env.login(actor)
    before = _snap(env)
    r = mgr.post("/api/iam/users/", json=_new_user_body(env, "sneaky", role=env.admin_role_name))
    assert r.status_code == 403
    _unchanged(env, before)
    assert "sneaky" not in env.state()["users"] and not _can_login(env, "sneaky")       # no account, so nothing to log in with
    assert _can_login(env, "theadmin") and not _can_login(env, "theadmin", NEW_PW)      # original Admin untouched


@pytest.mark.parametrize("actor", NON_ADMIN_ACTORS)
def test_creating_an_ordinary_account_and_then_promoting_it_is_also_refused(env, actor):
    boss = env.login("roleusermgr")
    made = boss.post("/api/iam/users/", json=_new_user_body(env, "later_promoted", role="Ordinary"))
    assert made.status_code == 200
    before = _snap(env)
    uid = made.json()["id"]
    mgr = env.login(actor)
    assert mgr.put(f"/api/iam/users/{uid}/", json={"role_id": env.role_id(env.admin_role_name)}).status_code in (403,)
    _unchanged(env, before)


def test_the_role_manager_cannot_create_an_admin_account_with_any_other_route_shape(env):
    boss = env.login("roleusermgr")
    before = _snap(env)
    for body in (_new_user_body(env, "s1", role=env.admin_role_name, is_active=False),
                 _new_user_body(env, "s2", role=env.admin_role_name, reason="approved by the CEO"),
                 {**_new_user_body(env, "s3", role=env.admin_role_name), "role_name": "Ordinary"}):
        assert boss.post("/api/iam/users/", json=body).status_code == 403
    _unchanged(env, before)


# ── 2. role management: minting or touching the Admin role ───────────────

@pytest.mark.parametrize("name", ADMIN_LOOKING_NAMES)
def test_non_admin_cannot_rename_a_role_into_admin_in_any_spelling(env, name):
    boss = env.login("roleusermgr")
    before = _snap(env)
    rid = env.role_id("Ordinary")
    r = boss.put(f"/api/iam/roles/{rid}/", json={"name": name, "reason": "sneaky rename"})
    assert r.status_code == 403, r.text
    _unchanged(env, before)


@pytest.mark.parametrize("name", ["  Admin", "admin ", "ＡＤＭＩＮ", "\tadmin"])
def test_non_admin_cannot_create_a_role_that_reads_as_admin(env, name):
    boss = env.login("roleusermgr")
    before = _snap(env)
    r = boss.post("/api/iam/roles/", json={"name": name, "description": "d", "permissions": ["iam:role:manage"]})
    assert r.status_code == 403, r.text
    _unchanged(env, before)


@pytest.mark.parametrize("spelling", ["admin", "Admin", "ADMIN"])
def test_creating_a_role_with_an_admin_spelling_is_refused_for_a_non_admin_whatever_the_reason(env, spelling):
    boss = env.login("roleusermgr")
    before = _snap(env)
    r = boss.post("/api/iam/roles/", json={"name": spelling, "description": "d", "permissions": []})
    assert r.status_code in (400, 403)                     # 400 "already exists" while an admin role exists; never 200
    _unchanged(env, before)


@pytest.mark.parametrize("change", [
    {"name": "Renamed"},
    {"description": "now something else"},
    {"permissions": ["iam:user:view"]},                    # revoke
])
def test_non_admin_cannot_modify_the_admin_role(env, change):
    boss = env.login("roleusermgr")
    before = _snap(env)
    r = boss.put(f"/api/iam/roles/{env.role_id(env.admin_role_name)}/", json={**change, "reason": "attempt"})
    assert r.status_code == 403, r.text
    _unchanged(env, before)


def test_non_admin_cannot_add_permissions_to_the_admin_role_or_delete_it(env):
    boss = env.login("roleusermgr")
    rid = env.role_id(env.admin_role_name)
    before = _snap(env)
    assert boss.put(f"/api/iam/roles/{rid}/", json={"permissions": ["iam:user:manage", "iam:user:view", "iam:role:manage", "iam:role:view", "ncr:view:all"]}).status_code == 403
    assert boss.delete(f"/api/iam/roles/{rid}/", params={"reason": "cleanup"}).status_code == 403
    _unchanged(env, before)


def test_resending_the_admin_role_unchanged_is_not_refused(env):
    boss = env.login("roleusermgr")
    rid = env.role_id(env.admin_role_name)
    codes = _snap(env)["role_rows"][rid][2]
    r = boss.put(f"/api/iam/roles/{rid}/", json={"name": env.admin_role_name, "permissions": list(reversed(codes)), "reason": "resave"})
    assert r.status_code == 200
    assert _snap(env)["role_rows"][rid][0] == env.admin_role_name and _snap(env)["role_rows"][rid][2] == codes


def test_the_plain_account_manager_still_cannot_touch_roles_at_all(env):
    mgr = env.login("usermgr")
    before = _snap(env)
    assert mgr.put(f"/api/iam/roles/{env.role_id('Ordinary')}/", json={"name": "Admin"}).status_code == 403
    assert mgr.post("/api/iam/roles/", json={"name": "Admin", "description": "", "permissions": []}).status_code == 403
    _unchanged(env, before)


# ── 3. identity comes from the database, in exactly the system's way ─────

def test_a_role_that_only_resembles_admin_is_not_an_admin_role(env):
    """Identity is the exact, case-insensitive role NAME (as the seeder and login use it):
    a role called " admin" or "administrator" grants nothing special — and confers no Admin rights."""
    import models
    db = env.Session()
    try:
        codes = list(db.query(models.Role).filter_by(name=env.admin_role_name).one().permissions_rel)
        for n in (" admin", "administrator", "sysadmin"):
            r = models.Role(name=n); r.permissions_rel = list(codes); db.add(r)
        db.commit()
    finally:
        db.close()
    _add_user(env, "lookalike", " admin")
    look = env.login("lookalike")                                            # same permissions, but NOT an Admin
    before = _snap(env)
    assert look.post("/api/iam/users/", json=_new_user_body(env, "made_by_lookalike", role=env.admin_role_name)).status_code == 403
    assert look.put(f"/api/iam/users/{env.user_id('theadmin')}/", json={"password": NEW_PW}).status_code == 403
    _unchanged(env, before)


def test_ordinary_role_management_is_not_over_blocked(env):
    boss = env.login("roleusermgr")
    r = boss.post("/api/iam/roles/", json={"name": "administrator", "description": "not the admin role", "permissions": ["iam:user:view"], "reason": "x"})
    assert r.status_code == 200                                              # only the exact admin identity / look-alikes of "admin" itself are reserved
    rid = boss.post("/api/iam/roles/", json={"name": "Support", "description": "d", "permissions": ["iam:user:view"]}).json()["id"]
    assert boss.put(f"/api/iam/roles/{rid}/", json={"name": "Support L2", "permissions": ["iam:user:view", "iam:role:view"], "reason": "grow"}).status_code == 200
    assert boss.delete(f"/api/iam/roles/{rid}/", params={"reason": "not needed"}).status_code == 200
    ordinary = env.user_id("ordinary")
    assert boss.put(f"/api/iam/users/{ordinary}/", json={"role_id": env.role_id("UserMgr")}).status_code == 200      # assigning ordinary roles: fine
    assert boss.post("/api/iam/users/", json=_new_user_body(env, "plainhire", role="Ordinary")).status_code == 200


# ── 4. the legitimate Admin still can ────────────────────────────────────

def test_an_admin_can_create_and_assign_the_admin_role_and_it_is_audited(env):
    admin = env.login("theadmin")
    r = admin.post("/api/iam/users/", json=_new_user_body(env, "second_admin", role=env.admin_role_name, reason="deputy admin"))
    assert r.status_code == 200, r.text
    assert admin.put(f"/api/iam/users/{env.user_id('ordinary')}/", json={"role_id": env.role_id(env.admin_role_name), "reason": "promote"}).status_code == 200
    st = env.state()
    assert st["users"]["second_admin"]["role_id"] == env.role_id(env.admin_role_name)
    assert st["users"]["ordinary"]["role_id"] == env.role_id(env.admin_role_name)
    creates = [a for a in st["audits"] if a.action == "CREATE" and a.entity_name == "second_admin"]
    assert len(creates) == 1 and creates[0].username == "theadmin" and creates[0].reason == "deputy admin"
    assert json.loads(creates[0].new_value)["role_name"] == env.admin_role_name
    # the new Admin really is one: it may reset a password through IAM
    assert env.login("second_admin").put(f"/api/iam/users/{env.user_id('usermgr')}/", json={"password": NEW_PW}).status_code == 200


def test_an_admin_can_manage_roles_including_the_admin_role(env):
    admin = env.login("theadmin")
    rid = env.role_id(env.admin_role_name)
    assert admin.put(f"/api/iam/roles/{rid}/", json={"description": "Administrators", "reason": "doc"}).status_code == 200
    ordinary_rid = env.role_id("Ordinary")
    other = "Admin" if env.admin_role_name != "Admin" else "admin"
    # (a second, differently spelled admin role name for an ordinary role is an Admin-only act — and allowed for an Admin)
    assert admin.put(f"/api/iam/roles/{ordinary_rid}/", json={"name": f"{other}", "reason": "rename"}).status_code == 200
    assert _snap(env)["role_rows"][ordinary_rid][0] == other


def test_last_admin_protection_is_unaffected_by_the_new_boundary(env):
    admin = env.login("theadmin")
    before = _snap(env)
    assert admin.put(f"/api/iam/users/{env.user_id('theadmin')}/", json={"is_active": False}).status_code == 400
    assert admin.put(f"/api/iam/roles/{env.role_id(env.admin_role_name)}/", json={"name": "Boss"}).status_code == 400
    _unchanged(env, before)


# ── 5. atomic audit is kept ──────────────────────────────────────────────

@pytest.mark.parametrize("fail", ["audit", "commit"])
def test_a_failed_admin_creation_or_assignment_rolls_everything_back(env, fail):
    admin = env.login("theadmin")
    before = _snap(env)
    import services.user_service as us
    with pytest.MonkeyPatch.context() as m:
        if fail == "audit":
            m.setattr(us, "strict_log_audit", _boom)
        else:
            def failing_commit(self, *a, **k):
                raise RuntimeError("disk full")
            m.setattr(Session, "commit", failing_commit)
        r1 = admin.post("/api/iam/users/", json=_new_user_body(env, "ghost_admin", role=env.admin_role_name))
        r2 = admin.put(f"/api/iam/users/{env.user_id('ordinary')}/", json={"role_id": env.role_id(env.admin_role_name)})
        r3 = admin.put(f"/api/iam/roles/{env.role_id('Ordinary')}/", json={"name": "Admin_Ghost"})
    assert (r1.status_code, r2.status_code, r3.status_code) == (500, 500, 500)
    _unchanged(env, before)
    assert "ghost_admin" not in env.state()["users"]
