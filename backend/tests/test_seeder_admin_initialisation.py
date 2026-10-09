"""Start-up must not re-create, re-promote or re-password an administrator (2026-09-20).

The bug: db_seeder's admin step, on EVERY start, (a) forced the account found by
email admin@example.com back into the admin role, and (b) rewrote that
account's password from INITIAL_ADMIN_PASSWORD whenever it differed. So a
legitimately changed password, or a deliberately demoted / repurposed account,
was silently undone at the next restart — and a plain account that merely held
the seed email (or was renamed into it) was promoted to Admin by the boot.

Now the step only ever CREATES the first administrator, and only when the
system has no Admin user at all and the seed identity (username "admin" / email
admin@example.com) is free. Anything else is left exactly as it is and reported
in the log for a person to resolve.

Each "boot" is a fresh Python process that imports `main` (migrations +
run_seeding, exactly what a server restart does) against a throwaway file
database under tmp_path. (INITIAL_ADMIN_PASSWORD is no longer accepted at login
in ANY environment — see test_login_no_env_password.py — so what these logins
show is always the stored password.) Nothing is mocked.
"""
import json
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import pytest

from isolation import run_python

BACKEND = Path(__file__).resolve().parents[1]
ENV_PW = "Seed-Env-Pw-123456"
CHANGED_PW = "Legit-Changed-Pw-654321"
KNOWN_PW = "Known-Plain-Pw-112233"


def _run(code: str, db_path: Path, *args: str, env_pw: str = ENV_PW) -> str:
    extra = {"ENVIRONMENT": "staging"}
    if env_pw:
        extra["INITIAL_ADMIN_PASSWORD"] = env_pw
    r = run_python(code, db_path, *args, extra_env=extra, timeout=240)     # shared isolation entry point
    return r.stdout + r.stderr


BOOT = r'''
import json, main, database, models
db = database.SessionLocal()
rows = db.query(models.User).order_by(models.User.id).all()
print("USERS=" + json.dumps({u.username: {"id": u.id, "email": u.email, "role": u.role.name if u.role else None,
      "hash": u.hashed_password, "cutoff": u.tokens_valid_after.isoformat() if u.tokens_valid_after else None,
      "active": u.is_active} for u in rows}))
print("ADMIN_ROLE_PERMS=" + json.dumps({r.name: len(r.permissions_rel) for r in db.query(models.Role).all()}))
'''


def boot(db_path, **kw):
    out = _run(BOOT, db_path, **kw)
    users = json.loads([l for l in out.splitlines() if l.startswith("USERS=")][-1][len("USERS="):])
    perms = json.loads([l for l in out.splitlines() if l.startswith("ADMIN_ROLE_PERMS=")][-1][len("ADMIN_ROLE_PERMS="):])
    return users, perms, out


LOGIN = r'''
import sys
from fastapi.testclient import TestClient
import main
c = TestClient(main.app)
r = c.post("/api/auth/login", data={"username": sys.argv[1], "password": sys.argv[2]})
print("STATUS=%d" % r.status_code)
'''


def login_status(db_path, username, password) -> int:
    out = _run(LOGIN, db_path, username, password)
    return int([l for l in out.splitlines() if l.startswith("STATUS=")][-1][len("STATUS="):])


CHANGE_OWN_PASSWORD = r'''
import sys
from fastapi.testclient import TestClient
import main, database, models
c = TestClient(main.app)
assert c.post("/api/auth/login", data={"username": "admin", "password": sys.argv[1]}).status_code == 200
c.headers["X-CSRF-Token"] = c.cookies.get("csrf_token")
db = database.SessionLocal(); uid = db.query(models.User).filter_by(username="admin").one().id; db.close()
r = c.put(f"/api/iam/users/{uid}/", json={"password": sys.argv[2], "reason": "legitimate change by an Admin"})
print("STATUS=%d" % r.status_code)
'''


def sql(db_path, *statements):
    con = sqlite3.connect(db_path)
    try:
        for s in statements:
            con.execute(*s) if isinstance(s, tuple) else con.execute(s)
        con.commit()
    finally:
        con.close()


def _hash(pw):
    sys.path.insert(0, str(BACKEND))
    from core.security import get_password_hash
    return get_password_hash(pw)


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "seed.db"


# ── first-time initialisation still works ────────────────────────────────

def test_first_boot_creates_the_admin_with_the_env_password_and_later_boots_leave_it_alone(db_path):
    users, _, out = boot(db_path)
    assert list(users) == ["admin"] and users["admin"]["role"].lower() == "admin" and users["admin"]["email"] == "admin@example.com"
    assert login_status(db_path, "admin", ENV_PW) == 200
    users2, _, _ = boot(db_path)
    assert users2 == users                                                # second start: nothing about the account changed


# ── a legitimately changed password and its session cut-off are never overwritten ──

