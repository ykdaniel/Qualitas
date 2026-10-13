"""Seed for RELATED-DOCS-OPEN-2026-001 (isolated stack only).

One ITP and one NOI linked to it (NOI.itpNo = ITP.referenceNo), plus a second ITP so the check can tell
"the right record opened" from "some record opened".

    cd backend
    python scripts/verification/isolated_stack.py up --port 8292 --vite-port 3292 \
        --vite-script ../react-app/tests-browser/related-docs-open-vite-launcher.mjs > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> \
        --script scripts/verification/seed_related_docs_open_review.py
    python scripts/verification/isolated_stack.py down --root <root>

Password: Accept-Test-1234 (isolated test account only, same convention as the other verification seeds).
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


role = models.Role(name="RelatedReview")
role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    perms.ITP_VIEW, perms.ITP_UPDATE, perms.NOI_VIEW, perms.NOI_UPDATE,
    perms.ITR_VIEW, perms.CHECKLIST_VIEW, perms.CONTRACTOR_VIEW,
]]
d.add(role)
d.flush()

d.add(models.Project(id="REL-P1", name="Related Review", code="RELP1"))
d.add(models.Contractor(id="REL-V1", name="Related Review Contractor", abbreviation="RRV"))
item = {"id": "A1", "activity": {"en": "Activity 1", "ch": ""}, "standard": {"en": "Std", "ch": ""},
        "criteria": [{"en": "Crit", "ch": ""}], "checkTime": {"en": "t", "ch": ""}, "method": {"en": "m", "ch": ""},
        "frequency": {"en": "f", "ch": ""}, "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
        "record": "-", "isNew": False}
ITP_A, ITP_B = str(uuid.uuid4()), str(uuid.uuid4())
for itp_id, ref in [(ITP_A, "QTS-RKS-RRV-ITP-000001"), (ITP_B, "QTS-RKS-RRV-ITP-000002")]:
    d.add(models.ITP(id=itp_id, referenceNo=ref, description=f"Related {ref[-1]}", vendor_id="REL-V1",
                     project_id="REL-P1", status="Pending", rev="Rev1.0", submit="", submissionDate="2026-10-12",
                     detail_data=json.dumps({"a": [item], "b": [], "c": [], "checklist": [], "self_inspection": None})))
d.flush()
NOI_ID = str(uuid.uuid4())
d.add(models.NOI(id=NOI_ID, referenceNo="QTS-RKS-RRV-NOI-000001", project_id="REL-P1", package="Related NOI",
                 issueDate="2026-10-12", inspectionDate="2026-10-13", inspectionTime="09:00",
                 itpNo="QTS-RKS-RRV-ITP-000002", eventNumber="A1", checkpoint="H", type="General",
                 vendor_id="REL-V1", contacts="Test", phone="000", email="test@example.com", status="Open"))
user = models.User(username="related_review", email="relatedreview@example.com", is_active=True,
                   hashed_password=get_password_hash(PW), role_id=role.id, full_name="Related Review")
d.add(user)
d.commit()
d.add(models.UserProject(user_id=user.id, project_id="REL-P1"))
d.commit()
print("SEED " + json.dumps({"ok": True, "itp_b": ITP_B, "noi": NOI_ID}))
