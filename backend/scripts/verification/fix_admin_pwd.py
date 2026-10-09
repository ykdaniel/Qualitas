import sqlite3

import passlib.context

pwd_context = passlib.context.CryptContext(schemes=['bcrypt'], deprecated='auto')
hash_str = pwd_context.hash('admin')

conn = sqlite3.connect('qualitas.db')
cursor = conn.cursor()
cursor.execute('UPDATE users SET hashed_password = ? WHERE email = ?', (hash_str, 'admin@example.com'))
conn.commit()
cursor.close()
conn.close()

print("Password updated successfully.")