def test_changed_password_and_cutoff_survive_repeated_restarts_with_the_env_var_set(db_path):
    boot(db_path)
    out = _run(CHANGE_OWN_PASSWORD, db_path, ENV_PW, CHANGED_PW)
    assert "STATUS=200" in out
    after_change, _, _ = boot(db_path)
    a = after_change["admin"]
    assert a["cutoff"] is not None                                        # the reset wrote the credential cut-off
    for _ in range(3):                                                    # ...and several restarts do not touch either
        again, _, _ = boot(db_path)
        assert again["admin"]["hash"] == a["hash"] and again["admin"]["cutoff"] == a["cutoff"]
    time.sleep(1.1)                                                       # token iat has 1-second resolution (existing mechanism)
    assert login_status(db_path, "admin", CHANGED_PW) == 200              # the changed password is what works
    assert login_status(db_path, "admin", ENV_PW) == 401                  # the environment value is NOT silently back


# ── the seed identity is not a promotion vector ──────────────────────────

@pytest.mark.parametrize("admin_role_spelling", ["admin", "Admin", "ADMIN"])
def test_a_demoted_seed_account_is_not_re_promoted_or_re_passworded(db_path, admin_role_spelling):
    boot(db_path)
    sql(db_path, ("UPDATE roles SET name = ? WHERE lower(name) = 'admin'", (admin_role_spelling,)))
    # a second Admin exists; the seed account was deliberately made an ordinary user with its own password
    rid_admin = sqlite3.connect(db_path).execute("SELECT id FROM roles WHERE lower(name)='admin'").fetchone()[0]
    rid_user = sqlite3.connect(db_path).execute("SELECT id FROM roles WHERE name='USER'").fetchone()[0]
    sql(db_path,
        ("INSERT INTO users (username,email,hashed_password,is_active,role_id,failed_login_attempts,totp_enabled) VALUES (?,?,?,1,?,0,0)", ("real_admin", "real@example.com", _hash(KNOWN_PW), rid_admin)),
        ("UPDATE users SET role_id = ?, hashed_password = ? WHERE username = 'admin'", (rid_user, _hash(KNOWN_PW))))
    before, _, _ = boot(db_path)
    for _ in range(2):
        after, _, out = boot(db_path)
        assert after == before
        assert after["admin"]["role"] == "USER"                            # NOT pulled back into the admin role
        assert "identity conflict" in out and "admin" in out               # ...and it is reported, not silent
    assert login_status(db_path, "admin", ENV_PW) == 401                    # env password did not overwrite anything
    assert login_status(db_path, "admin", KNOWN_PW) == 200


@pytest.mark.parametrize("colliding", ["username", "email"])
def test_an_ordinary_account_holding_the_seed_identity_is_never_promoted_and_no_admin_is_forced(db_path, colliding):
    """No Admin exists at all AND the seed username / email is held by an ordinary account:
    the boot must not promote it and must not invent another administrator; it reports it."""
    boot(db_path)
    rid_user = sqlite3.connect(db_path).execute("SELECT id FROM roles WHERE name='USER'").fetchone()[0]
    ident = ("admin", "not-the-seed@example.com") if colliding == "username" else ("plain_person", "admin@example.com")
    sql(db_path, "DELETE FROM users",
        ("INSERT INTO users (username,email,hashed_password,is_active,role_id,failed_login_attempts,totp_enabled) VALUES (?,?,?,1,?,0,0)", (*ident, _hash(KNOWN_PW), rid_user)))
    before, _, _ = boot(db_path)
    after, _, out = boot(db_path)
    assert after == before and len(after) == 1                              # nothing created, nothing changed
    only = next(iter(after.values()))
    assert only["role"] == "USER" and only["hash"] == before[ident[0]]["hash"]
    assert "identity conflict" in out and "No Admin user exists" in out     # loud, explicit, needs a person
    assert login_status(db_path, ident[0], KNOWN_PW) == 200 and login_status(db_path, ident[0], ENV_PW) == 401


def test_a_renamed_seed_admin_does_not_cause_a_second_seed_admin(db_path):
    boot(db_path)
    sql(db_path, "UPDATE users SET username = 'root', email = 'root@example.com' WHERE username = 'admin'")
    before, _, _ = boot(db_path)
    after, _, _ = boot(db_path)
    assert after == before and list(after) == ["root"] and after["root"]["role"].lower() == "admin"


def test_with_no_admin_at_all_and_a_free_identity_the_first_admin_is_created(db_path):
    """The one legitimate re-initialisation: an empty administrator set and a free seed identity."""
    boot(db_path)
    sql(db_path, "DELETE FROM users")
    users, _, _ = boot(db_path)
    assert list(users) == ["admin"] and users["admin"]["role"].lower() == "admin"
    assert login_status(db_path, "admin", ENV_PW) == 200


# ── the existing Admin-role permission policy is unchanged ───────────────

def test_the_admin_role_still_gets_all_permissions_synced_at_every_start(db_path):
    _, perms, _ = boot(db_path)
    full = next(v for k, v in perms.items() if k.lower() == "admin")
    sql(db_path, "DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE lower(name)='admin') AND permission_id = (SELECT MIN(id) FROM permissions)")
    _, perms2, _ = boot(db_path)
    assert next(v for k, v in perms2.items() if k.lower() == "admin") == full
