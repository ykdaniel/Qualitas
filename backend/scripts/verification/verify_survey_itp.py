import os
import sys

# Add the current directory (backend) to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import models
from database import SessionLocal


def verify_survey_itp():
    db = SessionLocal()
    try:
        ref_no = "ITP-SURVEY-001"
        itp = db.query(models.ITP).filter(models.ITP.referenceNo == ref_no).first()

        if itp:
            print(f"ITP Found: {itp.referenceNo}")
            print(f"Description: {itp.description}")
            print(f"Status: {itp.status}")
            print(f"Detail Data: {itp.detail_data}")
        else:
            print(f"ITP {ref_no} NOT FOUND")

    except Exception as e:
        print(f"Error verifying ITP: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    verify_survey_itp()
