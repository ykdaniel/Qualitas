"""Seed for the IAM business-review browser walkthrough (2026-09-24; isolated stack only —
never run against a real DB). Covers: user create/update/deactivate, role_id self-escalation
block (re-verified this round, not just cited from an earlier session's memory), role CRUD +
permission assignment, and per-user data-isolation scope (project_ids/vendor_id).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_iam_review.py
    node ../react-app/tests-browser/iam-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant).

Accounts, EXACT permissions each holds:

    iam_manager   iam:user:view, iam:user:manage, iam:role:view, iam:role:manage — full IAM admin.
    iam_viewer    iam:user:view, iam:role:view only — no manage, used for the permission-gate contrast.

Also seeds a plain "TargetUser" role (no iam:* permissions) and a target account
("scope_target") whose scope iam_manager will set/read during the review, plus a
"PowerRole" role with iam:role:manage (used as the escalation target in the self-role-change
test — separate from iam_manager's own role, since the router's escalation check is keyed off
role_id difference, not permission delta).
"""
import sys, os, json
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models
from core import perms
from core.security import get_password_hash

PW = "Accept-Test-1234"

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


manager_role = role("IamManager", [perms.USER_VIEW, perms.USER_MANAGE, perms.ROLE_VIEW, perms.ROLE_MANAGE, perms.CONTRACTOR_VIEW])
# Deliberately WITHOUT contractors:view:all — used to reproduce a confirmed defect: the Data
# Scope section (UserScopeSection.tsx) does Promise.all([getProjects(), getContractors()]);
# since Promise.all rejects atomically, an iam:user:manage account lacking contractors:view:all
# gets ZERO projects/contractors rendered (not just contractors) and can never load or save any
# user's data-isolation scope, even though GET /api/projects/ itself succeeds independently.
manager_no_contractor_role = role("IamManagerNoContractor", [perms.USER_VIEW, perms.USER_MANAGE, perms.ROLE_VIEW, perms.ROLE_MANAGE])
viewer_role = role("IamViewer", [perms.USER_VIEW, perms.ROLE_VIEW])
target_role = role("TargetUser", [])
power_role = role("PowerRole", [perms.ROLE_MANAGE])

d.add(models.Project(id="IAM-P1", name="IAM Review Project 1"))
d.add(models.Project(id="IAM-P2", name="IAM Review Project 2"))
d.add(models.Contractor(id="IAM-V1", name="IAM Review Vendor", abbreviation="IRV"))

d.add(models.User(username="iam_manager", email="iamm@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=manager_role.id, full_name="IAM Manager"))
d.add(models.User(username="iam_viewer", email="iamv@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=viewer_role.id, full_name="IAM Viewer"))
d.add(models.User(username="scope_target", email="scopet@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=target_role.id, full_name="Scope Target"))
d.add(models.User(username="iam_manager_no_contractor", email="iamnc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=manager_no_contractor_role.id, full_name="IAM Manager No Contractor Perm"))
d.commit()
result = {"ok": True, "target_role_id": target_role.id, "power_role_id": power_role.id}
d.close()
print("SEED " + json.dumps(result))
