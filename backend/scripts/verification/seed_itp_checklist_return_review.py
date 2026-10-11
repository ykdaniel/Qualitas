"""Seed for ITP-CHECKLIST-RETURN-2026-001 (isolated stack only).

Two ITPs in one project; ITP-A has an inspection item whose Record is the recordsNo of a Checklist
template linked to ITP-A. The browser check opens ITP-A, follows that Record link into the
Checklist, presses the Checklist's Cancel/Back and expects ITP-A's edit window again (not ITP-B,
not the bare list).

    cd backend
    python scripts/verification/isolated_stack.py up --port 8291 --vite-port 3291 \
        --vite-script ../react-app/tests-browser/itp-checklist-return-vite-launcher.mjs > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> \
        --script scripts/verification/seed_itp_checklist_return_review.py
    python scripts/verification/isolated_stack.py down --root <root>

Password: Accept-Test-1234 (isolated test account only).
"""
import sys, os, json, uuid
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models
from core import perms
from core.security import get_password_hash

PW = "Accept-Test-1234"
d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


role = models.Role(name="ReturnReview")
role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE,
    perms.CHECKLIST_VIEW, perms.CHECKLIST_CREATE, perms.CHECKLIST_UPDATE,
    perms.NOI_VIEW, perms.ITR_VIEW, perms.CONTRACTOR_VIEW,
]]
d.add(role)
d.flush()

d.add(models.Project(id="RET-P1", name="ITP Return Review", code="RETP1"))
d.add(models.Contractor(id="RET-V1", name="Return Review Contractor", abbreviation="RRC"))


def item(i, rec):
    return {"id": f"A{i}", "activity": {"en": f"Activity {i}", "ch": f"項目{i}"},
            "standard": {"en": "Approved drawings", "ch": ""},
            "criteria": [{"en": f"Criteria {i}", "ch": ""}],
            "checkTime": {"en": "Upon delivery to site", "ch": "材料進場"},
            "method": {"en": "Visual", "ch": "目視"}, "frequency": {"en": "Each batch", "ch": "每批"},
            "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"}, "record": rec, "isNew": False}


ITP_A, ITP_B = str(uuid.uuid4()), str(uuid.uuid4())
CHK_NO = "QTS-RKS-RRC-CHK-000001"
for itp_id, ref, rec in [(ITP_A, "QTS-RKS-RRC-ITP-000001", CHK_NO), (ITP_B, "QTS-RKS-RRC-ITP-000002", "-")]:
    d.add(models.ITP(id=itp_id, referenceNo=ref, description=f"Return Review {ref[-1]}", vendor_id="RET-V1",
                     project_id="RET-P1", status="Pending", rev="Rev1.0", submit="", submissionDate="2026-10-11",
                     detail_data=json.dumps({"a": [item(1, rec)], "b": [], "c": [], "checklist": [], "self_inspection": None})))

d.add(models.Checklist(id=str(uuid.uuid4()), recordsNo=CHK_NO, activity="Return Review Template", date="2026-10-11",
                       status="Ongoing", itpId=ITP_A, itpVersion="Rev1.0", project_id="RET-P1", contractor_id="RET-V1",
                       detail_data=json.dumps({"items": [{"id": 1, "item": "[A1] Activity 1", "criteria": "Criteria 1",
                                                          "situation": "", "result": ""}]})))

user = models.User(username="return_review", email="returnreview@example.com", is_active=True,
                   hashed_password=get_password_hash(PW), role_id=role.id, full_name="Return Review")
d.add(user)
d.commit()
d.add(models.UserProject(user_id=user.id, project_id="RET-P1"))
d.commit()
print("SEED " + json.dumps({"ok": True, "itp_a": ITP_A, "itp_b": ITP_B, "chk": CHK_NO}))
