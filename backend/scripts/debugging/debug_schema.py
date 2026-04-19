
import os
import sqlite3

db_path = "qualitas.db"

def check():
    if not os.path.exists(db_path):
        print(f"Error: {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("--- Listing Tables ---")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [r[0] for r in cursor.fetchall()]
    print(tables)

    for t in ["checklist", "checklists"]:
        if t in tables:
            print(f"\n--- Columns in {t} ---")
            cursor.execute(f"PRAGMA table_info({t})")
            cols = cursor.fetchall()
            for c in cols:
                print(f"{c[1]} ({c[2]})")
        else:
            print(f"\n--- {t} does not exist ---")

    conn.close()

if __name__ == "__main__":
    check()
