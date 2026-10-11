"""Seed for AUDIT-GRADES-2026-001 browser review (isolated stack only — never run against a real DB).

Run AFTER seed_audit_hardening_b_review.py (reuses project AHB-P1, contractor "Review Vendor" and the accounts, password
`Accept-Test-1234`). Adds:
    AHB-GRADES-1        In Progress: one item of each grade (pass / positive / major / minor), one older 'fail'
                        (shown as 不符合（未分級）), one old 'pending' and one without a result (both 未評) → progress 5 / 7
    AHB-GRADES-CLOSED-1 Closed, same items — the lock compares them unchanged on a resave
"""
import json
import os
import sys

if not os.environ.get("DATABASE_URL"):
    sys.exit("refusing to seed: DATABASE_URL is not set (run through isolated_stack.py seed, never against a real DB)")

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models  # noqa: E402

ITEMS = [
    {"id": 1, "no": "7.1", "clause": "The organization shall determine and provide the resources needed",
     "task": "How are resources provided?", "status": "pass", "note": "Budget approved", "updatedAt": "2026-10-02"},
    {"id": 2, "no": "7.2", "clause": "The organization shall determine the necessary competence",
     "task": "Training records?", "status": "positive", "note": "Training matrix is exemplary", "updatedAt": "2026-10-02"},
    {"id": 3, "no": "8.4", "clause": "The organization shall ensure that externally provided processes conform",
     "task": "How are suppliers controlled?", "status": "major", "note": "No evaluation\nfor two vendors", "updatedAt": "2026-10-02"},
    {"id": 4, "no": "7.5", "clause": "Documented information shall be controlled",
     "task": "Document control?", "status": "minor", "note": "One obsolete form in use", "updatedAt": "2026-10-02"},
    {"id": 5, "no": "8.7", "clause": "Nonconforming outputs are identified and controlled",
     "task": "Segregation?", "status": "fail", "note": "Recorded before the four grades", "updatedAt": "2026-09-30"},
    {"id": 6, "no": "9.2", "clause": "Internal audits at planned intervals", "task": "Audit programme?", "status": "pending"},
    {"id": 7, "no": "10.2", "clause": "Nonconformity and corrective action", "task": "Corrective actions?"},
]

d = database.SessionLocal()
common = dict(project_id="AHB-P1", project_name="Audit Review P1", contractor="Review Vendor", vendor_id="ahb-vendor",
              date="2026-10-01", end_date="2026-10-02", auditor="王稽核", location="Yard 3",
              selected_templates=json.dumps(["ISO 9001:2015"]), custom_check_items=json.dumps(ITEMS, ensure_ascii=False))
d.add(models.Audit(id="ahb-grades-1", auditNo="AHB-GRADES-1", title="Grades review", status="In Progress", **common))
d.add(models.Audit(id="ahb-grades-closed-1", auditNo="AHB-GRADES-CLOSED-1", title="Grades review (closed)", status="Closed", **common))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
