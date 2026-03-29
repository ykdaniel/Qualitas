import requests
import json

BASE_URL = "http://localhost:8000/api"

def test_create_checklist():
    # 模擬前端傳送的數據
    payload = {
        "recordsNo": "[AUTO-GENERATE]",
        "activity": "Stakeout 放樣",
        "date": "2026-02-10",
        "status": "Pass",
        "packageName": "RKS",
        "location": "基礁區",
        "itpIndex": 0,
        "detail_data": json.dumps({
            "projectTitle": "Hai Long Offshore Wind Farm Project",
            "packageName": "RKS",
            "inspectionDate": "2026-02-10",
            "location": "基礁區",
            "stage": "Before",
            "items": [],
            "remarks": ""
        })
    }
    
    # 注意：這裡可能需要 Token，但我們先測試 schema 驗證
    try:
        response = requests.post(f"{BASE_URL}/checklist/", json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_create_checklist()
