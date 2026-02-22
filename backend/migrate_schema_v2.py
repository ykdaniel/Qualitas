import sqlite3
import shutil
import os
import uuid
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DB_FILE = "qualitas.db"
BACKUP_FILE = f"qualitas.db.bak.{int(datetime.now().timestamp())}"

def backup_database():
    if os.path.exists(DB_FILE):
        shutil.copy2(DB_FILE, BACKUP_FILE)
        logger.info(f"Database backed up to {BACKUP_FILE}")
    else:
        logger.error(f"Database file {DB_FILE} not found!")
        exit(1)

def migrate():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    try:
        # 1. Get all contractors mapping (Name -> ID)
        logger.info("Reading contractors...")
        cursor.execute("SELECT id, name FROM contractors")
        contractors = {row[1]: row[0] for row in cursor.fetchall()}
        logger.info(f"Found {len(contractors)} contractors.")

        # Tables to migrate: (Table Name, Old Column Name, New Column Name)
        tables_to_migrate = [
            ("itp", "vendor", "vendor_id"),
            ("ncr", "vendor", "vendor_id"),
            ("noi", "contractor", "vendor_id"),  # Note: NOI uses 'contractor' column
            ("itr", "vendor", "vendor_id"),
            ("pqp", "vendor", "vendor_id"),
            ("obs", "vendor", "vendor_id"),
            ("fat", "supplier", "vendor_id"),    # Note: FAT uses 'supplier' column
            ("followup", "vendor", "vendor_id"),
            ("checklist", "contractor", "vendor_id"), # Checklist uses 'contractor'
        ]

        for table, old_col, new_col in tables_to_migrate:
            logger.info(f"Migrating table: {table}...")
            
            # Check if new column exists
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [info[1] for info in cursor.fetchall()]
            
            if new_col not in columns:
                logger.info(f"Adding column {new_col} to {table}...")
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {new_col} TEXT")
            else:
                logger.info(f"Column {new_col} already exists in {table}, skipping add.")

            # Update records
            logger.info(f"Updating records in {table}...")
            cursor.execute(f"SELECT id, {old_col} FROM {table}")
            rows = cursor.fetchall()
            
            updated_count = 0
            for row in rows:
                record_id = row[0]
                vendor_name = row[1]
                
                if vendor_name and vendor_name in contractors:
                    vendor_id = contractors[vendor_name]
                    cursor.execute(f"UPDATE {table} SET {new_col} = ? WHERE id = ?", (vendor_id, record_id))
                    updated_count += 1
                elif vendor_name:
                     logger.warning(f"Contractor not found for {table} ID {record_id}: {vendor_name}")

            logger.info(f"Updated {updated_count} records in {table}.")

        conn.commit()
        logger.info("Migration completed successfully.")

    except Exception as e:
        conn.rollback()
        logger.error(f"Migration failed: {e}")
        # Restore backup? 
        # For safety, we keep the backup file. User can restore manually if needed.
    finally:
        conn.close()

if __name__ == "__main__":
    backup_database()
    migrate()
