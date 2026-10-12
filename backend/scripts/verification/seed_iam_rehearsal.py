"""Isolated TEST SEED SCRIPT for the IAM rehearsal (coordination center, 2026-10-11) — writes test fixtures to an isolated
database; it is a seed script, not a read-only script. Mirrors production's IAM shape (read-only query 2026-10-11) so the
user can rehearse, before touching production: change the admin's password / email, enable 2FA, deactivate john_doe and
assign the role-permission matrix (DECISIONS「IAM 角色權限矩陣、停用測試帳號 john_doe」).

  YkDaniel   admin role (renamed ADMIN), email admin@example.com, 2FA off      (production's only admin)
  john_doe   role Inspector with 0 permissions, active, never logged in       (left by an old test script)
  roles      ENGINEER / QA_MANAGER / VIEWER / USER with production's current permission codes

Isolated stack only. Requires IAM_REHEARSAL_PASSWORD in the environment (no hardcoded or defaulted password); john_doe
gets a random password nobody knows. No production data is copied — only role names and permission codes.
"""
import os
import secrets
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

from sqlalchemy import func
import database, models
from core.security import get_password_hash

PW = os.environ.get("IAM_REHEARSAL_PASSWORD")
if not PW:
    raise RuntimeError("IAM_REHEARSAL_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

PRODUCTION_ROLES = {   # production's role -> permission codes, read-only query 2026-10-11
    "Inspector": [],
    "ENGINEER": "itp:view:all itp:create:all itp:update:all itp:void:all ncr:view:all ncr:create:all ncr:update:all "
                "ncr:close:all noi:view:all noi:create:all noi:update:all checklist:view:all checklist:create:all "
                "checklist:update:all iam:user:view iam:role:view checklist:close:all".split(),
    "QA_MANAGER": "itp:view:all itp:create:all itp:update:all itp:delete:all itp:approve:all itp:void:all ncr:view:all "
                  "ncr:create:all ncr:update:all ncr:delete:all ncr:approve:all ncr:close:all noi:view:all "
                  "noi:create:all noi:update:all noi:delete:all noi:approve:all checklist:view:all checklist:create:all "
                  "checklist:update:all checklist:delete:all iam:user:view iam:role:view checklist:close:all".split(),
    "VIEWER": "itp:view:all ncr:view:all noi:view:all checklist:view:all iam:user:view iam:role:view".split(),
    "USER": ["iam:user:view"],
}

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


admin_role = d.query(models.Role).filter(func.lower(models.Role.name) == "admin").one()
admin_role.name = "ADMIN"
admin = d.query(models.User).filter_by(email="admin@example.com").one()
admin.username = "YkDaniel"
admin.full_name = "YkDaniel"
admin.hashed_password = get_password_hash(PW)

roles = {}
for name, codes in PRODUCTION_ROLES.items():
    role = d.query(models.Role).filter(func.lower(models.Role.name) == name.lower()).first()
    if not role:
        role = models.Role(name=name)
        d.add(role)
    role.name = name
    role.permissions_rel = [_perm(c) for c in codes]
    roles[name] = role
d.flush()

d.add(models.User(username="john_doe", email="john.doe@example.com", is_active=True, full_name="John Doe",
                  hashed_password=get_password_hash(secrets.token_urlsafe(24)), role_id=roles["Inspector"].id))
d.commit()
print("seeded IAM rehearsal: YkDaniel (ADMIN), john_doe (Inspector, 0 permissions), roles", ", ".join(PRODUCTION_ROLES))
