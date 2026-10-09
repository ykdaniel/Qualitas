"""Seed for verifying the batch-1 save-flow fixes (2026-09-25; isolated stack only):
1. PQP save failure keeps the modal open with input intact (no silent close/data loss).
2. ITP save failure keeps input + isDirty intact, so closing afterward still asks to discard.
3. Contractors delete-while-referenced now returns 400/409, not 500 (covered by the
   existing contractors-review.mjs / seed_contractors_review.py — reused, not duplicated here).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_save_flow_fix_review.py
    node ../react-app/tests-browser/save-flow-fix-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>
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


review_role = role("SaveFlowReviewer", [
    perms.PQP_VIEW, perms.PQP_CREATE, perms.PQP_UPDATE,
    perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE,
    perms.CONTRACTOR_VIEW,
])

d.add(models.Contractor(id="SF-V1", name="Save Flow Review Co", abbreviation="SFR"))
d.add(models.User(username="save_flow_reviewer", email="sfr@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=review_role.id, full_name="Save Flow Reviewer"))
d.commit()

# An existing ITP the "new" flow's blank record simulates directly (mirrors handleAddNew's
# POST, which is out of scope for this batch — see the batch-2 plan). status='Pending' matches
# handleAddNew's default so the modal's readOnly/canEdit logic behaves the same as if the user
# had just clicked "Add New".
d.add(models.ITP(id="sf-itp-1", vendor_id="SF-V1", referenceNo="QTS-SFR-ITP-000001",
                  description="", rev="", submit="", status="Pending",
                  submissionDate="2026-09-25"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
