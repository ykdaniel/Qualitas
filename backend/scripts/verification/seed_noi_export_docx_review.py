"""Isolated TEST SEED SCRIPT for NOI-EXPORT-DOCX-2026-001 — writes test fixtures to an isolated
database; it is a seed script, not a read-only script.

Isolated stack only. Requires NOI_EXPORT_DOCX_PASSWORD in the environment (no hardcoded or
defaulted password). Enforces QUALITAS_REQUIRE_ISOLATED_DB=1 via core.startup_guard.

One Project/Contractor/ITP, one NOI linked to that ITP with every displayed field filled in
(including a real Attachment row + an actual file on disk, so the .docx export's
`add_file_list` path is exercised end-to-end), and a second NOI with no attachments at all (to
verify the "no attachments -> no empty section" guard).
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import datetime
import json
import database, models
from core.security import get_password_hash
from core.uploads import upload_root

PW = os.environ.get("NOI_EXPORT_DOCX_PASSWORD")
if not PW:
    raise RuntimeError("NOI_EXPORT_DOCX_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


role = models.Role(name="NoiExportDocxFull")
role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    "noi:view:all", "noi:create:all", "noi:update:all", "itp:view:all", "contractors:view:all",
]]
d.add(role)
d.flush()

user = models.User(username="noidocx_full", email="noidocx@example.com", is_active=True,
                    hashed_password=get_password_hash(PW), role_id=role.id, full_name="NOI Export Docx Full")
d.add(user)
d.add(models.Project(id="NDX-P1", name="NOI Export Docx Review", code="NDX1"))
d.add(models.Contractor(id="NDX-V1", name="Pinnacle Steel Works Ltd.", abbreviation="PSW",
                         package="Structural Steel", scope="Steel Erection", status="active",
                         contactPerson="Tan Wei Ming", email="tan@pinnacle-steel.example.com",
                         phone="0955-111-222", address="7 Pinnacle Rd."))
d.commit()
d.add(models.UserProject(user_id=user.id, project_id="NDX-P1"))
d.commit()

d.add(models.ITP(id="NDX-ITP1", project_id="NDX-P1", vendor_id="NDX-V1",
                  referenceNo="QTS-NDX1-ITP-000001", description="Steel Column Erection ITP",
                  status="Approved", hasDetails=True, submissionDate="2026-09-15",
                  detail_data=json.dumps({"a": [], "b": [], "c": []})))
d.commit()

# NOI1: every displayed field filled, plus a real attachment.
d.add(models.NOI(id="NDX-NOI1", project_id="NDX-P1", vendor_id="NDX-V1",
                  referenceNo="QTS-NDX1-NOI-000001", package="Steel Column Erection — Grid Line B3-B7",
                  itpNo="QTS-NDX1-ITP-000001", checkpoint="H", eventNumber="S1",
                  issueDate="2026-09-28", inspectionDate="2026-09-29", inspectionTime="10:30",
                  type="Hold Point", status="Open", dueDate="2026-10-06",
                  contacts="Tan Wei Ming", phone="0955-111-222",
                  email="tan@pinnacle-steel.example.com", remark="Crane access confirmed with site logistics."))
d.commit()

_upload_dir = os.path.join(upload_root(), "noi")
os.makedirs(_upload_dir, exist_ok=True)
_PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
    "53de0000000c4944415408d763f8ffff3f0005fe02fea7991ae50000000049454e44ae426082"
)
with open(os.path.join(_upload_dir, "seed-noi-attachment.png"), "wb") as f:
    f.write(_PNG_1PX)
d.add(models.Attachment(
    id="NDX-ATT1", entity_type="noi", entity_id="NDX-NOI1",
    file_name="seed-noi-attachment.png", file_path="noi/seed-noi-attachment.png",
    file_size=len(_PNG_1PX), mime_type="image/png", category="attachment",
    uploaded_by="noidocx_full", uploaded_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
))

# NOI2: no attachments at all, no ITP link — tests the "nothing to show" guards.
d.add(models.NOI(id="NDX-NOI2", project_id="NDX-P1", vendor_id="NDX-V1",
                  referenceNo="QTS-NDX1-NOI-000002", package="Steel Beam Alignment Check",
                  checkpoint="W", eventNumber="S2",
                  issueDate="2026-09-30", inspectionDate="2026-10-01", inspectionTime="14:00",
                  type="Witness Point", status="Open"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
