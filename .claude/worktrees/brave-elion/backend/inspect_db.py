import sqlite3
import os

db_path = "qualitas.db"

def inspect_db():
    if not os.path.exists(db_path):
        print(f"Error: {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    tables = ["itp", "noi", "itr", "ncr", "obs", "pqp", "document_naming_rules"]
    
    for table in tables:
        print(f"\n--- Schema for table: {table} ---")
        try:
            cursor.execute(f"PRAGMA table_info({table})")
            columns = cursor.fetchall()
            for col in columns:
                print(f"ID: {col[0]}, Name: {col[1]}, Type: {col[2]}, NotNull: {col[3]}, PK: {col[5]}")
        except Exception as e:
            print(f"Error inspecting {table}: {e}")

    conn.close()

if __name__ == "__main__":
    inspect_db()
