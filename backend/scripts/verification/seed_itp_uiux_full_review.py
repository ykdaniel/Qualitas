"""Seed for a full ITP UI/UX walkthrough (2026-09-28; isolated stack only, review-only, no code
change this batch). Builds one realistic ITP with ~15 inspection items spread across all three
phases, varying content length, and a couple of items genuinely linked to a real ITR / Checklist
record — enough to see the screen the way a user with a substantial, real plan actually would,
not a 1-2-item toy fixture.

    cd backend
    python scripts/verification/isolated_stack.py up --port 8099 --vite-port 3099 --vite-script <vite_multi.mjs> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_uiux_full_review.py
    (then drive a Playwright script for screenshots)
    python scripts/verification/isolated_stack.py down --root <root>

Password: Accept-Test-1234
Account: uiux_reviewer — itp:view/create/update/approve/void:all, checklist:create:all,
    contractors:view:all. Scoped to UIR-P1.
"""
import sys, os, json
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


def role(name, codes):
    r = models.Role(name=name)
    r.permissions_rel = [_get_or_create_perm(d, c) for c in codes]
    d.add(r)
    d.flush()
    return r


full = role("UiuxReviewer", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.ITP_APPROVE,
                              perms.ITP_VOID, perms.CHECKLIST_CREATE, perms.CONTRACTOR_VIEW])

d.add(models.Contractor(id="UIR-V1", name="Formwork & Rebar Co", abbreviation="FWR"))
d.add(models.Project(id="UIR-P1", name="ITP UI/UX Full Review Project"))

user = models.User(username="uiux_reviewer", email="uiuxr@example.com", is_active=True,
                    hashed_password=get_password_hash(PW), role_id=full.id, full_name="UIUX Reviewer")
d.add(user)
d.commit()
d.add(models.UserProject(user_id=user.id, project_id="UIR-P1"))
d.commit()

# A real ITR and a real Checklist so two of the ITP items can genuinely link to existing records
# (clicking "Record" should actually navigate somewhere real, not a dead link).
d.add(models.ITR(id="uir-itr-1", project_id="UIR-P1", vendor_id="UIR-V1",
                  documentNumber="QTS-UIR-ITR-000001", description="Rebar spacing pre-pour check",
                  rev="Rev1.0", status="Approved", type="Hold Point"))
d.add(models.Checklist(id="uir-chk-1", recordsNo="QTS-UIR-CHK-000001", date="2026-09-20",
                        status="Pass", activity="Formwork alignment checklist",
                        detail_data=json.dumps({"items": []})))
d.commit()


def vp(sub='', teco='', employer='', hse=''):
    return {"sub": sub, "teco": teco, "employer": employer, "hse": hse}


def item(phase, idx, activity_en, activity_ch, criteria, check_time='', method='', frequency='',
         record='-', v=None):
    return {
        "id": f"{phase}{idx}", "phase": phase,
        "activity": {"en": activity_en, "ch": activity_ch},
        "standard": {"en": "ACI 318 / Project Spec Section 3", "ch": "ACI 318／專案規範第三節"},
        "criteria": criteria,
        "checkTime": {"en": check_time, "ch": ""},
        "method": {"en": method, "ch": ""},
        "frequency": {"en": frequency, "ch": ""},
        "vp": v or vp(),
        "record": record,
    }


