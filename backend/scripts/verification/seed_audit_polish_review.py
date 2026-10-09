"""Extra seed for AUDIT-POLISH-2026-001 browser checks (isolated stack only — never run against a real DB).
Run AFTER seed_audit_hardening_b_review.py:

    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_audit_polish_review.py
    node ../react-app/tests-browser/audit-print-check.mjs  <stack.json> <outDir> AHB-DRAFT-1
    node ../react-app/tests-browser/audit-polish-check.mjs <stack.json> <outDir>

Adds: 60 check items + long findings on AHB-DRAFT-1 (several print pages); an active contractor whose only past audit is Void
("Void Only Co" — must not be flagged overdue); an inactive contractor with a Draft audit ("Retired Co" — must stay in its
audit's contractor picker).
"""
import json
import os
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models  # noqa: E402

d = database.SessionLocal()
a = d.query(models.Audit).filter_by(auditNo="AHB-DRAFT-1").one()
a.custom_check_items = json.dumps([{"id": i, "no": f"{4 + i % 7}.{i % 5 + 1}", "clause": f"Clause {i} — Resources and competence",
                                    "task": f"PRINT-ITEM-{i:02d} Check that requirement {i} is met with records",
                                    "status": ["pass", "fail", ""][i % 3], "note": f"note {i}"} for i in range(1, 61)])
a.findings = "PRINT-FINDINGS " + "Observed several gaps in document control. " * 30
a.scope_description = "PRINT-SCOPE site-wide quality system audit"
d.add(models.Contractor(id="void-only", name="Void Only Co", abbreviation="VO", status="active"))
d.add(models.Contractor(id="retired", name="Retired Co", abbreviation="RC", status="inactive"))
d.flush()
for no, status, cid, cname in (("AHB-VOIDONLY-1", "Void", "void-only", "Void Only Co"), ("AHB-RETIRED-1", "Draft", "retired", "Retired Co")):
    d.add(models.Audit(id=f"ahb-{no.lower()}", auditNo=no, title=no, date="2026-09-01", end_date="2026-09-02", status=status,
                       project_id="AHB-P1", project_name="Audit Review P1", contractor=cname, vendor_id=cid,
                       selected_templates="[]", custom_check_items="[]"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
