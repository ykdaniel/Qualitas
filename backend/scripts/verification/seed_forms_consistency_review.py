"""Isolated TEST SEED SCRIPT for FORMS-CONSISTENCY-2026-001 (2026-10-04) — writes test
fixtures to an isolated database; it is a seed script, not a read-only script.

Covers NOI / ITR / NCR button-consistency, save-state-consistency, read-only-clarity and
deep-link-return checks. Isolated stack only. Requires FORMS_CONSISTENCY_PASSWORD in the
environment (no hardcoded or defaulted password). Enforces QUALITAS_REQUIRE_ISOLATED_DB=1.

Two accounts:
  fc_full      — noi/itr/ncr view+create+update+approve. Deliberately WITHOUT ncr:close:all,
                 so the seeded Closed NCR is readonly even for this "full" account — this
                 mirrors NOI's Closed (unconditionally readonly, see NOIDetailModal.tsx's own
                 comment) and ITR's Approved (Save unconditionally hidden regardless of
                 itr:approve:all) without having to special-case NCR's own lock permission.
  fc_readonly  — view-only on all three. Used for the "no permission at all" scenario.

Records (one project, one contractor):
  - NOI-OPEN   : editable, Open status, LONG realistic subject/remark text (not blank/short).
  - NOI-CLOSED : Closed status — always readonly per NOIDetailModal.tsx, even for fc_full.
  - ITR-OPEN   : editable, In Progress status, long subject/description.
  - ITR-APPROVED: Approved status — Save unconditionally hidden (isLocked), only Revoke
                  Approval available to an itr:approve:all holder.
  - NCR-OPEN   : editable, Open status, long subject/description.
  - NCR-CLOSED : Closed status — readonly for fc_full (lacks ncr:close:all) by design above.
"""
import os
import database, models
from core.security import get_password_hash

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")

PW = os.environ.get("FORMS_CONSISTENCY_PASSWORD")
if not PW:
    raise RuntimeError("FORMS_CONSISTENCY_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


full_role = models.Role(name="FormsConsistencyFull")
full_role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    "noi:view:all", "noi:create:all", "noi:update:all", "noi:approve:all",
    "itr:view:all", "itr:create:all", "itr:update:all", "itr:approve:all",
    "ncr:view:all", "ncr:create:all", "ncr:update:all", "ncr:approve:all",
    # Deliberately NOT ncr:close:all — see module docstring.
]]
d.add(full_role)

readonly_role = models.Role(name="FormsConsistencyReadOnly")
readonly_role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    "noi:view:all", "itr:view:all", "ncr:view:all",
]]
d.add(readonly_role)
d.flush()

