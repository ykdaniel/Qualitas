import sqlite3

conn = sqlite3.connect('qualitas.db')
cursor = conn.cursor()
cursor.execute("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='audit_logs'")
for row in cursor.fetchall():
    if row[0]:
        print(row[0])
conn.close()
