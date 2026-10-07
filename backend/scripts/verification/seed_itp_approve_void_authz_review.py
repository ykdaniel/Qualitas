"""Seed for the ITP Approve/Void authorization gate review (2026-09-28; isolated stack only).
Covers the batch: create/update entering Approved or Void now requires itp:approve:all /
itp:void:all IN ADDITION to itp:create:all / itp:update:all, checked from the caller's actual
permission codes (never role name), enforced in services/itp_service.py with the router passing
in a trusted permission set.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_approve_void_authz_review.py
    node ../react-app/tests-browser/itp-approve-void-authz-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: Accept-Test-1234 (shared, isolated-only test constant).

Accounts, EXACT permissions each holds:

    itp_basic_only    itp:view:all, itp:create:all, itp:update:all
                       — has the basic create/update permission checked at the router level, but
                       NOT itp:approve:all/itp:void:all — this is the confirmed-bypassable account
                       from the earlier review; now expected to be blocked by the service-layer gate.
    itp_approve_only   itp:view:all, itp:approve:all, itp:void:all
                       — the REVERSE gap: holds approve/void but NOT the basic create/update the
                       router's RoleChecker(ITP_CREATE)/RoleChecker(ITP_UPDATE) demands to reach the
                       endpoint at all — should be blocked at the router dependency, never even
                       reaching the service's own check.
    itp_full           itp:view:all, itp:create:all, itp:update:all, itp:approve:all, itp:void:all
                       — the legitimate, fully-permissioned account.
    itp_other_project  same as itp_full, but scoped to a DIFFERENT project than the seeded ITP
                       records — used to confirm scope is still enforced independently of this
                       new permission gate (a fully-permissioned but out-of-scope account must
                       still be blocked, by the existing P0 scope mechanism, unrelated to this fix).
    itp_scoped_basic   itp:view:all, itp:create:all, itp:update:all — scoped (via UserProject) to
                       IAZ-P1 only, NO approve/void. Unlike itp_basic_only (which holds no
                       UserProject row at all and is therefore UNRESTRICTED per compute_scope's
                       "nothing configured -> unscoped" rule), this account lets us test whether a
                       caller missing itp:approve:all/itp:void:all can distinguish "record doesn't
                       exist" from "record exists but is out of my scope" via this permission gate
                       — both must come back identically (404, not a different 403) since
                       record_in_scope is checked before the permission gate runs.
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
        d.flush()
    return p


def role(name, codes):
    r = models.Role(name=name)
    r.permissions_rel = [_get_or_create_perm(d, c) for c in codes]
    d.add(r)
    d.flush()
    return r


basic_only = role("ItpAuthzBasicOnly", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE])
approve_only = role("ItpAuthzApproveOnly", [perms.ITP_VIEW, perms.ITP_APPROVE, perms.ITP_VOID])
full = role("ItpAuthzFull", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.ITP_APPROVE, perms.ITP_VOID])
other_project_role = role("ItpAuthzOtherProject", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.ITP_APPROVE, perms.ITP_VOID])
scoped_basic_role = role("ItpAuthzScopedBasic", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE])

d.add(models.Contractor(id="IAZ-V1", name="ITP Authz Review Co", abbreviation="IAZ"))
d.add(models.Project(id="IAZ-P1", name="ITP Authz Review Project 1"))
d.add(models.Project(id="IAZ-P2", name="ITP Authz Review Project 2 (other)"))

d.add(models.User(username="itp_basic_only", email="iazbo@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=basic_only.id, full_name="ITP Authz Basic Only"))
d.add(models.User(username="itp_approve_only", email="iazao@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=approve_only.id, full_name="ITP Authz Approve Only"))
d.add(models.User(username="itp_full", email="iazf@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=full.id, full_name="ITP Authz Full"))
d.commit()

full_user_id = d.query(models.User).filter_by(username="itp_full").first().id
d.add(models.UserProject(user_id=full_user_id, project_id="IAZ-P1"))

other_project_user = models.User(username="itp_other_project", email="iazop@example.com", is_active=True,
                                  hashed_password=get_password_hash(PW), role_id=other_project_role.id, full_name="ITP Authz Other Project")
d.add(other_project_user)
scoped_basic_user = models.User(username="itp_scoped_basic", email="iazsb@example.com", is_active=True,
                                 hashed_password=get_password_hash(PW), role_id=scoped_basic_role.id, full_name="ITP Authz Scoped Basic")
d.add(scoped_basic_user)
d.commit()
d.add(models.UserProject(user_id=other_project_user.id, project_id="IAZ-P2"))
d.add(models.UserProject(user_id=scoped_basic_user.id, project_id="IAZ-P1"))
d.commit()

# ITP records, all in IAZ-P1, various starting statuses for entering/leaving transition tests.
d.add(models.ITP(id="iaz-itp-pending", project_id="IAZ-P1", vendor_id="IAZ-V1", referenceNo="QTS-IAZ-ITP-000001",
                  description="Pending ITP for entry tests", rev="Rev1.0", submit="", status="Pending",
                  submissionDate="2026-09-28"))
d.add(models.ITP(id="iaz-itp-approved", project_id="IAZ-P1", vendor_id="IAZ-V1", referenceNo="QTS-IAZ-ITP-000002",
                  description="Already-Approved ITP for leaving/lateral tests", rev="Rev1.0", submit="", status="Approved",
                  submissionDate="2026-09-28"))
d.add(models.ITP(id="iaz-itp-void", project_id="IAZ-P1", vendor_id="IAZ-V1", referenceNo="QTS-IAZ-ITP-000003",
                  description="Already-Void ITP (terminal, no legal transitions out)", rev="Rev1.0", submit="", status="Void",
                  submissionDate="2026-09-28"))
# Out-of-scope target for itp_scoped_basic (which sees only IAZ-P1) — used together with a
# nonexistent id to confirm a missing-approve/void caller gets an IDENTICAL response (404) for
# "doesn't exist" and "exists but out of my scope", never a differently-worded 403 that would
# leak the record's existence.
d.add(models.ITP(id="iaz-itp-p2-pending", project_id="IAZ-P2", vendor_id="IAZ-V1", referenceNo="QTS-IAZ-ITP-000004",
                  description="Pending ITP in the OTHER project (out of itp_scoped_basic's scope)", rev="Rev1.0", submit="",
                  status="Pending", submissionDate="2026-09-28"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
