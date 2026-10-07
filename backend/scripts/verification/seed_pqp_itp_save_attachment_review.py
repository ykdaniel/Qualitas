"""Seed for the PQP/ITP partial-save + attachment-retry follow-up verification (2026-09-28;
isolated stack only). Covers the batch-1 gap-closing work: distinct "record saved, attachment
incomplete" messaging, per-item queue pruning (deletes and uploads), and retry-safety for both
plain Save and ITP's Publish. See tests-browser/pqp-itp-save-attachment-review.mjs.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_pqp_itp_save_attachment_review.py
    node ../react-app/tests-browser/pqp-itp-save-attachment-review.mjs stack.json
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


review_role = role("SaveAttachmentReviewer", [
    perms.PQP_VIEW, perms.PQP_CREATE, perms.PQP_UPDATE,
    # PQP_APPROVE is needed so this account's UI even lets it OPEN an Approved PQP for editing
    # (pqp_service.py's reopen-aware lock is otherwise fronted by a permission-based readOnly
    # gate in PQP.tsx) — the actual rejection under test is the backend's status-based content
    # lock, which applies regardless of this permission.
    perms.PQP_APPROVE,
    perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE,
    # ITP_APPROVE added 2026-09-28 so this account's Publish button/status options stay visible
    # under the new ITP approve/void authorization gate (services/itp_service.py) — this seed's
    # own tests exercise the save/retry mechanism via Publish, not the permission gate itself
    # (see seed_itp_approve_void_authz_review.py for that).
    perms.ITP_APPROVE,
    perms.CONTRACTOR_VIEW,
])
d.add(models.Contractor(id="SAT-V1", name="Save Attach Review Co", abbreviation="SAR"))
d.add(models.User(username="save_attach_reviewer", email="sar@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=review_role.id, full_name="Save Attach Reviewer"))


def attachment_json(entity_type, entity_id, items):
    return json.dumps([
        {"id": aid, "entity_type": entity_type, "entity_id": entity_id, "file_name": name,
         "file_url": f"/api/files/download/{entity_type}/{name}", "mime_type": "image/png",
         "category": "attachment", "uploaded_by": "seed", "uploaded_at": "2026-09-28T00:00:00Z"}
        for aid, name in items
    ])


def attachment_rows(entity_type, entity_id, items):
    for i, (aid, name) in enumerate(items):
        d.add(models.Attachment(id=aid, entity_type=entity_type, entity_id=entity_id, file_name=name,
                                file_path=f"{entity_type}/{name}", file_size=10, mime_type="image/png",
                                category="attachment", uploaded_by="seed",
                                uploaded_at=f"2026-09-28T00:00:0{i}Z", is_deleted=False))


# ── PQP records ───────────────────────────────────────────────────────────────────────────────
d.add(models.PQP(id="sat-pqp-locked", pqpNo="QTS-SAR-PQP-000001", title="Locked PQP", description="",
                  vendor_id="SAT-V1", status="Approved", version="Rev1.0",
                  createdAt="2026-09-28", updatedAt="2026-09-28"))
d.add(models.PQP(id="sat-pqp-network", pqpNo="QTS-SAR-PQP-000002", title="Network-fail PQP", description="",
                  vendor_id="SAT-V1", status="Not Submit", version="Rev1.0",
                  createdAt="2026-09-28", updatedAt="2026-09-28"))
d.add(models.PQP(id="sat-pqp-multidelete", pqpNo="QTS-SAR-PQP-000003", title="Multi-delete PQP", description="",
                  vendor_id="SAT-V1", status="Not Submit", version="Rev1.0",
                  createdAt="2026-09-28", updatedAt="2026-09-28",
                  attachments=attachment_json("pqp", "sat-pqp-multidelete", [("sat-pqp-md-keep", "keep.png"), ("sat-pqp-md-fail", "fail.png")])))
d.add(models.PQP(id="sat-pqp-uploadfail-delete", pqpNo="QTS-SAR-PQP-000004", title="Upload-delete-mix PQP", description="",
                  vendor_id="SAT-V1", status="Not Submit", version="Rev1.0",
                  createdAt="2026-09-28", updatedAt="2026-09-28",
                  attachments=attachment_json("pqp", "sat-pqp-uploadfail-delete", [("sat-pqp-ud-existing", "existing.png")])))
d.commit()
attachment_rows("pqp", "sat-pqp-multidelete", [("sat-pqp-md-keep", "keep.png"), ("sat-pqp-md-fail", "fail.png")])
attachment_rows("pqp", "sat-pqp-uploadfail-delete", [("sat-pqp-ud-existing", "existing.png")])
d.commit()

# ── ITP records ───────────────────────────────────────────────────────────────────────────────
d.add(models.ITP(id="sat-itp-reject", vendor_id="SAT-V1", referenceNo="QTS-SAR-ITP-000001",
                  description="Reject-status rejection test", rev="Rev1.0", submit="", status="Pending",
                  submissionDate="2026-09-28"))
d.add(models.ITP(id="sat-itp-network", vendor_id="SAT-V1", referenceNo="QTS-SAR-ITP-000002",
                  description="Network-fail ITP", rev="Rev1.0", submit="", status="Pending",
                  submissionDate="2026-09-28"))
d.add(models.ITP(id="sat-itp-detailfail", vendor_id="SAT-V1", referenceNo="QTS-SAR-ITP-000006",
                  description="Main-succeeds-detail-fails boundary ITP", rev="Rev1.0", submit="", status="Pending",
                  submissionDate="2026-09-28"))
# NOTE (2026-09-28): ITP's own `attachments` column is typed `list[str]` in schemas.py
# (ITPBase/ITPUpdate) — unlike PQP's much looser `list[Any]`. Seeding it with the SAME
# object-shaped AttachmentInfo entries used for PQP causes `routers/itp.py::read_itps` to
# silently DROP the whole row from every list/search response (its per-item try/except
# swallows the Pydantic error and does a bare `continue` — confirmed by direct API probing:
# GET /api/itp/?limit=500 returned 4 rows instead of 7 with these seeded; nulling one row's
# `attachments` immediately made it reappear). This is a genuine, separate, pre-existing
# defect — out of scope for this batch (PQP/ITP save+attachment-retry only) — see the report
# for details. Consequently these fixtures carry NO attachments column content; the
# multi-delete/upload-mix ITP scenarios are instead exercised by uploading fresh files within
# the test itself (see pqp-itp-save-attachment-review.mjs), which never touches this column.
d.add(models.ITP(id="sat-itp-multidelete", vendor_id="SAT-V1", referenceNo="QTS-SAR-ITP-000003",
                  description="Multi-delete ITP", rev="Rev1.0", submit="", status="Pending",
                  submissionDate="2026-09-28"))
d.add(models.ITP(id="sat-itp-uploadfail-delete", vendor_id="SAT-V1", referenceNo="QTS-SAR-ITP-000004",
                  description="Upload-delete-mix ITP", rev="Rev1.0", submit="", status="Pending",
                  submissionDate="2026-09-28"))
d.add(models.ITP(id="sat-itp-publish", vendor_id="SAT-V1", referenceNo="QTS-SAR-ITP-000005",
                  description="Publish partial-failure ITP", rev="Rev1.0", submit="", status="Pending",
                  submissionDate="2026-09-28"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
