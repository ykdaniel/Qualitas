from sqlalchemy import inspect

import models
from database import engine


def check_schema_consistency():
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    print(f"Checking {len(tables)} tables...")

    # Map model names to classes
    model_map = {
        'itp': models.ITP,
        'ncr': models.NCR,
        'noi': models.NOI,
        'itr': models.ITR,
        'pqp': models.PQP,
        'obs': models.OBS,
        'contractors': models.Contractor,
        'document_naming_rules': models.DocumentNamingRule,
        'reference_sequences': models.ReferenceSequence
    }

    issues_found = False

    for table_name in tables:
        if table_name not in model_map:
            continue

        print(f"\nScanning table: {table_name}")
        db_columns = [col['name'] for col in inspector.get_columns(table_name)]
        model_class = model_map[table_name]

        # Get columns defined in SQLAlchemy model
        model_columns = [c.name for c in model_class.__table__.columns]

        # Check for missing columns in DB
        missing_in_db = set(model_columns) - set(db_columns)
        if missing_in_db:
            print(f"  ❌ CRITICAL: Missing columns in DB table '{table_name}': {missing_in_db}")
            issues_found = True

        # Check for extra columns in DB (not critical, but good to know)
        extra_in_db = set(db_columns) - set(model_columns)
        if extra_in_db:
            print(f"  ⚠️  Notice: Extra columns in DB table '{table_name}' (not in model): {extra_in_db}")

        if not missing_in_db:
            print("  ✅ Schema matches model.")

    if not issues_found:
        print("\n🎉 All checked tables match their models!")
    else:
        print("\n❌ Schema inconsistencies found. Please run migrations.")

if __name__ == "__main__":
    try:
        check_schema_consistency()
    except Exception as e:
        print(f"Error during check: {e}")
