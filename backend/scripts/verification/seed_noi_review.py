"""Seed for the NOI business-review browser walkthrough (2026-09-23; isolated stack only — never run
against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_noi_review.py
    node ../react-app/tests-browser/noi-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    noi_creator     noi:view:all, noi:create:all                    — cannot update an existing NOI at all;
                    same cross-module pattern found in the PQP round: the create form's Contractor
                    dropdown needs contractors:view:all, which this documented-minimum role does NOT
                    have, so the dropdown is empty and creation cannot be completed on screen — kept
                    deliberately narrow to demonstrate exactly this
    noi_creator_cv  noi:view:all, noi:create:all, contractors:view:all — workaround account (same
                    convention as pqp_creator_cv) used only so the rest of the walkthrough can proceed
    noi_editor      noi_creator_cv's permissions + noi:update:all     — no noi:approve:all (a permission
                    code that is DORMANT on the backend — confirmed via grep, routers/noi.py never
                    imports or checks it on any route; the frontend still uses it to gate re-editing a
                    Rejected NOI, which is exactly the mismatch this review checks)
    noi_approver    same as noi_editor + noi:approve:all
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


creator = role("NoiCreator", [perms.NOI_VIEW, perms.NOI_CREATE])
# Two SEPARATE workaround tiers, kept apart on purpose so each dependency can be isolated rather than
# tested only in combination: creator_cv1 adds ONLY contractors:view:all; creator_cv adds BOTH.
creator_cv1 = role("NoiCreatorCV1", [perms.NOI_VIEW, perms.NOI_CREATE, perms.CONTRACTOR_VIEW])
creator_cv = role("NoiCreatorCV", [perms.NOI_VIEW, perms.NOI_CREATE, perms.CONTRACTOR_VIEW, perms.ITP_VIEW])
editor = role("NoiEditor", [perms.NOI_VIEW, perms.NOI_CREATE, perms.NOI_UPDATE, perms.CONTRACTOR_VIEW, perms.ITP_VIEW])
approver = role("NoiApprover", [perms.NOI_VIEW, perms.NOI_CREATE, perms.NOI_UPDATE, perms.NOI_APPROVE, perms.CONTRACTOR_VIEW, perms.ITP_VIEW])

d.add(models.Contractor(id="NOIR-V1", name="NOI Review Co", abbreviation="NRC"))
d.add(models.ITP(id="NOIR-ITP-1", referenceNo="QTS-NRC-ITP-000001", vendor_id="NOIR-V1",
                 description="NOI review source ITP", status="Approved", rev="Rev1.0"))
d.add(models.User(username="noi_creator", email="noic@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator.id, full_name="NOI Creator"))
d.add(models.User(username="noi_creator_cv1", email="noiccv1@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator_cv1.id, full_name="NOI Creator CV1"))
d.add(models.User(username="noi_creator_cv", email="noiccv@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator_cv.id, full_name="NOI Creator CV"))
d.add(models.User(username="noi_editor", email="noie@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=editor.id, full_name="NOI Editor"))
d.add(models.User(username="noi_approver", email="noia@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=approver.id, full_name="NOI Approver"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
