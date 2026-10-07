"""Seed for the ITP deferred-create review (2026-09-28; isolated stack only).

Covers this batch: ITP.tsx's "Add New" used to POST a blank record to the backend immediately on
button click (before the user typed anything), and every subsequent Save — including the very
first one — went through updateITP (PUT, gated on itp:update:all), meaning an itp:create:all-only
account could open the form but could NEVER actually complete a save (a confirmed create-only
dead end). Fixed by deferring the POST to the first real Save/Publish click; only that first save
uses addITP (POST, itp:create:all); every save after the record exists still requires
itp:update:all, unchanged. Cancelling before any Save now sends zero requests and creates nothing.
Approve/void authorization (services/itp_service.py, a separate prior batch), data scope, and
WorkflowEngine transition legality are entirely untouched by this batch.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_deferred_create_review.py
    node ../react-app/tests-browser/itp-deferred-create-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: Accept-Test-1234 (shared, isolated-only test constant).

Accounts, EXACT permissions each holds:

    itp_new_create_only    itp:view:all, itp:create:all, contractors:view:all (the last is NOT an
                            ITP permission — needed only so the Contractor <select> can populate;
                            disclosed, not folded silently into "create-only"). Scoped (via
                            UserProject) to IDC-P1 only (single project -> create auto-fills
                            project_id cleanly). No itp:update:all, no itp:approve:all/itp:void:all.
    itp_new_update_only     itp:view:all, itp:update:all, contractors:view:all (same disclosure).
                            Scoped to IDC-P1. No itp:create:all. Used to confirm this batch did NOT
                            grant update-only accounts any new ability to create.
    itp_new_full            itp:view:all, itp:create:all, itp:update:all, itp:approve:all,
                            itp:void:all, contractors:view:all. Scoped to IDC-P1. Used for the
                            existing-record edit/Publish/attachment-retry regression checks.
    itp_new_create_multiscope   itp:view:all, itp:create:all, contractors:view:all. Scoped to BOTH
                            IDC-P1 and IDC-P2 — used ONLY to provoke a REAL backend 403 on first
                            save (the form has no project picker, so a scoped-to-2-projects caller
                            can never supply project_id, and core/scope.py's enforce_create_scope
                            requires it whenever it can't auto-fill) — not used for any other
                            assertion. Mirrors the same structural gap already flagged for FAT.
    itp_new_create_approve  itp:view:all, itp:create:all, itp:approve:all, contractors:view:all.
                            Scoped to IDC-P1. Deliberately NO itp:update:all — used to verify the
                            ACTUAL Publish path for a brand-new (never-saved) record: since the
                            first save now goes through addITP (POST), Publish on a NEW record
                            should only require itp:create:all + itp:approve:all, never
                            itp:update:all. Also used to confirm Publish is correctly UNAVAILABLE
                            on an EXISTING record without itp:update:all.
"""
import sys, os, json
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models
from core import perms
from core.security import get_password_hash

PW = "Accept-Test-1234"
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


create_only = role("ItpDcCreateOnly", [perms.ITP_VIEW, perms.ITP_CREATE, perms.CONTRACTOR_VIEW])
update_only = role("ItpDcUpdateOnly", [perms.ITP_VIEW, perms.ITP_UPDATE, perms.CONTRACTOR_VIEW])
full = role("ItpDcFull", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.ITP_APPROVE, perms.ITP_VOID, perms.CONTRACTOR_VIEW])
create_multiscope = role("ItpDcCreateMultiscope", [perms.ITP_VIEW, perms.ITP_CREATE, perms.CONTRACTOR_VIEW])
create_approve = role("ItpDcCreateApprove", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_APPROVE, perms.CONTRACTOR_VIEW])

d.add(models.Contractor(id="IDC-V1", name="ITP DeferredCreate Review Co", abbreviation="IDC"))
d.add(models.Project(id="IDC-P1", name="ITP DeferredCreate Review Project 1"))
d.add(models.Project(id="IDC-P2", name="ITP DeferredCreate Review Project 2"))

create_only_user = models.User(username="itp_new_create_only", email="idcc@example.com", is_active=True,
                                hashed_password=get_password_hash(PW), role_id=create_only.id, full_name="ITP DC Create Only")
update_only_user = models.User(username="itp_new_update_only", email="idcu@example.com", is_active=True,
                                hashed_password=get_password_hash(PW), role_id=update_only.id, full_name="ITP DC Update Only")
full_user = models.User(username="itp_new_full", email="idcf@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full.id, full_name="ITP DC Full")
multiscope_user = models.User(username="itp_new_create_multiscope", email="idcm@example.com", is_active=True,
                               hashed_password=get_password_hash(PW), role_id=create_multiscope.id, full_name="ITP DC Create Multiscope")
create_approve_user = models.User(username="itp_new_create_approve", email="idca@example.com", is_active=True,
                                   hashed_password=get_password_hash(PW), role_id=create_approve.id, full_name="ITP DC Create Approve")
d.add(create_only_user)
d.add(update_only_user)
d.add(full_user)
d.add(multiscope_user)
d.add(create_approve_user)
d.commit()

d.add(models.UserProject(user_id=create_only_user.id, project_id="IDC-P1"))
d.add(models.UserProject(user_id=update_only_user.id, project_id="IDC-P1"))
d.add(models.UserProject(user_id=full_user.id, project_id="IDC-P1"))
d.add(models.UserProject(user_id=multiscope_user.id, project_id="IDC-P1"))
d.add(models.UserProject(user_id=multiscope_user.id, project_id="IDC-P2"))
d.add(models.UserProject(user_id=create_approve_user.id, project_id="IDC-P1"))
d.commit()

# Existing ITP for the edit/Publish/attachment regression checks (itp_new_full).
d.add(models.ITP(id="idc-itp-existing", project_id="IDC-P1", vendor_id="IDC-V1", referenceNo="QTS-IDC-ITP-000001",
                  description="Existing ITP for regression checks", rev="Rev1.0", submit="", status="Pending",
                  submissionDate="2026-09-28"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
