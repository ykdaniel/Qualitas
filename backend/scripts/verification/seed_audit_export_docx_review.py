"""Seed for AUDIT-EXPORT-DOCX-2026-001 browser review (isolated stack only — never run against a real DB).

Run AFTER seed_audit_hardening_b_review.py (it reuses that seed's project AHB-P1, contractor "Review Vendor" and the
`audit_full` / `audit_viewer` accounts, password `Accept-Test-1234`). Adds one fully filled audit, AHB-EXPORT-1, with
every plan field, templates, five checklist items (pass / fail / pending / no status, multi-line note) and multi-line
findings, so the exported Word report can be checked section by section.
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
    {"id": 1, "no": "7.1", "clause": "Resources", "task": "How does the organization provide the resources needed?",
     "status": "pass", "note": "人力配置表已核准", "updatedAt": "2026-10-02"},
    {"id": 2, "no": "8.4", "clause": "Control of externally provided processes",
     "task": "How do you ensure externally provided products conform?", "status": "fail",
     "note": "兩家供應商未做評鑑\nTwo suppliers not evaluated", "updatedAt": "2026-10-02"},
    {"id": 3, "no": "9.2", "clause": "Internal audit", "task": "Are internal audits conducted at planned intervals?",
     "status": "pending", "note": "待補年度稽核計畫", "updatedAt": "2026-10-02"},
    {"id": 4, "no": "", "clause": "", "task": "現場材料標示是否清楚？"},
    {"id": 5, "no": "10.2", "clause": "Nonconformity and corrective action",
     "task": "When a nonconformity occurs, how does the organization react?", "status": "pass", "updatedAt": "2026-10-02"},
]

d = database.SessionLocal()
d.add(models.Audit(
    id="ahb-export-1", auditNo="AHB-EXPORT-1", title="第四季供應商品質稽核 Q4 Supplier Audit", date="2026-10-01",
    end_date="2026-10-02", status="In Progress", project_id="AHB-P1", project_name="Audit Review P1",
    contractor="Review Vendor", vendor_id="ahb-vendor", location="三號料場 Yard 3", project_director="陳經理",
    tech_lead="林工程師", auditor="王稽核", support_auditors="李稽核、張稽核", audit_criteria="專案合約、ISO 9001:2015",
    scope_description="材料收料、儲存與標示\nReceiving, storage and identification",
    selected_templates=json.dumps(["ISO 9001:2015", "供應商評鑑表"], ensure_ascii=False),
    custom_check_items=json.dumps(ITEMS, ensure_ascii=False),
    findings="1. 兩家供應商未完成評鑑，將開立 NCR。\n2. 年度稽核計畫需補齊。\nOverall: acceptable with two follow-ups.",
))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
