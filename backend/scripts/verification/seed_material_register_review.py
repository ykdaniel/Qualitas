"""Isolated TEST SEED SCRIPT for MATERIAL-SUBMITTAL-M6-2026-001 (approved-material register, 2026-10-09). Writes NEW test
fixtures into an isolated database through the real register service. Isolated stack only (isolated_stack.py seed).
Replaces the M3 / M4 / M6 workflow seeds (their service calls were removed with the submittal workflow).

Requires M3_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password). Creates:
  * projects M3-P1 and M3-P2 (code set, so the header project badge shows it), contractor M3-V (abbreviation MV);
  * m3_full   — material view / manage + contractor view, projects M3-P1 and M3-P2;
  * m3_viewer — material view only, project M3-P1;
  * in M3-P1: "Fire stop sealant" (Approved, 2 photos), "M4 cable tray" (Approved with comments, 1 photo),
    "Galvanised pipe" (Approved), and 205 "Bulk item NNN" records (every 10th Approved with comments, R2) so the list has more
    than one 200-row page;
  * in M3-P2: "Project two only material" (Approved).
Photos are real PNG files written under the isolated upload root.
"""
import os
import struct
import uuid
import zlib
import datetime as dt
from pathlib import Path
from types import SimpleNamespace

from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import database, models, schemas
from core import perms
from core.scope import UNSCOPED
from core.security import get_password_hash
from core.uploads import upload_root
from services.material_submittal_service import MaterialSubmittalService

PW = os.environ.get("M3_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("M3_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


def png(width, height, top, bottom):
    raw = b"".join(b"\x00" + bytes(int(a + (b - a) * y / max(1, height - 1)) for a, b in zip(top, bottom)) * width for y in range(height))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


d.add_all([models.Project(id="M3-P1", name="M3 Project One", code="M3A"),
           models.Project(id="M3-P2", name="M3 Project Two", code="M3B"),
           models.Contractor(id="M3-V", name="M3 Vendor", abbreviation="MV", status="active")])
d.flush()
users = {}
for name, codes, projects in (("m3_full", [perms.MATERIAL_VIEW, perms.MATERIAL_MANAGE, perms.CONTRACTOR_VIEW], ["M3-P1", "M3-P2"]),
                              ("m3_viewer", [perms.MATERIAL_VIEW, perms.CONTRACTOR_VIEW], ["M3-P1"])):
    role = models.Role(name=f"M3 {name}")
    role.permissions_rel = [_perm(c) for c in codes]
    d.add(role)
    d.flush()
    u = models.User(username=name, email=f"{name}@example.com", is_active=True, hashed_password=get_password_hash(PW), role_id=role.id, full_name=name)
    d.add(u)
    d.flush()
    for p in projects:
        d.add(models.UserProject(user_id=u.id, project_id=p))
    users[name] = u
d.commit()

svc = MaterialSubmittalService(d)
actor = SimpleNamespace(id=users["m3_full"].id, username="m3_full")


def reg(project, name, result="Approved", date="2026-09-20", **kw):
    body = schemas.MaterialRegisterCreate(projectId=project, vendorId="M3-V", name=name, resultCode=result, approvedDate=date, **kw)
    return svc.register(body, UNSCOPED, actor)


root = Path(upload_root())
(root / "material_rev").mkdir(parents=True, exist_ok=True)


def photo(item, name, top, bottom):
    data = png(480, 360, top, bottom)
    stored = f"material_rev/reg-{uuid.uuid4().hex}.png"
    (root / stored).write_bytes(data)
    d.add(models.Attachment(id=str(uuid.uuid4()), entity_type="material_rev", entity_id=item["revision_id"], file_name=name,
                            file_path=stored, file_size=len(data), mime_type="image/png", category="photo", uploaded_by="seed",
                            uploaded_at=dt.datetime.now(dt.timezone.utc).isoformat(), is_deleted=False))


sealant = reg("M3-P1", "Fire stop sealant", brand="A brand", model="FS-200", category="Fire", decisionMaker="Consultant Lin",
              externalDocNo="EXT-0921", specReference="Spec 07 84 00")
tray = reg("M3-P1", "M4 cable tray", "ApprovedWithComments", model="M4", category="Electrical", decisionMaker="Consultant Lin")
reg("M3-P1", "Galvanised pipe", brand="B brand", model="SCH40", category="Pipe")
reg("M3-P2", "Project two only material", brand="C", model="X1", category="Other")
photo(sealant, "sealant-front.png", (200, 60, 40), (250, 200, 160))
photo(sealant, "sealant-label.png", (40, 90, 160), (200, 220, 245))
photo(tray, "cable-tray.png", (60, 120, 60), (210, 235, 200))
d.commit()
for i in range(205):   # R2: every 10th is "approved with comments", so filtered rows lie on both sides of the 200-row page
    reg("M3-P1", f"Bulk item {i:03d}", "ApprovedWithComments" if i % 10 == 0 else "Approved", model=f"B{i:03d}", category="Bulk",
        date="2026-09-01")
total = svc.approved("M3-P1", UNSCOPED, limit=1)["total"]
print("seeded register:", sealant["document_number"], tray["document_number"], "| approved in M3-P1 =", total)
