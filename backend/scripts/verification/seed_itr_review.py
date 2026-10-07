"""Seed for the ITR business-review browser walkthrough (2026-09-23; isolated stack only — never run
against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_itr_review.py
    node ../react-app/tests-browser/itr-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    itr_editor    itr:view:all, itr:create:all, itr:update:all, noi:view:all, contractors:view:all,
                  checklist:view:all, checklist:create:all
                  — no itr:approve:all — used for create, NOI-handoff, Checklist link (reusing evidence
                  already gathered in the Checklist round), and to confirm Publish/Approve is blocked
    itr_approver  itr_editor's permissions + itr:approve:all
                  — used to confirm Approve/Publish and Revoke actually work when the permission is held
    itr_ncr       itr_editor's permissions + ncr:create:all
                  — used for the "Raise NCR" handoff from a Fail-result ITR (does NOT hold itr:create:all
                  beyond what itr_editor already has, so Re-inspect is tested by itr_editor itself, which
                  already holds itr:create:all)
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


BASE_CODES = [perms.ITR_VIEW, perms.ITR_CREATE, perms.ITR_UPDATE, perms.NOI_VIEW,
              perms.CONTRACTOR_VIEW, perms.CHECKLIST_VIEW, perms.CHECKLIST_CREATE, perms.CHECKLIST_UPDATE]

editor = role("ItrEditor", BASE_CODES)
approver = role("ItrApprover", BASE_CODES + [perms.ITR_APPROVE])
ncr_role = role("ItrNcr", BASE_CODES + [perms.NCR_CREATE])
# Holds itr:delete:all for real (round-2 correction: neither earlier account did, so delete-protection
# was never actually reached — every attempt 403'd at the permission layer before the business rules
# in delete_itr ever ran).
deleter = role("ItrDeleter", BASE_CODES + [perms.ITR_APPROVE, perms.ITR_DELETE, perms.NCR_VIEW, perms.NCR_CREATE, perms.NCR_UPDATE])

d.add(models.Contractor(id="ITRR-V1", name="ITR Review Co", abbreviation="IRR"))
d.add(models.NOI(id="ITRR-NOI-1", referenceNo="QTS-IRR-NOI-000001", package="ITR review NOI",
                 vendor_id="ITRR-V1", status="Open", issueDate="2026-09-23", inspectionDate="2026-09-23",
                 inspectionTime="", itpNo="", type="", foundLocation="Block A", discipline="Civil"))
d.add(models.User(username="itr_editor", email="itre@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=editor.id, full_name="ITR Editor"))
d.add(models.User(username="itr_approver", email="itra@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=approver.id, full_name="ITR Approver"))
d.add(models.User(username="itr_ncr", email="itrn@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=ncr_role.id, full_name="ITR NCR"))
d.add(models.User(username="itr_deleter", email="itrd@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=deleter.id, full_name="ITR Deleter"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
