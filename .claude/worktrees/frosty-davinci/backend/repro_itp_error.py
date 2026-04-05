
import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base, SessionLocal
import models
import crud
import json

def test_fetch_itps():
    db = SessionLocal()
    try:
        print("Attempting to fetch ITPs...")
        itps = crud.get_itps(db)
        print(f"Successfully fetched {len(itps)} ITPs")
        for itp in itps:
            print(f"ITP ID: {itp.id}, Ref: {itp.referenceNo}")
            print(f"  SubmissionDate: {itp.submissionDate!r}")
            print(f"  DueDate: {itp.dueDate!r}")
            
            # Try to validate with schema to see if Pydantic fails
            try:
                import schemas
                # Convert to Pydantic model
                schema_itp = schemas.ITP.model_validate(itp)
                print(f"  Validated OK")
            except Exception as e:
                print(f"  Validation FAILED for {itp.id}: {e}")
                
    except Exception as e:
        print(f"Error fetching ITPs: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_fetch_itps()