items = [
    item("A", 1, "Rebar size and grade verification", "鋼筋尺寸與等級確認",
         [{"en": "Matches approved shop drawing", "ch": "符合核准施工圖"}],
         "Before concrete pour", "Visual + caliper measurement", "Every pour", "-", vp(sub="H")),
    item("A", 2, "Rebar spacing check", "鋼筋間距檢查",
         [{"en": "Spacing within ±10mm tolerance", "ch": "間距在±10mm公差內"},
          {"en": "No visible displacement from vibration", "ch": "震動後無明顯位移"}],
         "Before concrete pour", "Tape measurement at 5 points", "Every pour",
         "QTS-UIR-ITR-000001", vp(sub="H", teco="W")),
    item("A", 3, "Cover block placement", "墊塊放置",
         [{"en": "Cover blocks at 1m intervals both directions", "ch": "墊塊雙向間隔1公尺"}],
         "Before formwork close-up", "Visual", "Every pour", "-", vp(sub="H")),
    item("A", 4, "Formwork alignment and level", "模板校準與水平度",
         [{"en": "Vertical tolerance within 5mm/3m", "ch": "垂直公差5mm/3m內"},
          {"en": "Level tolerance within 3mm", "ch": "水平公差3mm內"},
          {"en": "No visible gaps at joints", "ch": "接縫無明顯縫隙"}],
         "Before concrete pour", "Level + plumb bob", "Every pour",
         "QTS-UIR-CHK-000001", vp(sub="H", teco="H", employer="W")),
    item("A", 5, "Formwork tie spacing", "模板繫材間距",
         [{"en": "Ties per approved shoring drawing", "ch": "依核准支撐圖配置繫材"}],
         "Before concrete pour", "Visual + count", "Every pour", "-", vp(sub="H")),
    item("A", 6, "Embedded items location check", "預埋件位置檢查",
         [{"en": "Conduits and sleeves per MEP coordination drawing", "ch": "依機電協調圖確認管線位置"}],
         "Before concrete pour", "Visual + measurement", "Every pour", "-", vp(sub="H", teco="W")),
    item("B", 1, "Concrete slump test", "混凝土坍度試驗",
         [{"en": "Slump within specified range (100-150mm)", "ch": "坍度符合規範(100-150mm)"}],
         "At point of placement", "Slump cone per ASTM C143", "Every truck", "-", vp(sub="H", teco="H")),
    item("B", 2, "Concrete cube sampling", "混凝土試體取樣",
         [{"en": "3 cubes per 50m3 or per pour", "ch": "每50立方米或每次澆置取3組試體"},
          {"en": "Cured per ASTM C31", "ch": "依ASTM C31養護"}],
         "During placement", "Standard cube mould", "Every pour", "-", vp(sub="H", teco="H", employer="W")),
    item("B", 3, "Concrete placement method and consolidation", "混凝土澆置方式與搗實",
         [{"en": "No free-fall over 1.5m", "ch": "自由落下不超過1.5公尺"},
          {"en": "Vibration at 300-500mm intervals", "ch": "振動棒間距300-500mm"}],
         "During placement", "Visual + vibrator log", "Continuous during pour", "-", vp(sub="H")),
    item("B", 4, "Curing method verification", "養護方式確認",
         [{"en": "Curing compound or wet burlap applied within 2hrs", "ch": "澆置後2小時內施作養護劑或濕麻布"}],
         "After finishing", "Visual", "Every pour", "-", vp(sub="W")),
    item("C", 1, "Concrete surface finish inspection", "混凝土表面完成度檢查",
         [{"en": "No honeycombing or exposed rebar", "ch": "無蜂窩或鋼筋外露"},
          {"en": "No cold joints visible", "ch": "無明顯冷縫"}],
         "After formwork strike", "Visual", "Every element", "-", vp(sub="H", teco="H", employer="H")),
    item("C", 2, "Dimensional check against drawing", "尺寸核對施工圖",
         [{"en": "Within ±10mm of drawing dimension", "ch": "與圖面尺寸公差±10mm內"}],
         "After formwork strike", "Tape measurement", "Every element", "-", vp(sub="H")),
    item("C", 3, "Cube compressive strength result review", "試體抗壓強度結果審查",
         [{"en": "7-day and 28-day results meet design strength", "ch": "7天與28天強度符合設計強度"}],
         "28 days after pour", "Lab test report review", "Every batch", "-", vp(teco="H", employer="H")),
    item("C", 4, "Rectification of surface defects (if any)", "表面缺陷修補（若有）",
         [{"en": "Repair per approved method statement", "ch": "依核准施工方法說明修補"}],
         "As needed", "Visual re-inspection", "As needed", "-", vp(sub="W")),
    item("C", 5, "Final housekeeping and photo documentation", "最終清潔與照片存證",
         [{"en": "Work area clean, photos filed", "ch": "工作區域清潔完成，照片存檔"}],
         "Before handover", "Visual + photo log", "Every element", "-", vp(sub="W")),
]

d.add(models.ITP(id="uir-itp-1", project_id="UIR-P1", vendor_id="UIR-V1",
                  referenceNo="QTS-UIR-ITP-000001", description="RC Column & Slab Formwork/Rebar/Concrete ITP",
                  rev="Rev1.0", submit="For Review", status="Pending", submissionDate="2026-09-28",
                  detail_data=json.dumps(items)))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
