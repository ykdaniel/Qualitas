"""Seed for tests-browser/save-failure.mjs (run through backend/scripts/verification/isolated_stack.py seed).

Creates five accounts (sf_user: NCR/OBS/NOI create+update and ncr:close; sf_user2: create+update; sf_noclose: like sf_user without ncr:close; sf_create: create only, NO update; sf_admin: delete only), one contractor, one ITP, and 16 NCR / OBS / NOI
records THROUGH THE REAL API (so the UI can save them). Record 9 of each kind is then given a legacy invalid date directly in the
isolated database. Prints one SEED line with the ids.
"""
import sys, json, os
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND); sys.path.insert(0, os.path.join(BACKEND, "tests"))
import main, database, models
import test_itr_revoke_approval_acceptance as T
from core import perms
from core.security import get_password_hash
from fastapi.testclient import TestClient
d = database.SessionLocal()
def role(name, codes):
    r = models.Role(name=name); r.permissions_rel = [T._get_or_create_perm(d, c) for c in codes]; d.add(r); d.flush(); return r
mods = [perms.NCR_VIEW, perms.NCR_CREATE, perms.NCR_UPDATE, perms.OBS_VIEW, perms.OBS_CREATE, perms.OBS_UPDATE, perms.NOI_VIEW, perms.NOI_CREATE, perms.NOI_UPDATE,
        perms.ITP_VIEW, perms.CONTRACTOR_VIEW, perms.ITR_VIEW, perms.KPI_VIEW, perms.USER_VIEW]
r1 = role("SaveFlow", mods + [perms.NCR_CLOSE])          # may also CLOSE an NCR (the backend requires ncr:close:all for that)
r5 = role("SaveFlowNoClose", mods)                       # ncr:update:all but NOT ncr:close:all
r3 = role("SaveFlow2", mods)
r4 = role("SaveFlowCreateOnly", [c for c in mods if not c.endswith(":update:all")])
r2 = role("SaveFlowAdmin", [perms.NCR_VIEW, perms.NCR_DELETE, perms.OBS_VIEW, perms.OBS_DELETE, perms.NOI_VIEW, perms.NOI_DELETE])
d.add(models.Contractor(id="ACC-V1", name="Accept Co", abbreviation="ACC"))
d.add(models.ITP(id="itp-1", referenceNo="QTS-ACC-ITP-000001", vendor_id="ACC-V1", description="i", rev="R", submit="s", status="Approved", submissionDate="2026-09-01"))
u1 = models.User(username="sf_user", email="sf@example.com", is_active=True, hashed_password=get_password_hash(T.PW), role_id=r1.id, full_name="SF User")
u2 = models.User(username="sf_admin", email="sfa@example.com", is_active=True, hashed_password=get_password_hash(T.PW), role_id=r2.id)
d.add_all([u1, u2, models.User(username="sf_user2", email="sf2@example.com", is_active=True, hashed_password=get_password_hash(T.PW), role_id=r3.id),
           models.User(username="sf_noclose", email="sfn@example.com", is_active=True, hashed_password=get_password_hash(T.PW), role_id=r5.id, full_name="SF NoClose"),
           models.User(username="sf_create", email="sfc@example.com", is_active=True, hashed_password=get_password_hash(T.PW), role_id=r4.id, full_name="SF Create")]); d.commit(); uid = u1.id; d.close()
c = TestClient(main.app, headers={"X-Forwarded-For": "127.0.0.1"})
assert c.post("/api/auth/login", data={"username": "sf_user", "password": T.PW}).status_code == 200
c.headers["X-CSRF-Token"] = c.cookies.get("csrf_token")
out = {"uid": uid, "ncr": [], "obs": [], "noi": []}
for i in range(1, 17):
    r = c.post("/api/ncr/", json=dict(vendor="Accept Co", description=f"NCR SUBJ {i}", rev="", submit="v", status="Open", hasDetails=True, raiseDate="2026-09-02", closeoutDate="2026-09-10", type="Design", subject=f"NCR SUBJ {i}",
        severity="Minor", discipline="Civil", foundBy="QA", raisedBy="QA", foundLocation="Grid A", referenceStandards="SPEC", deviation="dev", assignedTo=uid, productDisposition="", ownerApproval="", ownerApprovalBy="", ownerApprovalDate="", ownerApprovalNotes="")); assert r.status_code == 200, r.text
    out["ncr"].append(r.json()["id"])
    r = c.post("/api/obs/", json=dict(vendor="Accept Co", description=f"OBS DESC {i}", rev="", submit="v", status="Open", hasDetails=True, raiseDate="2026-09-02", subject=f"OBS SUBJ {i}", foundBy="QA", raisedBy="QA", foundLocation="Grid A")); assert r.status_code == 200, r.text
    out["obs"].append(r.json()["id"])
    r = c.post("/api/noi/", json=dict(package=f"NOI SUBJ {i}", referenceNo="", issueDate="2026-09-02", inspectionDate="2026-09-12", inspectionTime="09:00", itpNo="QTS-ACC-ITP-000001", eventNumber="EV1", checkpoint="H", type="Rebar",
        contractor="Accept Co", contacts="Bob", phone="123", email="b@example.com", status="Open", attachments=[], ncrNumber="", remark="", closeoutDate="", dueDate="")); assert r.status_code == 200, r.text
    out["noi"].append(r.json()["id"])