full_user = models.User(username="fc_full", email="fcfull@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full_role.id, full_name="Forms Consistency Full")
readonly_user = models.User(username="fc_readonly", email="fcreadonly@example.com", is_active=True,
                             hashed_password=get_password_hash(PW), role_id=readonly_role.id, full_name="Forms Consistency ReadOnly")
d.add(full_user)
d.add(readonly_user)
d.add(models.Project(id="FC-P1", name="Forms Consistency Review", code="FCP1"))
d.add(models.Contractor(id="FC-V1", name="Forms Consistency Review Contractor", abbreviation="FCV",
                         package="Structural Works", scope="Rebar, formwork and finishing",
                         status="active", contactPerson="QA Lead", email="qa@fc-review.example.com",
                         phone="0900000006", address="1 Consistency St."))
d.commit()
d.add(models.UserProject(user_id=full_user.id, project_id="FC-P1"))
d.add(models.UserProject(user_id=readonly_user.id, project_id="FC-P1"))
d.commit()

LONG_SUBJECT = (
    "Structural steel column base plate grouting and anchor bolt torque verification "
    "for Zone 3 Level 2 — includes re-check of previously flagged alignment tolerance"
)
LONG_REMARK = (
    "Site team completed grouting on all eight columns in Zone 3. Torque values for "
    "anchor bolts recorded against the approved calibration sheet; two bolts on column "
    "C-12 required a second pass after initial reading fell below the specified minimum. "
    "Photographic evidence attached for all columns. Awaiting QA sign-off before next pour."
)

# Row lookups in the browser script key off these markers, NOT referenceNo — a real save
# through the normal update endpoint can renumber referenceNo (document-naming-rule
# regeneration keyed on the contractor abbreviation), which would otherwise invalidate any
# hardcoded reference-number-based row lookup the FIRST time a test part actually saves.
MARK_NOI_OPEN, MARK_NOI_LOCKED = "FCMARK-NOI-OPEN", "FCMARK-NOI-LOCKED"
MARK_ITR_OPEN, MARK_ITR_LOCKED = "FCMARK-ITR-OPEN", "FCMARK-ITR-LOCKED"
MARK_NCR_OPEN, MARK_NCR_LOCKED = "FCMARK-NCR-OPEN", "FCMARK-NCR-LOCKED"

d.add(models.ITP(
    id="fc-itp-1", project_id="FC-P1", vendor_id="FC-V1",
    referenceNo="QTS-FCP1-ITP-000001", description="Structural works ITP for Zone 3",
    rev="A", submit="Initial", status="Approved", submissionDate="2026-09-20",
))
d.commit()

d.add(models.NOI(
    id="fc-noi-open", project_id="FC-P1", vendor_id="FC-V1",
    package=f"{MARK_NOI_OPEN} — {LONG_SUBJECT}", referenceNo="QTS-FCV-NOI-000001", itpNo="QTS-FCP1-ITP-000001",
    issueDate="2026-10-01", inspectionDate="2026-10-02", inspectionTime="09:00",
    eventNumber="EV1", checkpoint="H", type="Rebar",
    contacts="QA Lead", phone="0900000006", email="qa@fc-review.example.com",
    status="Open", remark=LONG_REMARK,
))
d.add(models.NOI(
    id="fc-noi-closed", project_id="FC-P1", vendor_id="FC-V1",
    package=f"{MARK_NOI_LOCKED} — {LONG_SUBJECT} (closed record)", referenceNo="QTS-FCV-NOI-000002",
    itpNo="QTS-FCP1-ITP-000001",
    issueDate="2026-09-01", inspectionDate="2026-09-02", inspectionTime="09:00",
    eventNumber="EV2", checkpoint="H", type="Rebar",
    contacts="QA Lead", phone="0900000006", email="qa@fc-review.example.com",
    status="Closed", remark="Closed out after acceptance.",
))

d.add(models.ITR(
    id="fc-itr-open", project_id="FC-P1", vendor_id="FC-V1",
    documentNumber="QTS-FCP1-ITR-000001", subject=f"{MARK_ITR_OPEN} — {LONG_SUBJECT}",
    description=LONG_SUBJECT, rev="A", submit="Contractor",
    status="In Progress", raiseDate="2026-10-02", noiNumber="QTS-FCV-NOI-000001",
    remark=LONG_REMARK,
))
d.add(models.ITR(
    id="fc-itr-approved", project_id="FC-P1", vendor_id="FC-V1",
    documentNumber="QTS-FCP1-ITR-000002", subject=f"{MARK_ITR_LOCKED} — {LONG_SUBJECT} (approved record)",
    description=LONG_SUBJECT, rev="A", submit="Contractor",
    status="Approved", inspectionResult="Pass", raiseDate="2026-09-01",
    noiNumber="QTS-FCV-NOI-000001", remark="Approved after re-inspection.",
))

d.add(models.NCR(
    id="fc-ncr-open", project_id="FC-P1", vendor_id="FC-V1",
    documentNumber="QTS-FCP1-NCR-000001", subject=f"{MARK_NCR_OPEN} — {LONG_SUBJECT}",
    description=LONG_SUBJECT, rev="A", submit="Initial", status="Open", raiseDate="2026-10-02",
    noiNumber="QTS-FCV-NOI-000001", itrNumber="QTS-FCP1-ITR-000001",
    remark=LONG_REMARK,
    # The rest are all "open-required" per ncrFormSchema.ts's reqStr fields — without
    # these, the frontend's own client-side validation blocks Save before any network
    # request is even sent, which (found the hard way) looks indistinguishable from "Save
    # doesn't disable while pending" unless you notice the validation toast.
    type="Material", severity="Major", discipline="Civil",
    referenceStandards="ACI 318-19 §17.8", foundLocation="Zone 3 Level 2, Column C-12",
    foundBy="QA Lead", raisedBy="QA Lead", assignedTo=full_user.id,
    deviation="Anchor bolt torque below specified minimum on column C-12.",
))
d.add(models.NCR(
    id="fc-ncr-closed", project_id="FC-P1", vendor_id="FC-V1",
    documentNumber="QTS-FCP1-NCR-000002", subject=f"{MARK_NCR_LOCKED} — {LONG_SUBJECT} (closed record)",
    description=LONG_SUBJECT, rev="A", submit="Initial", status="Closed", raiseDate="2026-09-01",
    noiNumber="QTS-FCV-NOI-000001", remark="Closed out after corrective action verified.",
    type="Material", severity="Major", discipline="Civil",
    referenceStandards="ACI 318-19 §17.8", foundLocation="Zone 3 Level 2, Column C-11",
    foundBy="QA Lead", raisedBy="QA Lead", assignedTo=full_user.id,
    deviation="Already corrected and verified closed.",
))

d.commit()
d.close()
print("SEED OK")
