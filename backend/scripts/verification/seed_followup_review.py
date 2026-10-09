"""Seed for the FollowUp Issue business-review browser walkthrough (2026-09-24; isolated stack only —
never run against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_followup_review.py
    node ../react-app/tests-browser/followup-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

This module was hardened the commit immediately before this review session (16672154: closed-state
lock + delete restriction + missing-audit-commit fix) — never verified on a real screen before now.

Accounts, EXACT permissions each holds:

    followup_creator  followup:view:all, followup:create:all — no update/delete
    followup_updater  followup_creator's permissions + followup:update:all
    followup_deleter  followup_updater's permissions + followup:delete:all
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


creator = role("FollowupCreator", [perms.FOLLOWUP_VIEW, perms.FOLLOWUP_CREATE])
updater = role("FollowupUpdater", [perms.FOLLOWUP_VIEW, perms.FOLLOWUP_CREATE, perms.FOLLOWUP_UPDATE])
deleter = role("FollowupDeleter", [perms.FOLLOWUP_VIEW, perms.FOLLOWUP_CREATE, perms.FOLLOWUP_UPDATE, perms.FOLLOWUP_DELETE])

d.add(models.User(username="followup_creator", email="fuc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator.id, full_name="FollowUp Creator"))
d.add(models.User(username="followup_updater", email="fuu@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=updater.id, full_name="FollowUp Updater"))
d.add(models.User(username="followup_deleter", email="fud@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=deleter.id, full_name="FollowUp Deleter"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
