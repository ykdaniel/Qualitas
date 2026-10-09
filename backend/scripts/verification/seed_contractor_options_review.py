"""Extra seed for CONTRACTOR-OPTIONS-2026-001 browser checks (isolated stack only — never run against a real DB).
Run AFTER seed_audit_hardening_b_review.py (+ optionally seed_audit_polish_review.py):

    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_contractor_options_review.py
    node ../react-app/tests-browser/contractor-options-check.mjs <stack.json> <outDir>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, same convention as the other seeds).

    module_user      ncr / obs / pqp view + create, NO contractors:view:all  -> pickers must still list contractors
    noi_writer       noi view + create, NO contractors:view:all              -> NOI contact auto-fill via /noi/contractor-contact
    contractor_admin contractors:view:all + contractors:manage:all           -> Contractors page still lists the full records

Contractors added: "Caps Active Co" stored with status 'Active' (capital A — what the Contractors page saves; the Audit page
used to treat it as inactive), with contact details; contact details for the existing "Review Vendor".
"""
import json
import os
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models  # noqa: E402
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


def user(username, codes):
    r = models.Role(name=f"CO-{username}")
    r.permissions_rel = [perm(c) for c in codes]
    d.add(r)
    d.flush()
    d.add(models.User(username=username, email=f"{username}@example.com", is_active=True, role_id=r.id,
                      hashed_password=get_password_hash(PW), full_name=username))


d.add(models.Contractor(id="caps-active", name="Caps Active Co", abbreviation="CA", scope="Civil works", status="Active",
                        contactPerson="Cathy Caps", phone="02-1111-2222", email="cathy@caps.example.com"))
rv = d.query(models.Contractor).filter_by(id="ahb-vendor").one()
rv.contactPerson, rv.phone, rv.email = "Rex Review", "03-3333-4444", "rex@review.example.com"
user("module_user", ["ncr:view:all", "ncr:create:all", "obs:view:all", "obs:create:all", "pqp:view:all", "pqp:create:all"])
user("noi_writer", ["noi:view:all", "noi:create:all", "itp:view:all"])
user("contractor_admin", ["contractors:view:all", "contractors:manage:all"])
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
