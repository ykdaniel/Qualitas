"""Seed for the FAT new/edit-form authorization review (2026-09-28; isolated stack only).

Covers this batch: FAT.tsx's edit modal used a single `canEdit = hasPermission('fat:update:all')`
flag for BOTH the "new record" form and the "edit existing record" form. A create-only account
(fat:create:all, no fat:update:all) therefore got `readOnly=true` on the brand-new blank record
too, disabling every field — the very bug this batch reproduces before fixing. The fix splits this
into `canCreate = hasPermission('fat:create:all')` (new record) vs `canEdit` (existing record).
Backend (routers/fat.py, services/fat_service.py) is untouched — already correctly gates POST on
fat:create:all and PUT on fat:update:all at the router level, with scope enforced the same way
every other module does (enforce_create_scope/enforce_update_scope/record_in_scope) — confirmed by
reading both files in full, not modified here.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_fat_create_update_authz_review.py
    node ../react-app/tests-browser/fat-create-update-authz-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: Accept-Test-1234 (shared, isolated-only test constant).

Accounts, EXACT permissions each holds (never call an account "create-only" if it also holds an
unrelated cross-module permission without saying so):

    fat_view_only     fat:view:all only. No create, no update.
    fat_create_only   fat:view:all, fat:create:all, contractors:view:all. The contractors:view:all
                      grant is NOT a FAT permission — it is required only so the Supplier <select>
                      in the form can populate its options at all (FATEditModal calls
                      useContractorsStore().getActiveContractors(), which is fetched separately
                      from a contractors:view:all-gated endpoint); this account is NOT being
                      called "create-only" without this disclosure. Scoped (via UserProject) to
                      project FCU-P1. No fat:update:all.
    fat_update_only   fat:view:all, fat:update:all, contractors:view:all (same disclosure as
                      above). Scoped to FCU-P1. No fat:create:all.
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


view_only = role("FatCuaViewOnly", [perms.FAT_VIEW])
create_only = role("FatCuaCreateOnly", [perms.FAT_VIEW, perms.FAT_CREATE, perms.CONTRACTOR_VIEW])
update_only = role("FatCuaUpdateOnly", [perms.FAT_VIEW, perms.FAT_UPDATE, perms.CONTRACTOR_VIEW])

d.add(models.Contractor(id="FCU-V1", name="FAT CUA Review Co", abbreviation="FCU"))
d.add(models.Project(id="FCU-P1", name="FAT CUA Review Project 1"))
d.add(models.Project(id="FCU-P2", name="FAT CUA Review Project 2 (other)"))

d.add(models.User(username="fat_view_only", email="fcuv@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=view_only.id, full_name="FAT CUA View Only"))
create_only_user = models.User(username="fat_create_only", email="fcuc@example.com", is_active=True,
                                hashed_password=get_password_hash(PW), role_id=create_only.id, full_name="FAT CUA Create Only")
update_only_user = models.User(username="fat_update_only", email="fcuu@example.com", is_active=True,
                                hashed_password=get_password_hash(PW), role_id=update_only.id, full_name="FAT CUA Update Only")
d.add(create_only_user)
d.add(update_only_user)
d.commit()

d.add(models.UserProject(user_id=create_only_user.id, project_id="FCU-P1"))
d.add(models.UserProject(user_id=update_only_user.id, project_id="FCU-P1"))
d.commit()

# In-scope FAT for fat_update_only to edit; out-of-scope FAT (FCU-P2) to confirm scope is still
# enforced independently of this batch's fix.
# schemas.FAT (the read/response model) requires startDate/endDate as non-null strings — must be
# populated here even though this batch never touches them, or GET /api/fat/ 500s on serialization.
d.add(models.FAT(id="fcu-fat-inscope", project_id="FCU-P1", vendor_id="FCU-V1", equipment="In-scope FAT for edit test",
                  startDate="2026-09-28", endDate="2026-09-29", status="Scheduled"))
d.add(models.FAT(id="fcu-fat-outofscope", project_id="FCU-P2", vendor_id="FCU-V1", equipment="Out-of-scope FAT (FCU-P2)",
                  startDate="2026-09-28", endDate="2026-09-29", status="Scheduled"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
