"""Seed for AUDIT-AGENDA-2026-001 browser review (isolated stack only — never run against a real DB).

Run AFTER seed_audit_hardening_b_review.py (reuses project AHB-P1, contractor "Review Vendor" and the accounts, password
`Accept-Test-1234`). Adds:
    AHB-AGENDA-1         Draft, audit period 2026-10-01 ~ 2026-10-02, no agenda yet (the wizard fills it)
    AHB-AGENDA-CLOSED-1  Closed, with a three-row agenda (read-only display, printouts, Word)
"""
import json
import os
import sys

if not os.environ.get("DATABASE_URL"):
    sys.exit("refusing to seed: DATABASE_URL is not set (run through isolated_stack.py seed, never against a real DB)")

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models  # noqa: E402

AGENDA = [
    {"id": 1, "date": "2026-10-01", "start": "09:00", "end": "09:30", "item": "起始會議 Opening meeting", "auditee": "全體",
     "auditor": "王稽核", "remarks": "會議室 A"},
    {"id": 2, "date": "2026-10-01", "start": "09:30", "end": "12:00", "item": "8.4 外部供應管理", "auditee": "採購部 / 陳",
     "auditor": "王稽核", "remarks": ""},
    {"id": 3, "date": "2026-10-02", "start": "15:00", "end": "15:30", "item": "結束會議 Closing meeting", "auditee": "全體",
     "auditor": "王稽核", "remarks": ""},
]

d = database.SessionLocal()
common = dict(project_id="AHB-P1", project_name="Audit Review P1", contractor="Review Vendor", vendor_id="ahb-vendor",
              date="2026-10-01", end_date="2026-10-02", auditor="王稽核", selected_templates="[]", custom_check_items="[]")
d.add(models.Audit(id="ahb-agenda-1", auditNo="AHB-AGENDA-1", title="Agenda review (draft)", status="Draft", **common))
d.add(models.Audit(id="ahb-agenda-closed-1", auditNo="AHB-AGENDA-CLOSED-1", title="Agenda review (closed)", status="Closed",
                   agenda=json.dumps(AGENDA, ensure_ascii=False), **common))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
