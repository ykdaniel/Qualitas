"""Seed for the PQP business-review browser walkthrough (2026-09-23; isolated stack only — never run against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_pqp_review.py
    node ../react-app/tests-browser/pqp-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Every account's password is `Accept-Test-1234` — the same shared, isolated-only test constant every
other seed script in this directory already uses; not a real credential.

Accounts, EXACT permissions each holds (nothing implied, nothing extra) — kept narrow on purpose so a
review can tell "this needed permission X" apart from "this account happened to also have Y":

    pqp_creator      pqp:view:all, pqp:create:all                         — the documented minimum for "create a PQP"
    pqp_creator_cv   pqp:view:all, pqp:create:all, contractors:view:all   — same, plus contractor visibility (see the
                                                                            round-22 review notes: the create form's
                                                                            required contractor picker needs this,
                                                                            which pqp_creator alone does not have —
                                                                            recorded as a pending permission-design
                                                                            question, not resolved by adding this
                                                                            account; it exists only so the rest of
                                                                            the walkthrough can proceed past create)
    pqp_editor       pqp:view:all, pqp:create:all, pqp:update:all         — no pqp:approve:all
    pqp_approver     pqp:view:all, pqp:create:all, pqp:update:all,
                     pqp:approve:all, pqp:delete:all

None of these accounts hold any permission for another module. `pqp_creator`/`pqp_editor` deliberately do NOT
hold `contractors:view:all` — that is the condition under review, not an oversight to fix here.
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


creator = role("PqpCreator", [perms.PQP_VIEW, perms.PQP_CREATE])
creator_with_contractor_view = role("PqpCreatorCV", [perms.PQP_VIEW, perms.PQP_CREATE, perms.CONTRACTOR_VIEW])
editor = role("PqpEditor", [perms.PQP_VIEW, perms.PQP_CREATE, perms.PQP_UPDATE])
approver = role("PqpApprover", [perms.PQP_VIEW, perms.PQP_CREATE, perms.PQP_UPDATE, perms.PQP_APPROVE, perms.PQP_DELETE])

d.add(models.Contractor(id="PQPR-V1", name="PQP Review Co", abbreviation="PRC"))
d.add(models.User(username="pqp_creator", email="pqpc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator.id, full_name="PQP Creator"))
d.add(models.User(username="pqp_creator_cv", email="pqpccv@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator_with_contractor_view.id, full_name="PQP Creator CV"))
d.add(models.User(username="pqp_editor", email="pqpe@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=editor.id, full_name="PQP Editor"))
d.add(models.User(username="pqp_approver", email="pqpa@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=approver.id, full_name="PQP Approver"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
