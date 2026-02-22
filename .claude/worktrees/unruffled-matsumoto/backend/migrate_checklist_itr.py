import sqlite3

def migrate():
    conn = sqlite3.connect("qualitas.db")
    cursor = conn.cursor()
    
    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(checklist)")
        columns = [info[1] for info in cursor.fetchall()]

        # Columns to add
        new_columns = {
            "itrId": "TEXT",
            "itrNumber": "TEXT" 
        }
        
        for col, dtype in new_columns.items():
            if col not in columns:
                print(f"Adding '{col}' column to 'checklist' table...")
                cursor.execute(f"ALTER TABLE checklist ADD COLUMN {col} {dtype}")
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
