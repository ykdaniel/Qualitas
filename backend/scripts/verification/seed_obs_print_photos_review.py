"""OBS-PRINT-PHOTOS-2026-001 review seed (isolated stack only, never a real DB).

Run through `isolated_stack.py seed`, which supplies the isolated DATABASE_URL and QUALITAS_UPLOAD_ROOT.
Creates one project, two contractors and nine OBS covering every photo count the print layout handles
(Before / After): Open 2/0, In Progress 2/1, Resolved 2/2, Closed 2/2, plus Open 3/3 (rows of two that
wrap), Void 1/1 (the files-locked notice for Void) and Open 1+2/1+1 — one LEGACY photo (a data: URL kept in the
record's own defectPhotos / improvementPhotos JSON, from before central uploads) next to uploaded ones, for the order; Open 4/3 (four pairs, the last without an After) and Open 0/2 (After only). Photos are generated with Pillow — landscape and
portrait — written under the upload root and registered as attachment rows, exactly what /api/files/upload
stores. Log in with the stack's admin account (password in the run dir's admin-password file).
"""
import base64
import io
import json
import os
import sys
import uuid
from datetime import datetime, timezone

from PIL import Image, ImageDraw, ImageFont

if not os.environ.get("DATABASE_URL") or not os.environ.get("QUALITAS_UPLOAD_ROOT"):
    sys.exit("refusing to seed: run through isolated_stack.py seed (DATABASE_URL / QUALITAS_UPLOAD_ROOT not set)")

BACKEND = os.environ.get("QUALITAS_BACKEND") or os.getcwd()
sys.path.insert(0, BACKEND)
import database, models  # noqa: E402
from core.uploads import upload_root  # noqa: E402


