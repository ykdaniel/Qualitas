"""Seed for the Attachment / Print business-review browser walkthrough (2026-09-24; isolated
stack only). Reuses NCR's already-confirmed attachment-evidence mechanism (core.ncr_photo_evidence,
verified in earlier sessions) as the baseline; this seed instead exercises OSD's implementation
path — a module never given a full attachment+print lifecycle test this round — via the SAME
shared components (FileAttachment.tsx, routers/file_router.py) other modules use.

Explicitly NOT an attempt to reproduce the old, unscoped BACKLOG #23 report ("attachment preview
+ print not working") — that stays marked unreproduced. This is a basic-acceptance pass: can a
representative record, built fresh in this isolated stack, actually upload / list / preview /
download / delete an attachment and produce a print view. Different question, doesn't retire #23.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_attachment_print_review.py
    node ../react-app/tests-browser/attachment-print-review.mjs stack.json
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


osd_role = role("OsdAttachmentReviewer", [perms.OSD_VIEW, perms.OSD_CREATE, perms.OSD_UPDATE])

d.add(models.Contractor(id="AP-V1", name="Attachment Print Review Co", abbreviation="APR"))
d.add(models.OSD(id="ap-osd-1", vendor_id="AP-V1", documentNumber="QTS-APR-OSD-000001", status="Open",
                  raiseDate="2026-09-24", raisedBy="Reviewer", deliveryNoteNo="DN-1", poNumber="PO-1",
                  itemDescription="Steel rebar bundle", expectedQty="100", receivedQty="92", unit="pcs",
                  damageDescription="8 units bent in transit"))
d.add(models.User(username="osd_attachment_reviewer", email="apr@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=osd_role.id, full_name="OSD Attachment Reviewer"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True, "osd_id": "ap-osd-1"}))
