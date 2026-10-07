"""Targeted seed for ONE specific gap identified while answering a follow-up question about
batch-1 (2026-09-28): PQP's attachment deletes use Promise.allSettled, so a partial failure
(one delete succeeds, one fails) leaves the FAILED one in `deletedFileIds` for a retry — but the
SUCCEEDED one is also still in that array (the modal never removes it), so a same-payload retry
re-sends a delete for an ALREADY soft-deleted attachment, which routers/file_router.py's
delete_file endpoint 404s (its query filters is_deleted == False). This seed + the paired
Playwright script exist ONLY to get real evidence for that one scenario — not a broader retest.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_pqp_partial_delete_review.py
    node ../react-app/tests-browser/pqp-partial-delete-review.mjs stack.json
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


review_role = role("PqpPartialDeleteReviewer", [perms.PQP_VIEW, perms.PQP_CREATE, perms.PQP_UPDATE, perms.CONTRACTOR_VIEW])

d.add(models.Contractor(id="PD-V1", name="Partial Delete Review Co", abbreviation="PDR"))
d.add(models.User(username="pqp_partial_delete_reviewer", email="pdr@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=review_role.id, full_name="PQP Partial Delete Reviewer"))
# PQP's EDIT modal does NOT auto-fetch via entityType/entityId (only its read-only view modal
# does) — FileAttachment.tsx renders whatever the `attachments` array PROP already contains
# (PQPModals.tsx passes formData.attachments straight through). For a seeded row to show real,
# deletable "existing" attachments in the edit form, that JSON column must already hold objects
# shaped like AttachmentInfo (id/file_name/file_url/mime_type) — matching real Attachment rows.
attachments_json = json.dumps([
    {"id": "pd-att-keep", "entity_type": "pqp", "entity_id": "pd-pqp-1", "file_name": "keep.png",
     "file_url": "/api/files/download/pqp/keep.png", "mime_type": "image/png", "category": "attachment",
     "uploaded_by": "seed", "uploaded_at": "2026-09-28T00:00:00Z"},
    {"id": "pd-att-fail", "entity_type": "pqp", "entity_id": "pd-pqp-1", "file_name": "fail.png",
     "file_url": "/api/files/download/pqp/fail.png", "mime_type": "image/png", "category": "attachment",
     "uploaded_by": "seed", "uploaded_at": "2026-09-28T00:00:01Z"},
])
d.add(models.PQP(id="pd-pqp-1", pqpNo="QTS-PDR-PQP-000001", title="Partial delete review PQP",
                  description="", vendor_id="PD-V1", status="Not Submit", version="Rev1.0",
                  createdAt="2026-09-28", updatedAt="2026-09-28", attachments=attachments_json))
d.commit()

# The matching real Attachment rows (soft-delete only touches is_deleted, no disk I/O — no real
# files needed) — these are what the DELETE call actually acts on.
d.add(models.Attachment(id="pd-att-keep", entity_type="pqp", entity_id="pd-pqp-1", file_name="keep.png",
                        file_path="pqp/keep.png", file_size=10, mime_type="image/png", category="attachment",
                        uploaded_by="seed", uploaded_at="2026-09-28T00:00:00Z", is_deleted=False))
d.add(models.Attachment(id="pd-att-fail", entity_type="pqp", entity_id="pd-pqp-1", file_name="fail.png",
                        file_path="pqp/fail.png", file_size=10, mime_type="image/png", category="attachment",
                        uploaded_by="seed", uploaded_at="2026-09-28T00:00:01Z", is_deleted=False))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
