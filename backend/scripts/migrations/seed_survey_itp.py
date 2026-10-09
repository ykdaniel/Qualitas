import json
import os
import sys
import uuid
from datetime import datetime

# Add the current directory (backend) to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import models
from database import SessionLocal


def seed_survey_itp():
    db = SessionLocal()
    try:
        # Check if exists
        ref_no = "QTS-RKS-HL-ITP-000017"
        existing = db.query(models.ITP).filter(models.ITP.referenceNo == ref_no).first()

        # Map data to structure
        detail_data = {
            "a": [
                {
                    "id": "A1", "phase": "A",
                    "activity": {"en": "Control Point Verification", "ch": "控制點確認"},
                    "standard": "設計圖提供控制點資訊、坐標基準",
                    "criteria": "• N/E/Z 誤差 ±1cm 以內\n• 控制點穩固、標示清楚、未受損\n\n[不合格處置: 重新設置控制點並回測]",
                    "checkTime": {"en": "Before survey", "ch": "測量前"},
                    "method": {"en": "Total Station Check", "ch": "全測站儀回測"},
                    "frequency": "Each time (每次測量前)",
                    "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
                    "record": "Control Point Handover/Check Record (控制點移交表、回測紀錄)"
                },
                {
                    "id": "A2", "phase": "A",
                    "activity": {"en": "Control Point Protection", "ch": "控制點保護確認"},
                    "standard": "測量作業規範",
                    "criteria": "• 控制點周邊未被破壞\n• 點位可見、可使用\n• 有必要時加裝保護架/警示\n\n[不合格處置: 恢復保護或重設控制點]",
                    "checkTime": {"en": "Before survey", "ch": "測量前"},
                    "method": {"en": "Visual + Positioning Check", "ch": "目視＋定位查核"},
                    "frequency": "Each time (每次測量前)",
                    "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
                    "record": "-"
                },
                {
                    "id": "A3", "phase": "A",
                    "activity": {"en": "Temporary Benchmark Setup", "ch": "臨時控制點設置"},
                    "standard": "Survey Guideline",
                    "criteria": "• 臨時點與主控制點誤差 ±1cm\n• 固定良好、可追溯\n\n[不合格處置: 重新設點並回測]",
                    "checkTime": {"en": "Before survey", "ch": "測量前"},
                    "method": {"en": "Total Station Check", "ch": "全測站儀回測"},
                    "frequency": "100%",
                    "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
                    "record": "Temporary Benchmark Record (臨時控制點紀錄)"
                }
            ],
            "b": [
                {
                    "id": "B1", "phase": "B",
                    "activity": {"en": "Traverse Survey", "ch": "導線測量"},
                    "standard": "-",
                    "criteria": "閉合差 ≦ 1/5000（全程要求）\n\n[不合格處置: 重測]",
                    "checkTime": {"en": "During survey", "ch": "測量中"},
                    "method": {"en": "Total Station", "ch": "全測站儀"},
                    "frequency": "100%",
                    "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
                    "record": "Traverse Report (導線成果報告)"
                },
                {
                    "id": "B2", "phase": "B",
                    "activity": {"en": "Leveling Survey", "ch": "水準測量"},
                    "standard": "Leveling Standards",
                    "criteria": "• 閉合差 ≦ ±4√K mm\n• 高差誤差 ≦ 8mm / 100m\n\n[不合格處置: 重測]",
                    "checkTime": {"en": "During survey", "ch": "測量中"},
                    "method": {"en": "Total Station / Level", "ch": "全測站儀"},
                    "frequency": "100%",
                    "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
                    "record": "Leveling Report (水準成果表)"
                },
                {
                    "id": "B3", "phase": "B",
                    "activity": {"en": "Station Distance Check", "ch": "設站距離檢測"},
                    "standard": "測量作業規範",
                    "criteria": "距離相對誤差 ≤ 1/3000 或 絕對誤差 ≤ 10mm\n\n[不合格處置: 重架站再測]",
                    "checkTime": {"en": "During survey", "ch": "測量中"},
                    "method": {"en": "Total Station", "ch": "全測站儀"},
                    "frequency": "100%",
                    "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
                    "record": "-"
                },
                {
                    "id": "B4", "phase": "B",
                    "activity": {"en": "Coordinate Back-check", "ch": "座標回測"},
                    "standard": "測量規範",
                    "criteria": "控制點 N/E/Z 誤差 ≤ ±1cm\n\n[不合格處置: 重架站再測]",
                    "checkTime": {"en": "During survey", "ch": "測量中"},
                    "method": {"en": "Total Station", "ch": "全測站儀"},
                    "frequency": "100%",
                    "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
                    "record": "-"
                },
                {
                    "id": "B5", "phase": "B",
                    "activity": {"en": "Earthwork Setting-out", "ch": "土方放樣測量"},
                    "standard": "Civil Work Standard／施工圖",
                    "criteria": "• 開挖面：0 ～ −5cm（一般）\n• 開挖面（基礎底板）：0 ～ −3cm\n• 填方面（無結構）：0 ～ +5cm\n• 填方面（有結構）：0 ～ −3cm\n\n[不合格處置: 修正後重測]",
                    "checkTime": {"en": "After excavation", "ch": "開挖後"},
                    "method": {"en": "Total Station", "ch": "全測站儀"},
                    "frequency": "100%",
                    "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
                    "record": "-"
                },
                {
                    "id": "B6", "phase": "B",
                    "activity": {"en": "Structure/Equipment Setting-out", "ch": "結構/設備放樣"},
                    "standard": "Installation Guideline／施工圖",
                    "criteria": "• 一般結構：±20mm\n• 預埋件／Anchor bolt：±5mm\n• 變電站設備（GIS/Transformer）：±5～10mm\n\n[不合格處置: 修正後重測]",
                    "checkTime": {"en": "After setting out", "ch": "放樣定位後"},
                    "method": {"en": "Total Station", "ch": "全測站儀"},
                    "frequency": "100%",
                    "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
                    "record": "-"
                }
            ],
            "c": [
                {
                    "id": "C1", "phase": "C",
                    "activity": {"en": "Traverse Verification", "ch": "導線成果審查"},
                    "standard": "測量成果審查準則",
                    "criteria": "閉合差 ≦ 1/5000\n\n[不合格處置: 修正後重測]",
                    "checkTime": {"en": "After survey", "ch": "測量後"},
                    "method": {"en": "Report Review", "ch": "成果表"},
                    "frequency": "-",
                    "vp": {"sub": "R", "teco": "R", "employer": "A", "hse": "-"},
                    "record": "Traverse Report (導線成果表)"
                },
                {
                    "id": "C2", "phase": "C",
                    "activity": {"en": "Leveling Verification", "ch": "水準成果審查"},
                    "standard": "水準審查準則",
                    "criteria": "誤差 ≦ 20mm√K\n\n[不合格處置: 修正後重測]",
                    "checkTime": {"en": "After survey", "ch": "測量後"},
                    "method": {"en": "Report Review", "ch": "成果表"},
                    "frequency": "-",
                    "vp": {"sub": "R", "teco": "R", "employer": "A", "hse": "-"},
                    "record": "Elevation Report (高程成果表)"
                },
                {
                    "id": "C3", "phase": "C",
                    "activity": {"en": "As-built Survey", "ch": "竣工測量"},
                    "standard": "As-built Guideline",
                    "criteria": "• 完工位置/標高與設計允許差內\n• 結構中心線與設備定位符合要求\n\n[不合格處置: 修正後重測]",
                    "checkTime": {"en": "After completion", "ch": "完工後"},
                    "method": {"en": "Report Review", "ch": "成果表"},
                    "frequency": "-",
                    "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
                    "record": "As-built Drawing / Report (As-built 圖、竣工測量表)"
                }
            ]
        }

        # Resolve vendor (Try '廠商C' for Civil/Survey or '廠商A' detailed)
        # Using '廠商C' as it seemed to have Civil/Survey scope in seeder
        vendor_name = "廠商C"
        vendor = db.query(models.Contractor).filter(models.Contractor.name == vendor_name).first()
        if not vendor:
            # Fallback to any vendor
            vendor = db.query(models.Contractor).first()
            if not vendor:
                print("No contractors found. Seeding aborted.")
                return
            vendor_name = vendor.name

        vendor_id = vendor.id

        itp_data = {
            "referenceNo": ref_no,
            "description": "Survey Works 測量工程",
            "vendor_id": vendor_id,
            "status": "Approved",
            "rev": "Rev1.0",
            "detail_data": json.dumps(detail_data),
            "submissionDate": datetime.now().strftime("%Y-%m-%d"),
            "submit": ""
        }

        if existing:
            print(f"Updating existing Survey ITP: {ref_no}")
            for key, value in itp_data.items():
                setattr(existing, key, value)
        else:
            print(f"Creating new Survey ITP: {ref_no}")
            new_itp = models.ITP(**itp_data, id=str(uuid.uuid4()))
            db.add(new_itp)

        db.commit()
        print("Survey ITP seeded successfully.")

    except Exception as e:
        print(f"Error seeding Survey ITP: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_survey_itp()
