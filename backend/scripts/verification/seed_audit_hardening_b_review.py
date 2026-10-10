"""Seed for AUDIT-HARDENING-B-2026-001 browser review (isolated stack only — never run against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --port 8320 --vite-port 3320 \
        --vite-script ../react-app/tests-browser/audit-hardening-b-vite-launcher.mjs > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_audit_hardening_b_review.py
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, same convention as the other
seed scripts in this directory).

    audit_viewer   audit:view + audit:create          — no update / delete (read-only wizard, delete disabled)
    audit_full     view + create + update + delete    — unscoped
    audit_multi    view + create + update             — scoped to BOTH projects (create used to be a 403: no project_id sent)

Data: projects AHB-P1 / AHB-P2, contractor "Review Vendor", and audits:
    one Draft in P1, one Void in P1, one Closed in P2, one legacy row in P1 with project_name only (no project_id).
"""
import json
import os
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models  # noqa: E402
from core import perms  # noqa: E402
from core.security import get_password_hash  # noqa: E402

PW = "Accept-Test-1234"  # shared, isolated-only test constant used across this directory's seed scripts

d = database.SessionLocal()


def perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


def role(name, codes):
    r = models.Role(name=name)
    r.permissions_rel = [perm(c) for c in codes]
    d.add(r)
    d.flush()
    return r


def user(username, r):
    u = models.User(username=username, email=f"{username}@example.com", is_active=True,
                    hashed_password=get_password_hash(PW), role_id=r.id, full_name=username)
    d.add(u)
    d.flush()
    return u


d.add_all([models.Project(id="AHB-P1", name="Audit Review P1", code="AHB1"),
           models.Project(id="AHB-P2", name="Audit Review P2", code="AHB2")])
d.add(models.Contractor(id="ahb-vendor", name="Review Vendor", abbreviation="RV", status="active"))
d.flush()

viewer = role("AuditViewerB", [perms.AUDIT_VIEW, perms.AUDIT_CREATE])
full = role("AuditFullB", [perms.AUDIT_VIEW, perms.AUDIT_CREATE, perms.AUDIT_UPDATE, perms.AUDIT_DELETE])
multi = role("AuditMultiB", [perms.AUDIT_VIEW, perms.AUDIT_CREATE, perms.AUDIT_UPDATE])
user("audit_viewer", viewer)
user("audit_full", full)
m = user("audit_multi", multi)
d.add_all([models.UserProject(user_id=m.id, project_id="AHB-P1"), models.UserProject(user_id=m.id, project_id="AHB-P2")])


def audit(no, status, project_id, project_name, title):
    d.add(models.Audit(id=f"ahb-{no.lower()}", auditNo=no, title=title, date="2026-10-01", end_date="2026-10-02",
                       status=status, project_id=project_id, project_name=project_name, contractor="Review Vendor",
                       vendor_id="ahb-vendor", selected_templates="[]",
                       custom_check_items=json.dumps([{"id": 1, "no": "7.1", "clause": "Resources", "task": "Check resources"}])))


audit("AHB-DRAFT-1", "Draft", "AHB-P1", "Audit Review P1", "Draft in P1")
audit("AHB-VOID-1", "Void", "AHB-P1", "Audit Review P1", "Void in P1")
audit("AHB-CLOSED-1", "Closed", "AHB-P2", "Audit Review P2", "Closed in P2")
audit("AHB-LEGACY-1", "Draft", None, "Audit Review P1", "Legacy name-only")
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
