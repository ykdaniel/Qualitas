import sqlite3


def migrate():
    conn = sqlite3.connect("qualitas.db")
    cursor = conn.cursor()

    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(checklist)")
        columns = [info[1] for info in cursor.fetchall()]

        if "contractor" not in columns:
            print("Adding 'contractor' column to 'checklist' table...")
            cursor.execute("ALTER TABLE checklist ADD COLUMN contractor TEXT")
            conn.commit()
            print("Migration successful.")
        else:
            print("'contractor' column already exists.")

    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
