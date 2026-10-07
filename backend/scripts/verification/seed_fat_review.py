"""Seed for the FAT business-review browser walkthrough (2026-09-24; isolated stack only — never run
against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_fat_review.py
    node ../react-app/tests-browser/fat-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    fat_creator  fat:view:all, fat:create:all, contractors:view:all — no update/delete
    fat_updater  fat_creator's permissions + fat:update:all
    fat_deleter  fat_updater's permissions + fat:delete:all

FAT has only these 4 permission codes total — no approve code, no WorkflowEngine transition table
(confirmed via grep of core/utils.py — FAT is not one of the modules listed there at all), and
`update_fat`/`delete_fat` (services/fat_service.py) have no status-based lock or delete guard of any
kind — confirmed via reading both functions in full.
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


creator = role("FatCreator", [perms.FAT_VIEW, perms.FAT_CREATE, perms.CONTRACTOR_VIEW])
updater = role("FatUpdater", [perms.FAT_VIEW, perms.FAT_CREATE, perms.CONTRACTOR_VIEW, perms.FAT_UPDATE])
deleter = role("FatDeleter", [perms.FAT_VIEW, perms.FAT_CREATE, perms.CONTRACTOR_VIEW, perms.FAT_UPDATE, perms.FAT_DELETE])

d.add(models.Contractor(id="FATR-V1", name="FAT Review Co", abbreviation="FAR"))
d.add(models.User(username="fat_creator", email="fatc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator.id, full_name="FAT Creator"))
d.add(models.User(username="fat_updater", email="fatu@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=updater.id, full_name="FAT Updater"))
d.add(models.User(username="fat_deleter", email="fatd@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=deleter.id, full_name="FAT Deleter"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
