"""Seed for the FAT DETAIL-modal save-failure review (2026-09-28; isolated stack only).

Scope: this batch covers ONLY FATDetailModal (the "檢驗明細/Details" table modal opened via
handleAddDetails), not the main FATEditModal (already fixed in the prior batch) and not the
multi-project create gap (already flagged, deliberately not fixed).

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_fat_detail_save_failure_review.py
    node ../react-app/tests-browser/fat-detail-save-failure-review.mjs stack.json [--baseline]
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: Accept-Test-1234 (shared, isolated-only test constant).

Accounts, EXACT permissions each holds:

    fat_detail_updater   fat:view:all, fat:update:all, contractors:view:all (the last is NOT a FAT
                          permission — same disclosure as the prior batch's seeds: needed only so
                          FATEditModal's own Supplier <select> can populate, unrelated to this
                          batch's actual assertions). Scoped (via UserProject) to FDS-P1.
    fat_detail_viewer    fat:view:all only. No update. Used for the "no update permission -> still
                          rejected" regression check on the details PUT.
    fat_detail_deleter   fat:view:all, fat:delete:all. Scoped to FDS-P1. Setup-only helper: performs
                          a genuinely concurrent DELETE of the underlying FAT row in scenario testing
                          a REAL backend rejection of a details save (not used for any delete
                          assertion itself).
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


updater_role = role("FatDsUpdater", [perms.FAT_VIEW, perms.FAT_UPDATE, perms.CONTRACTOR_VIEW])
viewer_role = role("FatDsViewer", [perms.FAT_VIEW])
deleter_role = role("FatDsDeleter", [perms.FAT_VIEW, perms.FAT_DELETE])

d.add(models.Contractor(id="FDS-V1", name="FAT DetailSave Review Co", abbreviation="FDS"))
d.add(models.Project(id="FDS-P1", name="FAT DetailSave Review Project 1"))

updater_user = models.User(username="fat_detail_updater", email="fdsu@example.com", is_active=True,
                            hashed_password=get_password_hash(PW), role_id=updater_role.id, full_name="FAT Detail Updater")
viewer_user = models.User(username="fat_detail_viewer", email="fdsv@example.com", is_active=True,
                           hashed_password=get_password_hash(PW), role_id=viewer_role.id, full_name="FAT Detail Viewer")
deleter_user = models.User(username="fat_detail_deleter", email="fdsd@example.com", is_active=True,
                            hashed_password=get_password_hash(PW), role_id=deleter_role.id, full_name="FAT Detail Deleter")
d.add(updater_user)
d.add(viewer_user)
d.add(deleter_user)
d.commit()

d.add(models.UserProject(user_id=updater_user.id, project_id="FDS-P1"))
d.add(models.UserProject(user_id=viewer_user.id, project_id="FDS-P1"))
d.add(models.UserProject(user_id=deleter_user.id, project_id="FDS-P1"))
d.commit()


def fat(id_, equipment, detail_data=None):
    return models.FAT(id=id_, project_id="FDS-P1", vendor_id="FDS-V1", equipment=equipment,
                       startDate="2026-09-28", endDate="2026-09-29", status="Scheduled",
                       detail_data=json.dumps(detail_data) if detail_data is not None else None,
                       hasDetails=bool(detail_data))


SEED_DETAIL = [{
    "id": "1", "sNo": "1", "itemName": "Seed item", "specification": "spec-1", "qty": "1",
    "unit": "pcs", "acceptanceCriteria": "criteria-1", "fatActualValue": "", "fatJudgment": "",
    "remarks": "",
}]

d.add(fat("fds-fat-baseline", "Baseline repro FAT", SEED_DETAIL))
d.add(fat("fds-fat-network", "Details-network-test FAT", SEED_DETAIL))
d.add(fat("fds-fat-500", "Details-500-test FAT", SEED_DETAIL))
d.add(fat("fds-fat-404", "Details-404-test FAT", SEED_DETAIL))
d.add(fat("fds-fat-permission", "Details-permission-test FAT", SEED_DETAIL))
d.add(fat("fds-fat-success", "Details-success-path FAT", SEED_DETAIL))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
