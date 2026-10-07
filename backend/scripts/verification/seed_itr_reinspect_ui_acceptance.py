"""Isolated-stack-only UI fixtures for the Approved/Void re-inspection boundary.

Run the existing chain account seed first. These are explicitly seeded legacy
states, not evidence that the normal approval UI was exercised by this seed.
"""
import json
import os

from database import SessionLocal
import models

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed; never run against development data")

with SessionLocal() as db:
    for suffix, status in [("approved", "Approved"), ("void", "Void")]:
        itr_id = f"reinspect-ui-{suffix}"
        number = f"UI-ITR-{suffix.upper()}"
        db.add(models.ITR(
            id=itr_id, documentNumber=number, project_id="CHAIN-P1", vendor_id="CHAIN-V1",
            subject=f"Isolated re-inspection {status}", status=status,
            inspectionResult="Fail", description="UI boundary fixture", rev="Rev1.0", submit="",
            type="Rev1.0", detail_data="{}"))
        db.flush()
        db.add(models.Checklist(
            id=f"reinspect-ui-checklist-{suffix}", recordsNo=f"UI-CHK-{suffix.upper()}",
            project_id="CHAIN-P1", contractor_id="CHAIN-V1", itrId=itr_id,
            itrNumber=number, activity="Boundary test snapshot", date="2026-09-29", status="Pass",
            passCount=1, failCount=0,
            detail_data=json.dumps({"items": [{"id": "A1", "item": "Spacing",
                "criteria": "200mm", "situation": "200mm", "result": "O"}]})))
    db.commit()
print("Seeded two independent UI boundary fixtures")
