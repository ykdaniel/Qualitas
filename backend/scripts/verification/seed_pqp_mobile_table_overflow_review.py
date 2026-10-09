"""Seed for the PQP mobile DataTable horizontal-overflow fix (2026-09-29; isolated stack only).

Reproduces the finding recorded in BACKLOG.md under the #28/#38 batch: the PQP list page's shared
`DataTable` component overflows the page horizontally at 390px in BOTH languages (language-independent,
unlike BACKLOG #38's header issue). This seed gives enough PQP rows with realistic-length text so the
8-column table (#, Reference no., Status, Contractor, Subject, Version, Updated Date, Operations) is
guaranteed to be wider than a phone viewport, regardless of window size.

    cd backend
    python scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 \
        --vite-script <a vite launcher> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> \
        --script scripts/verification/seed_pqp_mobile_table_overflow_review.py
    python scripts/verification/isolated_stack.py down --root <root>

Password: Accept-Test-1234

Account: pmt_full  pqp:view:all, contractors:view:all. Scoped to PMT-P1.

PQP (6 total): covers every real status per WorkflowEngine.TRANSITIONS["PQP"] once so the Status
column's badge widths vary too (Not Submit / Under Review / Approved / Reject / Void /
Revise & Resubmit).
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


full = role("PmtFull", [perms.PQP_VIEW, perms.CONTRACTOR_VIEW])
d.add(models.Project(id="PMT-P1", name="PQP Mobile Table Review", code="PMTP1"))
d.add(models.Contractor(id="PMT-V1", name="PQP Mobile Table Review Contractor Co Ltd", abbreviation="PMTC"))

full_user = models.User(username="pmt_full", email="pmtfull@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full.id, full_name="PMT Full")
d.add(full_user)
d.commit()
d.add(models.UserProject(user_id=full_user.id, project_id="PMT-P1"))
d.commit()

pqp_statuses = ["Not Submit", "Under Review", "Approved", "Reject", "Void", "Revise & Resubmit"]
for i, status in enumerate(pqp_statuses, start=1):
    d.add(models.PQP(
        id=f"pmt-pqp-{i}", project_id="PMT-P1", vendor_id="PMT-V1",
        pqpNo=f"QTS-PMT-PQP-{i:06d}",
        title=f"Project Quality Plan for Structural Steel Fabrication and Installation Works Phase {i}",
        description=f"PMT PQP {i}", version=f"{i}.0", createdAt=iso(TODAY - timedelta(days=i)),
        status=status, updatedAt=iso(TODAY - timedelta(days=i - 1 if i > 1 else 0)),
    ))

d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
