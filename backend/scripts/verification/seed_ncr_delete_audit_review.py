"""Isolated TEST SEED SCRIPT for NCR-DELETE-AUDIT-2026-001 (2026-10-12) — writes test fixtures to an isolated database; it is a
seed script, not a read-only script.

Isolated stack only. Requires NCR_DELETE_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password).

Creates one project, one contractor, one reviewer (NCR view / delete, ITR view) and three NCRs, one per delete outcome:
  * QTS-NDA1-HL-NCR-000001  Void, not cited       → deleted; one DELETE row in audit_logs
  * QTS-NDA1-HL-NCR-000002  Open                  → refused (400): "Please Void the NCR first"
  * QTS-NDA1-HL-NCR-000003  Void, cited by an ITR → refused (400): "referenced by 1 ITR record(s)"
For the refusals, the NCR page closes the confirm prompt and shows the server's reason in its error banner.
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import uuid
import database, models
from core.security import get_password_hash

PW = os.environ.get("NCR_DELETE_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("NCR_DELETE_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


role = models.Role(name="NCRDeleteAuditReview")
role.permissions_rel = [_perm(c) for c in ("ncr:view:all", "ncr:delete:all", "itr:view:all", "contractors:view:all")]
d.add(role)
d.flush()
d.add(models.User(username="ncr_reviewer", email="ncr.reviewer@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=role.id, full_name="NCR Reviewer"))
d.add(models.Project(id="NDA-P1", name="NCR Delete Audit Review", code="NDA1"))
d.add(models.Contractor(id="NDA-V1", name="Hailong Construction", abbreviation="HL", status="active"))
d.flush()


def ncr(number, status, subject):
    d.add(models.NCR(id=uuid.uuid4().hex, documentNumber=number, status=status, vendor_id="NDA-V1", project_id="NDA-P1",
                     raiseDate="2026-10-12", severity="Minor", subject=subject, description=subject, rev="0", submit=""))


ncr("QTS-NDA1-HL-NCR-000001", "Void", "Void, not cited — can be deleted")
ncr("QTS-NDA1-HL-NCR-000002", "Open", "Open — must be voided before delete")
ncr("QTS-NDA1-HL-NCR-000003", "Void", "Void, but cited by an ITR")
d.add(models.ITR(id=uuid.uuid4().hex, documentNumber="QTS-NDA1-HL-ITR-000001", status="In Progress", vendor_id="NDA-V1",
                 project_id="NDA-P1", raiseDate="2026-10-12", subject="Re-inspection for NCR-000003",
                 description="Re-inspection", rev="0", submit="", ncrNumber="QTS-NDA1-HL-NCR-000003"))
d.commit()
print("seeded:", d.query(models.NCR).count(), "NCRs,", d.query(models.ITR).count(), "ITR")
