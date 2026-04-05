import sqlite3
import os
import sys

# Add parent directory to path to import validators
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.sql_validators import validate_table_name

db_path = "qualitas.db"

def inspect_db():
    if not os.path.exists(db_path):
        print(f"Error: {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    tables = ["itp", "noi", "itr", "ncr", "obs", "pqp"]

    for table in tables:
        print(f"\n--- Schema for table: {table} ---")
        try:
            # SECURITY: Validate table name before using in SQL
            validated_table = validate_table_name(table)
            # Note: PRAGMA statements don't support parameterization, but table name is validated
            cursor.execute(f"PRAGMA table_info({validated_table})")
            columns = cursor.fetchall()
            for col in columns:
                print(f"ID: {col[0]}, Name: {col[1]}, Type: {col[2]}, NotNull: {col[3]}, PK: {col[5]}")
        except ValueError as e:
            print(f"Security validation failed for '{table}': {e}")
        except Exception as e:
            print(f"Error inspecting {table}: {e}")

    conn.close()

if __name__ == "__main__":
    inspect_db()
