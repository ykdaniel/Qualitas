"""Seed for the ITP business-review browser walkthrough (2026-09-23; isolated stack only — never run against a real DB).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <a script that serves the repo's vite.config.js> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_itp_review.py
    node ../react-app/tests-browser/itp-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: `test_itr_revoke_approval_acceptance.PW` (shared, isolated-only test constant,
not a real credential — same convention as every other seed script in this directory).

Accounts, EXACT permissions each holds:

    itp_editor    itp:view:all, itp:create:all, itp:update:all   — no itp:approve:all, no itp:void:all
                  (both of those codes are DORMANT — confirmed via grep, `routers/itp.py` never imports
                  or checks them on any route — so this account is, in practice, indistinguishable in
                  what it can DO from an account that does hold them; that gap is exactly what this
                  review script is set up to demonstrate on real screens, not just by reading code)
    itp_creator   itp:view:all, itp:create:all                    — cannot update an existing ITP at all
    itp_approver  itp:view:all, itp:create:all, itp:update:all,
                  itp:approve:all, itp:void:all                   — holds every ITP permission code that
                  exists; used as the "has the matching permission" comparison tier for the approve/void
                  gap re-check (round 2) — since those codes are dormant, this account is expected to
                  behave identically to itp_editor, which is itself the finding
    itp_viewer    itp:view:all only                                — no create/update at all; used as the
                  "missing even the basic permission" comparison tier
    checklist_v   itp:view:all, checklist:view:all                — used only to confirm the Checklist
                  generated from an ITP is visible/reachable to a plain checklist viewer
    itr_linker    itp:view:all, checklist:view:all, checklist:create:all,
                  itr:view:all, itr:create:all, itr:update:all    — used to trace whether an ITP-generated
                  Checklist can actually be linked into an ITR as a template (data-flow re-check, round 2)
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


editor = role("ItpEditor", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE])
creator = role("ItpCreator", [perms.ITP_VIEW, perms.ITP_CREATE])
approver = role("ItpApprover", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.ITP_APPROVE, perms.ITP_VOID])
viewer = role("ItpViewer", [perms.ITP_VIEW])
checklist_v = role("ItpChecklistViewer", [perms.ITP_VIEW, perms.CHECKLIST_VIEW])
itr_linker = role("ItpItrLinker", [perms.ITP_VIEW, perms.CHECKLIST_VIEW, perms.CHECKLIST_CREATE,
                                    perms.ITR_VIEW, perms.ITR_CREATE, perms.ITR_UPDATE])

d.add(models.Contractor(id="ITPR-V1", name="ITP Review Co", abbreviation="IRC"))
d.add(models.User(username="itp_editor", email="itpe@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=editor.id, full_name="ITP Editor"))
d.add(models.User(username="itp_creator", email="itpc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator.id, full_name="ITP Creator"))
d.add(models.User(username="itp_approver", email="itpa@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=approver.id, full_name="ITP Approver"))
d.add(models.User(username="itp_viewer", email="itpv@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=viewer.id, full_name="ITP Viewer"))
d.add(models.User(username="itp_checklist_v", email="itpcv@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=checklist_v.id, full_name="ITP Checklist Viewer"))
d.add(models.User(username="itp_itr_linker", email="itpil@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=itr_linker.id, full_name="ITP ITR Linker"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
