import os
import sqlite3

db_path = os.path.join(os.path.dirname(__file__), 'qualitas.db')

def migrate():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if version_no exists in km_articles
        cursor.execute("PRAGMA table_info(km_articles)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'version_no' not in columns:
            print("Adding version_no column to km_articles...")
            cursor.execute("ALTER TABLE km_articles ADD COLUMN version_no INTEGER DEFAULT 1")
            cursor.execute("UPDATE km_articles SET version_no = 1")
        else:
            print("version_no column already exists.")

        # Create km_article_history table
        print("Creating km_article_history table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS km_article_history (
                id VARCHAR PRIMARY KEY,
                article_id VARCHAR NOT NULL,
                version_no INTEGER NOT NULL,
                title VARCHAR NOT NULL,
                content TEXT NOT NULL,
                category VARCHAR,
                tags VARCHAR,
                status VARCHAR,
                author_id INTEGER,
                attachments TEXT,
                parent_id VARCHAR,
                chapter_no VARCHAR,
                change_summary VARCHAR,
                created_at VARCHAR NOT NULL,
                FOREIGN KEY(article_id) REFERENCES km_articles(id),
                FOREIGN KEY(author_id) REFERENCES users(id)
            )
        """)

        # Create an index for faster lookup of history by article
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_km_article_history_article_id ON km_article_history(article_id)")

        conn.commit()
        print("Migration successful.")
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
