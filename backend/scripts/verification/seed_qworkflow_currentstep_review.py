"""Isolated TEST SEED SCRIPT for QWORKFLOW-UX-2026-001 (2026-10-03) — writes test fixtures to an
isolated database; it is a seed script, not a read-only script.

Isolated stack only. Requires QWORKFLOW_UX_REVIEW_PASSWORD in the environment (no hardcoded or
defaulted password). Enforces QUALITAS_REQUIRE_ISOLATED_DB=1.

Four Q-Workflow rows on one project, each landing on a DIFFERENT real shape computed by
workflow_service.py's own _evaluate_checkpoints (not invented — read from its source):

  1. QWU-NOI-000001 (LOW) — no ITR filed at all. wh_inspection is the first un-done rule
     (_rule_wh_inspection needs >=1 non-Void ITR) -> current = wh_inspection ("Inspected"),
     done_count=1/9.
  2. QWU-NOI-000002 (MID) — one ITR filed with inspectionResult=Fail, no NCR raised.
     wh_inspection passes (an ITR exists); _rule_ncr requires an NCR once any ITR failed, and
     none exists -> current = ncr ("NCR Review"), done_count=2/9.
  3. QWU-NOI-000003 (DONE) — one ITR, inspectionResult=Pass, status=Approved (satisfies
     _rule_itr_terminal), no NCR raised at all (every NCR-derived rule is vacuously true over an
     empty NCR list, per _rule_moc/_all_ncrs and friends) -> current_idx is None, every checkpoint
     including 'accepted' renders done, done_count=9/9, completion_percent=100.
  4. QWU-NOI-000004 (VOID-ITR) — one ITR, status=Void, nothing else. _rule_wh_inspection excludes
     Void ITRs from counting as "an inspection happened", so this ends up computing to the SAME
     shape as scenario 1 (current = wh_inspection) even though a (Void) ITR row exists — the point
     of this fixture is confirming the UI shows the exact same real state, not a different guess
     just because the word "Void" appears somewhere in the data.
"""
import os
import database, models
from core.security import get_password_hash

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")

PW = os.environ.get("QWORKFLOW_UX_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("QWORKFLOW_UX_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


role = models.Role(name="QWorkflowUXReviewFull")
role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    "noi:view:all", "itr:view:all", "ncr:view:all",
]]
d.add(role)
d.flush()

user = models.User(username="qwux_full", email="qwux@example.com", is_active=True,
                    hashed_password=get_password_hash(PW), role_id=role.id, full_name="QWorkflow UX Review Full")
d.add(user)
d.add(models.Project(id="QWU-P1", name="Q-Workflow Current-Step Review", code="QWUP1"))
d.add(models.Project(id="QWU-P2", name="Q-Workflow Current-Step Review P2", code="QWUP2"))
d.add(models.Contractor(id="QWU-V1", name="QWorkflow UX Review Contractor", abbreviation="QWU",
                         package="Civil Works", scope="General", status="active",
                         contactPerson="QA Lead", email="qa@qwux.example.com", phone="0900000004",
                         address="1 Review St."))
d.commit()
d.add(models.UserProject(user_id=user.id, project_id="QWU-P1"))
d.add(models.UserProject(user_id=user.id, project_id="QWU-P2"))
d.commit()


def make_noi(noi_id, ref, package, project_id="QWU-P1"):
    n = models.NOI(id=noi_id, project_id=project_id, vendor_id="QWU-V1", package=package,
                    referenceNo=ref, issueDate="2026-10-01", inspectionDate="2026-10-01",
                    inspectionTime="09:00", eventNumber="EV1", checkpoint="H", type="Rebar",
                    contacts="QA Lead", phone="0900000004", email="qa@qwux.example.com", status="Open")
    d.add(n)
    d.flush()
    d.add(models.QWorkflow(id=f"{noi_id}-qwf", project_id=project_id,
                            referenceNo=f"Q-WorkFlow-{ref}", noi_id=n.id))
    return n


# 1. LOW — no ITR at all.
noi1 = make_noi("qwu-noi-1", "QTS-QWUP1-NOI-000001", "LOW — no ITR filed yet")

# 2. MID — one failed ITR, no NCR.
noi2 = make_noi("qwu-noi-2", "QTS-QWUP1-NOI-000002", "MID — ITR failed, no NCR raised yet")
d.add(models.ITR(id="qwu-itr-2", project_id="QWU-P1", vendor_id="QWU-V1",
                  documentNumber="QTS-QWUP1-ITR-000002", description="Failed inspection",
                  rev="A", submit="Contractor", status="In Progress", inspectionResult="Fail",
                  raiseDate="2026-10-01", noiNumber=noi2.referenceNo))

# 3. DONE — ITR passed and terminal (Approved), no NCR at all -> 100%, Accepted.
noi3 = make_noi("qwu-noi-3", "QTS-QWUP1-NOI-000003", "DONE — fully accepted")
d.add(models.ITR(id="qwu-itr-3", project_id="QWU-P1", vendor_id="QWU-V1",
                  documentNumber="QTS-QWUP1-ITR-000003", description="Passed inspection",
                  rev="A", submit="Contractor", status="Approved", inspectionResult="Pass",
                  raiseDate="2026-09-20", closeoutDate="2026-09-25", noiNumber=noi3.referenceNo))

# 4. VOID-ITR — only a Void ITR; must compute to the SAME shape as scenario 1.
noi4 = make_noi("qwu-noi-4", "QTS-QWUP1-NOI-000004", "VOID — only a Void ITR linked")
d.add(models.ITR(id="qwu-itr-4", project_id="QWU-P1", vendor_id="QWU-V1",
                  documentNumber="QTS-QWUP1-ITR-000004", description="Voided, does not count",
                  rev="A", submit="Contractor", status="Void",
                  raiseDate="2026-10-01", noiNumber=noi4.referenceNo))

# 5. On the SECOND project (QWU-P2) — used for the project-switch no-stale-text check. A LOW
# shape again (current = wh_inspection), deliberately the SAME shape as scenario 1 but on a
# different project/NOI, so a leftover "Current step: Inspected" from switching away from P1
# cannot be mistaken for correctness by coincidence — the browser script checks the NOI
# reference number alongside the text, not the text alone.
noi5 = make_noi("qwu-noi-5", "QTS-QWUP2-NOI-000001", "P2 LOW — no ITR filed yet", project_id="QWU-P2")

d.commit()
d.close()
print("SEED OK")
