"""
資料庫遷移腳本 - 新增軟刪除欄位和審計日誌表
"""
import sqlite3

DB_PATH = "qualitas.db"

# 需要新增軟刪除欄位的表格
TABLES_FOR_SOFT_DELETE = [
    "itp",
    "ncr",
    "noi",
    "itr",
    "pqp",
    "obs",
    "audits",
    "contractors",
    "followup",
    "users",
    "roles"
]


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("="*50)
    print("開始資料庫遷移...")
    print("="*50)

    # 1. 為現有表格新增軟刪除欄位
    for table in TABLES_FOR_SOFT_DELETE:
        try:
            # 檢查表格是否存在
            cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
            if not cursor.fetchone():
                print(f"  ⚠️  表格 '{table}' 不存在，跳過")
                continue

            # 檢查欄位是否已存在
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [col[1] for col in cursor.fetchall()]

            if 'is_deleted' not in columns:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN is_deleted INTEGER DEFAULT 0")
                print(f"  ✅ 已為 '{table}' 新增 'is_deleted' 欄位")
            else:
                print(f"  ⏭️  '{table}' 已有 'is_deleted' 欄位")

            if 'deleted_at' not in columns:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN deleted_at TEXT")
                print(f"  ✅ 已為 '{table}' 新增 'deleted_at' 欄位")
            else:
                print(f"  ⏭️  '{table}' 已有 'deleted_at' 欄位")

        except Exception as e:
            print(f"  ❌ 處理 '{table}' 時發生錯誤: {e}")

    print()

    # 2. 建立審計日誌表
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                user_id INTEGER,
                username TEXT,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                entity_name TEXT,
                old_value TEXT,
                new_value TEXT,
                ip_address TEXT,
                details TEXT
            )
        """)
        print("✅ 審計日誌表 'audit_logs' 建立/確認完成")

        # 建立索引
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)")
        print("✅ 審計日誌索引建立完成")

    except Exception as e:
        print(f"❌ 建立審計日誌表時發生錯誤: {e}")

    conn.commit()
    conn.close()

    print()
    print("="*50)
    print("資料庫遷移完成！")
    print("="*50)


if __name__ == "__main__":
    migrate()
