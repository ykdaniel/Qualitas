"""Isolated TEST SEED SCRIPT for ITP-INPUT-UX-2026-001 (2026-10-04) — writes test fixtures
to an isolated database; it is a seed script, not a read-only script.

Isolated stack only. Requires ITP_INPUT_UX_PASSWORD in the environment (no hardcoded or
defaulted password). Enforces QUALITAS_REQUIRE_ISOLATED_DB=1 via core.startup_guard.

One active contractor, one ITP record pre-seeded with two realistic-length inspection
items (Phase A and Phase B) so the review can exercise Edit and Copy against real content
immediately, without first having to hand-type everything. Adding further items (including
a long Phase C item) is done live in the browser as part of the review itself.
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import json
import database, models
from core.security import get_password_hash

PW = os.environ.get("ITP_INPUT_UX_PASSWORD")
if not PW:
    raise RuntimeError("ITP_INPUT_UX_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


role = models.Role(name="ITPInputUXFull")
role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    "itp:view:all", "itp:create:all", "itp:update:all", "contractors:view:all",
]]
d.add(role)
d.flush()

user = models.User(username="itpux_full", email="itpux@example.com", is_active=True,
                    hashed_password=get_password_hash(PW), role_id=role.id, full_name="ITP Input UX Full")
d.add(user)
d.add(models.Project(id="IUX-P1", name="ITP Input UX Review", code="IUX1"))
d.add(models.Contractor(id="IUX-VA", name="Sunrise Structural Engineering Co.", abbreviation="SSE",
                         package="Civil Works", scope="Structural", status="active",
                         contactPerson="Hu Wenjie", email="hu@sunrise-structural.example.com",
                         phone="0933-222-111", address="88 Sunrise Rd."))
d.commit()
d.add(models.UserProject(user_id=user.id, project_id="IUX-P1"))
d.commit()

# Two realistic-length inspection items (one per phase), matching the detail_data shape
# ({ a: [], b: [], c: [] } keyed by lowercase phase letter — see backend/models.py:33 and
# react-app/src/constants/itp.ts's PHASES A/B/C) and the InspectionItem fields used by
# ITPAdvancedEditor.tsx (activity/standard/criteria/checkTime/method/frequency/vp/record).
detail_data = {
    "a": [
        {
            "phase": "A", "id": "A1",
            "activity": {"en": "Verify rebar material certificates and mill test reports against approved shop drawings prior to placement",
                         "ch": "施工前核對鋼筋材質證明文件與原廠測試報告是否與核准施工圖一致"},
            "standard": {"en": "ACI 318-19 Chapter 20; Project Specification Section 03 20 00", "ch": "ACI 318-19 第20章；專案規範 03 20 00"},
            "criteria": [
                {"en": "Mill certificate heat number matches the delivered bundle tag number", "ch": "原廠證明爐號須與到貨捆紮標籤爐號一致"},
                {"en": "Yield strength and tensile strength meet or exceed Grade 60 (420 MPa) requirements", "ch": "降伏強度與抗拉強度須達到或超過 Grade 60（420 MPa）要求"},
            ],
            "checkTime": {"en": "Prior to rebar fabrication", "ch": "鋼筋加工前"},
            "method": {"en": "Visual document review and cross-check against delivery log", "ch": "文件目視審查並與到貨紀錄交叉核對"},
            "frequency": {"en": "Each delivery batch", "ch": "每批到貨"},
            "vp": {"sub": "W", "teco": "R", "employer": "", "hse": ""},
            "record": "-",
        },
    ],
    "b": [
        {
            "phase": "B", "id": "B1",
            "activity": {"en": "Inspect rebar spacing, cover thickness, and lap splice length at column and beam junctions before concrete pour",
                         "ch": "澆置混凝土前檢查梁柱接頭處鋼筋間距、保護層厚度及搭接長度"},
            "standard": {"en": "ACI 318-19 Section 25.5; Structural Drawing S-301 Rev.C", "ch": "ACI 318-19 第25.5節；結構圖 S-301 Rev.C"},
            "criteria": [
                {"en": "Clear cover not less than 40mm for columns exposed to weather", "ch": "外露於氣候之柱體保護層不得小於40mm"},
                {"en": "Lap splice length at least 40 times bar diameter unless noted otherwise on drawings", "ch": "搭接長度至少為鋼筋直徑之40倍，圖面另有註明者除外"},
                {"en": "Stirrup spacing matches drawing within +/-10mm tolerance", "ch": "箍筋間距須符合圖面規定，容許誤差正負10mm"},
            ],
            "checkTime": {"en": "Before concrete pour, after rebar tie-off complete", "ch": "混凝土澆置前，鋼筋綁紮完成後"},
            "method": {"en": "Physical measurement with tape measure and caliper, photographic record", "ch": "以捲尺及卡尺實測，並拍照存證"},
            "frequency": {"en": "Every pour section", "ch": "每一澆置區段"},
            "vp": {"sub": "H", "teco": "H", "employer": "W", "hse": ""},
            "record": "-",
        },
    ],
    "c": [],
}

itp = models.ITP(id="iux-itp-1", project_id="IUX-P1", vendor_id="IUX-VA",
                  referenceNo="QTS-IUX1-ITP-000001",
                  description="Structural Rebar Installation Inspection and Test Plan for East Wing Foundation and Columns",
                  rev="Rev1.0", submit="Contractor", status="Pending",
                  submissionDate="2026-10-01", dueDate="2026-10-15",
                  hasDetails=True, detail_data=json.dumps(detail_data))
d.add(itp)
d.commit()
d.close()
print("SEED OK")
