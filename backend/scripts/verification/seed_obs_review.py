"""Seed for the OBS business-review browser walkthrough (2026-09-24; isolated stack only — never run
against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_obs_review.py
    node ../react-app/tests-browser/obs-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    obs_creator  obs:view:all, obs:create:all, contractors:view:all — no update/approve/delete
    obs_updater  obs_creator's permissions + obs:update:all — no obs:approve:all (a permission code
                 that is DORMANT on the backend — confirmed via grep, routers/obs.py never imports or
                 checks it — the frontend still gates re-editing a Closed/Void OBS behind it, which is
                 exactly the frontend/backend mismatch this review checks; the REAL backend protection
                 on a Closed OBS is a content lock on evidence fields, exempting an explicit reopen
                 (status change away from Closed) regardless of this permission — see
                 services/obs_service.py's is_reopening check)
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


creator = role("ObsCreator", [perms.OBS_VIEW, perms.OBS_CREATE, perms.CONTRACTOR_VIEW])
updater = role("ObsUpdater", [perms.OBS_VIEW, perms.OBS_CREATE, perms.CONTRACTOR_VIEW, perms.OBS_UPDATE])

d.add(models.Contractor(id="OBSR-V1", name="OBS Review Co", abbreviation="OBR"))
d.add(models.User(username="obs_creator", email="obsc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator.id, full_name="OBS Creator"))
d.add(models.User(username="obs_updater", email="obsu@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=updater.id, full_name="OBS Updater"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
