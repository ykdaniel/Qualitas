"""Isolated TEST SEED SCRIPT for CHECKLIST-TEMPLATE-LAYOUT-2026-001 — writes test fixtures to an isolated database; it is
a seed script, not a read-only script.

Isolated stack only. Requires CHK_LAYOUT_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password).

Creates one project, one contractor, one reviewer (ITP / Checklist / ITR view + update), one view-only reviewer
(chk_layout_view — the read-only rule) and:
  * a bare Checklist template with short and long Item / Criteria texts (one Criteria holds an old line break);
  * an ITP whose inspection item's Record is that template's number, so the template opens from the ITP with
    from=itp&returnItp=<ITP id> (the user's route);
  * the two cases in which this editor shows the Actual Situation / Result columns (an ITR-linked instance is not
    listed on the Checklist page — the ITR opens it in ChecklistSnapshotModal — so it is not one of them):
      - QTS-CTL1-HL-CHK-000002: an instance made from the template (template_id set) whose ITR link is empty —
        editable result columns;
      - QTS-CTL1-HL-CHK-000003: a bare template that still carries historical results (status Pass) — shown
        read-only.
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import json
import uuid
import database, models
from core.security import get_password_hash

PW = os.environ.get("CHK_LAYOUT_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("CHK_LAYOUT_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


role = models.Role(name="ChecklistTemplateLayoutReview")
role.permissions_rel = [_perm(c) for c in ("checklist:view:all", "checklist:create:all", "checklist:update:all",
                                            "itp:view:all", "itp:update:all", "itr:view:all",
                                            "noi:view:all", "contractors:view:all")]
d.add(role)
d.flush()
user = models.User(username="chk_layout", email="chk.layout@example.com", is_active=True,
                   hashed_password=get_password_hash(PW), role_id=role.id, full_name="Checklist Layout Reviewer")
d.add(user)
view_role = models.Role(name="ChecklistTemplateLayoutViewOnly")
view_role.permissions_rel = [_perm(c) for c in ("checklist:view:all", "itp:view:all", "itr:view:all", "noi:view:all",
                                                 "contractors:view:all")]
d.add(view_role)
d.flush()
viewer = models.User(username="chk_layout_view", email="chk.layout.view@example.com", is_active=True,
                     hashed_password=get_password_hash(PW), role_id=view_role.id, full_name="Checklist Layout Viewer")
d.add(viewer)
d.add(models.Project(id="CTL-P1", name="Checklist Layout Review", code="CTL1"))
d.add(models.Contractor(id="CTL-V1", name="Hailong Construction", abbreviation="HL", status="active"))
d.flush()
d.add(models.UserProject(user_id=user.id, project_id="CTL-P1"))
d.add(models.UserProject(user_id=viewer.id, project_id="CTL-P1"))

ITEMS = [
    ("[A1] Material check (板材進場檢查)",
     "Manufacturer, size and grade comply with the approved material submittal; mill certificates available; "
     "no visible damage, corrosion or deformation (製造商、尺寸與等級符合核准送審資料，附出廠證明，外觀無損傷)"),
    ("[A2] Bolt torque", "Per ITP table 3"),
    ("[A3] Welding visual inspection (焊道外觀)",
     "No cracks, porosity or undercut > 0.5 mm per AWS D1.1 Table 8.1\n"
     "Weld size ≥ drawing size; profile per Figure 7.4"),
    ("[A4] Coating thickness", "DFT 250–350 µm, average of 5 spot readings per 10 m²"),
]
TEMPLATE_NO = "QTS-CTL1-HL-CHK-000001"
INSTANCE_NO = "QTS-CTL1-HL-CHK-000002"
template_id, instance_id = uuid.uuid4().hex, uuid.uuid4().hex
header = {"packageName": "RKS", "contractor": "Hailong Construction", "location": "", "stage": "Before", "revision": 0,
          "referenceNo": "", "remarks": "1. Mark 'O' for passed items, 'X' for failed items, and '/' for N/A items."}
blank_items = [{"id": i + 1, "item": it, "criteria": cr, "situation": "", "result": ""} for i, (it, cr) in enumerate(ITEMS)]
d.add(models.Checklist(id=template_id, recordsNo=TEMPLATE_NO, activity="Steel structure erection", date="2026-10-12",
                       status="Ongoing", passCount=0, failCount=0, packageName="RKS", project_id="CTL-P1",
                       contractor_id="CTL-V1",
                       detail_data=json.dumps({**header, "activity": "Steel structure erection", "inspectionDate": "",
                                               "items": blank_items}, ensure_ascii=False)))


def itp_item(i, activity, rec):
    return {"id": f"A{i}", "activity": {"en": activity, "ch": ""}, "standard": {"en": "Approved drawings", "ch": ""},
            "criteria": [{"en": "See checklist", "ch": ""}], "checkTime": {"en": "Upon delivery to site", "ch": ""},
            "method": {"en": "Visual", "ch": ""}, "frequency": {"en": "Each batch", "ch": ""},
            "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"}, "record": rec, "isNew": False}


itp_id = uuid.uuid4().hex
d.add(models.ITP(id=itp_id, referenceNo="QTS-CTL1-HL-ITP-000001", description="Steel structure erection",
                 vendor_id="CTL-V1", project_id="CTL-P1", status="Pending", rev="Rev1.0", submit="",
                 submissionDate="2026-10-12",
                 detail_data=json.dumps({"a": [itp_item(1, "Material check", TEMPLATE_NO)], "b": [], "c": [],
                                         "checklist": [], "self_inspection": None})))

results = [("Mill certificates checked, all plates per submittal", "O"), ("", ""),
           ("One porosity indication at joint J12, marked for repair", "X"), ("N/A — coating by others", "/")]
inst_items = [{**it, "situation": s, "result": r} for it, (s, r) in zip(blank_items, results)]
inst_items[3]["naReason"] = "Coating is in another package"
d.add(models.Checklist(id=instance_id, recordsNo=INSTANCE_NO, activity="Steel structure erection", date="2026-10-12",
                       status="Ongoing", passCount=1, failCount=1, packageName="RKS", project_id="CTL-P1",
                       contractor_id="CTL-V1", template_id=template_id,
                       detail_data=json.dumps({**header, "activity": "Steel structure erection",
                                               "inspectionDate": "2026-10-12",
                                               "agreementChecked": False, "ncrNo": "", "reInspectionDate": "",
                                               "signatures": {"siteEngineer": "", "constructionLeader": "",
                                                              "subcontractorRep": ""},
                                               "items": inst_items}, ensure_ascii=False)))
HISTORICAL_NO = "QTS-CTL1-HL-CHK-000003"
d.add(models.Checklist(id=uuid.uuid4().hex, recordsNo=HISTORICAL_NO, activity="Steel structure erection (legacy)",
                       date="2024-03-20", status="Pass", passCount=1, failCount=1, packageName="RKS",
                       project_id="CTL-P1", contractor_id="CTL-V1",
                       detail_data=json.dumps({**header, "activity": "Steel structure erection (legacy)",
                                               "inspectionDate": "2024-03-20", "items": inst_items},
                                              ensure_ascii=False)))
d.commit()
print("SEED " + json.dumps({"ok": True, "template": TEMPLATE_NO, "template_id": template_id, "instance": INSTANCE_NO,
                            "instance_id": instance_id, "historical": HISTORICAL_NO, "itp_id": itp_id}))
