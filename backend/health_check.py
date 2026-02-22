import requests
import json
import uuid
from datetime import datetime

BASE_URL = "http://127.0.0.1:3002/api"
TOKEN = None

def login():
    global TOKEN
    url = f"{BASE_URL}/auth/login"
    payload = {
        "username": "admin@examples.com", # Typo intentional to check failure? No, let's fix. admin@example.com
        "username": "admin@example.com",
        "password": "admin"
    }
    try:
        response = requests.post(url, data=payload)
        if response.status_code == 200:
            TOKEN = response.json().get("access_token")
            print("Login successful.")
            return True
        else:
            print(f"Login failed: {response.status_code} {response.text}")
            return False
    except Exception as e:
        print(f"Connection failed: {e}")
        return False

def get_headers():
    return {"Authorization": f"Bearer {TOKEN}"}

def test_module_crud(module_name, url_suffix, create_data, update_data, id_field='id'):
    print(f"\n--- Testing {module_name} ---")
    headers = get_headers()
    url = f"{BASE_URL}/{url_suffix}/"
    
    # 1. CREATE
    print(f"CREATE Payload: {json.dumps(create_data)}")
    try:
        resp = requests.post(url, json=create_data, headers=headers)
        if resp.status_code not in [200, 201]:
            print(f"❌ CREATE Failed: {resp.status_code} {resp.text}")
            return False
        
        item = resp.json()
        item_id = item.get(id_field)
        if not item_id:
             print(f"❌ CREATE Success but no ID returned: {item}")
             return False
             
        print(f"✅ CREATE Success. ID: {item_id}")
    except Exception as e:
        print(f"❌ CREATE Exception: {e}")
        return False

    # 2. UPDATE
    update_url = f"{url}{item_id}"
    print(f"UPDATE Payload: {json.dumps(update_data)}")
    try:
        resp = requests.put(update_url, json=update_data, headers=headers)
        if resp.status_code != 200:
            print(f"❌ UPDATE Failed: {resp.status_code} {resp.text}")
            return False
        print(f"✅ UPDATE Success")
    except Exception as e:
        print(f"❌ UPDATE Exception: {e}")
        return False

    # 3. DELETE
    delete_url = f"{url}{item_id}"
    try:
        resp = requests.delete(delete_url, headers=headers)
        if resp.status_code != 200:
            print(f"❌ DELETE Failed: {resp.status_code} {resp.text}")
            return False
        print(f"✅ DELETE Success")
    except Exception as e:
        print(f"❌ DELETE Exception: {e}")
        return False
        
    return True

def run_health_check():
    if not login():
        return

    # ITP Data
    # Assuming 'itp' endpoint
    itp_create = {
        "referenceNo": f"ITP-TEST-{uuid.uuid4().hex[:6]}",
        "description": "Health Check ITP",
        "vendor": "Vendor A", 
        "status": "Draft",
        "rev": "Rev1.0"
    }
    itp_update = {
        "description": "Updated Health Check ITP",
        "status": "Pending",
        "vendor": "Vendor B" # Test update handling
    }
    test_module_crud("ITP", "itp", itp_create, itp_update)

    # NCR Data
    # Assuming 'ncr' endpoint
    ncr_create = {
        "documentNumber": f"NCR-TEST-{uuid.uuid4().hex[:6]}",
        "description": "Health Check NCR",
        "vendor": "Vendor A",
        "status": "Open",
        "type": "Product",
        "rev": "Rev1.0",
        "submit": "Initial"
    }
    ncr_update = {
        "description": "Updated Health Check NCR", 
        "status": "In Progress"
    }
    test_module_crud("NCR", "ncr", ncr_create, ncr_update)

    # NOI Data
    noi_create = {
        "package": "PKG-001",
        "issueDate": "2026-02-14",
        "inspectionTime": "10:00",
        "inspectionDate": "2026-02-15",
        "itpNo": "ITP-001", # Mock ITP
        "contractor": "Vendor A", # Schema uses 'contractor'
        "type": "Hold Point"
    }
    noi_update = {
        "remark": "Updated remark",
        "status": "In Progress" # Check transition
    }
    test_module_crud("NOI", "noi", noi_create, noi_update)

    # Checklist Data
    checklist_create = {
        "recordsNo": "[AUTO-GENERATE]",
        "activity": "Health Check CL",
        "date": "2026-02-14",
        "status": "Ongoing",
        "packageName": "PKG-TEST",
        "contractor": "Vendor A"
    }
    checklist_update = {
        "activity": "Updated CL",
        "contractor": "Vendor B" 
    }
    # Note endpoint might be 'checklist' or 'checklists'? Checking routers... it's 'checklist'
    test_module_crud("Checklist", "checklist", checklist_create, checklist_update)

if __name__ == "__main__":
    run_health_check()
