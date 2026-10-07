"""Seed for the FAT save-failure review (2026-09-28; isolated stack only).

Covers this batch: FATEditModal's create/update save flow used to close the modal and discard the
user's input on ANY failure (network drop, 500, a genuine backend rejection) — traced to
FAT.tsx::handleSaveFATDetails swallowing its own try/catch without rethrowing, which made the
child's `await onSave(...); onClose()` always reach onClose() regardless of success. Fixed by
letting the error propagate and only calling onClose() after a successful await — see
services/... NO backend change; this is a frontend-only fix (FAT.tsx). This seed supports testing
three DISTINCT create-failure and three DISTINCT update-failure scenarios: a Playwright-intercepted
aborted request (network interruption), a Playwright-intercepted HTTP 500 (simulated server
failure), and a REAL, reproducible backend rejection that the real backend actually returns without
any interception:

  - CREATE real rejection: fat_create_multiscope is scoped (via UserProject) to TWO projects
    (FCU-P1 and FCU-P2). FATEditModal's form has no project picker, so a create request never
    includes project_id. core/scope.py::enforce_create_scope requires an explicit project_id
    whenever a scoped caller belongs to more than one project ("ambiguous — can't auto-fill") and
    raises ScopeForbidden -> a real 403 from the real backend, with no interception needed. This is
    a genuine, pre-existing structural gap (a multi-project-scoped user cannot create a FAT via this
    form at all) — informational only, NOT fixed in this batch (would need a project-picker field
    added to the form, out of scope for "fix the close/lose-input bug").
  - UPDATE real rejection: the target row is deleted via a direct API call between opening the edit
    modal and clicking Save (simulating a genuinely concurrent delete by another user) — the
    backend's real 404 "FAT not found" path (service returns None because record_in_scope's own
    get_by_id no longer finds the row) is then hit for real when Save is clicked.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_fat_save_failure_review.py
    node ../react-app/tests-browser/fat-save-failure-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: Accept-Test-1234 (shared, isolated-only test constant).

Accounts, EXACT permissions each holds:

    fat_create_only        fat:view:all, fat:create:all, contractors:view:all (the last one is NOT
                            a FAT permission — needed only for the Supplier <select> to populate;
                            disclosed, not silently folded into "create-only"). Scoped to FCU-P1
                            only (single project -> auto-fills cleanly, used for the
                            network/500-intercepted create-failure tests and the create/update
                            permission regression check). No fat:update:all.
    fat_update_only         fat:view:all, fat:update:all, contractors:view:all (same disclosure).
                            Scoped to FCU-P1 only. No fat:create:all. Used for the
                            network/500/real-404 update-failure tests and the regression check.
    fat_create_multiscope   fat:view:all, fat:create:all, contractors:view:all. Scoped to BOTH
                            FCU-P1 and FCU-P2 — used ONLY to provoke the real backend 403 described
                            above; not used for any other assertion.
    fat_delete_helper       fat:view:all, fat:delete:all. Scoped to FSF-P1. Setup-only: performs the
                            concurrent DELETE in scenario 6, simulating a different actor deleting
                            the record while fat_update_only has it open for editing. Not used for
                            any assertion about delete itself (delete permission is untouched,
                            out of this batch's scope).
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


create_only = role("FatSfCreateOnly", [perms.FAT_VIEW, perms.FAT_CREATE, perms.CONTRACTOR_VIEW])
update_only = role("FatSfUpdateOnly", [perms.FAT_VIEW, perms.FAT_UPDATE, perms.CONTRACTOR_VIEW])
create_multiscope = role("FatSfCreateMultiscope", [perms.FAT_VIEW, perms.FAT_CREATE, perms.CONTRACTOR_VIEW])
# Setup-only helper for scenario 6 (simulating a delete by a DIFFERENT, concurrent actor) — not
# used for any assertion itself, only to perform the concurrent DELETE.
delete_helper = role("FatSfDeleteHelper", [perms.FAT_VIEW, perms.FAT_DELETE])

d.add(models.Contractor(id="FSF-V1", name="FAT SaveFail Review Co", abbreviation="FSF"))
d.add(models.Project(id="FSF-P1", name="FAT SaveFail Review Project 1"))
d.add(models.Project(id="FSF-P2", name="FAT SaveFail Review Project 2"))

create_only_user = models.User(username="fat_create_only", email="fsfc@example.com", is_active=True,
                                hashed_password=get_password_hash(PW), role_id=create_only.id, full_name="FAT SF Create Only")
update_only_user = models.User(username="fat_update_only", email="fsfu@example.com", is_active=True,
                                hashed_password=get_password_hash(PW), role_id=update_only.id, full_name="FAT SF Update Only")
multiscope_user = models.User(username="fat_create_multiscope", email="fsfm@example.com", is_active=True,
                               hashed_password=get_password_hash(PW), role_id=create_multiscope.id, full_name="FAT SF Create Multiscope")
delete_helper_user = models.User(username="fat_delete_helper", email="fsfd@example.com", is_active=True,
                                  hashed_password=get_password_hash(PW), role_id=delete_helper.id, full_name="FAT SF Delete Helper")
d.add(create_only_user)
d.add(update_only_user)
d.add(multiscope_user)
d.add(delete_helper_user)
d.commit()

d.add(models.UserProject(user_id=create_only_user.id, project_id="FSF-P1"))
d.add(models.UserProject(user_id=update_only_user.id, project_id="FSF-P1"))
d.add(models.UserProject(user_id=multiscope_user.id, project_id="FSF-P1"))
d.add(models.UserProject(user_id=multiscope_user.id, project_id="FSF-P2"))
d.add(models.UserProject(user_id=delete_helper_user.id, project_id="FSF-P1"))
d.commit()

# schemas.FAT (the read/response model) requires startDate/endDate as non-null strings.
def fat(id_, equipment):
    return models.FAT(id=id_, project_id="FSF-P1", vendor_id="FSF-V1", equipment=equipment,
                       startDate="2026-09-28", endDate="2026-09-29", status="Scheduled")

d.add(fat("fsf-fat-update-network", "Update-network-test FAT"))
d.add(fat("fsf-fat-update-500", "Update-500-test FAT"))
d.add(fat("fsf-fat-update-404", "Update-404-test FAT"))
d.add(fat("fsf-fat-update-only-regression", "Update-only regression FAT"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
