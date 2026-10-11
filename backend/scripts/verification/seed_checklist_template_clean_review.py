"""Isolated TEST SEED SCRIPT for CHECKLIST-TEMPLATE-CLEAN-2026-001 (BACKLOG #22, 2026-10-11) — writes test fixtures to an
isolated database; it is a seed script, not a read-only script.

Isolated stack only. Requires CHK_CLEAN_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password).

Creates one project, one contractor, one reviewer (checklist + ITR view / update), one ITR "In Progress" and two bare
templates:
  * "Stakeout (legacy)" — shaped like production's QTS-RKS-HL-CHK-000001 before the cleanup: status Pass, passCount 1,
    items with results, a 2024 inspection date, filled signatures and an old ITR reference in detail_data. The stack's
    start-up already ran migration step 23 on an EMPTY database (flag set, nothing cleaned), so this script clears the
    flag and calls the same step function, exactly as the first start after deployment would on production.
  * "Rebar spacing" — a normal template as the form saves it (header defaults + blank items), with a 2025 inspection
    date and signature names in its header: linking it to the ITR must give a checklist whose per-inspection fields
    start blank.
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import json
import uuid
import database, models, db_migrations
from core.security import get_password_hash
from sqlalchemy import text

PW = os.environ.get("CHK_CLEAN_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("CHK_CLEAN_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


role = models.Role(name="ChecklistTemplateCleanReview")
role.permissions_rel = [_perm(c) for c in ("checklist:view:all", "checklist:create:all", "checklist:update:all",
                                            "itr:view:all", "itr:update:all", "itp:view:all", "noi:view:all",
                                            "contractors:view:all")]
d.add(role)
d.flush()
d.add(models.User(username="chk_reviewer", email="chk.reviewer@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=role.id, full_name="Checklist Reviewer"))
d.add(models.Project(id="CTC-P1", name="Checklist Template Cleanup Review", code="CTC1"))
d.add(models.Contractor(id="CTC-V1", name="Hailong Construction", abbreviation="HL", status="active"))
d.flush()
d.add(models.ITR(id=uuid.uuid4().hex, documentNumber="QTS-CTC1-HL-ITR-000001", status="In Progress", vendor_id="CTC-V1",
                 project_id="CTC-P1", raiseDate="2026-10-11", subject="Setting-out check, Grid A–C",
                 description="Setting-out check before rebar works", rev="0", submit=""))

header = {"packageName": "RKS", "contractor": "Hailong Construction", "location": "Grid A–C", "stage": "Before",
          "revision": 0, "referenceNo": "", "remarks": "1. Mark 'O' for passed items, 'X' for failed items, and '/' for N/A items."}
legacy = {**header, "activity": "Stakeout (legacy)", "inspectionDate": "2024-03-20", "agreementChecked": False, "ncrNo": "NCR-OLD-1",
          "reInspectionDate": "2024-04-02", "passCount": 2, "failCount": 0, "itrId": "old-itr", "itrNumber": "QTS-RKS-HL-ITR-000002",
          "signatures": {"siteEngineer": "Old Inspector", "constructionLeader": "Old Leader", "subcontractorRep": ""},
          "items": [{"id": 1, "item": "Benchmark level", "criteria": "±5 mm", "situation": "Measured 3 mm", "result": "O"},
                    {"id": 2, "item": "Grid line offset", "criteria": "±10 mm", "situation": "Measured 6 mm", "result": "O"}]}
normal = {**header, "activity": "Rebar spacing", "inspectionDate": "2025-01-15", "agreementChecked": True, "ncrNo": "", "reInspectionDate": "",
          "signatures": {"siteEngineer": "Template Author", "constructionLeader": "Template Leader", "subcontractorRep": ""},
          "items": [{"id": 1, "item": "Main bar spacing", "criteria": "≤ 200 mm", "situation": "", "result": ""},
                    {"id": 2, "item": "Cover", "criteria": "≥ 40 mm", "situation": "", "result": ""}]}
d.add(models.Checklist(id=uuid.uuid4().hex, recordsNo="QTS-CTC1-HL-CHK-000001", activity="Stakeout (legacy)", date="2024-03-20",
                       status="Pass", passCount=1, failCount=0, packageName="RKS", project_id="CTC-P1", contractor_id="CTC-V1",
                       detail_data=json.dumps(legacy, ensure_ascii=False)))
d.add(models.Checklist(id=uuid.uuid4().hex, recordsNo="QTS-CTC1-HL-CHK-000002", activity="Rebar spacing", date="2025-01-15",
                       status="Ongoing", passCount=0, failCount=0, packageName="RKS", project_id="CTC-P1", contractor_id="CTC-V1",
                       detail_data=json.dumps(normal, ensure_ascii=False)))
d.commit()

# the first start after deployment: step 23 on a database that holds a legacy template (flag not yet set)
with database.engine.begin() as conn:
    conn.execute(text("DELETE FROM migration_flags WHERE flag_name = :f"), {"f": db_migrations.CHECKLIST_TEMPLATE_CLEANUP_FLAG})
db_migrations._clean_legacy_bare_template_results()

row = d.execute(text("SELECT status, passCount, detail_data FROM checklist WHERE recordsNo='QTS-CTC1-HL-CHK-000001'")).one()
audits = d.execute(text("SELECT COUNT(*) FROM audit_logs WHERE action='CLEANUP_TEMPLATE_RESULTS'")).scalar()
print("legacy template after step 23:", row[0], row[1], json.loads(row[2]).get("inspectionDate"), "| cleanup audits:", audits)
