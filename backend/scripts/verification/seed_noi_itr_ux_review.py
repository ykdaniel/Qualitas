"""Isolated TEST SEED SCRIPT for NOI-ITR-UX-2026-001 (2026-10-03) — writes test fixtures to an
isolated database; it is a seed script, not a read-only script.

Isolated stack only. Requires NOI_ITR_UX_REVIEW_PASSWORD in the environment (no hardcoded or
defaulted password). Enforces QUALITAS_REQUIRE_ISOLATED_DB=1.

Three NOI scenarios on one project:

  1. QTS-NIUP1-NOI-000001 (NO-ITR) — no ITR filed at all.
  2. QTS-NIUP1-NOI-000002 (ONE-ITR) — one normal (non-reinspection) ITR, In Progress.
  3. QTS-NIUP1-NOI-000003 (REINSPECTION) — the ORIGINAL ITR failed (inspectionResult=Fail,
     status=Reject), an NCR was raised against it (NCR.itrNumber = original's documentNumber),
     and a re-inspection ITR exists (isReInspection=True, originalItrId -> original's id,
     reInspectionCount=1), with NCR.reInspectionNumber pointing at the re-inspection ITR's
     documentNumber — this mirrors exactly what ITRService.create_reinspection() would produce,
     not an invented shape. The re-inspection ITR's subject/description are DELIBERATELY left
     identical to the original's own subject/description (create_reinspection copies them
     verbatim — see services/itr_service.py:1252 onward), so this fixture can show whether the
     UI gives the user ANY way to tell them apart beyond the raw document number/status.
"""
import os
import database, models
from core.security import get_password_hash

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")

PW = os.environ.get("NOI_ITR_UX_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("NOI_ITR_UX_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


role = models.Role(name="NOIITRUXReviewFull")
role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    "noi:view:all", "noi:create:all", "noi:update:all",
    "itr:view:all", "itr:create:all", "itr:update:all",
    "ncr:view:all",
]]
d.add(role)
d.flush()

user = models.User(username="noiitrux_full", email="noiitrux@example.com", is_active=True,
                    hashed_password=get_password_hash(PW), role_id=role.id, full_name="NOI ITR UX Review Full")
d.add(user)
d.add(models.Project(id="NIU-P1", name="NOI-ITR UX Review", code="NIUP1"))
d.add(models.Contractor(id="NIU-V1", name="NOI-ITR UX Review Contractor", abbreviation="NIU",
                         package="Civil Works", scope="General", status="active",
                         contactPerson="QA Lead", email="qa@niu.example.com", phone="0900000005",
                         address="1 Review St."))
d.commit()
d.add(models.UserProject(user_id=user.id, project_id="NIU-P1"))
d.commit()


def make_noi(noi_id, ref, package, event):
    n = models.NOI(id=noi_id, project_id="NIU-P1", vendor_id="NIU-V1", package=package,
                    referenceNo=ref, issueDate="2026-10-01", inspectionDate="2026-10-01",
                    inspectionTime="09:00", eventNumber=event, checkpoint="H", type="Rebar",
                    contacts="QA Lead", phone="0900000005", email="qa@niu.example.com", status="Open")
    d.add(n)
    d.flush()
    return n


# 1. NO-ITR
noi1 = make_noi("niu-noi-1", "QTS-NIUP1-NOI-000001", "NO-ITR — nothing filed yet", "EV1")

# 2. ONE-ITR (normal, non-reinspection)
noi2 = make_noi("niu-noi-2", "QTS-NIUP1-NOI-000002", "ONE-ITR — a single normal ITR", "EV2")
d.add(models.ITR(id="niu-itr-2", project_id="NIU-P1", vendor_id="NIU-V1",
                  documentNumber="QTS-NIUP1-ITR-000002", subject="Formwork inspection",
                  description="Formwork inspection", rev="A", submit="Contractor",
                  status="In Progress", raiseDate="2026-10-01", noiNumber=noi2.referenceNo))

# 3. REINSPECTION — original Fail -> NCR -> re-inspection ITR, exactly as create_reinspection()
# would produce (same subject/description copied verbatim onto the new ITR).
noi3 = make_noi("niu-noi-3", "QTS-NIUP1-NOI-000003", "REINSPECTION — failed then re-inspected", "EV3")
original_subject = "Rebar spacing inspection"
d.add(models.ITR(id="niu-itr-3-orig", project_id="NIU-P1", vendor_id="NIU-V1",
                  documentNumber="QTS-NIUP1-ITR-000003", subject=original_subject,
                  description=original_subject, rev="0", submit="Contractor",
                  status="Reject", inspectionResult="Fail", raiseDate="2026-09-20",
                  noiNumber=noi3.referenceNo))
d.add(models.NCR(id="niu-ncr-3", project_id="NIU-P1", vendor_id="NIU-V1",
                  documentNumber="QTS-NIUP1-NCR-000001", subject="Rebar spacing out of tolerance",
                  description="Rebar spacing out of tolerance", status="Opening",
                  raiseDate="2026-09-20", noiNumber=noi3.referenceNo,
                  itrNumber="QTS-NIUP1-ITR-000003", reInspectionNumber="QTS-NIUP1-ITR-000004"))
d.add(models.ITR(id="niu-itr-3-reinsp", project_id="NIU-P1", vendor_id="NIU-V1",
                  documentNumber="QTS-NIUP1-ITR-000004", subject=original_subject,
                  description=original_subject, rev="0", submit="",
                  status="In Progress", raiseDate="2026-09-25", noiNumber=noi3.referenceNo,
                  isReInspection=True, originalItrId="niu-itr-3-orig", reInspectionCount=1))

d.commit()
d.close()
print("SEED OK")
