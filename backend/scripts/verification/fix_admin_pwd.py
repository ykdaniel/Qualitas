"""Reset one account's password directly in a SQLite database (emergency tool).

Every input must be given explicitly -- there is no default database path, account or password, so running this
by accident from any backend directory does nothing:
  QUALITAS_RESET_DB        absolute path to an EXISTING SQLite database file
                           (or DATABASE_URL=sqlite:////absolute/path.db; relative paths are refused)
  QUALITAS_RESET_EMAIL     email of the one account to reset
  QUALITAS_RESET_PASSWORD  the new password
"""
import os
import sqlite3
import sys
from pathlib import Path

import passlib.context


def _require_env(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"{name} is not set. Export it before running this script (no built-in default).")
    return value


def _target_db():
    path = os.environ.get("QUALITAS_RESET_DB")
    if not path:
        url = os.environ.get("DATABASE_URL", "")
        if url.startswith("sqlite:///"):
            path = url[len("sqlite:///"):]
    if not path:
        sys.exit("No database given. Set QUALITAS_RESET_DB (absolute path) or DATABASE_URL=sqlite:////absolute/path.db; "
                 "there is no default.")
    db = Path(path)
    if not db.is_absolute():
        sys.exit(f"Database path must be absolute, got {path!r}.")
    if not db.is_file():
        sys.exit(f"Database file does not exist: {db} (refusing to create a new one).")
    return db


def main():
    db = _target_db()
    email = _require_env("QUALITAS_RESET_EMAIL")
    new_password = _require_env("QUALITAS_RESET_PASSWORD")

    pwd_context = passlib.context.CryptContext(schemes=['bcrypt'], deprecated='auto')
    hash_str = pwd_context.hash(new_password)

    conn = sqlite3.connect(f"{db.as_uri()}?mode=rw", uri=True)  # mode=rw never creates a file
    try:
        cursor = conn.execute('UPDATE users SET hashed_password = ? WHERE email = ?', (hash_str, email))
        if cursor.rowcount != 1:
            conn.rollback()
            sys.exit(f"Expected exactly 1 account with that email in {db}, found {cursor.rowcount}; nothing changed.")
        conn.commit()
    finally:
        conn.close()

    print(f"Password updated for 1 account in {db}.")


if __name__ == "__main__":
    main()
