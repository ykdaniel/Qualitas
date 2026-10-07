"""Add Void-mixed ITR/NCR fixtures to DW-P1 (after seed_dashboard_workflow_review.py), for
verifying Q-Workflow checkpoint node navigation never opens a Void record (2026-09-30).

Only for a fresh isolated stack; requires QUALITAS_REQUIRE_ISOLATED_DB=1.

Three scenarios, each its own NOI (own Q-WorkFlow row) on DW-P1:

  1. QTS-DRC-NOI-000003 — TWO ITRs linked (Void inserted first, then a valid Approved one).
     Clicking the "wh_inspection" checkpoint marker must open the valid ITR, never the Void one.
  2. QTS-DRC-NOI-000004 — ONLY a Void ITR linked (no valid ITR at all).
     Clicking "wh_inspection" must fall back to opening the NOI itself (existing fallback,
     itr_ids is empty after Void exclusion).
  3. QTS-DRC-NOI-000005 — one original ITR + one NCR (single sibling, no reInspectionNumber set)
     + TWO re-inspection ITRs sharing originalItrId (Void inserted first, then a valid one with
     inspectionResult=Pass so the NCR's re-inspection predicate is satisfied and the "itr"
     checkpoint is NOT blocked by that NCR). Clicking the "itr" checkpoint marker must open the
     valid re-inspection ITR, never the Void one.
"""
import os
import database, models

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")

d = database.SessionLocal()

# ── Scenario 1: mixed Void + valid ITR on one NOI ──
noi3 = models.NOI(
    id="dw-noi-3", project_id="DW-P1", vendor_id="DW-V1",
    package="DW Void-mixed W/H (P1)", referenceNo="QTS-DRC-NOI-000003",
    issueDate="2026-09-02", inspectionDate="2026-09-12", inspectionTime="09:00",
    itpNo="QTS-DRC-ITP-000001", eventNumber="EV3", checkpoint="H", type="Rebar",
    contacts="Bob", phone="123", email="b@example.com", status="Open",
)
d.add(noi3)
d.flush()
d.add(models.QWorkflow(id="dw-qwf-3", project_id="DW-P1", referenceNo="Q-WorkFlow-000003", noi_id=noi3.id))
d.add(models.ITR(id="dw-itr-void-3", vendor_id="DW-V1", documentNumber="ITR-DW-VOID-3",
                  description="void one, inserted first", rev="A", submit="s", status="Void",
                  noiNumber=noi3.referenceNo, raiseDate="2026-09-12"))
d.add(models.ITR(id="dw-itr-valid-3", vendor_id="DW-V1", documentNumber="ITR-DW-VALID-3",
                  description="valid one", rev="A", submit="s", status="Approved",
                  noiNumber=noi3.referenceNo, raiseDate="2026-09-13"))

# ── Scenario 2: Void-only ITR on one NOI (itr_ids ends up empty) ──
noi4 = models.NOI(
    id="dw-noi-4", project_id="DW-P1", vendor_id="DW-V1",
    package="DW Void-only W/H (P1)", referenceNo="QTS-DRC-NOI-000004",
    issueDate="2026-09-02", inspectionDate="2026-09-12", inspectionTime="09:00",
    itpNo="QTS-DRC-ITP-000001", eventNumber="EV4", checkpoint="H", type="Rebar",
    contacts="Bob", phone="123", email="b@example.com", status="Open",
)
d.add(noi4)
d.flush()
d.add(models.QWorkflow(id="dw-qwf-4", project_id="DW-P1", referenceNo="Q-WorkFlow-000004", noi_id=noi4.id))
d.add(models.ITR(id="dw-itr-void-4", vendor_id="DW-V1", documentNumber="ITR-DW-VOID-4",
                  description="only ITR, voided", rev="A", submit="s", status="Void",
                  noiNumber=noi4.referenceNo, raiseDate="2026-09-12"))

# ── Scenario 3: mixed Void + valid re-inspection ITR via an NCR chain ──
noi5 = models.NOI(
    id="dw-noi-5", project_id="DW-P1", vendor_id="DW-V1",
    package="DW Void-mixed re-insp (P1)", referenceNo="QTS-DRC-NOI-000005",
    issueDate="2026-09-02", inspectionDate="2026-09-12", inspectionTime="09:00",
    itpNo="QTS-DRC-ITP-000001", eventNumber="EV5", checkpoint="H", type="Rebar",
    contacts="Bob", phone="123", email="b@example.com", status="Open",
)
d.add(noi5)
d.flush()
d.add(models.QWorkflow(id="dw-qwf-5", project_id="DW-P1", referenceNo="Q-WorkFlow-000005", noi_id=noi5.id))
d.add(models.ITR(id="dw-itr-orig-5", vendor_id="DW-V1", documentNumber="ITR-DW-ORIG-5",
                  description="original failed inspection", rev="A", submit="s", status="Reject",
                  noiNumber=noi5.referenceNo, raiseDate="2026-09-12", inspectionResult="Fail"))
d.add(models.NCR(id="dw-ncr-5", project_id="DW-P1", vendor_id="DW-V1", documentNumber="NCR-DW-5",
                  description="raised from failed ITR", rev="0", submit="", status="Open",
                  raiseDate="2026-09-13", noiNumber=noi5.referenceNo, itrNumber="ITR-DW-ORIG-5"))
d.add(models.ITR(id="dw-itr-reinsp-void-5", vendor_id="DW-V1", documentNumber="ITR-DW-REINSP-VOID-5",
                  description="re-inspection, voided", rev="A", submit="s", status="Void",
                  noiNumber=noi5.referenceNo, raiseDate="2026-09-14", inspectionResult="Pass",
                  isReInspection=True, originalItrId="dw-itr-orig-5"))
d.add(models.ITR(id="dw-itr-reinsp-valid-5", vendor_id="DW-V1", documentNumber="ITR-DW-REINSP-VALID-5",
                  description="re-inspection, valid and passed", rev="A", submit="s", status="In Progress",
                  noiNumber=noi5.referenceNo, raiseDate="2026-09-15", inspectionResult="Pass",
                  isReInspection=True, originalItrId="dw-itr-orig-5"))

d.commit()
d.close()
print("SEED ok: added QTS-DRC-NOI-000003/000004/000005 (Void-mixed navigation fixtures) to DW-P1")
