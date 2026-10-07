"""Seed for the Dashboard statistics-consistency + PQP/ITP simplification batch (2026-09-29;
isolated stack only). Covers every real NCR/OBS status
(`backend/core/utils.py::WorkflowEngine.TRANSITIONS["NCR"|"OBS"]`: Open / In Progress / Resolved /
Closed / Void) with a hand-countable mix, plus PQP/ITP records across their real statuses.

    cd backend
    python scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 \
        --vite-script ../react-app/tests-browser/project-create-vite.mjs > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> \
        --script scripts/verification/seed_dashboard_stats_consistency_review.py
    node ../react-app/tests-browser/dashboard-stats-consistency-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password: Accept-Test-1234

Account: sc_full  itp/pqp/ncr/obs:view:all, contractors:view:all. Scoped to SC-P1.

NCR (7 total): 2 Open, 2 In Progress, 1 Resolved, 1 Closed, 1 Void.
    "not Closed/Void" (the outstanding bucket) = 2+2+1 = 5.
    Literal "Open" only = 2.
    (Before this batch's fix: Dashboard summary showed 2 (literal Open only); StatsCard/Pareto
    showed 5 (not Closed/Void). This seed makes that gap non-zero and exact.)

OBS (7 total): 2 Open, 2 In Progress, 1 Resolved, 1 Closed, 1 Void.
    "not Closed/Void" (the outstanding bucket) = 5.
    "not Closed" (includes Void) = 6.
    (Before this batch's fix: Dashboard summary showed 6 (Void folded into Open); StatsCard/Pareto
    showed 5 (Void excluded).)

PQP (5 total): 2 Approved, 1 Under Review, 1 Reject, 1 Void.
ITP (6 total): 2 Approved, 1 "Approved with comments", 1 Pending, 1 Revise & Resubmit, 1 Void.
"""
import sys, os, json
from datetime import date, timedelta
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models
from core import perms
from core.security import get_password_hash

PW = "Accept-Test-1234"
d = database.SessionLocal()
TODAY = date(2026, 9, 29)


def iso(dt):
    return dt.strftime("%Y-%m-%d")


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


full = role("ScFull", [
    perms.ITP_VIEW, perms.PQP_VIEW, perms.NCR_VIEW, perms.OBS_VIEW, perms.CONTRACTOR_VIEW,
])
d.add(models.Project(id="SC-P1", name="Stats Consistency Review", code="SCP1"))
d.add(models.Contractor(id="SC-V1", name="Stats Consistency Review Co", abbreviation="SCC"))

full_user = models.User(username="sc_full", email="scfull@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full.id, full_name="SC Full")
d.add(full_user)
d.commit()
d.add(models.UserProject(user_id=full_user.id, project_id="SC-P1"))
d.commit()

# ── NCR: 2 Open, 2 In Progress, 1 Resolved, 1 Closed, 1 Void ──
ncr_statuses = ["Open", "Open", "In Progress", "In Progress", "Resolved", "Closed", "Void"]
for i, status in enumerate(ncr_statuses, start=1):
    d.add(models.NCR(id=f"sc-ncr-{i}", project_id="SC-P1", vendor_id="SC-V1",
                      documentNumber=f"SC-NCR-{i}", description=f"SC NCR {i} ({status})",
                      rev="A", submit="", status=status,
                      raiseDate=iso(TODAY - timedelta(days=i))))

# ── OBS: 2 Open, 2 In Progress, 1 Resolved, 1 Closed, 1 Void ──
obs_statuses = ["Open", "Open", "In Progress", "In Progress", "Resolved", "Closed", "Void"]
for i, status in enumerate(obs_statuses, start=1):
    d.add(models.OBS(id=f"sc-obs-{i}", project_id="SC-P1", vendor_id="SC-V1",
                      documentNumber=f"SC-OBS-{i}", description=f"SC OBS {i} ({status})",
                      rev="A", submit="", status=status,
                      raiseDate=iso(TODAY - timedelta(days=i))))

# ── PQP: 2 Approved, 1 Under Review, 1 Reject, 1 Void ──
pqp_statuses = ["Approved", "Approved", "Under Review", "Reject", "Void"]
for i, status in enumerate(pqp_statuses, start=1):
    d.add(models.PQP(id=f"sc-pqp-{i}", project_id="SC-P1", vendor_id="SC-V1",
                      pqpNo=f"SC-PQP-{i}", title=f"SC PQP {i} ({status})",
                      description=f"SC PQP {i}", version="1.0", createdAt=iso(TODAY),
                      status=status, updatedAt=iso(TODAY)))

# ── ITP: 2 Approved, 1 Approved with comments, 1 Pending, 1 Revise & Resubmit, 1 Void ──
itp_statuses = ["Approved", "Approved", "Approved with comments", "Pending", "Revise & Resubmit", "Void"]
for i, status in enumerate(itp_statuses, start=1):
    d.add(models.ITP(id=f"sc-itp-{i}", project_id="SC-P1", vendor_id="SC-V1",
                      referenceNo=f"SC-ITP-{i}", description=f"SC ITP {i} ({status})",
                      rev="Rev1.0", submit="", status=status, submissionDate=iso(TODAY)))

d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
