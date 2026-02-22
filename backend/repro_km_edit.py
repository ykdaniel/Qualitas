import requests
import json

BASE_URL = "http://localhost:8000/km"

# We bypass auth for testing, or we assume test login works. Let's just catch the exact error.
# Wait, backend requires auth. Let me try a simple fetch first.
try:
    # 1. Login to get token
    login_data = {"username": "admin", "password": "password"}
    login_res = requests.post("http://localhost:8000/auth/login", data=login_data)
    token = login_res.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 2. Get the first KM article
    km_res = requests.get(BASE_URL, headers=headers)
    if km_res.status_code == 200 and len(km_res.json()) > 0:
        article = km_res.json()[0]
        print(f"Testing edit on article: {article['id']}")
        
        # 3. Simulate an update
        update_payload = {
            "title": article["title"] + " (Edited)",
            "content": article["content"],
            "category": article["category"],
            "tags": article["tags"],
            "status": article["status"],
            "parent_id": article.get("parent_id"),
            "chapter_no": article.get("chapter_no")
        }
        
        put_res = requests.put(f"{BASE_URL}/{article['id']}", headers=headers, json=update_payload)
        print("PUT Status Code:", put_res.status_code)
        
        if put_res.status_code != 200:
            print("PUT Response:", put_res.text)
        else:
            print("PUT success. No error reproduced.")
    else:
        print("No articles found or GET failed:", km_res.status_code)
except Exception as e:
    print("Test script failed:", e)
