import json
from database import SessionLocal
import models

db = SessionLocal()
itp = db.query(models.ITP).filter(models.ITP.referenceNo=='QTS-RKS-HL-ITP-000017').first()

new_detail = {
    "a": [
        {
            "id": "A1",
            "activity": {"en": "Control Point Verification", "ch": "控制點確認"},
            "standard": {"en": "Design drawings with control point info, coordinates & datum", "ch": "設計圖提供控制點資訊、坐標基準"},
            "criteria": [
                {"en": "N/E/Z error within ±1cm", "ch": "N/E/Z 誤差 ±1cm 以內"},
                {"en": "Control point stable, clearly marked, undamaged", "ch": "控制點穩固、標示清楚、未受損"}
            ],
            "checkTime": {"en": "Before survey", "ch": "測量前"},
            "method": {"en": "Total station back-check", "ch": "全測站儀回測"},
            "frequency": {"en": "Before each survey", "ch": "每次測量前"},
            "vp": {"sub": "H", "teco": "H", "employer": "H", "hse": ""},
            "record": "Control point handover form / Back-check record",
            "isNew": False
        },
        {
            "id": "A2",
            "activity": {"en": "Control Point Protection", "ch": "控制點保護確認"},
            "standard": {"en": "Survey operation guidelines", "ch": "測量作業規範"},
            "criteria": [
                {"en": "Control point surroundings undamaged", "ch": "控制點周邊未被破壞"},
                {"en": "Point visible and usable", "ch": "點位可見、可使用"},
                {"en": "Protection frame/warning installed if necessary", "ch": "有必要時加裝保護架/警示"}
            ],
            "checkTime": {"en": "Before survey", "ch": "測量前"},
            "method": {"en": "Visual + positioning check", "ch": "目視＋定位查核"},
            "frequency": {"en": "Before each survey", "ch": "每次測量前"},
            "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": ""},
            "record": "-",
            "isNew": False
        },
        {
            "id": "A3",
            "activity": {"en": "Temporary Benchmark Setup", "ch": "臨時控制點設置"},
            "standard": {"en": "Survey Guideline", "ch": ""},
            "criteria": [
                {"en": "Temp point vs main control point error ±1cm", "ch": "臨時點與主控制點誤差 ±1cm"},
                {"en": "Well-fixed and traceable", "ch": "固定良好、可追溯"}
            ],
            "checkTime": {"en": "Before survey", "ch": "測量前"},
            "method": {"en": "Total station back-check", "ch": "全測站儀回測"},
            "frequency": {"en": "100%", "ch": ""},
            "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": ""},
            "record": "Temporary control point record",
            "isNew": False
        }
    ],
    "b": [
        {
            "id": "B1",
            "activity": {"en": "Traverse Survey", "ch": "導線測量"},
            "standard": {"en": "", "ch": ""},
            "criteria": [{"en": "Traverse closure error ≤ 1/5000", "ch": "閉合差 ≦ 1/5000（全程要求）"}],
            "checkTime": {"en": "During survey", "ch": "測量中"},
            "method": {"en": "Total station", "ch": "全測站儀"},
            "frequency": {"en": "100%", "ch": ""},
            "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": ""},
            "record": "Traverse survey report",
            "isNew": False
        },
        {
            "id": "B2",
            "activity": {"en": "Leveling Survey", "ch": "水準測量"},
            "standard": {"en": "Leveling Standards", "ch": ""},
            "criteria": [
                {"en": "Closure error ≤ ±4√K mm", "ch": "閉合差 ≦ ±4√K mm"},
                {"en": "Height difference error ≤ 8mm/100m", "ch": "高差誤差 ≦ 8mm/100m"}
            ],
            "checkTime": {"en": "During survey", "ch": "測量中"},
            "method": {"en": "Total station", "ch": "全測站儀"},
            "frequency": {"en": "100%", "ch": ""},
            "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": ""},
            "record": "Leveling result table",
            "isNew": False
        },
        {
            "id": "B3",
            "activity": {"en": "Station Distance Check", "ch": "設站距離檢測"},
            "standard": {"en": "Survey operation guidelines", "ch": "測量作業規範"},
            "criteria": [{"en": "Relative distance error ≤ 1/3000 or absolute error ≤ 10mm", "ch": "距離相對誤差 ≤ 1/3000 或絕對誤差 ≤ 10mm"}],
            "checkTime": {"en": "During survey", "ch": "測量中"},
            "method": {"en": "Total station", "ch": "全測站儀"},
            "frequency": {"en": "100%", "ch": ""},
            "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": ""},
            "record": "-",
            "isNew": False
        },
        {
            "id": "B4",
            "activity": {"en": "Coordinate Back-check", "ch": "座標回測"},
            "standard": {"en": "Survey standards", "ch": "測量規範"},
            "criteria": [{"en": "Control point N/E/Z error ≤ ±1cm", "ch": "控制點 N/E/Z 誤差 ≤ ±1cm"}],
            "checkTime": {"en": "During survey", "ch": "測量中"},
            "method": {"en": "Total station", "ch": "全測站儀"},
            "frequency": {"en": "100%", "ch": ""},
            "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": ""},
            "record": "-",
            "isNew": False
        },
        {
            "id": "B5",
            "activity": {"en": "Earthwork Setting-out", "ch": "土方放樣測量"},
            "standard": {"en": "Civil Work Standard / Construction drawings", "ch": "施工圖"},
            "criteria": [
                {"en": "Excavation (general): 0 ~ -5cm", "ch": "開挖面：0～-5cm（一般）"},
                {"en": "Excavation (foundation slab): 0 ~ -3cm", "ch": "開挖面（基礎底板）：0～-3cm"},
                {"en": "Fill (non-structural): 0 ~ +5cm", "ch": "填方面（無結構）：0～+5cm"},
                {"en": "Fill (structural): 0 ~ -3cm", "ch": "填方面（有結構）：0～-3cm"}
            ],
            "checkTime": {"en": "After excavation", "ch": "開挖後"},
            "method": {"en": "Total station", "ch": "全測站儀"},
            "frequency": {"en": "100%", "ch": ""},
            "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": ""},
            "record": "-",
            "isNew": False
        },
        {
            "id": "B6",
            "activity": {"en": "Structure/Equipment Setting-out", "ch": "結構/設備放樣"},
            "standard": {"en": "Installation Guideline / Construction drawings", "ch": "施工圖"},
            "criteria": [
                {"en": "General structure: ±20mm", "ch": "一般結構：±20mm"},
                {"en": "Embedded items / Anchor bolt: ±5mm", "ch": "預埋件／Anchor bolt：±5mm"},
                {"en": "Substation equipment (GIS/Transformer): ±5~10mm", "ch": "變電站設備（GIS/Transformer）：±5～10mm"}
            ],
            "checkTime": {"en": "After setting-out", "ch": "放樣定位後"},
            "method": {"en": "Total station", "ch": "全測站儀"},
            "frequency": {"en": "100%", "ch": ""},
            "vp": {"sub": "H", "teco": "H", "employer": "W", "hse": ""},
            "record": "-",
            "isNew": False
        }
    ],
    "c": [
        {
            "id": "C1",
            "activity": {"en": "Traverse Verification", "ch": "導線成果審查"},
            "standard": {"en": "Traverse result review criteria", "ch": "測量成果審查準則"},
            "criteria": [{"en": "Closure error ≤ 1/5000", "ch": "閉合差 ≦ 1/5000"}],
            "checkTime": {"en": "After survey", "ch": "測量後"},
            "method": {"en": "Result table review", "ch": "成果表"},
            "frequency": {"en": "", "ch": ""},
            "vp": {"sub": "H", "teco": "R", "employer": "R", "hse": ""},
            "record": "Traverse result table",
            "isNew": False
        },
        {
            "id": "C2",
            "activity": {"en": "Leveling Verification", "ch": "水準成果審查"},
            "standard": {"en": "Leveling review criteria", "ch": "水準審查準則"},
            "criteria": [{"en": "Error ≤ 20mm√K", "ch": "誤差 ≦ 20mm√K"}],
            "checkTime": {"en": "After survey", "ch": "測量後"},
            "method": {"en": "Result table review", "ch": "成果表"},
            "frequency": {"en": "", "ch": ""},
            "vp": {"sub": "H", "teco": "R", "employer": "R", "hse": ""},
            "record": "Leveling result table",
            "isNew": False
        },
        {
            "id": "C3",
            "activity": {"en": "As-built Survey", "ch": "竣工測量"},
            "standard": {"en": "As-built Guideline", "ch": ""},
            "criteria": [
                {"en": "As-built position/elevation within design tolerance", "ch": "完工位置/標高與設計允許差內"},
                {"en": "Structure centerline and equipment positioning meet requirements", "ch": "結構中心線與設備定位符合要求"}
            ],
            "checkTime": {"en": "After completion", "ch": "完工後"},
            "method": {"en": "Result table review", "ch": "成果表"},
            "frequency": {"en": "", "ch": ""},
            "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": ""},
            "record": "As-built drawing / As-built survey table",
            "isNew": False
        }
    ],
    "checklist": [],
    "self_inspection": None
}

itp.detail_data = json.dumps(new_detail, ensure_ascii=False)
db.commit()
print(f"Done! A: {len(new_detail['a'])} B: {len(new_detail['b'])} C: {len(new_detail['c'])}")
db.close()
