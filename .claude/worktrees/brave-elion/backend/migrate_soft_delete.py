"""
資料庫遷移腳本 - 新增軟刪除欄位和審計日誌表
"""
import sqlite3
from datetime import datetime
import sys
import os

# Add parent directory to path to import validators
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.sql_validators import validate_table_name

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
            # SECURITY: Validate table name before using in SQL
            validated_table = validate_table_name(table)

            # 檢查表格是否存在 - using parameterized query
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (validated_table,))
            if not cursor.fetchone():
                print(f"  ⚠️  表格 '{validated_table}' 不存在，跳過")
                continue

            # 檢查欄位是否已存在
            # Note: PRAGMA statements don't support parameterization, but table name is validated
            cursor.execute(f"PRAGMA table_info({validated_table})")
            columns = [col[1] for col in cursor.fetchall()]

            if 'is_deleted' not in columns:
                # Safe to use validated table name in f-string after validation
                cursor.execute(f"ALTER TABLE {validated_table} ADD COLUMN is_deleted INTEGER DEFAULT 0")
                print(f"  ✅ 已為 '{validated_table}' 新增 'is_deleted' 欄位")
            else:
                print(f"  ⏭️  '{validated_table}' 已有 'is_deleted' 欄位")

            if 'deleted_at' not in columns:
                cursor.execute(f"ALTER TABLE {validated_table} ADD COLUMN deleted_at TEXT")
                print(f"  ✅ 已為 '{validated_table}' 新增 'deleted_at' 欄位")
            else:
                print(f"  ⏭️  '{validated_table}' 已有 'deleted_at' 欄位")

        except ValueError as e:
            print(f"  ❌ 安全驗證失敗: {e}")
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
