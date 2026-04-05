"""
Database migration script to add created_at column to users table.
Run this script once to fix the schema issue.
"""
import sqlite3
from datetime import datetime

DB_PATH = "qualitas.db"

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if column exists
    cursor.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'created_at' not in columns:
        print("Adding 'created_at' column to users table...")
        cursor.execute("ALTER TABLE users ADD COLUMN created_at TEXT")
        
        # Update existing users with current date
        today = datetime.now().strftime("%Y-%m-%d")
        cursor.execute(f"UPDATE users SET created_at = ? WHERE created_at IS NULL", (today,))
        
        conn.commit()
        print(f"Migration complete. Set created_at to '{today}' for existing users.")
    else:
        print("Column 'created_at' already exists. No migration needed.")
    
    conn.close()

if __name__ == "__main__":
    migrate()