# four NCRs that are overdue (raised 2025-01-02, due 2025-01-16) and satisfy every closure requirement except the effectiveness verdict the
# user gives in the UI: for the late-closure browser scenarios. Linked to an existing NOI so the "NCR closed" hint has a NOI to name.
out["ncr_ready"] = []
for i in range(1, 5):
    r = c.post("/api/ncr/", json=dict(vendor="Accept Co", description=f"NCR READY {i}", rev="", submit="v", status="Open", hasDetails=True, raiseDate="2025-01-02", dueDate="2025-01-16",
        type="Design", subject=f"NCR READY {i}", severity="Minor", discipline="Civil", foundBy="QA", raisedBy="QA", foundLocation="Grid A", referenceStandards="SPEC",
        deviation="dev", assignedTo=uid, productDisposition="", ownerApproval="", ownerApprovalBy="", ownerApprovalDate="", ownerApprovalNotes="")); assert r.status_code == 200, r.text
    out["ncr_ready"].append(r.json()["id"])
d = database.SessionLocal()
noi_ref = d.query(models.NOI).filter_by(id=out["noi"][0]).one().referenceNo
for nid in out["ncr_ready"]:
    d.query(models.NCR).filter_by(id=nid).update(dict(productDisposition="Use As Is", ownerApproval="Approved", reInspectionNumber="ITR-1", drawingNo="D1", specNo="S1",
        qtyAffected="1", extent="Isolated", effectivenessVerified="Pending", noiNumber=noi_ref))
# each of them carries a REAL improvement photo the way the server needs it (2026-09-21): an image file under this stack's upload root + its attachments
# row. (A path string in improvementPhotos no longer supports a closure.)
import base64, uuid
from datetime import datetime
from core.uploads import upload_root
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
os.makedirs(os.path.join(upload_root(), "ncr"), exist_ok=True)
for nid in out["ncr_ready"]:
    rel = f"ncr/{uuid.uuid4().hex}.png"
    with open(os.path.join(upload_root(), rel), "wb") as fh:
        fh.write(PNG)
    d.add(models.Attachment(id=uuid.uuid4().hex, entity_type="ncr", entity_id=nid, file_name="seeded-after.png", file_path=rel, file_size=len(PNG), mime_type="image/png",
                            category="improvementPhoto", uploaded_by="seed", uploaded_at=datetime.now().isoformat(), is_deleted=False))
d.commit(); d.close()

# four more like them, but WITHOUT any legacy improvementPhotos: their only possible photos are real attachments uploaded to the saved record
out["ncr_nophoto"] = []
for i in range(1, 5):
    r = c.post("/api/ncr/", json=dict(vendor="Accept Co", description=f"NCR NOPHOTO {i}", rev="", submit="v", status="Open", hasDetails=True, raiseDate="2025-01-02", dueDate="2025-01-16",
        type="Design", subject=f"NCR NOPHOTO {i}", severity="Minor", discipline="Civil", foundBy="QA", raisedBy="QA", foundLocation="Grid A", referenceStandards="SPEC",
        deviation="dev", assignedTo=uid, productDisposition="", ownerApproval="", ownerApprovalBy="", ownerApprovalDate="", ownerApprovalNotes="")); assert r.status_code == 200, r.text
    out["ncr_nophoto"].append(r.json()["id"])
d = database.SessionLocal()
for nid in out["ncr_nophoto"]:
    d.query(models.NCR).filter_by(id=nid).update(dict(productDisposition="Use As Is", ownerApproval="Approved", reInspectionNumber="ITR-1", drawingNo="D1", specNo="S1",
        qtyAffected="1", extent="Isolated", effectivenessVerified="Pending", noiNumber=noi_ref))
d.commit(); d.close()
# record 9 of each kind carries a historical bad date (written straight to the isolated DB, as a legacy row would be)
d = database.SessionLocal()
d.query(models.NCR).filter_by(id=out["ncr"][8]).update({"raiseDate": "garbage", "dueDate": "2026-09-19", "closeoutDate": None})
d.query(models.OBS).filter_by(id=out["obs"][8]).update({"raiseDate": "2026-09-20T10:00:00Z"})
d.query(models.NOI).filter_by(id=out["noi"][8]).update({"issueDate": "2026-02-30"})
# NOI record 14 (index 13) already has one stored file in its own attachments list, for the delete-failure scenario
d.query(models.NOI).filter_by(id=out["noi"][13]).update({"attachments": json.dumps([{"id": "pre-noi", "entity_type": "noi", "entity_id": out["noi"][13], "file_name": "old.txt", "file_url": "/api/files/download/pre-noi", "category": "attachment", "uploaded_at": "2026-09-01T00:00:00+00:00", "mime_type": "text/plain"}])})
d.commit(); d.close()
print("SEED", json.dumps(out))
