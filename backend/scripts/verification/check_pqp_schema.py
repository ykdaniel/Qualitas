import sqlite3


def check_schema():
    conn = sqlite3.connect('qualitas.db')
    cursor = conn.cursor()

    print("Columns in 'pqp' table:")
    try:
        cursor.execute("PRAGMA table_info(pqp)")
        columns = cursor.fetchall()
        for col in columns:
            print(col)

        print("\nChecking if 'attachments' exists:")
        has_attachments = any(c[1] == 'attachments' for c in columns)
        print(f"Has 'attachments': {has_attachments}")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    check_schema()
