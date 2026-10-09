"""Add 201 workflows to DW-P2 after seed_dashboard_workflow_review.py.

Only for a fresh isolated stack; validates the page beyond the old 200-row cutoff.
"""
import os
import models
from database import SessionLocal

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")

with SessionLocal() as db:
    for i in range(201):
        noi = models.NOI(
            id=f"wf-page-noi-{i}", referenceNo=f"WF-PAGE-NOI-{i:04d}",
            project_id="DW-P2", vendor_id="DW-V1", status="Open",
            package=f"Pagination fixture {i}", issueDate="2026-09-30",
            inspectionDate="2026-09-30", inspectionTime="09:00", type="site",
            itpNo="QTS-DRC-ITP-000001",
        )
        db.add(noi)
        db.flush()
        db.add(models.QWorkflow(id=f"wf-page-{i}", referenceNo=f"WF-PAGE-{i:04d}",
                               noi_id=noi.id, project_id="DW-P2"))
    db.commit()
print("Added 201 workflows; DW-P2 now has 202, all projects 203")
