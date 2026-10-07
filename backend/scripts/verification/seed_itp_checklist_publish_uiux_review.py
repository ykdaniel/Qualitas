"""Seed for the ITP "Generate Checklist" permission-gating + Publish ConfirmModal UI/UX batch
(2026-09-28; isolated stack only).

Covers two of the four UI/UX findings from a real isolated-browser walkthrough of
"create ITP -> write inspection plan -> approve -> generate checklist template":

  1. The Generate Checklist button ignored checklist:create:all entirely — a user without it
     could still click it and get a raw backend permission-code string
     ("Operation not permitted. Required: checklist:create:all") surfaced verbatim in a toast.
  2. Publish used window.confirm() with a generic message that never showed the actual target
     revision/status, and could not distinguish a genuine publish from a retry that was really
     just finishing a stalled attachment upload.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <vite_multi.mjs> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_checklist_publish_uiux_review.py
    node ../react-app/tests-browser/itp-checklist-publish-uiux-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: Accept-Test-1234 (shared, isolated-only test constant).

Accounts, EXACT permissions each holds:

    icp_full     itp:view:all, itp:create:all, itp:update:all, itp:approve:all, itp:void:all,
                 checklist:create:all, contractors:view:all. Scoped to ICP-P1. Used for the
                 button-visible / generate-success / Publish-confirm-variant scenarios.
    icp_nockl    Same ITP permissions as icp_full, but deliberately NO checklist:create:all —
                 used to confirm the Generate Checklist button is hidden entirely (not merely
                 disabled) for this account.

Records:

    icp-itp-with-items    status=Pending, rev=Rev1.0, has 1 saved inspection-plan item already
                           (detail_data pre-populated) — used for: (a) icp_nockl's hidden-button
                           check, (b) icp_full's real Generate Checklist success case, (c) the
                           mid-operation permission-loss case (this exact record is reused, and
                           the test script revokes checklist:create:all from icp_full's role via
                           a direct DB write between page-load and the click, to produce a REAL
                           403 from the actual backend — not a simulated network failure).
    icp-itp-existing-rev  status=Pending, rev=Rev1.0, no items — used for the Publish-confirm
                           "existing record" wording variant (fromRev/toRev shown correctly).
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


ITP_PERMS = [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.ITP_APPROVE, perms.ITP_VOID, perms.CONTRACTOR_VIEW]

full = role("IcpFull", ITP_PERMS + [perms.CHECKLIST_CREATE])
nockl = role("IcpNoChecklist", ITP_PERMS)

d.add(models.Contractor(id="ICP-V1", name="ITP Checklist/Publish UIUX Review Co", abbreviation="ICP"))
d.add(models.Project(id="ICP-P1", name="ITP Checklist/Publish UIUX Review Project 1"))

full_user = models.User(username="icp_full", email="icpf@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full.id, full_name="ICP Full")
nockl_user = models.User(username="icp_nockl", email="icpn@example.com", is_active=True,
                          hashed_password=get_password_hash(PW), role_id=nockl.id, full_name="ICP No Checklist Create")
d.add(full_user)
d.add(nockl_user)
d.commit()

d.add(models.UserProject(user_id=full_user.id, project_id="ICP-P1"))
d.add(models.UserProject(user_id=nockl_user.id, project_id="ICP-P1"))
d.commit()

detail_data_with_item = json.dumps([
    {"id": "A1", "phase": "A", "activity": {"en": "Rebar spacing check", "ch": "鋼筋間距檢查"},
     "criteria": [{"en": "Spacing within tolerance", "ch": "間距符合公差"}]}
])

d.add(models.ITP(id="icp-itp-with-items", project_id="ICP-P1", vendor_id="ICP-V1",
                  referenceNo="QTS-ICP-ITP-000001", description="Checklist/Publish UIUX: has items",
                  rev="Rev1.0", submit="", status="Pending", submissionDate="2026-09-28",
                  detail_data=detail_data_with_item))
d.add(models.ITP(id="icp-itp-existing-rev", project_id="ICP-P1", vendor_id="ICP-V1",
                  referenceNo="QTS-ICP-ITP-000002", description="Checklist/Publish UIUX: existing rev",
                  rev="Rev1.0", submit="", status="Pending", submissionDate="2026-09-28"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
