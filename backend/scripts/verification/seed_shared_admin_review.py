"""Seed for the shared-admin-cluster business-review browser walkthrough (2026-09-24, Projects
section updated 2026-09-28; isolated stack only — never run against a real DB). Covers: Document
Naming Rules, Contractors update, KPI weights, and Projects' authorization gate.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_shared_admin_review.py
    node ../react-app/tests-browser/shared-admin-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions/role each holds:

    settings_manager   settings:manage:all, contractors:view:all, contractors:manage:all,
                       kpi:view:all, kpi:update:all — role name "SettingsManager" (NOT "Admin")
    fake_admin_perms   the SAME permission codes as settings_manager, role name "NotAdmin" —
                       2026-09-28: since routers/projects.py now requires contractors:manage:all
                       (RoleChecker) instead of checking the role name, this account (a
                       non-"Admin"-named role that legitimately HOLDS the permission) is now
                       expected to SUCCEED at Projects writes — the account/permissions were not
                       changed for this batch, only what the test expects from them.
    real_admin_role    a role literally named "Admin" with NO permissions_rel at all — 2026-09-28:
                       now expected to be REJECTED (403) at Projects writes, since the name "Admin"
                       no longer grants anything by itself; this is the reverse case of
                       fake_admin_perms, both accounts unchanged from 2026-09-24.
"""
import sys, os, json
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models
from core import perms
from core.security import get_password_hash

PW = "Accept-Test-1234"  # shared, isolated-only test constant used across this directory's seed scripts

d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


def role(name, codes):
    r = models.Role(name=name)
    r.permissions_rel = [_get_or_create_perm(d, c) for c in codes]
    d.add(r)
    d.flush()
    return r


CODES = ["settings:manage:all", perms.CONTRACTOR_VIEW, perms.CONTRACTOR_MANAGE, perms.KPI_VIEW, perms.KPI_UPDATE, perms.NCR_CREATE]
settings_role = role("SettingsManager", CODES)
notadmin_role = role("NotAdmin", CODES)  # same permissions, different role NAME
admin_role = role("Admin", [])  # the literal name "Admin", zero permission codes

d.add(models.Contractor(id="SHARED-V1", name="Shared Review Co", abbreviation="SRC"))
d.add(models.User(username="settings_manager", email="setm@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=settings_role.id, full_name="Settings Manager"))
d.add(models.User(username="fake_admin_perms", email="fap@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=notadmin_role.id, full_name="Fake Admin Perms"))
d.add(models.User(username="real_admin_role", email="rar@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=admin_role.id, full_name="Real Admin Role"))
d.commit()

# 2026-09-28: a Project referenced by a real ITP, to confirm the existing reference-deletion
# protection (core/validators.py::check_project_references) is unaffected by the authorization fix
# — a permission-holding account must still be blocked from deleting it. Plus a plain, unreferenced
# Project for the ordinary update/delete-succeeds path.
d.add(models.Project(id="SHARED-PROJ-REF", name="Shared Referenced Project"))
d.add(models.Project(id="SHARED-PROJ-PLAIN", name="Shared Plain Project"))
d.add(models.ITP(id="shared-itp-ref", project_id="SHARED-PROJ-REF", vendor_id="SHARED-V1",
                  referenceNo="QTS-SHARED-ITP-000001", description="References SHARED-PROJ-REF",
                  rev="Rev1.0", submit="", status="Pending", submissionDate="2026-09-28"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
