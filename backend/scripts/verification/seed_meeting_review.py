"""Seed for the Meeting Minutes business-review browser walkthrough (2026-09-24; isolated stack only —
never run against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_meeting_review.py
    node ../react-app/tests-browser/meeting-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    meeting_creator  meeting:view:all, meeting:create:all, followup:view:all, followup:create:all
                     (the action-item -> FollowUp handoff calls addFollowUp/bulkCreateFollowUps
                     directly from the browser, so this account needs followup:create:all too — not
                     a dropdown dependency this time, a genuine cross-module write) — no update/delete
    meeting_updater  meeting_creator's permissions + meeting:update:all

WorkflowEngine.TRANSITIONS["MeetingMinutes"]: Draft->{Published,Void}, Published->{Void}, Void->[] —
unlike FollowUp/Audit, Void IS reachable from Published (no dead-end contradiction here). delete
allows Draft directly or Void (services/meeting_minutes_service.py::delete_meeting_minutes).
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


creator = role("MeetingCreator", [perms.MEETING_VIEW, perms.MEETING_CREATE, perms.MEETING_DELETE, perms.FOLLOWUP_VIEW, perms.FOLLOWUP_CREATE])
updater = role("MeetingUpdater", [perms.MEETING_VIEW, perms.MEETING_CREATE, perms.MEETING_UPDATE, perms.MEETING_DELETE, perms.FOLLOWUP_VIEW, perms.FOLLOWUP_CREATE])

d.add(models.User(username="meeting_creator", email="mtgc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator.id, full_name="Meeting Creator"))
d.add(models.User(username="meeting_updater", email="mtgu@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=updater.id, full_name="Meeting Updater"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
