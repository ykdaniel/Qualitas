"""Seed for the Contractors business-review browser walkthrough (2026-09-24; isolated stack only —
never run against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_contractors_review.py
    node ../react-app/tests-browser/contractors-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    contractor_viewer  contractors:view:all only — no manage. Add button correctly gated by
                       hasPermission('contractors:manage:all') per Contractors.tsx (confirmed via
                       code read — unlike KM's ungated Add button).
    contractor_manager contractors:view:all, contractors:manage:all — covers create/update/delete.
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


viewer = role("ContractorViewer", [perms.CONTRACTOR_VIEW])
# itp:create:all added so this account can create a real referencing ITP for the delete-protection test
# (validators.check_contractor_references) — not because ITP itself is under review here.
manager = role("ContractorManager", [perms.CONTRACTOR_VIEW, perms.CONTRACTOR_MANAGE, perms.ITP_CREATE])

d.add(models.User(username="contractor_viewer", email="cov@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=viewer.id, full_name="Contractor Viewer"))
d.add(models.User(username="contractor_manager", email="com@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=manager.id, full_name="Contractor Manager"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
