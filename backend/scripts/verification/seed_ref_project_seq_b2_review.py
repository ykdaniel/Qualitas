"""Isolated TEST SEED SCRIPT for REF-PROJECT-SEQ-2026-001 batch 2 (2026-10-13) — writes test fixtures to an isolated database;
it is a seed script, not a read-only script.

Isolated stack only. Requires B2_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password).

Two projects (Hailong, TECO), shared and project templates, and one project member:
  ITP-SHARED-REVIEW   shared ITP template (no project)     — visible in both projects, admin-only changes
  ITP-HL-REVIEW       Hailong's own ITP
  ITP-TECO-REVIEW     TECO's own ITP                        — invisible in Hailong
  CHK-SHARED-REVIEW   shared bare Checklist template
  NOI-TECO-REVIEW     a TECO NOI                             — cannot be cited from Hailong
  pm_hl               project member of Hailong (NCR / NOI / ITR / ITP / Checklist / Follow-up rights, not admin)
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

PW = os.environ.get("B2_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("B2_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


d.add(models.Project(id="B2-HL", name="Hailong", code="HL"))
d.add(models.Project(id="B2-TECO", name="TECO Substation", code="TECO"))
d.add(models.Contractor(id="B2-V1", name="Formosa Heavy Structural Engineering Co., Ltd.", abbreviation="FHS"))
d.flush()

role = models.Role(name="B2ProjectStaff")
role.permissions_rel = [_perm(c) for c in (
    "ncr:view:all", "ncr:create:all", "ncr:update:all", "noi:view:all", "noi:create:all", "noi:update:all",
    "itr:view:all", "itr:create:all", "itr:update:all", "itp:view:all", "itp:create:all", "itp:update:all",
    "itp:delete:all", "checklist:view:all", "checklist:create:all", "checklist:update:all",
    "followup:view:all", "followup:create:all", "obs:view:all", "obs:create:all", "contractors:view:all", "km:view:all",
)]
d.add(role)
d.flush()
u = models.User(username="pm_hl", email="pm_hl@example.com", is_active=True, company_name="Rokusumi",
                hashed_password=get_password_hash(PW), role_id=role.id, full_name="PM Hailong")
d.add(u)
d.flush()
d.add(models.UserProject(user_id=u.id, project_id="B2-HL"))

items = json.dumps({"a": [{"activity": "Rebar spacing", "standard": "CNS 560", "criteria": "±10 mm", "point": "H"}], "b": [], "c": []})
common = dict(vendor_id="B2-V1", rev="Rev1.0", submit="2026-10-01", status="Approved", detail_data=items, hasDetails=True)
d.add(models.ITP(id="b2-itp-shared", referenceNo="ITP-SHARED-REVIEW", description="Shared rebar ITP template", **common))
d.add(models.ITP(id="b2-itp-hl", referenceNo="ITP-HL-REVIEW", description="Hailong rebar ITP", project_id="B2-HL", **common))
d.add(models.ITP(id="b2-itp-teco", referenceNo="ITP-TECO-REVIEW", description="TECO rebar ITP", project_id="B2-TECO", **common))
d.add(models.Checklist(id="b2-chk-shared", recordsNo="CHK-SHARED-REVIEW", status="Ongoing", date="2026-10-01",
                       activity="Rebar inspection template", contractor_id="B2-V1",
                       detail_data=json.dumps({"items": [{"description": "Spacing", "criteria": "±10 mm", "result": ""}]})))
d.add(models.NOI(id="b2-noi-teco", referenceNo="NOI-TECO-REVIEW", project_id="B2-TECO", vendor_id="B2-V1", status="Open",
                 package="TECO rebar", issueDate="2026-10-01", inspectionDate="2026-10-02", inspectionTime="09:00",
                 type="Rebar", itpNo="ITP-TECO-REVIEW"))
d.commit()
d.close()
print("SEED OK")
