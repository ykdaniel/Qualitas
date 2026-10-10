import requests
import os
import sys


def _require_env(name):
    """Credentials come only from the environment; this script has no built-in password."""
    value = os.environ.get(name)
    if not value:
        sys.exit(f"{name} is not set. Export it before running this script (no built-in default).")
    return value

BASE_URL = "http://127.0.0.1:3001/api"

def test_login_node():
    url = f"{BASE_URL}/auth/login"
    payload = {
        "username": "admin@example.com",
        "password": _require_env("QUALITAS_ADMIN_PASSWORD")
    }
    print(f"Testing login via Node Proxy: {url}")
    try:
        response = requests.post(url, json=payload) # server.js expects body, uses express.json/urlencoded
        # server.js: const { username, password } = req.body;
        # server.js consumes JSON or URL-encoded. Frontend sends URL-encoded.

        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_login_node()
