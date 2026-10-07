"""Seed for the Checklist template/instance business-review browser walkthrough (2026-09-23;
isolated stack only — never run against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_checklist_review.py
    node ../react-app/tests-browser/checklist-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    chk_full     itp:view:all, itp:create:all, itp:update:all,
                 checklist:view:all, checklist:create:all, checklist:update:all,
                 checklist:close:all, checklist:delete:all,
                 itr:view:all, itr:create:all, itr:update:all
                 — full rights across all three modules; used for the main walkthrough
                   (template create, ITP-source generation, ITR link, result fill, reopen, unlink, delete)
    chk_no_close same as chk_full MINUS checklist:close:all
                 — used to confirm Reopen is actually blocked without this permission
    chk_no_delete same as chk_full MINUS checklist:delete:all
                 — used to confirm template delete is blocked without this permission (separately from
                   the itrId-based instance-delete block, which applies regardless of permission)
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


FULL_CODES = [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE,
              perms.CHECKLIST_VIEW, perms.CHECKLIST_CREATE, perms.CHECKLIST_UPDATE,
              perms.CHECKLIST_CLOSE, perms.CHECKLIST_DELETE,
              perms.ITR_VIEW, perms.ITR_CREATE, perms.ITR_UPDATE,
              perms.NOI_VIEW]  # ITR creation requires selecting an existing NOI — view-only, NOI itself isn't under review here

full = role("ChkFull", FULL_CODES)
no_close = role("ChkNoClose", [c for c in FULL_CODES if c != perms.CHECKLIST_CLOSE])
no_delete = role("ChkNoDelete", [c for c in FULL_CODES if c != perms.CHECKLIST_DELETE])

d.add(models.Contractor(id="CHKR-V1", name="Checklist Review Co", abbreviation="CRC"))
# A pre-made NOI, seeded directly (not through the screen — NOI itself is out of scope for this review,
# it exists here only so the ITR creation form's mandatory NOI picker has something to select).
d.add(models.NOI(id="CHKR-NOI-1", referenceNo="QTS-CRC-NOI-000001", package="Checklist review NOI",
                 vendor_id="CHKR-V1", status="Open", issueDate="2026-09-23", inspectionDate="2026-09-23",
                 inspectionTime="", itpNo="", type=""))
d.add(models.User(username="chk_full", email="chkf@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=full.id, full_name="Checklist Full"))
d.add(models.User(username="chk_no_close", email="chknc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=no_close.id, full_name="Checklist No-Close"))
d.add(models.User(username="chk_no_delete", email="chknd@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=no_delete.id, full_name="Checklist No-Delete"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
