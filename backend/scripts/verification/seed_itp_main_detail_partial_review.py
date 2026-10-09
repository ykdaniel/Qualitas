"""Seed for the ITP main-succeeds/detail-fails save-outcome review (2026-09-28; isolated stack
only). Covers: on an EXISTING record's update, PUT /itp/{id}/ (main fields) succeeding while the
follow-up PUT /itp/{id}/detail fails must be reported distinctly ("main saved, plan not saved"),
must keep the modal/inputs/pending attachment queue intact, and a retry (with or without further
edits) must complete the detail write and save the latest content — not just show a generic
"save failed" toast that implies nothing was saved.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_main_detail_partial_review.py
    node ../react-app/tests-browser/itp-main-detail-partial-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: Accept-Test-1234 (shared, isolated-only test constant).

Accounts, EXACT permissions each holds:

    itp_mdp_full   itp:view:all, itp:create:all, itp:update:all, itp:approve:all, itp:void:all,
                   contractors:view:all. Scoped to IMD-P1. Used for every scenario — this batch is
                   about save-outcome presentation/retry, not authorization, so a single
                   fully-permissioned account is enough (no permission-boundary case to cover
                   here).
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


full = role("ImdpFull", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.ITP_APPROVE, perms.ITP_VOID, perms.CONTRACTOR_VIEW])

d.add(models.Contractor(id="IMD-V1", name="ITP MainDetailPartial Review Co", abbreviation="IMD"))
d.add(models.Project(id="IMD-P1", name="ITP MainDetailPartial Review Project 1"))

full_user = models.User(username="itp_mdp_full", email="imdf@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full.id, full_name="ITP MDP Full")
d.add(full_user)
d.commit()
d.add(models.UserProject(user_id=full_user.id, project_id="IMD-P1"))
d.commit()


def itp(id_, ref_suffix, desc):
    return models.ITP(id=id_, project_id="IMD-P1", vendor_id="IMD-V1", referenceNo=f"QTS-IMD-ITP-{ref_suffix}",
                       description=desc, rev="Rev1.0", submit="", status="Pending", submissionDate="2026-09-28")


d.add(itp("imd-itp-baseline-fail", "000001", "Baseline detail-fail scenario"))
d.add(itp("imd-itp-edit-before-retry", "000002", "Edit-before-retry scenario"))
d.add(itp("imd-itp-attachment-untouched", "000003", "Attachment-untouched-on-detail-fail scenario"))
d.add(itp("imd-itp-clean-success", "000004", "Clean full-success regression"))
d.add(itp("imd-itp-confirmed-rejection", "000005", "Confirmed-rejection wording scenario"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
