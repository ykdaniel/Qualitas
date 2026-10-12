"""Isolated TEST SEED SCRIPT for REFUSAL-DIALOG-2026-001 (2026-10-12) — writes test fixtures to an isolated database; it is a
seed script, not a read-only script.

Isolated stack only. Requires REFUSAL_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password).

Creates two users:
  * refusal_reviewer — view + delete on every module (+ contractors:manage, itr:update, iam:role:manage): every delete
    below is refused by a business rule, so the refusal dialog shows the translated reason;
  * refusal_viewer   — view only: a delete it can reach is refused with 403 PERMISSION_DENIED.
and one record per delete refusal (numbers are prefixed RFD):
  NCR Open (not Void) · NCR Void cited by an ITR · NOI cited by an ITR (delete-check) · ITP cited by that NOI (was 500)
  ITR with approval history (the citing ITR, so it is never deleted) · ITR Approved (locked) · ITR In Progress with a passed Checklist (evidence; also the Unlink refusal)
  Checklist owned by an ITR · standalone Checklist that held results · Audit Planned · Meeting Minutes Published
  Follow-up Open · Contractor with personnel · Contractor cited by records · Project with records (was 500, silent)
  Role still assigned (RefusalViewer) · plus PQP / FAT / OBS / OSD / KM records that can be deleted (for the viewer's 403).
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import json
import database, models
from core import perms
from core.security import get_password_hash

PW = os.environ.get("REFUSAL_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("REFUSAL_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


ALL = [p["code"] for p in perms.ALL_PERMISSIONS] if hasattr(perms, "ALL_PERMISSIONS") else []
VIEW = [c for c in ALL if ":view:" in c or c in (perms.USER_VIEW, perms.ROLE_VIEW)]
DELETE = [c for c in ALL if ":delete:" in c] + [perms.CONTRACTOR_MANAGE, perms.ITR_UPDATE, perms.ROLE_MANAGE]
assert VIEW and DELETE, "permission list not found in core/perms.py"

reviewer = models.Role(name="RefusalReviewer")
reviewer.permissions_rel = [_perm(c) for c in sorted(set(VIEW + DELETE))]
viewer = models.Role(name="RefusalViewer")
viewer.permissions_rel = [_perm(c) for c in sorted(set(VIEW))]
d.add_all([reviewer, viewer])
d.flush()
d.add(models.User(username="refusal_reviewer", email="refusal.reviewer@example.com", is_active=True, company_name="QA",
                  hashed_password=get_password_hash(PW), role_id=reviewer.id, full_name="Refusal Reviewer"))
d.add(models.User(username="refusal_viewer", email="refusal.viewer@example.com", is_active=True, company_name="QA",
                  hashed_password=get_password_hash(PW), role_id=viewer.id, full_name="Refusal Viewer"))

P, V = "RFD-P1", "RFD-V1"
d.add(models.Project(id=P, name="Refusal Dialog Review", code="RFD"))
d.add(models.Project(id="RFD-P2", name="Project with records", code="RFD2"))
d.add(models.Contractor(id=V, name="Hailong Construction", abbreviation="HL", status="active"))
d.add(models.Contractor(id="RFD-V2", name="Contractor With People", abbreviation="CWP", status="active"))
d.flush()
d.add(models.ContractorPersonnel(id="RFD-PP1", contractor_id="RFD-V2", name="Lee Wei", position="Site Engineer"))

common = dict(vendor_id=V, project_id=P)
d.add(models.NCR(id="rfd-ncr-1", documentNumber="RFD-NCR-000001", status="Open", subject="Open NCR — void it first",
                 raiseDate="2026-10-12", severity="Minor", **common))
d.add(models.NCR(id="rfd-ncr-2", documentNumber="RFD-NCR-000002", status="Void", subject="Void NCR cited by an ITR",
                 raiseDate="2026-10-12", severity="Minor", **common))
d.add(models.ITP(id="rfd-itp-1", referenceNo="RFD-ITP-000001", status="Draft", description="ITP cited by an NOI",
                 **common))
d.add(models.NOI(id="rfd-noi-1", referenceNo="RFD-NOI-000001", status="Open", itpNo="RFD-ITP-000001", package="NOI cited by an ITR",
                 **common))
d.add(models.ITR(id="rfd-itr-1", documentNumber="RFD-ITR-000001", status="In Progress", noiNumber="RFD-NOI-000001",
                 ncrNumber="RFD-NCR-000002", subject="Cites NCR-000002 and NOI-000001 (was approved once)",
                 approvedBy="QA Lead", **common))   # approval history: refused, so the two citations it holds stay
d.add(models.ITR(id="rfd-itr-2", documentNumber="RFD-ITR-000002", status="Approved", subject="Approved ITR (locked)",
                 **common))
d.add(models.ITR(id="rfd-itr-3", documentNumber="RFD-ITR-000003", status="In Progress", subject="ITR whose checklist holds results",
                 **common))
items = json.dumps({"items": [{"description": "Weld size", "criteria": "6 mm", "situation": "6 mm", "result": "pass"}]})
d.add(models.Checklist(id="rfd-chk-1", recordsNo="RFD-CHK-000001", itrId="rfd-itr-3", itrNumber="RFD-ITR-000003", status="Pass",
                       passCount=1, failCount=0, activity="Welding (ITR-owned, passed)", detail_data=items,
                       contractor_id=V, project_id=P))
d.add(models.Checklist(id="rfd-chk-2", recordsNo="RFD-CHK-000002", status="Fail", passCount=0, failCount=1,
                       activity="Template that once held results", detail_data=items,
                       contractor_id=V, project_id=P))
d.add(models.Audit(id="rfd-aud-1", auditNo="RFD-AUD-000001", date="2026-10-12", status="Planned", title="Planned audit",
                   contractor="Hailong Construction", **common))
d.add(models.MeetingMinutes(id="rfd-mom-1", documentNumber="RFD-MOM-000001", status="Published", title="Published meeting",
                            **common))
d.add(models.FollowUp(id="rfd-fu-1", issueNo="RFD-FU-000001", status="Open", title="Open follow-up", **common))
d.add(models.NCR(id="rfd-ncr-3", documentNumber="RFD-NCR-000003", status="Open", subject="NCR in the project with records",
                 raiseDate="2026-10-12", severity="Minor", vendor_id=V, project_id="RFD-P2"))
# deletable records (the viewer's 403 path)
d.add(models.PQP(id="rfd-pqp-1", pqpNo="RFD-PQP-000001", status="Draft", **common))
d.add(models.FAT(id="rfd-fat-1", equipment="Pump", status="Planned", **common))
d.add(models.OBS(id="rfd-obs-1", documentNumber="RFD-OBS-000001", status="Open", **common))
d.add(models.OSD(id="rfd-osd-1", documentNumber="RFD-OSD-000001", status="Open", **common))
# The response schemas expect strings where these hand-made rows have none: fill unset text columns (never JSON / id ones).
from sqlalchemy import String, Text
JSONISH = {"attachments", "attendees", "discussionLog", "detail_data", "custom_check_items", "agenda", "selected_templates",
           "findings", "support_auditors", "defectPhotos", "improvementPhotos", "progressPhotos", "photos", "items"}
for obj in list(d.new):
    if isinstance(obj, (models.User, models.Role, models.Permission)):
        continue
    for col in obj.__table__.columns:
        attr = next((a.key for a in obj.__mapper__.column_attrs if a.columns[0] is col), None)
        if attr is None or getattr(obj, attr) is not None or col.primary_key or col.foreign_keys:
            continue
        if not isinstance(col.type, (String, Text)) or col.name in JSONISH or col.name.endswith("_id") or col.name.endswith("Id"):
            continue
        setattr(obj, attr, "2026-10-12T00:00:00" if col.name.lower().replace("_", "") in ("createdat", "updatedat") else "")
d.commit()
print("seeded refusal review:", d.query(models.NCR).count(), "NCR,", d.query(models.ITR).count(), "ITR,",
      d.query(models.Checklist).count(), "Checklist,", d.query(models.User).count(), "users")
