import requests
import os
import sys


def _require_env(name):
    """Credentials come only from the environment; this script has no built-in password."""
    value = os.environ.get(name)
    if not value:
        sys.exit(f"{name} is not set. Export it before running this script (no built-in default).")
    return value

BASE_URL = "http://127.0.0.1:8000/api"

def test_roles():
    # Login
    login_payload = {"username": "admin", "password": _require_env("QUALITAS_ADMIN_PASSWORD")}
    response = requests.post(f"{BASE_URL}/auth/login", data=login_payload)
    if response.status_code != 200:
        print(f"Login failed: {response.status_code} {response.text}")
        return

    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Get Roles
    print("Fetching roles...")
    response = requests.get(f"{BASE_URL}/roles", headers=headers)
    if response.status_code == 200:
        roles = response.json()
        print(f"Roles found: {len(roles)}")
        print(roles)
    else:
        print(f"Get roles failed: {response.status_code} {response.text}")

if __name__ == "__main__":
    test_roles()
