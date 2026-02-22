
import sqlite3
import os

DB_FILE = os.path.join("backend", "qualitas.db")

def add_column():
    if not os.path.exists(DB_FILE):
        print(f"Database file {DB_FILE} not found.")
        return

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(itr)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if "detail_data" in columns:
            print("Column 'detail_data' already exists in 'itr' table.")
        else:
            print("Adding column 'detail_data' to 'itr' table...")
            cursor.execute("ALTER TABLE itr ADD COLUMN detail_data TEXT")
            conn.commit()
            print("Column added successfully.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    add_column()
