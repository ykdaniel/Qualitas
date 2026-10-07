"""Seed for the project-selector server-side filtering fix (BACKLOG #28, 2026-09-29; isolated
stack only). Covers all 12 modules whose list endpoints read `project_id` from the frontend
(`getProjectFilterParams()`): ITP, PQP, NCR, OBS, NOI, ITR, FAT, OSD, Audit, MeetingMinutes,
Checklist, FollowUp.

    cd backend
    python scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 \
        --vite-script ../react-app/tests-browser/project-create-vite.mjs > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> \
        --script scripts/verification/seed_project_filter_review.py
    node ../react-app/tests-browser/project-filter-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password: Accept-Test-1234

Accounts:
    pf_full    itp/pqp/ncr/obs/noi/itr/fat/osd/audit/meeting_minutes/checklist/followup:view:all,
               contractors:view:all. Scoped to BOTH PF-A and PF-B (two UserProject rows).
    pf_a_only  Same view permissions. Scoped to PF-A ONLY.

Data: every module gets 2 rows in PF-A (ids ending -a1/-a2) and 3 rows in PF-B (ids ending
-b1/-b2/-b3) — deliberately different counts so a leaked/ignored project_id is caught by a count
mismatch alone, and deliberately different ids/reference numbers so a mismatched RECORD (not just
a wrong count) is also caught.
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


VIEW_PERMS = [
    perms.ITP_VIEW, perms.PQP_VIEW, perms.NCR_VIEW, perms.OBS_VIEW, perms.NOI_VIEW,
    perms.ITR_VIEW, perms.FAT_VIEW, perms.OSD_VIEW, perms.AUDIT_VIEW,
    perms.MEETING_VIEW, perms.CHECKLIST_VIEW, perms.FOLLOWUP_VIEW,
    perms.CONTRACTOR_VIEW,
]
full = role("PfFull", VIEW_PERMS)
a_only = role("PfAOnly", VIEW_PERMS)

d.add(models.Project(id="PF-A", name="Project Filter Review A", code="PFA"))
d.add(models.Project(id="PF-B", name="Project Filter Review B", code="PFB"))
d.add(models.Contractor(id="PF-V1", name="Project Filter Review Co A", abbreviation="PFVA"))
d.add(models.Contractor(id="PF-V2", name="Project Filter Review Co B", abbreviation="PFVB"))

full_user = models.User(username="pf_full", email="pffull@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full.id, full_name="PF Full")
a_user = models.User(username="pf_a_only", email="pfaonly@example.com", is_active=True,
                      hashed_password=get_password_hash(PW), role_id=a_only.id, full_name="PF A Only")
d.add(full_user)
d.add(a_user)
d.commit()
full_id, a_id = full_user.id, a_user.id
d.add(models.UserProject(user_id=full_id, project_id="PF-A"))
d.add(models.UserProject(user_id=full_id, project_id="PF-B"))
d.add(models.UserProject(user_id=a_id, project_id="PF-A"))
d.commit()

PROJECTS = [("PF-A", "a", 2, "PF-V1"), ("PF-B", "b", 3, "PF-V2")]


def add_rows(build):
    """`build(proj, suffix, i)` returns a model instance for row i (1-based) in that project."""
    for proj, suffix, count, vendor in PROJECTS:
        for i in range(1, count + 1):
            d.add(build(proj, suffix, i, vendor))


# ITP
add_rows(lambda p, s, i, v: models.ITP(
    id=f"pf-itp-{s}{i}", project_id=p, vendor_id=v, referenceNo=f"PF-{s.upper()}-ITP-{i}",
    description=f"PF {p} ITP {i}", rev="Rev1.0", submit="", status="Approved",
    submissionDate=iso(TODAY)))

# PQP
add_rows(lambda p, s, i, v: models.PQP(
    id=f"pf-pqp-{s}{i}", project_id=p, vendor_id=v, pqpNo=f"PF-{s.upper()}-PQP-{i}",
    title=f"PF {p} PQP {i}", description=f"PF {p} PQP {i}", version="1.0",
    createdAt=iso(TODAY), status="Approved", updatedAt=iso(TODAY)))

# NCR
add_rows(lambda p, s, i, v: models.NCR(
    id=f"pf-ncr-{s}{i}", project_id=p, vendor_id=v, documentNumber=f"PF-{s.upper()}-NCR-{i}",
    description=f"PF {p} NCR {i}", rev="A", submit="", status="Open",
    raiseDate=iso(TODAY - timedelta(days=i))))

# OBS
add_rows(lambda p, s, i, v: models.OBS(
    id=f"pf-obs-{s}{i}", project_id=p, vendor_id=v, documentNumber=f"PF-{s.upper()}-OBS-{i}",
    description=f"PF {p} OBS {i}", rev="A", submit="", status="Open",
    raiseDate=iso(TODAY - timedelta(days=i))))

# NOI
add_rows(lambda p, s, i, v: models.NOI(
    id=f"pf-noi-{s}{i}", project_id=p, vendor_id=v, referenceNo=f"PF-{s.upper()}-NOI-{i}",
    package=f"PF {p} NOI {i}", issueDate=iso(TODAY), inspectionDate=iso(TODAY),
    inspectionTime="09:00", itpNo="", eventNumber=f"EV{i}", checkpoint="H", type="Rebar",
    contacts="Tester", phone="000", email="pf@example.com", status="Open"))

# ITR
add_rows(lambda p, s, i, v: models.ITR(
    id=f"pf-itr-{s}{i}", project_id=p, vendor_id=v, documentNumber=f"PF-{s.upper()}-ITR-{i}",
    description=f"PF {p} ITR {i}", rev="A", submit="", status="Approved",
    raiseDate=iso(TODAY)))

# FAT
add_rows(lambda p, s, i, v: models.FAT(
    id=f"pf-fat-{s}{i}", project_id=p, vendor_id=v, equipment=f"PF {p} FAT {i}",
    procedure="", location="", startDate=iso(TODAY), endDate=iso(TODAY), status="Scheduled"))

# OSD
add_rows(lambda p, s, i, v: models.OSD(
    id=f"pf-osd-{s}{i}", project_id=p, vendor_id=v, documentNumber=f"PF-{s.upper()}-OSD-{i}",
    status="Open", raiseDate=iso(TODAY)))

# Audit
add_rows(lambda p, s, i, v: models.Audit(
    id=f"pf-audit-{s}{i}", project_id=p, vendor_id=v, auditNo=f"PF-{s.upper()}-AUDIT-{i}",
    title=f"PF {p} Audit {i}", date=iso(TODAY), status="Scheduled"))

# MeetingMinutes
add_rows(lambda p, s, i, v: models.MeetingMinutes(
    id=f"pf-mm-{s}{i}", project_id=p, vendor_id=v, documentNumber=f"PF-{s.upper()}-MM-{i}",
    rev="A", status="Published", title=f"PF {p} Meeting {i}", meetingDate=iso(TODAY),
    meetingTime="10:00", location="Site", organizer="Tester"))

# Checklist — DB column is vendor_id, but the Python attribute is contractor_id (see models.py)
add_rows(lambda p, s, i, v: models.Checklist(
    id=f"pf-chk-{s}{i}", project_id=p, contractor_id=v, recordsNo=f"PF-{s.upper()}-CHK-{i}",
    activity=f"PF {p} Checklist {i}", date=iso(TODAY), status="Ongoing", packageName="PF"))

# FollowUp
add_rows(lambda p, s, i, v: models.FollowUp(
    id=f"pf-fu-{s}{i}", project_id=p, vendor_id=v, issueNo=f"PF-{s.upper()}-FU-{i}",
    title=f"PF {p} FollowUp {i}", description=f"PF {p} FollowUp {i}", status="Open",
    priority="Medium", createdAt=iso(TODAY), updatedAt=iso(TODAY)))

d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
