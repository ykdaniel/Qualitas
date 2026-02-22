import requests
import json

BASE_URL = "http://127.0.0.1:8000/api"

def test_login():
    url = f"{BASE_URL}/auth/login"
    payload = {
        "username": "admin@example.com",
        "password": "admin"
    }
    try:
        response = requests.post(url, data=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            token = response.json().get("access_token")
            test_profile(token)
    except Exception as e:
        print(f"Error: {e}")

def test_profile(token):
    # Test Contractors endpoint instead of profile
    url = f"{BASE_URL}/contractors/"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.get(url, headers=headers)
        print(f"Profile Status: {response.status_code}")
        print(f"Profile Response: {response.text}")
    except Exception as e:
        print(f"Profile Error: {e}")

if __name__ == "__main__":
    test_login()
