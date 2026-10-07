"""Isolated TEST SEED SCRIPT for ITR-STATUS-2026-001 (2026-10-03) — this script WRITES test
fixtures to an isolated database; it is a seed script, not a read-only script.

Isolated stack only — never run against a real DB. Requires ITR_STATUS_REVIEW_PASSWORD in the
environment (no hardcoded or defaulted password, same pattern as the other seed scripts in this
directory). Enforces QUALITAS_REQUIRE_ISOLATED_DB=1.

Four ITR fixtures on one project, covering the scenarios ITR-STATUS-2026-001's acceptance
criteria need:

  1. ISR-ITR-000001 — In Progress, NO linked checklist. Repro target for the core bug: select
     Approved, save gets rejected ("Cannot approve ITR without any linked checklists"), then try
     to revert Status back to In Progress in the same modal session.
  2. ISR-ITR-000002 — In Progress, with an ALREADY-Pass checklist instance linked (seeded directly,
     bypassing the UI fill-in flow — this fixture exists only to prove Approve still succeeds when
     its real precondition IS met, not to re-test the checklist-marking UI itself). Used to confirm
     the fix didn't accidentally block a legitimate Approve.
  3. ISR-ITR-000003 — already status=Approved (persisted). Used to confirm an already-approved
     record is still locked (dropdown disabled / any attempted change still refused) and that
     Publish (next revision) on a genuinely Approved record still works.
  4. No ITR at all pre-seeded for "new item mode" — that scenario is exercised by clicking
     "Add New ITR" in the browser script itself, not by seeding a row (there is nothing to seed:
     the point is the record does NOT exist yet in the backend).
"""
import os
import json
import database, models
from core.security import get_password_hash

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")

PW = os.environ.get("ITR_STATUS_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("ITR_STATUS_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


role = models.Role(name="ITRStatusReviewFull")
role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    "itr:view:all", "itr:create:all", "itr:update:all", "itr:approve:all",
    "checklist:view:all", "checklist:create:all", "checklist:update:all", "checklist:close:all",
    "contractors:view:all",
]]
d.add(role)
d.flush()

user = models.User(username="itrstatus_full", email="itrstatus@example.com", is_active=True,
                    hashed_password=get_password_hash(PW), role_id=role.id, full_name="ITR Status Review Full")
d.add(user)
d.add(models.Project(id="ISR-P1", name="ITR Status Revert Review", code="ISRP1"))
d.add(models.Contractor(id="ISR-V1", name="ITR Status Review Contractor", abbreviation="ISR",
                         package="Civil Works", scope="General", status="active",
                         contactPerson="QA Lead", email="qa@isr.example.com", phone="0900000003",
                         address="1 Review St."))
d.commit()
d.add(models.UserProject(user_id=user.id, project_id="ISR-P1"))
d.commit()

# ITRModals.tsx's handleSave client-side-blocks any ITR with no noiNumber ("Please select an NOI
# Number.") — every ITR in this system is a NOI's inspection record, so each fixture below needs
# its own NOI to link to, not just a bare ITR row.
d.add(models.NOI(id="isr-noi-1", project_id="ISR-P1", vendor_id="ISR-V1",
                  package="No-checklist repro NOI", referenceNo="QTS-ISRP1-NOI-000001",
                  issueDate="2026-10-01", inspectionDate="2026-10-01", inspectionTime="09:00",
                  eventNumber="EV1", checkpoint="H", type="Rebar",
                  contacts="QA Lead", phone="0900000003", email="qa@isr.example.com", status="Open"))
d.add(models.NOI(id="isr-noi-2", project_id="ISR-P1", vendor_id="ISR-V1",
                  package="Already-Pass-checklist NOI", referenceNo="QTS-ISRP1-NOI-000002",
                  issueDate="2026-10-01", inspectionDate="2026-10-01", inspectionTime="10:00",
                  eventNumber="EV2", checkpoint="H", type="Formwork",
                  contacts="QA Lead", phone="0900000003", email="qa@isr.example.com", status="Open"))
d.add(models.NOI(id="isr-noi-3", project_id="ISR-P1", vendor_id="ISR-V1",
                  package="Already-Approved NOI", referenceNo="QTS-ISRP1-NOI-000003",
                  issueDate="2026-09-20", inspectionDate="2026-09-20", inspectionTime="11:00",
                  eventNumber="EV3", checkpoint="H", type="Rebar",
                  contacts="QA Lead", phone="0900000003", email="qa@isr.example.com", status="Open"))
d.flush()

# 1. In Progress, no checklist — the core repro target.
d.add(models.ITR(
    id="isr-itr-1", project_id="ISR-P1", vendor_id="ISR-V1", documentNumber="QTS-ISRP1-ITR-000001",
    description="No-checklist repro target", rev="A", submit="Contractor", status="In Progress",
    raiseDate="2026-10-01", noiNumber="QTS-ISRP1-NOI-000001",
))

# 2. In Progress, with an already-Pass checklist instance already linked — proves a legitimate
# Approve still works after the fix. Seeded directly (bypassing the link+fill UI flow, which is
# pre-existing, unrelated behavior this batch does not touch).
d.add(models.ITR(
    id="isr-itr-2", project_id="ISR-P1", vendor_id="ISR-V1", documentNumber="QTS-ISRP1-ITR-000002",
    description="Already-Pass checklist, Approve should still succeed", rev="A", submit="Contractor",
    status="In Progress", raiseDate="2026-10-01", noiNumber="QTS-ISRP1-NOI-000002",
))
d.add(models.Checklist(
    id="isr-checklist-2", recordsNo="ISR-CHK-000001", project_id="ISR-P1", contractor_id="ISR-V1",
    itrId="isr-itr-2", itrNumber="QTS-ISRP1-ITR-000002", activity="Formwork check",
    date="2026-10-01", status="Pass", passCount=1, failCount=0,
    detail_data=json.dumps({"items": [{"id": "A1", "item": "Alignment", "criteria": "±5mm",
                                        "situation": "±3mm", "result": "O"}]}),
))

# 3. Already persisted Approved — must stay locked; Publish (next revision) must still work.
d.add(models.ITR(
    id="isr-itr-3", project_id="ISR-P1", vendor_id="ISR-V1", documentNumber="QTS-ISRP1-ITR-000003",
    description="Already Approved — must stay locked", rev="Rev1.0", submit="Contractor",
    status="Approved", raiseDate="2026-09-20", closeoutDate="2026-09-25", noiNumber="QTS-ISRP1-NOI-000003",
))

d.commit()
d.close()
print("SEED OK")
