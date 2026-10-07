"""Seed for the NCR business-review browser walkthrough (2026-09-24; isolated stack only — never run
against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_ncr_review.py
    node ../react-app/tests-browser/ncr-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    ncr_creator   ncr:view:all, ncr:create:all, contractors:view:all, iam:user:view
                  — the create form needs BOTH contractors:view:all (Contractor dropdown) and
                    iam:user:view (Assigned To picker, via getUsers()) — a FOURTH confirmed instance of
                    the cross-module dropdown-dependency pattern already found in PQP/NOI. No
                    ncr:approve:all, no ncr:close:all, no ncr:update:all beyond create.
    ncr_updater   ncr_creator's permissions + ncr:update:all — no ncr:approve:all, no ncr:close:all
    ncr_approver  ncr_updater's permissions + ncr:approve:all — no ncr:close:all
    ncr_closer    ncr_updater's permissions + ncr:close:all — no ncr:approve:all
"""
import sys, os, json
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models
from core import perms
from core.security import get_password_hash

PW = "Accept-Test-1234"  # shared, isolated-only test constant used across this directory's seed scripts

d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


def role(name, codes):
    r = models.Role(name=name)
    r.permissions_rel = [_get_or_create_perm(d, c) for c in codes]
    d.add(r)
    d.flush()
    return r


BASE_CODES = [perms.NCR_VIEW, perms.NCR_CREATE, perms.CONTRACTOR_VIEW, perms.USER_VIEW]

creator = role("NcrCreator", BASE_CODES)
updater = role("NcrUpdater", BASE_CODES + [perms.NCR_UPDATE])
approver = role("NcrApprover", BASE_CODES + [perms.NCR_UPDATE, perms.NCR_APPROVE])
closer = role("NcrCloser", BASE_CODES + [perms.NCR_UPDATE, perms.NCR_CLOSE])

d.add(models.Contractor(id="NCRR-V1", name="NCR Review Co", abbreviation="NCC"))
d.add(models.User(username="ncr_creator", email="ncrc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator.id, full_name="NCR Creator"))
d.add(models.User(username="ncr_updater", email="ncru@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=updater.id, full_name="NCR Updater"))
d.add(models.User(username="ncr_approver", email="ncra@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=approver.id, full_name="NCR Approver"))
d.add(models.User(username="ncr_closer", email="ncrcl@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=closer.id, full_name="NCR Closer"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
