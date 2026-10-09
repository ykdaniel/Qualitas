"""Isolated TEST SEED SCRIPT for ITR-INPUT-UX-2026-001 (2026-10-04) — writes test fixtures to an
isolated database; it is a seed script, not a read-only script.

Isolated stack only. Requires ITR_INPUT_UX_PASSWORD in the environment (no hardcoded or
defaulted password). Enforces QUALITAS_REQUIRE_ISOLATED_DB=1 via core.startup_guard.

Builds the real chain this review needs rather than requiring it to be hand-built live in the
browser: one Project/Contractor, one ITP (so NOI->ITP and the Related Documents 2-hop walk have
something real to surface), one NOI linked to that ITP (so "basic info copied from NOI" has a
concrete source to compare against), and two ITRs linked to that NOI:

  - QTS-IUX2-ITR-000001 — status "In Progress" (editable form state), with a linked Checklist
    INSTANCE whose first item's `situation` is a long, realistic, multi-line (`\\n`) string with
    a unique trailing marker — for reviewing how the editable Situation field actually looks
    when it holds real-length content.
  - QTS-IUX2-ITR-000002 — status "Approved" (locked/read-only form state, isLocked=True in
    ITRModals.tsx), with its OWN linked Checklist instance, item already filled (result "O") and
    carrying the SAME kind of long multi-line situation text with its own marker — for reviewing
    the read-only rendering of the same field.

Neither ITR is given an `itpNo` value anywhere (there is no such column on the ITR model/schema —
confirmed by code reading; the "Related ITP" dropdown in ITRModals.tsx binds to a field that is
never persisted) — this is deliberate, so the review can observe the real-world "Related ITP
shows Select ITP" state on a normal, current-shape record, not a contrived one.
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import json
import database, models
from core.security import get_password_hash

PW = os.environ.get("ITR_INPUT_UX_PASSWORD")
if not PW:
    raise RuntimeError("ITR_INPUT_UX_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


role = models.Role(name="ITRInputUXFull")
role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    "itr:view:all", "itr:create:all", "itr:update:all", "itr:approve:all",
    "noi:view:all", "itp:view:all", "contractors:view:all",
    "checklist:view:all", "checklist:create:all", "checklist:update:all", "checklist:close:all",
]]
d.add(role)
d.flush()

user = models.User(username="itrux_full", email="itrux@example.com", is_active=True,
                    hashed_password=get_password_hash(PW), role_id=role.id, full_name="ITR Input UX Full")
d.add(user)
d.add(models.Project(id="IUX2-P1", name="ITR Input UX Review", code="IUX2P1"))
d.add(models.Contractor(id="IUX2-V1", name="Meridian Concrete Works Ltd.", abbreviation="MCW",
                         package="Civil Works", scope="Structural", status="active",
                         contactPerson="Lin Cheng", email="lin@meridian-concrete.example.com",
                         phone="0922-333-444", address="12 Meridian Ave."))
d.commit()
d.add(models.UserProject(user_id=user.id, project_id="IUX2-P1"))
d.commit()

d.add(models.ITP(id="IUX2-ITP1", project_id="IUX2-P1", vendor_id="IUX2-V1",
                  referenceNo="QTS-IUX2-ITP-000001", description="Level 3 Slab Pour — Structural ITP",
                  status="Approved", hasDetails=True, submissionDate="2026-09-20",
                  detail_data=json.dumps({"a": [], "b": [], "c": []})))
d.commit()

d.add(models.NOI(id="IUX2-NOI1", project_id="IUX2-P1", vendor_id="IUX2-V1",
                  referenceNo="QTS-IUX2-NOI-000001", package="Level 3 Slab Pour Inspection",
                  itpNo="QTS-IUX2-ITP-000001", checkpoint="H", eventNumber="A1",
                  issueDate="2026-09-28", inspectionDate="2026-09-29", inspectionTime="09:00",
                  type="Hold Point", status="Approved", foundLocation="Block C / Level 3 / Grid C4-C7",
                  discipline="Civil", contacts="Lin Cheng", phone="0922-333-444",
                  email="lin@meridian-concrete.example.com"))
d.commit()

LONG_SITUATION_1 = (
    "Rebar cover checked at 8 locations along Grid C4-C7 using a calibrated cover meter "
    "(serial no. CM-2291, calibration valid until 2027-01-15); all readings between 42mm and "
    "47mm, within the 40mm+/-5mm tolerance specified on Structural Drawing S-301 Rev.C.\n"
    "Lap splice lengths measured at 3 column-beam junctions (C4, C5, C6); all exceeded the "
    "required 40x bar diameter minimum. Minor honeycombing observed at the underside of the "
    "C5-C6 beam soffit near the formwork joint, approx. 15cm x 8cm, noted for patch repair "
    "before final finish inspection — does not affect structural cover or splice compliance.\n"
    "SITU-MARK-ONE-abc123"
)
LONG_SITUATION_2 = (
    "Re-checked rebar cover and lap splice after the C5-C6 soffit patch repair referenced in "
    "the prior inspection cycle; patched area now shows uniform finish with no exposed "
    "aggregate or voids.\n"
    "All 8 cover readings re-verified within tolerance (43mm-46mm). Formwork release agent "
    "residue on the patched section was cleaned prior to re-inspection per the contractor's "
    "method statement MS-C-014 Rev.1.\n"
    "SITU-MARK-TWO-xyz789"
)

d.add(models.ITR(id="IUX2-ITR1", project_id="IUX2-P1", vendor_id="IUX2-V1",
                  documentNumber="QTS-IUX2-ITR-000001", description="Level 3 Slab Pour Inspection",
                  rev="0", submit="1",
                  status="In Progress", subject="Level 3 Slab Pour Inspection", raiseDate="2026-09-29",
                  noiNumber="QTS-IUX2-NOI-000001", eventNumber="A1", checkpoint="H",
                  foundLocation="Block C / Level 3 / Grid C4-C7", discipline="Civil"))
d.add(models.ITR(id="IUX2-ITR2", project_id="IUX2-P1", vendor_id="IUX2-V1",
                  documentNumber="QTS-IUX2-ITR-000002", description="Level 3 Slab Pour Inspection (Re-check)",
                  rev="0", submit="1",
                  status="Approved", subject="Level 3 Slab Pour Inspection (Re-check)", raiseDate="2026-09-30",
                  noiNumber="QTS-IUX2-NOI-000001", eventNumber="A1", checkpoint="H",
                  foundLocation="Block C / Level 3 / Grid C4-C7", discipline="Civil",
                  inspectionResult="Pass", approvedBy="ITR Input UX Full", approvedAt="2026-09-30T10:00:00"))
d.commit()

d.add(models.Checklist(id="IUX2-CKT1", project_id="IUX2-P1", recordsNo="QTS-IUX2-CHK-000001",
                        activity="Rebar Cover & Lap Splice Check", date="2026-09-29", status="Ongoing",
                        packageName="Level 3 Slab Pour Inspection", location="Block C / Level 3 / Grid C4-C7",
                        itpId="IUX2-ITP1", contractor_id="IUX2-V1", itrId="IUX2-ITR1",
                        itrNumber="QTS-IUX2-ITR-000001",
                        detail_data=json.dumps({"items": [
                            {"id": "1", "item": "Rebar cover thickness", "criteria": "40mm +/-5mm per S-301 Rev.C",
                             "situation": LONG_SITUATION_1, "result": ""},
                            # Untouched second item (ITR-INPUT-UX-IMPLEMENT-2026-001 acceptance
                            # criteria 3: editing item 1 must not change item 2's stored value).
                            {"id": "2", "item": "Formwork alignment", "criteria": "Plumb within 6mm per storey",
                             "situation": "UNTOUCHED-ITEM-MARK-keep-me", "result": ""},
                        ]})))
d.add(models.Checklist(id="IUX2-CKT2", project_id="IUX2-P1", recordsNo="QTS-IUX2-CHK-000002",
                        activity="Rebar Cover & Lap Splice Check (Re-check)", date="2026-09-30", status="Pass",
                        packageName="Level 3 Slab Pour Inspection (Re-check)", location="Block C / Level 3 / Grid C4-C7",
                        itpId="IUX2-ITP1", contractor_id="IUX2-V1", itrId="IUX2-ITR2",
                        itrNumber="QTS-IUX2-ITR-000002",
                        detail_data=json.dumps({"items": [
                            {"id": "1", "item": "Rebar cover thickness", "criteria": "40mm +/-5mm per S-301 Rev.C",
                             "situation": LONG_SITUATION_2, "result": "O"},
                        ]})))
d.commit()

# ITR-EXPORT-DOCX-2026-001 (photo-embedding follow-up): one real, tiny PNG registered as a
# defectPhoto Attachment on ITR2, so the .docx export's add_photo_section path is actually
# exercised end-to-end (a real file on disk, resolved via core.uploads.upload_root()), not just
# "the code didn't crash when the list was empty".
from core.uploads import upload_root
import datetime
_upload_dir = os.path.join(upload_root(), "itr")
os.makedirs(_upload_dir, exist_ok=True)
_PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
    "53de0000000c4944415408d763f8ffff3f0005fe02fea7991ae50000000049454e44ae426082"
)
with open(os.path.join(_upload_dir, "seed-defect-photo.png"), "wb") as f:
    f.write(_PNG_1PX)
d.add(models.Attachment(
    id="IUX2-ATT1", entity_type="itr", entity_id="IUX2-ITR2",
    file_name="seed-defect-photo.png", file_path="itr/seed-defect-photo.png",
    file_size=len(_PNG_1PX), mime_type="image/png", category="defectPhoto",
    uploaded_by="itrux_full", uploaded_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
