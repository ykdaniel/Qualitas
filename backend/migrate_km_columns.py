import sqlite3

db_path = "/Users/nook/Desktop/Qualitas/backend/qualitas.db"

def migrate():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Add parent_id
        try:
            cursor.execute("ALTER TABLE km_articles ADD COLUMN parent_id VARCHAR NULL")
            print("Added parent_id column.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("Column parent_id already exists.")
            else:
                print(f"Error adding parent_id: {e}")
                
        # Add chapter_no
        try:
            cursor.execute("ALTER TABLE km_articles ADD COLUMN chapter_no VARCHAR NULL")
            print("Added chapter_no column.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("Column chapter_no already exists.")
            else:
                print(f"Error adding chapter_no: {e}")
                
        conn.commit()
        print("Migration complete.")
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    migrate()
