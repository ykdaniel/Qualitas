"""Seed for the internal Audit business-review browser walkthrough (2026-09-24; isolated stack only —
never run against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_audit_review.py
    node ../react-app/tests-browser/audit-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    audit_creator  audit:view:all, audit:create:all — no update/delete
    audit_updater  audit_creator's permissions + audit:update:all
    audit_deleter  audit_updater's permissions + audit:delete:all

WorkflowEngine.TRANSITIONS["Audit"]: Draft->{Planned,Void}, Planned->{In Progress,Draft,Void},
In Progress->{Completed,Void}, Completed->{Closed,In Progress,Void}, Closed->[] (terminal, no path out
at all — same shape as FollowUp), Void->[] (terminal). delete_audit only allows status=='Void'
(services/audit_service.py) — same "Please Void first, then delete" wording as FollowUp, so the same
operational-contradiction question applies: can a genuinely Closed Audit ever reach Void?
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


creator = role("AuditCreator", [perms.AUDIT_VIEW, perms.AUDIT_CREATE])
updater = role("AuditUpdater", [perms.AUDIT_VIEW, perms.AUDIT_CREATE, perms.AUDIT_UPDATE])
deleter = role("AuditDeleter", [perms.AUDIT_VIEW, perms.AUDIT_CREATE, perms.AUDIT_UPDATE, perms.AUDIT_DELETE])

d.add(models.User(username="audit_creator", email="audc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator.id, full_name="Audit Creator"))
d.add(models.User(username="audit_updater", email="audu@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=updater.id, full_name="Audit Updater"))
d.add(models.User(username="audit_deleter", email="audd@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=deleter.id, full_name="Audit Deleter"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
