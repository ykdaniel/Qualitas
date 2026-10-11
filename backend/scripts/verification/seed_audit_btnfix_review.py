"""Seed for AUDIT-BTNFIX-2026-001 browser review (isolated stack only — never run against a real DB).

Run AFTER seed_audit_hardening_b_review.py and seed_audit_agenda_review.py (reuses project AHB-P1, contractor
"Review Vendor" and the accounts, password `Accept-Test-1234`). Adds:
    contractor "Second Vendor" + audit AHB-SV-1 (Draft) for it — the contractor column filter must show only that one
    audit AHB-NOVENDOR-1 (Draft) with no contractor at all — must not match any contractor filter
    btnfix_lists   view-only on Audit, NOI, OSD and Meeting Minutes — to look at other modules' shared DataTable
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
d.add(models.Contractor(id="btnfix-vendor-2", name="Second Vendor", abbreviation="SV", status="active"))
common = dict(project_id="AHB-P1", project_name="Audit Review P1", date="2026-10-01", end_date="2026-10-02",
              auditor="王稽核", status="Draft", selected_templates="[]", custom_check_items="[]")
d.add(models.Audit(id="ahb-sv-1", auditNo="AHB-SV-1", title="Second vendor audit", contractor="Second Vendor",
                   vendor_id="btnfix-vendor-2", **common))
# contractor "" (not NULL): what older rows hold, and the value the old `value.includes(cell)` filter matched for every option
d.add(models.Audit(id="ahb-novendor-1", auditNo="AHB-NOVENDOR-1", title="Audit without contractor", contractor="",
                   vendor_id=None, **common))
codes = [perms.AUDIT_VIEW, perms.NOI_VIEW, perms.OSD_VIEW, perms.MEETING_VIEW, perms.USER_VIEW]
role = models.Role(name="BTNFIX_LISTS", description="AUDIT-BTNFIX review",
                   permissions_rel=d.query(models.Permission).filter(models.Permission.code.in_(codes)).all())
d.add(role)
d.flush()
assert len(role.permissions_rel) == len(codes), [p.code for p in role.permissions_rel]
d.add(models.User(username="btnfix_lists", email="btnfix_lists@example.com", is_active=True, role_id=role.id,
                  hashed_password=get_password_hash(PW)))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
