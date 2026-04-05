import requests
import json
import sys

BASE_URL = "http://localhost:8000/api"

def test_pqp_attachments():
    # 1. Create PQP with attachments
    payload = {
        "title": "API Test PQP",
        "description": "Created via API verification script",
        "vendor": "Test Vendor",
        "status": "Approved",
        "version": "Rev1.0",
        "createdAt": "2023-10-27",
        "updatedAt": "2023-10-27",
        "attachments": ["data:image/png;base64,fakeimage", "http://example.com/file.pdf"]
    }
    
    print("Creating PQP...")
    try:
        resp = requests.post(f"{BASE_URL}/pqp/", json=payload)
        if resp.status_code != 200:
            print(f"Error creating PQP: {resp.status_code} {resp.text}")
            sys.exit(1)
        data = resp.json()
        pqp_id = data['id']
        print(f"Created PQP with ID: {pqp_id}")
    except Exception as e:
        print(f"Failed to create PQP: {e}")
        sys.exit(1)

    # 2. Verify attachments in response
    if 'attachments' not in data:
        print("Error: 'attachments' field missing in create response")
        sys.exit(1)
    
    # Check if attachments is None or empty list
    attachments = data.get('attachments')
    if attachments is None:
        print("Error: attachments is None")
        sys.exit(1)
        
    if len(attachments) != 2:
        print(f"Error: Expected 2 attachments, got {len(attachments)}")
        print(attachments)
        sys.exit(1)

    # 3. Fetch PQP to verify persistence
    print("Fetching PQP...")
    try:
        resp = requests.get(f"{BASE_URL}/pqp/{pqp_id}")
        if resp.status_code != 200:
            print(f"Error fetching PQP: {resp.status_code} {resp.text}")
            sys.exit(1)
        fetched_data = resp.json()
    except Exception as e:
        print(f"Failed to fetch PQP: {e}")
        sys.exit(1)

    if 'attachments' not in fetched_data:
        print("Error: 'attachments' field missing in get response")
        sys.exit(1)
        
    fetched_attachments = fetched_data.get('attachments')
    if fetched_attachments != payload['attachments']:
        print("Error: Attachments mismatch")
        print(f"Expected: {payload['attachments']}")
        print(f"Got: {fetched_attachments}")
        sys.exit(1)

    print("Verification Successful: PQP attachments created and persisted.")

    # 4. Delete PQP (cleanup)
    print("Cleaning up...")
    requests.delete(f"{BASE_URL}/pqp/{pqp_id}")

if __name__ == "__main__":
    test_pqp_attachments()
