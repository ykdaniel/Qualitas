"""Seed for the Dashboard load-state fix (BACKLOG #37, 2026-09-29; isolated stack only).

Two projects with DIFFERENT, hand-countable PQP/ITP/NCR counts so a project-scope switch that
leaked the previous project's numbers would be caught immediately (not just "did it re-fetch" but
"does the NEW number actually match the NEW project").

    cd backend
    python scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 \
        --vite-script ../react-app/tests-browser/project-create-vite.mjs > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> \
        --script scripts/verification/seed_dashboard_loadstate_review.py
    node ../react-app/tests-browser/dashboard-loadstate-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password: Accept-Test-1234

Account: ls_full  itp/pqp/ncr/obs/noi:view:all, contractors:view:all. NOT scoped to either
project (sees both) — this batch is about load-state presentation, not scope permission
enforcement (already covered elsewhere), so the account is deliberately unscoped.

Data:
    Project LS-P1 ("Load-State Review P1"): PQP 2 rows (1 Approved, 1 Pending), ITP 1 row
                  (Approved), NCR 0 rows (real, deliberate zero).
    Project LS-P2 ("Load-State Review P2"): PQP 5 rows (3 Approved, 2 Pending), ITP 3 rows
                  (2 Approved, 1 Pending), NCR 2 rows (1 Open, 1 Closed).
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


full = role("LsFull", [
    perms.ITP_VIEW, perms.PQP_VIEW, perms.NCR_VIEW, perms.OBS_VIEW, perms.NOI_VIEW,
    perms.CONTRACTOR_VIEW,
])

d.add(models.Project(id="LS-P1", name="Load-State Review P1", code="LSP1"))
d.add(models.Project(id="LS-P2", name="Load-State Review P2", code="LSP2"))
d.add(models.Contractor(id="LS-V1", name="Load-State Review Co", abbreviation="LSC"))

full_user = models.User(username="ls_full", email="lsfull@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full.id, full_name="LS Full")
p1_user = models.User(username="ls_p1_only", email="lsp1@example.com", is_active=True,
                       hashed_password=get_password_hash(PW), role_id=full.id, full_name="LS P1 Only")
d.add(full_user)
d.add(p1_user)
d.commit()
full_user_id, p1_user_id = full_user.id, p1_user.id
# ls_full: scoped to BOTH LS-P1 and LS-P2 (two UserProject rows — apply_scope treats project_ids
# as a frozenset, so this is real multi-project scope, not "unscoped"). Deliberately NOT unscoped:
# an unscoped account would also see the isolated stack's own baseline db_seeder.py data (4 ITP
# demo records, 1 Checklist demo record with no project), which would silently pollute the
# hand-countable totals this script exists to make exact.
d.add(models.UserProject(user_id=full_user_id, project_id="LS-P1"))
d.add(models.UserProject(user_id=full_user_id, project_id="LS-P2"))
# ls_p1_only: scoped to LS-P1 ONLY — used to prove genuine per-scope data correctness (including
# NCR's real zero) via BACKEND-enforced scope (existing, already covered by the P0 tests referenced
# in BACKLOG.md line ~704) rather than the project-selector DROPDOWN, which this round's
# verification found does NOT actually filter server-side for any account that can see more than
# one project — see BACKLOG #28 (updated this round with this finding) for why ls_full's own
# in-session dropdown switch is not used to prove per-scope numbers.
d.add(models.UserProject(user_id=p1_user_id, project_id="LS-P1"))
d.commit()

TODAY = date(2026, 9, 29)


def iso(dt):
    return dt.strftime("%Y-%m-%d")


# ── P1: PQP 2, ITP 1, NCR 0 (real zero) ──
d.add(models.PQP(id="ls-p1-pqp-1", project_id="LS-P1", vendor_id="LS-V1", pqpNo="LS-P1-PQP-1",
                  title="LS P1 PQP 1", description="d", version="1.0", createdAt=iso(TODAY),
                  status="Approved", updatedAt=iso(TODAY)))
d.add(models.PQP(id="ls-p1-pqp-2", project_id="LS-P1", vendor_id="LS-V1", pqpNo="LS-P1-PQP-2",
                  title="LS P1 PQP 2", description="d", version="1.0", createdAt=iso(TODAY),
                  status="Pending", updatedAt=iso(TODAY)))
d.add(models.ITP(id="ls-p1-itp-1", project_id="LS-P1", vendor_id="LS-V1", referenceNo="LS-P1-ITP-1",
                  description="LS P1 ITP 1", rev="Rev1.0", submit="", status="Approved",
                  submissionDate=iso(TODAY)))

# ── P2: PQP 5, ITP 3, NCR 2 ──
for i, status in enumerate(["Approved", "Approved", "Approved", "Pending", "Pending"]):
    d.add(models.PQP(id=f"ls-p2-pqp-{i+1}", project_id="LS-P2", vendor_id="LS-V1",
                      pqpNo=f"LS-P2-PQP-{i+1}", title=f"LS P2 PQP {i+1}", description="d",
                      version="1.0", createdAt=iso(TODAY), status=status, updatedAt=iso(TODAY)))
for i, status in enumerate(["Approved", "Approved", "Pending"]):
    d.add(models.ITP(id=f"ls-p2-itp-{i+1}", project_id="LS-P2", vendor_id="LS-V1",
                      referenceNo=f"LS-P2-ITP-{i+1}", description=f"LS P2 ITP {i+1}", rev="Rev1.0",
                      submit="", status=status, submissionDate=iso(TODAY)))
for i, status in enumerate(["Open", "Closed"]):
    d.add(models.NCR(id=f"ls-p2-ncr-{i+1}", project_id="LS-P2", vendor_id="LS-V1",
                      documentNumber=f"LS-P2-NCR-{i+1}", description=f"LS P2 NCR {i+1}",
                      rev="A", submit="", status=status, raiseDate=iso(TODAY - timedelta(days=5))))

d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
