
import requests
import json

BASE_URL = "http://127.0.0.1:8000/api"

def test_iam_flow():
    print("Testing IAM Backend Flow...")

    # 1. Login as Admin (Seeded)
    print("\n1. Logging in as Admin...")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", data={
            "username": "admin@example.com",
            "password": "admin"
        })
        if response.status_code == 200:
            token = response.json()["access_token"]
            print("   [PASS] Login successful. Token received.")
        else:
            print(f"   [FAIL] Login failed: {response.status_code} {response.text}")
            return
    except Exception as e:
        print(f"   [FAIL] Connection failed: {e}")
        return

    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create a New Role
    print("\n2. Creating a new Role 'Inspector'...")
    role_data = {
        "name": "Inspector",
        "description": "Quality Inspector",
        "permissions": ["read_ncr", "write_ncr"]
    }
    response = requests.post(f"{BASE_URL}/iam/roles", json=role_data, headers=headers)
    if response.status_code == 200:
        role = response.json()
        print(f"   [PASS] Role created: {role['id']} - {role['name']}")
        role_id = role['id']
    elif response.status_code == 400 and "already exists" in response.text:
         print("   [INFO] Role 'Inspector' already exists. Fetching it...")
         # Fetch to get ID
         r = requests.get(f"{BASE_URL}/iam/roles", headers=headers)
         for item in r.json():
             if item['name'] == "Inspector":
                 role_id = item['id']
                 print(f"   [PASS] Found existing role ID: {role_id}")
                 break
    else:
        print(f"   [FAIL] Create Role failed: {response.status_code} {response.text}")
        return

    # 3. Create a New User
    print("\n3. Creating a new User 'john_doe'...")
    user_data = {
        "username": "john_doe",
        "email": "john@example.com",
        "password": "password123",
        "full_name": "John Doe",
        "role_id": role_id
    }
    response = requests.post(f"{BASE_URL}/iam/users", json=user_data, headers=headers)
    if response.status_code == 200:
        user = response.json()
        print(f"   [PASS] User created: {user['id']} - {user['username']}")
    elif response.status_code == 400 and "already registered" in response.text:
        print("   [INFO] User 'john_doe' already exists.")
    else:
        print(f"   [FAIL] Create User failed: {response.status_code} {response.text}")
        return

    print("\n[SUCCESS] IAM Backend Verification Complete!")

if __name__ == "__main__":
    test_iam_flow()
