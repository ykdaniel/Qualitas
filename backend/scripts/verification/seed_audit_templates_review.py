"""Seed for AUDIT-TEMPLATES-2026-001 browser review (isolated stack only — never run against a real DB).

Run AFTER seed_audit_hardening_b_review.py (reuses project AHB-P1, contractor "Review Vendor" and the accounts, password
`Accept-Test-1234`). The four initial templates come from start-up (db_migrations step 24). Adds:
    audit_tpl_mgr      audit view / create / update + audit:template:manage (the 模板管理 tab); audit_full has no manage
    AHB-TPL-1          Draft, no template selected, no items (select / unselect in step 4)
    AHB-TPL-LEGACY-1   Draft from before the library: selected_templates ["ISO 9001:2015", "Old supplier form"] by name only,
                       one hand-added item (no templateId)
"""
import json
import os
import sys

if not os.environ.get("DATABASE_URL"):
    sys.exit("refusing to seed: DATABASE_URL is not set (run through isolated_stack.py seed, never against a real DB)")

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models  # noqa: E402
from core import perms  # noqa: E402
from core.security import get_password_hash  # noqa: E402

PW = "Accept-Test-1234"  # shared, isolated-only test constant used across this directory's seed scripts

d = database.SessionLocal()
codes = [perms.AUDIT_VIEW, perms.AUDIT_CREATE, perms.AUDIT_UPDATE, perms.AUDIT_TEMPLATE_MANAGE, perms.USER_VIEW]
role = models.Role(name="AUDIT_TEMPLATE_MANAGER", description="AUDIT-TEMPLATES review",
                   permissions_rel=d.query(models.Permission).filter(models.Permission.code.in_(codes)).all())
d.add(role)
d.flush()
assert len(role.permissions_rel) == len(codes), [p.code for p in role.permissions_rel]
d.add(models.User(username="audit_tpl_mgr", email="audit_tpl_mgr@example.com", is_active=True, role_id=role.id,
                  hashed_password=get_password_hash(PW)))
common = dict(project_id="AHB-P1", project_name="Audit Review P1", contractor="Review Vendor", vendor_id="ahb-vendor",
              date="2026-10-01", end_date="2026-10-02", auditor="王稽核", status="Draft")
d.add(models.Audit(id="ahb-tpl-1", auditNo="AHB-TPL-1", title="Template review", selected_templates="[]",
                   custom_check_items="[]", **common))
d.add(models.Audit(id="ahb-tpl-legacy-1", auditNo="AHB-TPL-LEGACY-1", title="Template review (legacy)",
                   selected_templates=json.dumps(["ISO 9001:2015", "Old supplier form"]),
                   custom_check_items=json.dumps([{"id": 1, "no": "7.1", "clause": "Resources", "task": "Hand-added question"}]),
                   **common))
d.commit()
names = [t.name for t in d.query(models.AuditTemplate).order_by(models.AuditTemplate.id)]
d.close()
print("SEED " + json.dumps({"ok": True, "templates": names}, ensure_ascii=False))
