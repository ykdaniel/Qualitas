"""Seed for the IAM Data Scope partial-load-failure review (2026-09-28; isolated stack only).

Reproduces and covers the fix for a confirmed defect: UserScopeSection.tsx used
`Promise.all([getProjects(), getContractors()])` — since Promise.all rejects atomically, an
account with iam:user:manage but NOT contractors:view:all got a 403 on GET /contractors/, which
threw away the ALREADY-SUCCESSFUL getProjects() result too, and skipped getUserScope() entirely.
`selected`/`vendorId` were left at their EMPTY initial state (never populated from the real
scope), so an admin who only meant to toggle a project checkbox and click Save would submit
`vendor_id: null` — silently wiping the user's real contractor assignment, because
PUT /iam/users/{id}/scope (routers/iam.py::set_user_scope) always REPLACES both fields (confirmed:
no partial/merge semantics exist in this API — schemas.UserScope requires both, and
services/user_service.py::set_user_scope fully replaces the UserProject rows and User.vendor_id
column every call). Fixed by loading projects/contractors/existing-scope independently
(Promise.allSettled) and disabling Save outright when the existing scope itself failed to load.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_iam_scope_partial_load_review.py
    node ../react-app/tests-browser/iam-scope-partial-load-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: Accept-Test-1234 (shared, isolated-only test constant).

Accounts, EXACT permissions each holds:

    iam_mgr_no_contractor   iam:user:view, iam:user:manage, iam:role:view. Deliberately NO
                            contractors:view:all — the account that reproduces the real backend
                            403 on GET /contractors/ used throughout this review.
    iam_mgr_full            iam:user:view, iam:user:manage, iam:role:view, contractors:view:all —
                            full IAM admin, used for the "permission-complete account's existing
                            operations still work" regression check.
    iam_viewer_only         iam:user:view, iam:role:view only (no iam:user:manage) — used to
                            confirm the backend still rejects PUT /iam/users/{id}/scope without
                            manage permission, regardless of this frontend fix.

Target users whose scope is read/written during the review (not IAM accounts themselves):

    scope_target_with_vendor   pre-seeded scope: projects=[ISP-P1], vendor_id=ISP-V1 (a REAL,
                                non-empty baseline — used for "originally HAS a contractor").
    scope_target_no_vendor     pre-seeded scope: projects=[ISP-P1], vendor_id=None — used for
                                "originally has NO contractor" (must stay None, not get coerced to
                                empty-string-vs-null confusion or accidentally assigned one).
    scope_target_two_projects  pre-seeded scope: projects=[ISP-P1, ISP-P2], vendor_id=None — used
                                for: getProjects() fails, getUserScope() succeeds, admin changes
                                ONLY the contractor and saves; both original project_ids must
                                still be sent/persisted, not silently dropped to [].
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


mgr_no_contractor_role = role("IspMgrNoContractor", [perms.USER_VIEW, perms.USER_MANAGE, perms.ROLE_VIEW])
mgr_full_role = role("IspMgrFull", [perms.USER_VIEW, perms.USER_MANAGE, perms.ROLE_VIEW, perms.CONTRACTOR_VIEW])
viewer_role = role("IspViewerOnly", [perms.USER_VIEW, perms.ROLE_VIEW])
target_role = role("IspTargetUser", [])

d.add(models.Project(id="ISP-P1", name="IAM ScopePartial Review Project 1"))
d.add(models.Project(id="ISP-P2", name="IAM ScopePartial Review Project 2"))
d.add(models.Contractor(id="ISP-V1", name="IAM ScopePartial Review Vendor", abbreviation="ISPV"))

d.add(models.User(username="iam_mgr_no_contractor", email="ispmnc@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=mgr_no_contractor_role.id, full_name="ISP Mgr No Contractor"))
d.add(models.User(username="iam_mgr_full", email="ispmf@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=mgr_full_role.id, full_name="ISP Mgr Full"))
d.add(models.User(username="iam_viewer_only", email="ispvo@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=viewer_role.id, full_name="ISP Viewer Only"))

target_with_vendor = models.User(username="scope_target_with_vendor", email="istwv@example.com", is_active=True,
                                  hashed_password=get_password_hash(PW), role_id=target_role.id, full_name="Scope Target With Vendor",
                                  vendor_id="ISP-V1")
target_no_vendor = models.User(username="scope_target_no_vendor", email="istnv@example.com", is_active=True,
                                hashed_password=get_password_hash(PW), role_id=target_role.id, full_name="Scope Target No Vendor")
target_two_projects = models.User(username="scope_target_two_projects", email="isttp@example.com", is_active=True,
                                   hashed_password=get_password_hash(PW), role_id=target_role.id, full_name="Scope Target Two Projects")
d.add(target_with_vendor)
d.add(target_no_vendor)
d.add(target_two_projects)
d.commit()

d.add(models.UserProject(user_id=target_with_vendor.id, project_id="ISP-P1"))
d.add(models.UserProject(user_id=target_no_vendor.id, project_id="ISP-P1"))
d.add(models.UserProject(user_id=target_two_projects.id, project_id="ISP-P1"))
d.add(models.UserProject(user_id=target_two_projects.id, project_id="ISP-P2"))
d.commit()

result = {"ok": True, "target_with_vendor_id": target_with_vendor.id, "target_no_vendor_id": target_no_vendor.id, "target_two_projects_id": target_two_projects.id}
d.close()
print("SEED " + json.dumps(result))
