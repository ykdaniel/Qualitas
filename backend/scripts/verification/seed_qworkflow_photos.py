"""Seed for tests-browser/qworkflow-photo-matrix.mjs (run through backend/scripts/verification/isolated_stack.py seed; isolated stack only).

One NOI + one ITR + NCR(s) per case, all through the real API except the ITR and the two HISTORICAL Closed rows (written straight to the isolated DB, as an
import would). Read-only investigation aid for the Q-Workflow "improvement" checkpoint (2026-09-21): it changes no business rule.
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
mods = [perms.NCR_VIEW, perms.NCR_CREATE, perms.NCR_UPDATE, perms.NCR_CLOSE, perms.NOI_VIEW, perms.NOI_CREATE, perms.NOI_UPDATE, perms.ITP_VIEW, perms.CONTRACTOR_VIEW,
        perms.ITR_VIEW, perms.KPI_VIEW, perms.USER_VIEW]
r1 = role("QwUser", mods)
r2 = role("QwNoUpdate", [perms.NCR_VIEW, perms.NOI_VIEW, perms.ITP_VIEW, perms.CONTRACTOR_VIEW, perms.ITR_VIEW, perms.KPI_VIEW, perms.USER_VIEW])   # ncr:view:all only, no update
d.add(models.Contractor(id="ACC-V1", name="Accept Co", abbreviation="ACC"))
d.add(models.ITP(id="itp-1", referenceNo="QTS-ACC-ITP-000001", vendor_id="ACC-V1", description="i", rev="R", submit="s", status="Approved", submissionDate="2026-09-01"))
u = models.User(username="qw_user", email="qw@example.com", is_active=True, hashed_password=get_password_hash(T.PW), role_id=r1.id, full_name="QW User")
d.add(u)
d.add(models.User(username="qw_noupdate", email="qwn@example.com", is_active=True, hashed_password=get_password_hash(T.PW), role_id=r2.id, full_name="QW NoUpdate"))
d.commit(); uid = u.id; d.close()
c = TestClient(main.app, headers={"X-Forwarded-For": "127.0.0.1"})
assert c.post("/api/auth/login", data={"username": "qw_user", "password": T.PW}).status_code == 200
c.headers["X-CSRF-Token"] = c.cookies.get("csrf_token")
out = {"cases": {}}
READY = dict(productDisposition="Rework", repairMethodStatement="fix", reInspectionNumber="ITR-1", drawingNo="D1", specNo="S1", qtyAffected="1", extent="Isolated", effectivenessVerified="Yes")
def make(case, n_ncr=1, kinds=None):
    r = c.post("/api/noi/", json=dict(package=f"QW {case}", referenceNo="", issueDate="2026-09-02", inspectionDate="2026-09-12", inspectionTime="09:00", itpNo="QTS-ACC-ITP-000001", eventNumber="EV1",
        checkpoint="H", type="Rebar", contractor="Accept Co", contacts="Bob", phone="123", email="b@example.com", status="Open", attachments=[], ncrNumber="", remark="", closeoutDate="", dueDate=""))
    assert r.status_code == 200, r.text
    noi_id, noi_ref = r.json()["id"], r.json()["referenceNo"]
    dd = database.SessionLocal()
    dd.add(models.ITR(id=f"itr-{case}", vendor_id="ACC-V1", documentNumber=f"ITR-QW-{case}", description="x", rev="A", submit="s", status="In Progress", noiNumber=noi_ref, raiseDate="2026-09-12"))
    dd.commit(); dd.close()
    ids = []
    for k in range(n_ncr):
        r = c.post("/api/ncr/", json=dict(vendor="Accept Co", description=f"NCR {case}{k}", rev="", submit="v", status="Open", hasDetails=True, raiseDate="2025-01-02", dueDate="2025-01-16", type="Design",
            subject=f"NCR {case}{k}", severity="Minor", discipline="Civil", foundBy="QA", raisedBy="QA", foundLocation="Grid A", referenceStandards="SPEC", deviation="dev", assignedTo=uid,
            productDisposition="", ownerApproval="", ownerApprovalBy="", ownerApprovalDate="", ownerApprovalNotes="")); assert r.status_code == 200, r.text
        ids.append(r.json()["id"])
    dd = database.SessionLocal()
    for nid in ids:
        dd.query(models.NCR).filter_by(id=nid).update(dict(noiNumber=noi_ref, **READY))
    dd.commit(); dd.close()
    out["cases"][case] = {"noi": noi_id, "noiRef": noi_ref, "ncrs": ids}
    return ids
for case in ["A", "B", "C", "D", "E", "E2", "F", "G", "H", "I", "J", "K", "L", "U", "R", "Y"]:
    make(case)
make("M", 3)        # multi-NCR: m0 valid attachment, m1 legacy JSON only, m2 to be Voided
make("N", 2)        # multi-NCR: both valid attachments
# historical rows: written straight to the DB, as an import would (I: Closed with legacy JSON only; J: Closed with nothing)
dd = database.SessionLocal()
dd.query(models.NCR).filter_by(id=out["cases"]["I"]["ncrs"][0]).update(dict(status="Closed", closeoutDate="2025-01-10", improvementPhotos='["/uploads/old-a.jpg"]', ownerApproval="Approved"))
dd.query(models.NCR).filter_by(id=out["cases"]["J"]["ncrs"][0]).update(dict(status="Closed", closeoutDate="2025-01-10", ownerApproval="Approved"))
# K / L / R: historical Closed rows the API steps never touch — K nothing on record, L old string only (both for the tracker page), R old string only (reopened in the browser scenario);
# Y: an ordinary open NCR that ALREADY carries "effectivenessVerified = Yes" and has no photo (left as seeded on purpose: it reproduces the known usability trap, BACKLOG #33.4)
# U: an ordinary open NCR for the UI upload -> close flow (its verdict is NOT "Yes" yet — with "Yes" the form would already try to close it)
dd.query(models.NCR).filter_by(id=out["cases"]["U"]["ncrs"][0]).update(dict(effectivenessVerified="Pending"))
dd.query(models.NCR).filter_by(id=out["cases"]["K"]["ncrs"][0]).update(dict(status="Closed", closeoutDate="2025-01-10", ownerApproval="Approved"))
dd.query(models.NCR).filter_by(id=out["cases"]["L"]["ncrs"][0]).update(dict(status="Closed", closeoutDate="2025-01-10", improvementPhotos='["/uploads/old-l.jpg"]', ownerApproval="Approved"))
dd.query(models.NCR).filter_by(id=out["cases"]["R"]["ncrs"][0]).update(dict(status="Closed", closeoutDate="2025-01-10", improvementPhotos='["/uploads/old-r.jpg"]', ownerApproval="Approved"))
dd.commit(); dd.close()
print("SEED " + json.dumps(out))
