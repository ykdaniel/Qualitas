"""Seed for a UX review (2026-10-03) of the Q-Workflow -> NOI -> ITR cross-module flow.

Isolated stack only — never run against a real DB. Requires UX_REVIEW_PASSWORD in the
environment (no hardcoded or defaulted password, same pattern as
seed_forms_leave_guard_review.py). Enforces QUALITAS_REQUIRE_ISOLATED_DB=1 like the other
seed scripts in this directory.

Two NOIs on one project, both get an auto-created Q-WorkFlow row, so the tracker shows two
rows at genuinely different points in the 9-checkpoint progress — a representative walkthrough,
not an edge-case/void-mixed scenario (see seed_qworkflow_void_nav_review.py for that):

  - UXR-NOI-000001: no ITR linked yet (early-stage row — "W/H Inspection" checkpoint still open).
  - UXR-NOI-000002: one ITR linked, In Progress, inspectionResult unset (mid-stage row — ITR
    exists but inspection outcome not yet recorded).
"""
import os
import database, models
from core.security import get_password_hash

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")

PW = os.environ.get("UX_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("UX_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


role = models.Role(name="UXReviewFull")
role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    "noi:view:all", "noi:create:all", "noi:update:all",
    "itr:view:all", "itr:create:all", "itr:update:all", "itr:approve:all",
    "ncr:view:all", "ncr:create:all", "ncr:update:all",
    "checklist:view:all", "checklist:create:all", "checklist:update:all", "checklist:close:all",
]]
d.add(role)
d.flush()

user = models.User(username="uxreview_full", email="uxreview@example.com", is_active=True,
                    hashed_password=get_password_hash(PW), role_id=role.id, full_name="UX Review Full")
d.add(user)
d.add(models.Project(id="UXR-P1", name="Q-Workflow UX Review", code="UXRP1"))
d.add(models.Contractor(id="UXR-V1", name="UX Review Contractor Co", abbreviation="UXR",
                         package="Civil Works", scope="General", status="active",
                         contactPerson="QA Lead", email="qa@uxreview.example.com", phone="0900000002",
                         address="1 Review St."))
d.commit()
d.add(models.UserProject(user_id=user.id, project_id="UXR-P1"))
d.commit()

noi1 = models.NOI(
    id="uxr-noi-1", project_id="UXR-P1", vendor_id="UXR-V1",
    package="Rebar fixing — Block A", referenceNo="QTS-UXRP1-NOI-000001",
    issueDate="2026-10-01", inspectionDate="2026-10-03", inspectionTime="09:00",
    eventNumber="EV1", checkpoint="H", type="Rebar",
    contacts="Site Engineer A", phone="0911111111", email="a@uxreview.example.com", status="Open",
)
d.add(noi1)
d.flush()
d.add(models.QWorkflow(id="uxr-qwf-1", project_id="UXR-P1", referenceNo="Q-WorkFlow-UXR-000001", noi_id=noi1.id))

noi2 = models.NOI(
    id="uxr-noi-2", project_id="UXR-P1", vendor_id="UXR-V1",
    package="Formwork — Block B", referenceNo="QTS-UXRP1-NOI-000002",
    issueDate="2026-10-01", inspectionDate="2026-10-02", inspectionTime="14:00",
    eventNumber="EV2", checkpoint="W", type="Formwork",
    contacts="Site Engineer B", phone="0922222222", email="b@uxreview.example.com", status="Open",
)
d.add(noi2)
d.flush()
d.add(models.QWorkflow(id="uxr-qwf-2", project_id="UXR-P1", referenceNo="Q-WorkFlow-UXR-000002", noi_id=noi2.id))
d.add(models.ITR(
    id="uxr-itr-2", project_id="UXR-P1", vendor_id="UXR-V1", documentNumber="QTS-UXRP1-ITR-000001",
    description="Formwork inspection — Block B", rev="A", submit="Contractor", status="In Progress",
    noiNumber=noi2.referenceNo, raiseDate="2026-10-02",
))
d.commit()
d.close()
print("SEED OK")
