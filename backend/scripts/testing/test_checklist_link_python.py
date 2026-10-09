
import requests

BASE_URL = "http://127.0.0.1:8001/api"
TOKEN = None

def login():
    global TOKEN
    url = f"{BASE_URL}/auth/login"
    payload = {
        "username": "admin@example.com",
        "password": "admin"
    }
    # Direct to FastAPI uses form-urlencoded for OAuth2PasswordRequestForm
    response = requests.post(url, data=payload)
    if response.status_code == 200:
        TOKEN = response.json().get("access_token")
        print("Login successful.")
        return True
    else:
        print(f"Login failed: {response.text}")
        return False

def test_checklist_python():
    if not login():
        return

    create_url = f"{BASE_URL}/checklist/"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    checklist_data = {
        "recordsNo": "[AUTO-GENERATE]",
        "activity": "Test Activity Python",
        "date": "2026-02-14",
        "status": "Ongoing",
        "packageName": "PKG-001",
        "itrId": None,
        "itrNumber": None
    }

    print(f"Creating checklist via Python port 8000: {create_url}")
    try:
        resp = requests.post(create_url, json=checklist_data, headers=headers)
        print(f"Status Code: {resp.status_code}")
        print(f"Response: {resp.text}")

        if resp.status_code == 200:
            chk_id = resp.json()['id']
            # Test Update
            print(f"Updating checklist {chk_id}...")
            update_url = f"{BASE_URL}/checklist/{chk_id}"
            update_data = {
                "activity": "Updated Activity",
                "contractor": "Unknown Vendor" # Should be resolved or ignored, but definitely popped
            }
            # Note: ChecklistUpdate has contractor: Optional[str]
            # Passing it should trigger the fix in update_checklist

            resp_upd = requests.put(update_url, json=update_data, headers=headers)
            print(f"Update Status: {resp_upd.status_code}")
            print(f"Update Response: {resp_upd.text}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_checklist_python()
