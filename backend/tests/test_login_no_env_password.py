"""INITIAL_ADMIN_PASSWORD is not a login password in any environment (2026-09-20).

Independently reproduced before this fix: with ENVIRONMENT=development (which is
also what an UNSET ENVIRONMENT means — it is the default), logging in as `admin`
or `admin@example.com` with the value of INITIAL_ADMIN_PASSWORD succeeded and
reached role management even though the database password was different. A
legitimate password reset therefore could not really retire the initial
password. The "rescue login" branch in routers/auth.py is removed; the variable
now only supplies the password when db_seeder creates the very first
administrator.

Real start-up, real login: each phase is a fresh Python process that imports
`main` (migrations + seeding, i.e. one server start) against a throwaway file
database and drives the real HTTP routes through TestClient. Run for
development, staging, production and the actual default (ENVIRONMENT unset).
Nothing is mocked; no real environment value, database or credential is read.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from isolation import run_python

BACKEND = Path(__file__).resolve().parents[1]
ENV_PW = "Initial-Env-Pw-123456"
CHANGED_PW = "Legit-Changed-Pw-654321"
WRONG_PW = "Some-Wrong-Guess-778899"
ENVIRONMENTS = ["development", "staging", "production", None]        # None = ENVIRONMENT not set at all (the real default)


def _run(code: str, db_path: Path, environment, *args: str) -> tuple[str, str]:
    extra = {"INITIAL_ADMIN_PASSWORD": ENV_PW, "SECRET_KEY": "test-only-secret-key-not-the-default-0123456789"}
    if environment is not None:                       # None = ENVIRONMENT genuinely not set (the application's real default)
        extra["ENVIRONMENT"] = environment
    r = run_python(code, db_path, *args, extra_env=extra, timeout=300)     # shared isolation entry point
    return r.stdout, r.stderr


PRELUDE = r'''
import json, sys, time
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
import main, database, models
from core.auth_cookies import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME
ENV_PW, CHANGED_PW, WRONG_PW = sys.argv[1], sys.argv[2], sys.argv[3]

def client():
    # https + a loopback forwarded address: production cookies are Secure, and loopback is exempt from the login rate limiter
    return TestClient(main.app, base_url="https://testserver", raise_server_exceptions=False, headers={"X-Forwarded-For": "127.0.0.1"})

def attempt(username, password):
    c = client()
    r = c.post("/api/auth/login", data={"username": username, "password": password})
    roles = c.get("/api/iam/roles/").status_code            # would only be 200 with a real credential
    return {"status": r.status_code, "credential": ACCESS_COOKIE_NAME in c.cookies or REFRESH_COOKIE_NAME in c.cookies,
            "roles_endpoint": roles, "detail": (r.json().get("detail") if r.headers.get("content-type", "").startswith("application/json") else None)}

def admin_client(username, password):
    c = client()
    assert c.post("/api/auth/login", data={"username": username, "password": password}).status_code == 200
    c.headers["X-CSRF-Token"] = c.cookies.get("csrf_token")
    return c

def db_do(fn):
    db = database.SessionLocal()
    try:
        fn(db); db.commit()
    finally:
        db.close()

def uid(username):
    db = database.SessionLocal()
    try:
        return db.query(models.User).filter_by(username=username).one().id
    finally:
        db.close()

def cutoff_and_hash():
    db = database.SessionLocal()
    try:
        u = db.query(models.User).filter_by(username="admin").one()
        return {"cutoff": u.tokens_valid_after.isoformat() if u.tokens_valid_after else None, "hash": u.hashed_password}
    finally:
        db.close()

def env_password_attempts():
    return {
        "admin": attempt("admin", ENV_PW),
        "email": attempt("admin@example.com", ENV_PW),
        "unknown": attempt("nobody", ENV_PW),
        "wrong_case": attempt("ADMIN", ENV_PW),
        "wrong_case_email": attempt("Admin@Example.com", ENV_PW),
    }
'''

FIRST = PRELUDE + r'''
out = {}
# 5. first creation used the initialisation password: it logs in ONCE, through the normal DB check
out["init_login"] = attempt("admin", ENV_PW)
# a legitimate password change by an Admin
c = admin_client("admin", ENV_PW)
out["change_status"] = c.put(f"/api/iam/users/{uid('admin')}/", json={"password": CHANGED_PW, "reason": "legitimate change"}).status_code
time.sleep(1.1)                                            # token iat has 1-second resolution (existing mechanism)
out["after_change"] = env_password_attempts()
out["correct_db_password"] = attempt("admin", CHANGED_PW)
out["correct_db_password_email"] = attempt("admin@example.com", CHANGED_PW)
out["state"] = cutoff_and_hash()
print("RESULT=" + json.dumps(out))
'''

RESTART = PRELUDE + r'''
out = {"after_restart": env_password_attempts(), "correct_db_password": attempt("admin", CHANGED_PW), "state": cutoff_and_hash()}
print("RESULT=" + json.dumps(out))
'''

PROTECTIONS = PRELUDE + r'''
out = {}
def reset_admin():
    def f(db):
        u = db.query(models.User).filter_by(username="admin").one()
        u.totp_enabled = False; u.totp_secret = None; u.locked_until = None; u.failed_login_attempts = 0; u.is_active = True
    db_do(f)

# 4a. 2FA enabled: neither the database password (without a code) nor the environment value gets in
def f(db):
    u = db.query(models.User).filter_by(username="admin").one(); u.totp_enabled = True; u.totp_secret = "JBSWY3DPEHPK3PXP"
db_do(f)
out["twofa_db_pw_no_code"] = attempt("admin", CHANGED_PW)
out["twofa_env_pw"] = attempt("admin", ENV_PW)
out["twofa_env_pw_with_code"] = None
c = client()
r = c.post("/api/auth/login", data={"username": "admin", "password": ENV_PW, "otp": "000000"})
out["twofa_env_pw_with_code"] = {"status": r.status_code, "credential": ACCESS_COOKIE_NAME in c.cookies}
reset_admin()

# 4b. locked: the lockout check precedes any password check
def f(db):
    u = db.query(models.User).filter_by(username="admin").one(); u.locked_until = datetime.utcnow() + timedelta(hours=1)
db_do(f)
out["locked_db_pw"] = attempt("admin", CHANGED_PW)
out["locked_env_pw"] = attempt("admin", ENV_PW)
out["locked_email_env_pw"] = attempt("admin@example.com", ENV_PW)
reset_admin()

# 4c. deactivated (a second Admin deactivates the seed admin — the last-admin rule allows it)
boss_c = admin_client("admin", CHANGED_PW)
r = boss_c.post("/api/iam/users/", json={"username": "boss", "email": "boss@example.com", "password": "Boss-Pw-123456", "is_active": True,
                                         "role_id": [x["id"] for x in boss_c.get("/api/iam/roles/").json() if x["name"].lower() == "admin"][0]})
out["boss_created"] = r.status_code
time.sleep(1.1)
boss = admin_client("boss", "Boss-Pw-123456")
out["deactivate_status"] = boss.put(f"/api/iam/users/{uid('admin')}/", json={"is_active": False, "reason": "test"}).status_code
out["inactive_db_pw"] = attempt("admin", CHANGED_PW)
out["inactive_env_pw"] = attempt("admin", ENV_PW)
out["inactive_email_env_pw"] = attempt("admin@example.com", ENV_PW)

# 6. what failed logins left behind: no input password, no environment value, anywhere in the audit trail
db = database.SessionLocal()
try:
    rows = db.query(models.AuditLog).all()
    blob = json.dumps([[getattr(a, col.name) for col in a.__table__.columns] for a in rows], default=str)
    out["audit_rows"] = len(rows)
    out["audit_failed_rows"] = sum(1 for a in rows if a.action.startswith("LOGIN_FAILED"))
    out["audit_leaks"] = [w for w in (ENV_PW, CHANGED_PW, WRONG_PW, "Boss-Pw-123456") if w in blob]
finally:
    db.close()
out["wrong_pw"] = attempt("admin", WRONG_PW)
print("RESULT=" + json.dumps(out))
'''


def _result(stdout: str) -> dict:
    return json.loads([l for l in stdout.splitlines() if l.startswith("RESULT=")][-1][len("RESULT="):])


def _refused(a: dict, status=401):
    assert a["status"] == status, a
    assert a["credential"] is False, a                  # no access / refresh cookie issued
    assert a["roles_endpoint"] in (401, 403), a         # and role management is unreachable


@pytest.mark.parametrize("environment", ENVIRONMENTS, ids=lambda e: e or "unset-default")
def test_the_initialisation_password_never_logs_anyone_in_after_the_account_exists(tmp_path, environment):
    db = tmp_path / "login.db"
    args = (ENV_PW, CHANGED_PW, WRONG_PW)
    out1, err1 = _run(FIRST, db, environment, *args)
    first = _result(out1)

    # 5. first creation: the initialisation password worked exactly like a normal DB password
    assert first["init_login"]["status"] == 200 and first["init_login"]["credential"] and first["init_login"]["roles_endpoint"] == 200
    assert first["change_status"] == 200

    # after the legitimate change the old initialisation password is dead — by username, by email, any case, unknown user
    for name, a in first["after_change"].items():
        _refused(a)
    # 2. the correct DB password still logs in through the normal flow (username and email)
    for key in ("correct_db_password", "correct_db_password_email"):
        a = first[key]
        assert a["status"] == 200 and a["credential"] and a["roles_endpoint"] == 200, a

    # a restart (twice) restores nothing
    out2, err2 = _run(RESTART, db, environment, *args)
    second = _result(out2)
    out3, err3 = _run(RESTART, db, environment, *args)
    third = _result(out3)
    for res in (second, third):
        for a in res["after_restart"].values():
            _refused(a)
        assert res["correct_db_password"]["status"] == 200 and res["correct_db_password"]["credential"]
        assert res["state"] == first["state"]                      # password hash and credential cut-off untouched by start-up

    # 6. no process output contains the environment value or any password that was typed
    for text in (out1 + err1, out2 + err2, out3 + err3):
        for secret in (ENV_PW, CHANGED_PW, WRONG_PW):
            assert secret not in text


@pytest.mark.parametrize("environment", ENVIRONMENTS, ids=lambda e: e or "unset-default")
def test_deactivation_lockout_and_2fa_are_never_skipped_because_of_the_environment_value(tmp_path, environment):
    db = tmp_path / "protect.db"
    args = (ENV_PW, CHANGED_PW, WRONG_PW)
    out1, _ = _run(FIRST, db, environment, *args)
    assert _result(out1)["change_status"] == 200
    out, err = _run(PROTECTIONS, db, environment, *args)
    res = _result(out)

    # 2FA enabled: the correct DB password alone is stopped at the 2FA step; the environment value never gets that far
    a = res["twofa_db_pw_no_code"]; _refused(a); assert "2FA" in (a["detail"] or "")
    _refused(res["twofa_env_pw"]); assert "Incorrect" in (res["twofa_env_pw"]["detail"] or "")
    assert res["twofa_env_pw_with_code"]["status"] == 401 and res["twofa_env_pw_with_code"]["credential"] is False

    # locked: locked for the real password and for the environment value alike
    for k in ("locked_db_pw", "locked_env_pw", "locked_email_env_pw"):
        _refused(res[k], status=423)

    # deactivated: refused for the real password (deactivated) and the environment value (bad password)
    assert res["boss_created"] == 200 and res["deactivate_status"] == 200
    a = res["inactive_db_pw"]; _refused(a); assert "deactivated" in (a["detail"] or "")
    for k in ("inactive_env_pw", "inactive_email_env_pw"):
        _refused(res[k]); assert "Incorrect" in (res[k]["detail"] or "")

    # failed-login audit rows exist, and hold neither the typed passwords nor the environment value
    assert res["audit_failed_rows"] > 0 and res["audit_leaks"] == []
    _refused(res["wrong_pw"])
    for secret in (ENV_PW, CHANGED_PW, WRONG_PW):
        assert secret not in out + err


def _code_lines(path: Path) -> str:
    """Source without comment-only lines (the explanatory comment in auth.py names the variable)."""
    return "\n".join(l for l in path.read_text(errors="ignore").splitlines() if not l.lstrip().startswith("#"))


def test_the_source_has_no_environment_password_login_branch():
    """Belt and braces: the only code that reads INITIAL_ADMIN_PASSWORD is the seeder; routers/auth.py has no such branch or flag."""
    auth_code = _code_lines(BACKEND / "routers" / "auth.py")
    assert "INITIAL_ADMIN_PASSWORD" not in auth_code and "getenv" not in auth_code and "environ" not in auth_code
    assert "rescue" not in auth_code.lower()
    scanned = list(BACKEND.glob("*.py")) + [p for d in ("routers", "services", "core", "repositories", "middleware") for p in (BACKEND / d).rglob("*.py")]
    readers = sorted(p.name for p in scanned if "INITIAL_ADMIN_PASSWORD" in _code_lines(p))
    assert readers == ["db_seeder.py"], readers
