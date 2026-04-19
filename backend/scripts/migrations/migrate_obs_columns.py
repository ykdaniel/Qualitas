import sqlite3


def add_columns_to_obs():
    conn = sqlite3.connect('qualitas.db')
    cursor = conn.cursor()

    # 檢查列是否已存在
    cursor.execute("PRAGMA table_info(obs)")
    columns = [info[1] for info in cursor.fetchall()]

    try:
        if 'noiNumber' not in columns:
            print("Adding noiNumber to obs table...")
            cursor.execute("ALTER TABLE obs ADD COLUMN noiNumber TEXT")
            cursor.execute("CREATE INDEX ix_obs_noiNumber ON obs (noiNumber)")

        if 'itrNumber' not in columns:
            print("Adding itrNumber to obs table...")
            cursor.execute("ALTER TABLE obs ADD COLUMN itrNumber TEXT")
            cursor.execute("CREATE INDEX ix_obs_itrNumber ON obs (itrNumber)")

        conn.commit()
        print("Migration successful.")
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    add_columns_to_obs()
