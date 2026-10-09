"""Startup/seeder permission persistence (2026-09-19).

The bug: db_seeder.seed_initial_data() re-granted checklist:close:all to every
role holding checklist:update:all on EVERY backend start — so an administrator
could never revoke it, and "may update" / "may reopen a closed checklist"
could not be managed separately.

These tests exercise the REAL start-up path: each "boot" is a fresh Python
process that imports `main` (migrations + run_seeding, exactly what a server
restart does) against a throwaway file database; role changes are made
through the real IAM HTTP API as the seeded admin; each user then logs in
for real. Nothing is mocked. The DB path is absolute and under tmp_path, so no
backup/side file is written into the repository.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from isolation import run_python

BACKEND = Path(__file__).resolve().parents[1]
ADMIN_PW = "Seed-Admin-Pw-123456"
USER_PW = "Seed-User-Pw-123456"
CLOSE, UPDATE = "checklist:close:all", "checklist:update:all"
BASE_PERMS = ["checklist:view:all", "checklist:create:all", UPDATE, "itr:view:all", "itr:create:all", "itr:update:all"]


def _run(code: str, db_path: Path, *args: str) -> str:
    # Every start-up subprocess goes through the shared isolation entry point (validated throwaway DB, explicit env).
    r = run_python(code, db_path, *args, extra_env={"INITIAL_ADMIN_PASSWORD": ADMIN_PW}, timeout=180)
    return r.stdout + r.stderr


BOOT = r'''
import json, main, database, models      # importing main = migrations + run_seeding, i.e. one server start
db = database.SessionLocal()
print("ROLES=" + json.dumps({r.name: sorted(p.code for p in r.permissions_rel) for r in db.query(models.Role).all()}))
'''


def boot(db_path) -> tuple[dict, str]:
    out = _run(BOOT, db_path)
    line = [l for l in out.splitlines() if l.startswith("ROLES=")][-1]
    return json.loads(line[len("ROLES="):]), out


ADMIN = r'''
import json, sys
from fastapi.testclient import TestClient
import main
ops = json.loads(sys.argv[1]); pw = sys.argv[2]; admin_pw = sys.argv[3]
c = TestClient(main.app)
assert c.post("/api/auth/login", data={"username": "admin", "password": admin_pw}).status_code == 200
c.headers["X-CSRF-Token"] = c.cookies.get("csrf_token")
roles = {r["name"]: r for r in c.get("/api/iam/roles/").json()}
out = {}
for op in ops:
    if op["op"] == "create_role":
        r = c.post("/api/iam/roles/", json={"name": op["name"], "description": "t", "permissions": op["permissions"]})
        assert r.status_code == 200, r.text; roles[op["name"]] = r.json()
    elif op["op"] == "set_permissions":
        r = c.put(f"/api/iam/roles/{roles[op['name']]['id']}/", json={"permissions": op["permissions"]})
        assert r.status_code == 200, r.text
    elif op["op"] == "create_user":
        r = c.post("/api/iam/users/", json={"username": op["username"], "email": op["username"] + "@example.com",
                                          "password": pw, "full_name": op["username"], "role_id": roles[op["role"]]["id"]})
        assert r.status_code == 200, r.text
import database, models
db = database.SessionLocal()   # brand-new session: were the role changes really persisted / audited?
out["role_audit_rows"] = db.query(models.AuditLog).filter_by(entity_type="Role").count()
print("OUT=" + json.dumps(out))
'''


def admin_ops(db_path, ops):
    out = _run(ADMIN, db_path, json.dumps(ops), USER_PW, ADMIN_PW)
    return json.loads([l for l in out.splitlines() if l.startswith("OUT=")][-1][4:])


CHECK = r'''
import json, sys, uuid
from fastapi.testclient import TestClient
import main, database, models
users = json.loads(sys.argv[1]); pw = sys.argv[2]; admin_pw = sys.argv[3]
admin = TestClient(main.app)
assert admin.post("/api/auth/login", data={"username": "admin", "password": admin_pw}).status_code == 200
admin.headers["X-CSRF-Token"] = admin.cookies.get("csrf_token")
db = database.SessionLocal()
if not db.query(models.Contractor).filter_by(id="SEED-V1").first():
    db.add(models.Contractor(id="SEED-V1", name="Seed Co", abbreviation="SED")); db.commit()
def closed_instance():
    itr = uuid.uuid4().hex
    db.add(models.ITR(id=itr, vendor_id="SEED-V1", documentNumber="ITR-SEED-" + itr[:6], description="d", rev="Rev1.0",
                      submit="2026-09-19", status="In Progress", raiseDate="2026-09-19")); db.commit()
    item = {"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""}
    tpl = admin.post("/api/checklist/", json={"activity": "Seed", "date": "2026-09-19", "status": "Ongoing",
                     "detail_data": json.dumps({"items": [item]})}).json()
    assert admin.post(f"/api/itr/{itr}/link-checklist", params={"checklist_id": tpl["id"]}).status_code == 200
    inst = db.query(models.Checklist).filter_by(itrId=itr).one().id
    r = admin.put(f"/api/checklist/{inst}/", json={"status": "Pass", "passCount": 1, "failCount": 0,
                  "detail_data": json.dumps({"items": [{**item, "result": "O"}]})})
    assert r.status_code == 200, r.text
    return inst
out = {}
for u in users:
    c = TestClient(main.app)
    assert c.post("/api/auth/login", data={"username": u, "password": pw}).status_code == 200, u
    c.headers["X-CSRF-Token"] = c.cookies.get("csrf_token")
    perms = c.get("/api/user/profile").json()["permissions"]
    inst = closed_instance()
    r = c.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"})      # the Reopen call
    out[u] = {"profile_has_close": "checklist:close:all" in perms, "profile_has_update": "checklist:update:all" in perms,
              "reopen_status": r.status_code}
print("OUT=" + json.dumps(out))
'''


def check_users(db_path, users):
    out = _run(CHECK, db_path, json.dumps(users), USER_PW, ADMIN_PW)
    return json.loads([l for l in out.splitlines() if l.startswith("OUT=")][-1][4:])


def _assert_consistent(result):
    """/user/profile, and the real Reopen API call must agree (the UI button reads /user/profile)."""
    for user, r in result.items():
        assert r["profile_has_update"], user
        assert r["reopen_status"] == (200 if r["profile_has_close"] else 403), (user, r)


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "seeder_persist.db"


def test_close_is_never_granted_revoked_or_restored_by_restarts(db_path):
    roles, first_log = boot(db_path)                                   # start #1: creates codes + admin
    assert CLOSE in roles["admin"] and UPDATE in roles["admin"]

    admin_ops(db_path, [
        {"op": "create_role", "name": "UpdateOnly", "permissions": BASE_PERMS},
        {"op": "create_role", "name": "UpdateAndClose", "permissions": BASE_PERMS + [CLOSE]},
        {"op": "create_role", "name": "RevokedLater", "permissions": BASE_PERMS + [CLOSE]},
        {"op": "create_user", "username": "u_update_only", "role": "UpdateOnly"},
        {"op": "create_user", "username": "u_with_close", "role": "UpdateAndClose"},
        {"op": "create_user", "username": "u_revoked", "role": "RevokedLater"},
    ])

    # 1 + 3: two more real starts — update-only stays without close; explicit close stays.
    for n in (2, 3):
        roles, log = boot(db_path)
        assert CLOSE not in roles["UpdateOnly"] and UPDATE in roles["UpdateOnly"], f"start #{n}"
        assert CLOSE in roles["UpdateAndClose"], f"start #{n}"
        assert "Backfilled" not in log

    # 2: an administrator revokes close (through the IAM API); the next start must NOT put it back.
    admin_ops(db_path, [{"op": "set_permissions", "name": "RevokedLater", "permissions": BASE_PERMS}])
    roles, log = boot(db_path)
    assert CLOSE not in roles["RevokedLater"] and UPDATE in roles["RevokedLater"]
    roles, _ = boot(db_path)                                            # ...and not on the one after either
    assert CLOSE not in roles["RevokedLater"]

    # 4: a role created later with plain update permission gets no close, before or after a restart.
    admin_ops(db_path, [
        {"op": "create_role", "name": "NewUpdater", "permissions": BASE_PERMS},
        {"op": "create_user", "username": "u_new_updater", "role": "NewUpdater"},
    ])
    roles, _ = boot(db_path)
    assert CLOSE not in roles["NewUpdater"]

    # 6: after these starts, fresh logins: /user/profile, the Reopen API result and the button source agree.
    result = check_users(db_path, ["u_update_only", "u_with_close", "u_revoked", "u_new_updater"])
    _assert_consistent(result)
    assert [result[u]["profile_has_close"] for u in ("u_update_only", "u_with_close", "u_revoked", "u_new_updater")] \
        == [False, True, False, False]

    # ...and once more after yet another start (each start is a fresh process, each check a fresh login).
    boot(db_path)
    result2 = check_users(db_path, ["u_update_only", "u_with_close", "u_revoked", "u_new_updater"])
    _assert_consistent(result2)
    assert {u: r["profile_has_close"] for u, r in result2.items()} == {u: r["profile_has_close"] for u, r in result.items()}


def test_admin_behaviour_is_unchanged(db_path):
    """Admin keeps its existing 'all permissions, re-synced on every start' design."""
    from core.perms import ALL_PERMISSIONS
    every = sorted(p["code"] for p in ALL_PERMISSIONS)
    roles, _ = boot(db_path)
    assert roles["admin"] == every                                       # includes close
    # the existing re-sync still repairs admin (not changed by this fix)
    _run("import main, database, models\n"
         "db = database.SessionLocal(); a = db.query(models.Role).filter(models.Role.name.ilike('admin')).one()\n"
         "a.permissions_rel = [p for p in a.permissions_rel if p.code != 'checklist:close:all']; db.commit()", db_path)
    roles, _ = boot(db_path)
    assert roles["admin"] == every


def test_permission_codes_are_still_created_on_a_fresh_database(db_path):
    roles, _ = boot(db_path)
    assert CLOSE in roles["admin"]                                       # the code exists (admin can hold it)
    out = _run("import main, database, models\n"
               "db = database.SessionLocal()\n"
               "print('CODES=' + str(sorted(p.code for p in db.query(models.Permission).filter(models.Permission.code.in_(['checklist:close:all','checklist:update:all'])))))", db_path)
    assert "['checklist:close:all', 'checklist:update:all']" in out


def test_role_inventory_is_read_only_and_marks_provenance_unknown(db_path):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from scripts.verification.role_permission_inventory import role_update_close_report
    boot(db_path)
    admin_ops(db_path, [
        {"op": "create_role", "name": "UpdateOnly", "permissions": BASE_PERMS},
        {"op": "create_role", "name": "UpdateAndClose", "permissions": BASE_PERMS + [CLOSE]},
    ])
    engine = create_engine(f"sqlite:///{db_path}")
    Session = sessionmaker(bind=engine)
    def snapshot():
        with engine.connect() as c:
            return sorted(c.execute(text("select role_id, permission_id from role_permissions")).fetchall())
    before = snapshot()
    db = Session()
    rows = {r["role"]: r for r in role_update_close_report(db)}
    db.close()
    assert snapshot() == before                                            # nothing granted or revoked
    assert (rows["UpdateOnly"]["update"], rows["UpdateOnly"]["close"]) == (True, False)
    assert (rows["UpdateAndClose"]["update"], rows["UpdateAndClose"]["close"]) == (True, True)
    assert rows["admin"]["is_admin"] is True
    assert "unknown" in rows["UpdateAndClose"]["provenance_of_close"]      # never claims to know the source
    assert rows["UpdateOnly"]["provenance_of_close"] == "-"
