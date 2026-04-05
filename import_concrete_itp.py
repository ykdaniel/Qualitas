import json
from database import SessionLocal
import models
import uuid

db = SessionLocal()

new_detail = {
    "a": [
        {
            "id": "A1",
            "activity": {"en": "Document Confirmation Before Work", "ch": "作業前文件確認"},
            "standard": {"en": "Construction specification chapter 03050", "ch": "施工規範第 03050 章"},
            "criteria": [
                {"en": "Work plan, RAMS, ITP & Check sheets and Design Drawing documents have been approved", "ch": "施工計畫、RAMS、ITP及自主檢查表、設計圖文件已審核"},
                {"en": "Concrete material data & Supplier qualification reviewed", "ch": "預拌混凝土材料審查及廠商資格審查完成"},
                {"en": "Proportioning data reviewed and approved", "ch": "配比資料審查通過"},
                {"en": "Factory inspection and trial mixing completed", "ch": "廠驗及試拌完成"}
            ],
            "checkTime": {"en": "Before work", "ch": "作業前"},
            "method": {"en": "Document review results: edition and code", "ch": "文件審核結果：版次及 Code"},
            "frequency": {"en": "Once before construction", "ch": "施工前一次"},
            "vp": {"sub": "H", "teco": "W", "employer": "W/R", "hse": ""},
            "record": "Pre-mixed concrete material checksheet & Material inspection test summary",
            "isNew": False
        },
        {
            "id": "A2",
            "activity": {"en": "Confirmation Points Before Placement", "ch": "澆置前確認事項"},
            "standard": {"en": "Construction specification chapter 03050 section 3.2.3", "ch": "施工規範第 03050 章第 3.2.3 項"},
            "criteria": [
                {"en": "Reinforcement assembly completed and inspection passed", "ch": "鋼筋組立完成且檢驗通過"},
                {"en": "Formwork assembly completed and inspection passed", "ch": "模板組立完成且檢驗通過"},
                {"en": "MEP (Earthing system, embedded system etc.) completed and inspection passed", "ch": "機電裝置安裝完成且檢驗通過"},
                {"en": "At least two high frequency vibrators; Rod vibrators comply with CNS 5646; Template vibrator comply with CNS 5648", "ch": "至少二部高頻率振動器；棒形振動器須符合 CNS 5646；模板振動器須符合 CNS 5648"},
                {"en": "Surface preparation at construction joints, and cleaning of debris", "ch": "施工縫處進行表面處理，並清潔碎屑"}
            ],
            "checkTime": {"en": "Before work", "ch": "作業前"},
            "method": {"en": "Check Concrete manufacturing notice & related checksheets", "ch": "核對混凝土製造通知單及相關自檢表"},
            "frequency": {"en": "Once before construction", "ch": "施工前一次"},
            "vp": {"sub": "H", "teco": "W", "employer": "W/R", "hse": ""},
            "record": "Pre-mixed concrete construction checksheet & Concrete manufacturing notice",
            "isNew": False
        }
    ],
    "b": [
        {
            "id": "B1",
            "activity": {"en": "Pre-mixed Concrete Material Entry Inspection (Site QC & Test Cylinder Production)", "ch": "預拌混凝土材料進場檢驗（現場品質控制及試體製作）"},
            "standard": {"en": "Construction specification chapter 03050 section 3.3.2 / 3.1.1 / 3.5.1 / 2.2.2", "ch": "施工規範第 03050 章第 3.3.2/3.1.1/3.5.1/2.2.2 項"},
            "criteria": [
                {"en": "Sampling: 2+ specimens per mixer truck = 1 group; 4 per group (1×7day & 3×28day)", "ch": "取樣：同一預拌車取樣 2 個以上為 1 組；每組 4 顆（7天1顆 & 28天3顆）"},
                {"en": "Temperature < 32°C", "ch": "溫度 < 32°C"},
                {"en": "Slump: 170 ±40mm (tolerance ±40mm when designed slump > 100mm)", "ch": "坍度：配比設計 170 ±40mm（坍度 > 100mm 時，許可差 ±40mm）"},
                {"en": "Chloride ion content test ≤ 0.15 kg/m³", "ch": "氯離子含量測試 ≤ 0.15kg/m³"}
            ],
            "checkTime": {"en": "When material enters site", "ch": "材料進場時"},
            "method": {"en": "Following CNS 1174 Method of sampling concrete; Thermometer; Slump cone; Chloride ion analyzer", "ch": "遵循 CNS 1174 抽樣方法；溫度計；坍度錐；氯離子測定儀器"},
            "frequency": {"en": "Each batch: 120m³ per mix ratio, add 1 group if remainder > 40m³", "ch": "每種配比以 120m³ 為一批，餘數超過 40m³ 時增加一組"},
            "vp": {"sub": "H", "teco": "W", "employer": "W/R", "hse": ""},
            "record": "Pre-mixed concrete material checksheet & Compression test report",
            "isNew": False
        },
        {
            "id": "B2",
            "activity": {"en": "Compressive Strength Test", "ch": "抗壓強度試驗"},
            "standard": {"en": "Construction specification chapter 03310 section 3.3.1; TAF accredited laboratory", "ch": "施工規範第 03310 章第 3.3.1 項；TAF 認證試驗機構"},
            "criteria": [
                {"en": "Design strength PC ≧ 140 kg/cm²", "ch": "設計強度 PC ≧ 140kg/cm²"},
                {"en": "Design strength PC ≧ 210 kg/cm²", "ch": "設計強度 PC ≧ 210kg/cm²"},
                {"en": "Design strength RC ≧ 280 kg/cm²", "ch": "設計強度 RC ≧ 280kg/cm²"}
            ],
            "checkTime": {"en": "Test 1 cylinder 7 days after pouring / Test 3 cylinders 28 days after pouring", "ch": "澆置後 7 天試驗 1 顆 / 28 天試驗 3 顆"},
            "method": {"en": "Concrete Compression Testers (TAF accredited lab)", "ch": "混凝土抗壓試驗機（TAF 認證實驗室）"},
            "frequency": {"en": "Each batch", "ch": "每批"},
            "vp": {"sub": "H", "teco": "W", "employer": "W/R", "hse": ""},
            "record": "Pre-mixed concrete material checksheet & Compression test report & Material inspection test summary",
            "isNew": False
        },
        {
            "id": "B3",
            "activity": {"en": "Precautions During Pouring", "ch": "澆置中注意事項"},
            "standard": {"en": "Construction specification chapter 03050 section 3.1.1 / 3.4 / 03053 section 3.2.3 / 03056 section 3.1.5", "ch": "施工規範第 03050 章第 3.1.1/3.4 項、03053 章第 3.2.3 項、03056 章第 3.1.5 項"},
            "criteria": [
                {"en": "Manifest matches concrete manufacturing list", "ch": "送貨單與混凝土製造單配比一致"},
                {"en": "Concrete mixing from factory to completion ≤ 90 mins", "ch": "混凝土拌合出廠至澆置完成 ≤ 90 分鐘"},
                {"en": "Upper layer poured before lower layer sets; interval ≤ 45 mins", "ch": "下層凝結前澆置上層；上下層間隔 ≤ 45 分鐘"},
                {"en": "Vertical free fall height < 1.5m", "ch": "垂直自由落高 < 1.5 公尺"}
            ],
            "checkTime": {"en": "During pouring", "ch": "澆置中"},
            "method": {"en": "Delivery note, pouring record; Visual, tape measure", "ch": "出料單、澆置紀錄；目視、捲尺"},
            "frequency": {"en": "Each truck / Full process", "ch": "每車／全程"},
            "vp": {"sub": "H", "teco": "W", "employer": "W/R", "hse": ""},
            "record": "Pre-mixed concrete construction checksheet",
            "isNew": False
        }
    ],
    "c": [
        {
            "id": "C1",
            "activity": {"en": "Concrete Curing", "ch": "混凝土養護"},
            "standard": {"en": "Construction specification chapter 03390 section 3.1.2 / 3.1.1", "ch": "施工規範第 03390 章第 3.1.2/3.1.1 項"},
            "criteria": [
                {"en": "Curing shall commence immediately after floating water disappears", "ch": "澆置完成於表面浮水消失後即速進行養護"},
                {"en": "Surface retained with water or covered with linen, waterproof tape, oiled paper; kept moist at all times", "ch": "表面滯水或以麻布、防水膠布、油毛紙覆蓋，隨時保持濕潤"},
                {"en": "Covering material shall not be damaged during curing period", "ch": "養護期間不得損害覆蓋材料"},
                {"en": "Curing no less than 7 days", "ch": "養護不得少於 7 天"}
            ],
            "checkTime": {"en": "After pouring", "ch": "澆置後"},
            "method": {"en": "Visual check", "ch": "目視"},
            "frequency": {"en": "Each section", "ch": "每一區塊"},
            "vp": {"sub": "H", "teco": "W", "employer": "W/R", "hse": ""},
            "record": "Pre-mixed concrete construction checksheet",
            "isNew": False
        },
        {
            "id": "C2",
            "activity": {"en": "Formwork Removal", "ch": "拆模作業"},
            "standard": {"en": "Concrete spec section 4.8.6 & chapter 03110 section 3.2.3", "ch": "混凝土工程施工規範第 4.8.6 項 & 施工規範 03110 章第 3.2.3 項"},
            "criteria": [
                {"en": "Back on Formwork work ITP", "ch": "回歸模板工程 ITP"}
            ],
            "checkTime": {"en": "", "ch": ""},
            "method": {"en": "Back on Formwork work ITP", "ch": "回歸模板工程 ITP"},
            "frequency": {"en": "", "ch": ""},
            "vp": {"sub": "H", "teco": "W", "employer": "W/R", "hse": ""},
            "record": "-",
            "isNew": False
        },
        {
            "id": "C3",
            "activity": {"en": "Concrete Surface Defect Inspection & Repair", "ch": "混凝土表面缺失檢查及修補"},
            "standard": {"en": "Construction specification chapter 03310 section 3.5; STARCOGE-GCOR-001042", "ch": "施工規範第 03310 章第 3.5 項"},
            "criteria": [
                {"en": "Inspection per STARCOGE-GCOR-001042 concrete patch inspection procedure", "ch": "依據 STARCOGE-GCOR-001042 混凝土修補程序檢查"},
                {"en": "Repair per STARCOGE-GCOR-001042 Concrete Patch Repair procedure", "ch": "依據 STARCOGE-GCOR-001042 混凝土修補程序修補"}
            ],
            "checkTime": {"en": "After formwork is removed / Under repair and after repair", "ch": "模板拆除後／修補中、修補後"},
            "method": {"en": "Crack calipers, tape measure, visual", "ch": "裂紋卡尺、捲尺、目視"},
            "frequency": {"en": "Each section / Each defect", "ch": "每一區塊／每一缺失"},
            "vp": {"sub": "H", "teco": "W", "employer": "W/R", "hse": ""},
            "record": "Pre-mixed concrete construction checksheet",
            "isNew": False
        },
        {
            "id": "C4",
            "activity": {"en": "Concrete Finish Surface Elevation & Structure Size Inspection", "ch": "混凝土完成面高程、結構物尺寸檢查"},
            "standard": {"en": "PCC construction specification section 3.4.1", "ch": "工程會施工規範第 3.4.1 項"},
            "criteria": [
                {"en": "Verticality: Column/wall height below 15m, tolerance ±13mm", "ch": "垂直度：柱/牆高 15m 以下投影許可差 ±13mm"},
                {"en": "Level/Slope: ≤3m tolerance ±6mm; 3m~12m tolerance ±12mm", "ch": "水平或坡度：3m 內偏差 ±6mm／3m~12m 偏差 ±12mm"},
                {"en": "Section size: column/beam & slab/wall thickness tolerance +13mm/-6mm", "ch": "斷面尺寸：柱/梁斷面及版/牆厚度許可差 +13mm/-6mm"},
                {"en": "Stair size: height tolerance ±6mm / depth tolerance ±13mm", "ch": "樓梯尺寸：級高許可差 ±6mm／級深許可差 ±13mm"}
            ],
            "checkTime": {"en": "After formwork is removed (Survey work ITP)", "ch": "模板拆除後（測量 ITP）"},
            "method": {"en": "Plummet/Laser plummet, Level/Laser level, Total station, Tape (Survey work ITP)", "ch": "鉛錘/雷射垂直儀、水準儀/雷射水準儀、全測站、捲尺（測量 ITP）"},
            "frequency": {"en": "Inspection of each column wall beam (Survey work ITP)", "ch": "每一柱牆樑版檢驗一次（測量 ITP）"},
            "vp": {"sub": "H", "teco": "W", "employer": "W/R", "hse": ""},
            "record": "Survey work checksheet",
            "isNew": False
        }
    ],
    "checklist": [],
    "self_inspection": None
}

new_itp = models.ITP(
    id=str(uuid.uuid4()),
    description="Pre-mixed Concrete Work",
    rev="Rev1.0",
    submit="",
    status="Pending",
    remark="Ref: CHW12-SEC-CST-Q-ITP-008 (Ørsted Greater Changhua)",
    hasDetails=True,
    submissionDate="",
    detail_data=json.dumps(new_detail, ensure_ascii=False),
)
db.add(new_itp)
db.commit()
db.refresh(new_itp)

print(f"Created ITP: {new_itp.referenceNo}")
print(f"ID: {new_itp.id}")
print(f"Description: {new_itp.description}")
print(f"Phase A: {len(new_detail['a'])} items")
print(f"Phase B: {len(new_detail['b'])} items")
print(f"Phase C: {len(new_detail['c'])} items")
db.close()
