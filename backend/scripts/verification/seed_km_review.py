"""Seed for the KM (Knowledge Base) business-review browser walkthrough (2026-09-24; isolated stack
only — never run against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_km_review.py
    node ../react-app/tests-browser/km-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `Accept-Test-1234` (shared, isolated-only test constant, not a real
credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    km_viewer   km:view:all only — no create/update/delete
    km_editor   km:view:all, km:create:all, km:update:all — no delete

KM has no status/workflow — it is a wiki-style article system with per-chapter optimistic locking via
`version_no` (repositories/km_repository.py::update — a stale version_no raises ValueError, which
services/km_service.py::update_article converts to HTTP 409). No WorkflowEngine entry exists for KM.
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


viewer = role("KmViewer", [perms.KM_VIEW])
editor = role("KmEditor", [perms.KM_VIEW, perms.KM_CREATE, perms.KM_UPDATE])

d.add(models.User(username="km_viewer", email="kmv@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=viewer.id, full_name="KM Viewer"))
d.add(models.User(username="km_editor", email="kme@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=editor.id, full_name="KM Editor"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
