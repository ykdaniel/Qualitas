"""Seed for the Dashboard UI/UX reorder + key-stats + trend-labeling batch (2026-09-29; isolated
stack only).

Builds a small, hand-countable dataset across two contractors and one project so the review
script can compute expected totals/rates independently (ground truth) and compare them against
every place the Dashboard renders the same numbers (key-stats tile, module stats card, gauge).

    cd backend
    python scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 \
        --vite-script ../react-app/tests-browser/project-create-vite.mjs > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> \
        --script scripts/verification/seed_dashboard_uiux_review.py
    node ../react-app/tests-browser/dashboard-uiux-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password: Accept-Test-1234

Account: dash_full  itp/pqp/ncr/obs/noi:view:all, contractors:view:all. Scoped to DASH-P1.

Data (all in project DASH-P1):
    Contractors: DASH-V1 ("Dash Review Co A"), DASH-V2 ("Dash Review Co B")
    ITP:  5 total (DASH-V1: 3, DASH-V2: 2) — 3 Approved (incl. 1 "Approved with comments"), 1
          Pending, 1 Void (excluded from total per existing rule, untouched here)
    PQP:  4 total (DASH-V1: 3, DASH-V2: 1) — 2 Approved, 1 Reject, 1 Pending
    NCR:  4 total (DASH-V1: 2, DASH-V2: 2) — 2 Open, 2 Closed — raiseDate spread across 2 months
    OBS:  3 total (DASH-V1: 2, DASH-V2: 1) — 2 Open, 1 Closed — raiseDate spread
    NOI:  3 total (DASH-V1: 2, DASH-V2: 1) — 2 Open, 1 Closed — issueDate spread
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


full = role("DashFull", [
    perms.ITP_VIEW, perms.PQP_VIEW, perms.NCR_VIEW, perms.OBS_VIEW, perms.NOI_VIEW,
    perms.CONTRACTOR_VIEW,
])

d.add(models.Project(id="DASH-P1", name="Dashboard Review Project", code="DASHP1"))
d.add(models.Contractor(id="DASH-V1", name="Dash Review Co A", abbreviation="DVA"))
d.add(models.Contractor(id="DASH-V2", name="Dash Review Co B", abbreviation="DVB"))

full_user = models.User(username="dash_full", email="dashfull@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full.id, full_name="Dash Full")
d.add(full_user)
d.commit()
d.add(models.UserProject(user_id=full_user.id, project_id="DASH-P1"))
d.commit()

TODAY = date(2026, 9, 29)


def iso(dt):
    return dt.strftime("%Y-%m-%d")


# ── ITP: 5 rows total (1 Void excluded from "total" by existing rule) ──
itp_rows = [
    ("DASH-ITP-1", "DASH-V1", "Approved", iso(TODAY - timedelta(days=10))),
    ("DASH-ITP-2", "DASH-V1", "Approved with comments", iso(TODAY - timedelta(days=40))),
    ("DASH-ITP-3", "DASH-V1", "Pending", iso(TODAY - timedelta(days=5))),
    ("DASH-ITP-4", "DASH-V2", "Approved", iso(TODAY - timedelta(days=70))),
    ("DASH-ITP-5", "DASH-V2", "Void", iso(TODAY - timedelta(days=2))),
]
for i, (ref, vendor, status, subdate) in enumerate(itp_rows):
    d.add(models.ITP(id=f"dash-itp-{i+1}", project_id="DASH-P1", vendor_id=vendor,
                      referenceNo=ref, description=f"Dashboard review ITP {i+1}", rev="Rev1.0",
                      submit="", status=status, submissionDate=subdate))

# ── PQP: 4 rows ──
pqp_rows = [
    ("DASH-V1", "Approved"), ("DASH-V1", "Approved"), ("DASH-V1", "Reject"), ("DASH-V2", "Pending"),
]
for i, (vendor, status) in enumerate(pqp_rows):
    d.add(models.PQP(id=f"dash-pqp-{i+1}", project_id="DASH-P1", vendor_id=vendor,
                      pqpNo=f"DASH-PQP-{i+1}", title=f"Dashboard review PQP {i+1}",
                      description=f"Dashboard review PQP {i+1}", version="1.0",
                      createdAt=iso(TODAY - timedelta(days=20 * (i + 1))),
                      status=status, updatedAt=iso(TODAY - timedelta(days=15 * (i + 1)))))

# ── NCR: 4 rows, raiseDate spread across 2 different months ──
ncr_rows = [
    ("DASH-V1", "Open", TODAY - timedelta(days=10)),
    ("DASH-V1", "Closed", TODAY - timedelta(days=45)),
    ("DASH-V2", "Open", TODAY - timedelta(days=20)),
    ("DASH-V2", "Closed", TODAY - timedelta(days=50)),
]
for i, (vendor, status, raise_dt) in enumerate(ncr_rows):
    d.add(models.NCR(id=f"dash-ncr-{i+1}", project_id="DASH-P1", vendor_id=vendor,
                      documentNumber=f"DASH-NCR-{i+1}", description=f"Dashboard review NCR {i+1}",
                      rev="A", submit="", status=status, raiseDate=iso(raise_dt)))

# ── OBS: 3 rows ──
obs_rows = [
    ("DASH-V1", "Open", TODAY - timedelta(days=8)),
    ("DASH-V1", "In Progress", TODAY - timedelta(days=30)),
    ("DASH-V2", "Closed", TODAY - timedelta(days=60)),
]
for i, (vendor, status, raise_dt) in enumerate(obs_rows):
    d.add(models.OBS(id=f"dash-obs-{i+1}", project_id="DASH-P1", vendor_id=vendor,
                      documentNumber=f"DASH-OBS-{i+1}", description=f"Dashboard review OBS {i+1}",
                      rev="A", submit="", status=status, raiseDate=iso(raise_dt)))

# ── NOI: 3 rows, issueDate spread ──
noi_rows = [
    ("DASH-V1", "Open", TODAY - timedelta(days=12)),
    ("DASH-V1", "Open", TODAY - timedelta(days=35)),
    ("DASH-V2", "Closed", TODAY - timedelta(days=55)),
]
for i, (vendor, status, issue_dt) in enumerate(noi_rows):
    d.add(models.NOI(id=f"dash-noi-{i+1}", project_id="DASH-P1", vendor_id=vendor,
                      referenceNo=f"DASH-NOI-{i+1}", package=f"Dashboard review NOI {i+1}",
                      issueDate=iso(issue_dt), inspectionDate=iso(issue_dt), inspectionTime="09:00",
                      itpNo="", eventNumber=f"EV{i+1}", checkpoint="H", type="Rebar",
                      contacts="Dash Tester", phone="000", email="dash@example.com",
                      status=status))

d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
