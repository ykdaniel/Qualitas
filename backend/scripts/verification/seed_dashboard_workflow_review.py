"""Seed for the Dashboard / Q-Workflow business-review browser walkthrough (2026-09-24;
isolated stack only). Dashboard has no dedicated backend endpoint of its own — it's a pure
client-side aggregation of each module's own (already scope-enforced) list; Q-Workflow
(``/api/workflow/*``) has no permission gate of its own either, just P0 project-scope filtering
via ``apply_scope``. What's actually worth verifying here is that scope filtering reaches BOTH
surfaces correctly, and that a representative real scenario's numbers are internally consistent
(not a re-test of NOI/ITR/NCR business rules, already covered in those modules' own reviews).

Creates 2 projects, each with one NOI (auto-creates its Q-WorkFlow row 1:1):
  - Project 1's NOI has zero NCRs linked -> "no NCRs = N/A" -> the row reads fully Accepted (9/9).
  - Project 2's NOI has no ITR linked at all -> the row is stuck at "W/H Inspection" (current, 1/9-ish).

Two accounts, SAME view permissions, only their data-scope differs:
    dw_unscoped   no project_ids set -> sees both projects' data (internal-staff style).
    dw_scoped_p1  project_ids=[DW-P1] only -> P0 isolation should hide Project 2's NOI/Q-WorkFlow
                  entirely, on both the Dashboard's underlying lists and the Workflow tracker.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_dashboard_workflow_review.py
    node ../react-app/tests-browser/dashboard-workflow-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>
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


VIEW_PERMS = [perms.NOI_VIEW, perms.NOI_CREATE, perms.ITR_VIEW, perms.NCR_VIEW, perms.ITP_VIEW, perms.CONTRACTOR_VIEW]
unscoped_role = role("DwUnscoped", VIEW_PERMS)
scoped_role = role("DwScopedP1", VIEW_PERMS)

d.add(models.Project(id="DW-P1", name="Dashboard Review Project 1"))
d.add(models.Project(id="DW-P2", name="Dashboard Review Project 2"))
d.add(models.Contractor(id="DW-V1", name="Dashboard Review Co", abbreviation="DRC"))
d.add(models.ITP(id="dw-itp-1", referenceNo="QTS-DRC-ITP-000001", vendor_id="DW-V1", description="i", rev="R", submit="s", status="Approved", submissionDate="2026-09-01"))

u1 = models.User(username="dw_unscoped", email="dwu@example.com", is_active=True, hashed_password=get_password_hash(PW), role_id=unscoped_role.id, full_name="DW Unscoped")
u2 = models.User(username="dw_scoped_p1", email="dws@example.com", is_active=True, hashed_password=get_password_hash(PW), role_id=scoped_role.id, full_name="DW Scoped P1")
d.add(u1)
d.add(u2)
d.commit()
u2_id = u2.id
d.close()

# Assign u2's scope to Project 1 only (direct row insert — same effect as IAM's set_user_scope).
ds = database.SessionLocal()
ds.add(models.UserProject(user_id=u2_id, project_id="DW-P1"))
ds.commit()
ds.close()

# No httpx in this environment (starlette.testclient unavailable) — build the NOI + Q-WorkFlow
# rows directly, the same way NOIService.create + _create_qworkflow_for_noi would (real API
# behaviour for these two fields is already covered by the NOI module's own review; what matters
# here is the resulting DATA shape scope-filtering is tested against, not re-proving NOI create).
dd = database.SessionLocal()
noi1 = models.NOI(id="dw-noi-1", project_id="DW-P1", package="DW Accepted (P1)", referenceNo="QTS-DRC-NOI-000001",
                   issueDate="2026-09-02", inspectionDate="2026-09-12", inspectionTime="09:00",
                   itpNo="QTS-DRC-ITP-000001", eventNumber="EV1", checkpoint="H", type="Rebar",
                   vendor_id="DW-V1", contacts="Bob", phone="123", email="b@example.com", status="Open")
noi2 = models.NOI(id="dw-noi-2", project_id="DW-P2", package="DW Stuck at W-H (P2)", referenceNo="QTS-DRC-NOI-000002",
                   issueDate="2026-09-02", inspectionDate="2026-09-12", inspectionTime="09:00",
                   itpNo="QTS-DRC-ITP-000001", eventNumber="EV1", checkpoint="H", type="Rebar",
                   vendor_id="DW-V1", contacts="Bob", phone="123", email="b@example.com", status="Open")
dd.add(noi1)
dd.add(noi2)
dd.flush()
dd.add(models.QWorkflow(id="dw-qwf-1", project_id="DW-P1", referenceNo="Q-WorkFlow-000001", noi_id=noi1.id))
dd.add(models.QWorkflow(id="dw-qwf-2", project_id="DW-P2", referenceNo="Q-WorkFlow-000002", noi_id=noi2.id))
# P1's NOI gets a linked, Approved ITR -> W/H Inspection checkpoint passes; zero NCRs -> N/A for
# the rest -> fully Accepted. P2's NOI is left with NO ITR at all -> stuck at W/H Inspection.
dd.add(models.ITR(id="dw-itr-1", vendor_id="DW-V1", documentNumber="ITR-DW-1", description="x", rev="A",
                   submit="s", status="Approved", noiNumber=noi1.referenceNo, raiseDate="2026-09-12"))
dd.commit()
dd.close()

print("SEED " + json.dumps({
    "ok": True,
    "noi1": {"id": "dw-noi-1", "ref": "QTS-DRC-NOI-000001", "project": "DW-P1"},
    "noi2": {"id": "dw-noi-2", "ref": "QTS-DRC-NOI-000002", "project": "DW-P2"},
}))