def _font(size):
    for path in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _photo(label, colour, portrait=False, small=False):
    w, h = (900, 1200) if portrait else (1200, 900)
    if small:
        w, h = w // 3, h // 3
    img = Image.new("RGB", (w, h), colour)
    d = ImageDraw.Draw(img)
    for x in range(0, w, 100):
        d.line([(x, 0), (x, h)], fill=(255, 255, 255), width=1)
    for y in range(0, h, 100):
        d.line([(0, y), (w, y)], fill=(255, 255, 255), width=1)
    d.rectangle([20, 20, w - 20, h - 20], outline=(0, 0, 0), width=8)
    scale = 3 if small else 1
    d.text((60 // scale, h // 2 - 60 // scale), label, fill=(0, 0, 0), font=_font(90 // scale))
    d.text((60 // scale, h // 2 + 60 // scale), "portrait" if portrait else "landscape", fill=(40, 40, 40), font=_font(50 // scale))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    return buf.getvalue()


db = database.SessionLocal()
admin = db.query(models.User).filter(models.User.username == "admin").first()
admin_label = (admin.full_name or admin.username) if admin else "admin"

proj = models.Project(id=uuid.uuid4().hex, name="OBS Print Photos Review", code="OPP",
                      description="Isolated OBS print review", owner="Review Owner", created_at="2026-10-12T00:00:00Z")
db.add(proj)
c1 = models.Contractor(id=uuid.uuid4().hex, name="Formosa Steel Works", abbreviation="FSW", status="active")
c2 = models.Contractor(id=uuid.uuid4().hex, name="Harbor Civil Engineering", abbreviation="HCE", status="active")
db.add_all([c1, c2])
db.flush()

base = dict(project_id=proj.id, rev="1.0", submit="Yes", hasDetails=True, type="Quality",
            raisedBy=admin_label, foundBy=admin_label, defectPhotos="[]", improvementPhotos="[]", attachments="[]")
approved_both = dict(qualityEngineerApproval="Approved", qualityEngineerApprovalBy=admin_label, qualityEngineerApprovalDate="2026-10-02",
                     constructionEngineerApproval="Approved", constructionEngineerApprovalBy=admin_label,
                     constructionEngineerApprovalDate="2026-10-03", closeoutDate="2026-10-03")
# (document number, status, before count, after count, extra fields)
cases = [
    ("QTS-OPP-FSW-OBS-000001", "Open", 2, 0, dict(vendor_id=c1.id, subject="Rebar cover insufficient at column C3")),
    ("QTS-OPP-FSW-OBS-000002", "In Progress", 2, 1, dict(vendor_id=c1.id, subject="Bolt tightening marks missing", productDisposition="Rework")),
    ("QTS-OPP-HCE-OBS-000001", "Resolved", 2, 2, dict(vendor_id=c2.id, subject="Formwork joint leakage", productDisposition="Repair",
                                                       qualityEngineerApproval="Approved", qualityEngineerApprovalBy=admin_label,
                                                       qualityEngineerApprovalDate="2026-10-09", constructionEngineerApproval="Pending")),
    ("QTS-OPP-HCE-OBS-000002", "Closed", 2, 2, dict(vendor_id=c2.id, subject="Curing blankets not maintained", productDisposition="Use as is", **approved_both)),
    ("QTS-OPP-FSW-OBS-000003", "Open", 3, 3, dict(vendor_id=c1.id, subject="Three photos each — rows of two wrap")),
    ("QTS-OPP-HCE-OBS-000003", "Void", 1, 1, dict(vendor_id=c2.id, subject="Raised in error — void")),
    ("QTS-OPP-FSW-OBS-000004", "Open", 2, 1, dict(vendor_id=c1.id, subject="Legacy photo + uploaded photos — order")),
    ("QTS-OPP-HCE-OBS-000004", "Open", 4, 3, dict(vendor_id=c2.id, subject="Four pairs — the fourth has no After")),
    ("QTS-OPP-FSW-OBS-000005", "Open", 0, 2, dict(vendor_id=c1.id, subject="After photos only")),
]
LEGACY = {"QTS-OPP-FSW-OBS-000004"}

root = upload_root()
os.makedirs(os.path.join(root, "obs"), exist_ok=True)
colours = {"defectPhoto": (240, 190, 170), "improvementPhoto": (170, 220, 180)}
out = []
for number, status, n_before, n_after, extra in cases:
    obs_id = uuid.uuid4().hex
    fields = {**base, **extra}
    if number in LEGACY:
        legacy = lambda word, colour: "data:image/jpeg;base64," + base64.b64encode(_photo(f"{word} 0 legacy", colour, small=True)).decode()
        fields["defectPhotos"] = json.dumps([legacy("BEFORE", colours["defectPhoto"])])
        fields["improvementPhotos"] = json.dumps([legacy("AFTER", colours["improvementPhoto"])])
    db.add(models.OBS(id=obs_id, documentNumber=number, status=status, raiseDate="2026-10-05", dueDate="2026-10-15",
                      description=f"Review case {number}: {n_before} before / {n_after} after photos"
                                  + (" (+1 legacy each)" if number in LEGACY else "") + ".",
                      foundLocation="Building A, 2F", **fields))
    for category, count, word in (("defectPhoto", n_before, "BEFORE"), ("improvementPhoto", n_after, "AFTER")):
        for i in range(count):
            content = _photo(f"{word} {i + 1}", colours[category], portrait=(i == 1))   # 2nd photo portrait: mixed aspect
            rel = f"obs/{uuid.uuid4().hex}.jpg"
            with open(os.path.join(root, rel), "wb") as fh:
                fh.write(content)
            db.add(models.Attachment(id=uuid.uuid4().hex, entity_type="obs", entity_id=obs_id,
                                     file_name=f"{word.lower()}-{i + 1}.jpg", file_path=rel, file_size=len(content),
                                     mime_type="image/jpeg", category=category, uploaded_by="admin",
                                     uploaded_at=datetime.now(timezone.utc).isoformat(), is_deleted=False))
    out.append({"obs": number, "status": status, "before": n_before, "after": n_after})
db.commit()
print("SEED " + json.dumps({"ok": True, "project": proj.code, "cases": out}))
