import sqlite3
import sys
import os

# Add parent directory to path to import validators
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.sql_validators import validate_table_name, validate_column_name

# Whitelist for allowed column types in this migration
ALLOWED_COLUMN_TYPES = {
    "TEXT",
    "INTEGER DEFAULT 0"
}

def validate_column_type(dtype: str) -> str:
    """Validate column type against whitelist."""
    if dtype not in ALLOWED_COLUMN_TYPES:
        raise ValueError(f"Invalid column type: {dtype}")
    return dtype

def migrate():
    conn = sqlite3.connect("qualitas.db")
    cursor = conn.cursor()

    try:
        # SECURITY: Validate table name
        table_name = validate_table_name("checklist")

        # Check if column exists
        # Note: PRAGMA statements don't support parameterization, but table name is validated
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [info[1] for info in cursor.fetchall()]

        new_columns = {
            "itpId": "TEXT",
            "itpVersion": "TEXT",
            "passCount": "INTEGER DEFAULT 0",
            "failCount": "INTEGER DEFAULT 0"
        }

        for col, dtype in new_columns.items():
            if col not in columns:
                print(f"Adding '{col}' column to 'checklist' table...")
                # SECURITY: Validate column type
                validated_dtype = validate_column_type(dtype)
                # Safe to use after validation
                cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {col} {validated_dtype}")
                conn.commit()
                print(f"Added {col}.")
            else:
                print(f"'{col}' column already exists.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
