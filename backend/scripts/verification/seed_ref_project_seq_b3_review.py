"""Isolated TEST SEED SCRIPT for REF-PROJECT-SEQ-2026-001 batch 3 (2026-10-14) — writes test fixtures to an isolated database;
it is a seed script, not a read-only script.

Isolated stack only. Requires B3_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password).

What the preview shows:
  Hailong (HL)          old contractor-HL numbers QTS-RKS-HL-NOI-000004 / -ITP-000075 exist, so the next HL NOI is 000005
                        and the next HL ITP 000076 (numbers continue, never reused)
  TECO (TECO)           numbers from 000001
  New site (no code)    a project without a code: creating a document there is refused (PROJECT_CODE_MISSING)
  ITP-SHARED-EXT        a shared ITP template with an original (external) document number
  QTS-RKS-STD-ITP-000003  a shared ITP template the system numbered (STD; 000001-000002 are the demo ITPs db_seeder makes)
  pm_hl                 project member of Hailong (NOI / ITP / NCR / Checklist rights, not admin)
  pm_new                project member of "New site" (no code)
The stack's own `admin` account (isolated_stack.py) is the system administrator.
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import json
import database, models
from core.security import get_password_hash

PW = os.environ.get("B3_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("B3_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


d.add(models.Project(id="B3-HL", name="Hailong", code="HL"))
d.add(models.Project(id="B3-TECO", name="TECO Substation", code="TECO"))
d.add(models.Project(id="B3-NEW", name="New site (no code yet)", code=""))
d.add(models.Contractor(id="B3-V1", name="Formosa Heavy Structural Engineering Co., Ltd.", abbreviation="FHS"))
d.flush()

role = models.Role(name="B3ProjectStaff")
role.permissions_rel = [_perm(c) for c in (
    "ncr:view:all", "ncr:create:all", "noi:view:all", "noi:create:all", "noi:update:all", "itr:view:all",
    "itp:view:all", "itp:create:all", "itp:update:all", "checklist:view:all", "followup:view:all",
    "contractors:view:all", "km:view:all",
)]
d.add(role)
d.flush()
for username, project, full in (("pm_hl", "B3-HL", "PM Hailong"), ("pm_new", "B3-NEW", "PM New site")):
    u = models.User(username=username, email=f"{username}@example.com", is_active=True, company_name="Rokusumi",
                    hashed_password=get_password_hash(PW), role_id=role.id, full_name=full)
    d.add(u)
    d.flush()
    d.add(models.UserProject(user_id=u.id, project_id=project))

items = json.dumps([{"id": "1", "itemNo": "1", "activity": "Rebar spacing", "referenceDoc": "CNS 560", "acceptanceCriteria": "±10 mm",
                     "verifyingDocuments": "", "checkpointContractor": "H", "checkpointMainCon": "W", "checkpointClient": "R"}])
common = dict(vendor_id="B3-V1", rev="Rev1.0", submit="2026-10-01", status="Approved", detail_data=items, hasDetails=True)
d.add(models.ITP(id="b3-itp-std", referenceNo="QTS-RKS-STD-ITP-000003", description="Shared rebar ITP template", **common))
d.add(models.ITP(id="b3-itp-ext", referenceNo="ITP-SHARED-EXT", external_doc_no="FHS-ITP-2026-017",
                 description="Shared steel erection ITP (contractor's own number)", **common))
d.add(models.ITP(id="b3-itp-hl-old", referenceNo="QTS-RKS-HL-ITP-000075", description="Hailong ITP (old number)",
                 project_id="B3-HL", **common))
d.add(models.NOI(id="b3-noi-hl-old", referenceNo="QTS-RKS-HL-NOI-000004", project_id="B3-HL", vendor_id="B3-V1", status="Open",
                 package="Hailong rebar (old number)", issueDate="2026-10-01", inspectionDate="2026-10-02",
                 inspectionTime="09:00", type="Rebar", itpNo="QTS-RKS-STD-ITP-000003"))
d.add(models.QWorkflow(id="b3-qwf-old", referenceNo="Q-WorkFlow-000001", noi_id="b3-noi-hl-old", project_id="B3-HL",
                       createdAt="2026-10-01T00:00:00+00:00"))
d.commit()
d.close()
print("SEED OK")
