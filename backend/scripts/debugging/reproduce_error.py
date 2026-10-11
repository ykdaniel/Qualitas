
import time

import requests
import os
import sys


def _require_env(name):
    """Credentials come only from the environment; this script has no built-in password."""
    value = os.environ.get(name)
    if not value:
        sys.exit(f"{name} is not set. Export it before running this script (no built-in default).")
    return value

try:
    # Login
    r = requests.post('http://localhost:8000/api/auth/login', data={'username': 'admin@example.com', 'password': _require_env("QUALITAS_ADMIN_PASSWORD")})
    if r.status_code != 200:
        print('Login failed')
        exit()
    token = r.json().get('access_token', '')
    headers = {'Authorization': f'Bearer {token}'}

    # Create dummy
    payload = {
        'recordsNo': f'[AUTO-TEST-{int(time.time())}]',
        'activity': 'Test Delete 3',
        'date': '2024-01-01',
        'status': 'Ongoing',
        'packageName': 'PKG',
        'detail_data': '{}',
        'itpIndex': 0
    }
    r_create = requests.post('http://localhost:8000/api/checklist/', json=payload, headers=headers)
    print(f'Create status: {r_create.status_code}')

    if r_create.status_code == 200:
        chk_id = r_create.json()['id']
        print(f'Created ID: {chk_id}')

        # Delete
        r_delete = requests.delete(f'http://localhost:8000/api/checklist/{chk_id}/', headers=headers)
        print(f'Delete status: {r_delete.status_code}')
        print(f'Delete response: {r_delete.text}')
    else:
        print(f'Create failed response: {r_create.text}')

except Exception as e:
    print(f"Script error: {e}")
