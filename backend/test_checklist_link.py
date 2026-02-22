import requests
import json

BASE_URL = "http://127.0.0.1:3001/api"
TOKEN = None

def login():
    global TOKEN
    url = f"{BASE_URL}/auth/login"
    payload = {
        "username": "admin@example.com",
        "password": "admin"
    }
    response = requests.post(url, json=payload)
    if response.status_code == 200:
        TOKEN = response.json().get("access_token")
        print("Login successful.")
        return True
    else:
        print(f"Login failed: {response.text}")
        return False

def test_link_checklist():
    if not login():
        return

    # 1. Create a dummy checklist
    create_url = f"{BASE_URL}/checklist"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    checklist_data = {
        "recordsNo": "[AUTO-GENERATE]",
        "activity": "Test Activity for Linking",
        "date": "2026-02-14",
        "status": "Ongoing", # Changed from 'Open' to 'Ongoing' to match schema enum
        "packageName": "PKG-001",
        "itrId": None,
        "itrNumber": None
    }
    
    # Check if 'Ongoing' is valid status. Looking at ChecklistRecord interface it says 'Ongoing' | 'Pass' | 'Fail'.
    # Backend schema might be different. Let's try 'Ongoing'.
    
    # We need to make sure we use the correct endpoint. 
    # Usually POST /checklist/ (checking routers/checklist.py would confirm, but let's assume standard REST)
    
    # Wait, create_checklist payload doesn't support 'recordsNo' if it is auto-generated? 
    # Let's check schemas.py or just try.
    
    print("Creating checklist...")
    try:
        # Note: server.js uses body, but backend expects query params? No, FastAPI POST expects body.
        # But requests.post json=... sends application/json. 
        # API requires authentication? Yes.
        
        # Adjust URL if trailing slash is needed
        # routers/checklist.py: @router.post("/", ...)
        
        resp = requests.post(f"{create_url}/", json=checklist_data, headers=headers)
        if resp.status_code not in [200, 201]:
             print(f"Create failed: {resp.status_code} {resp.text}")
             return
        
        checklist = resp.json()
        chk_id = checklist['id']
        print(f"Checklist created: {chk_id}")
        
        # 2. Link it to an ITR (dummy itrId)
        # We don't need a real ITR ID if foreign key constraints are not enforced or if we just want to test the update endpoint logic.
        # However, models.py shows ForeignKey("itr.id"). So we need a valid ITR ID.
        # Let's fetch an existing ITR first.
        
        print("Fetching an ITR...")
        itr_resp = requests.get(f"{BASE_URL}/itr/", headers=headers)
        itrs = itr_resp.json()
        if not itrs:
             print("No ITRs found to link to. creating one...")
             # create logic skipped for brevity, assuming DB has seeded data or we can tolerate failure
             # actually lets just try to link to 'test-itr-id' and see if it fails with 500 or 422 (FK violation).
             target_itr_id = "test-itr-id" 
             target_itr_no = "ITR-TEST-001"
        else:
             target_itr_id = itrs[0]['id']
             target_itr_no = itrs[0]['documentNumber']
             
        print(f"Linking checklist {chk_id} to ITR {target_itr_id}...")
        
        update_url = f"{BASE_URL}/checklist/{chk_id}"
        update_data = {
            "itrId": target_itr_id,
            "itrNumber": target_itr_no
        }
        
        update_resp = requests.put(update_url, json=update_data, headers=headers)
        
        print(f"Link Status: {update_resp.status_code}")
        print(f"Link Response: {update_resp.text}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_link_checklist()
