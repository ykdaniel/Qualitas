"""Seed for the OSD business-review browser walkthrough (2026-09-24; isolated stack only — never run
against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_osd_review.py
    node ../react-app/tests-browser/osd-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    osd_creator  osd:view:all, osd:create:all, contractors:view:all — no update/delete. OSD has only
                 4 permission codes total (view/create/update/delete) — NO approve code exists at all,
                 unlike OBS/NOI/ITP. The frontend's own "locked record needs a higher permission" gate
                 (OSD.tsx line ~301) reuses osd:create:all itself for this purpose, not a separate code.
    osd_updater  osd_creator's permissions + osd:update:all
    osd_deleter  osd_updater's permissions + osd:delete:all
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


creator = role("OsdCreator", [perms.OSD_VIEW, perms.OSD_CREATE, perms.CONTRACTOR_VIEW])
updater = role("OsdUpdater", [perms.OSD_VIEW, perms.OSD_CREATE, perms.CONTRACTOR_VIEW, perms.OSD_UPDATE])
deleter = role("OsdDeleter", [perms.OSD_VIEW, perms.OSD_CREATE, perms.CONTRACTOR_VIEW, perms.OSD_UPDATE, perms.OSD_DELETE])

d.add(models.Contractor(id="OSDR-V1", name="OSD Review Co", abbreviation="OSR"))
d.add(models.User(username="osd_creator", email="osdc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator.id, full_name="OSD Creator"))
d.add(models.User(username="osd_updater", email="osdu@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=updater.id, full_name="OSD Updater"))
d.add(models.User(username="osd_deleter", email="osdd@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=deleter.id, full_name="OSD Deleter"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
