import requests

BASE_URL = "http://localhost:8000/api"

def get_token():
    try:
        res = requests.post(f"{BASE_URL}/auth/login", data={"username": "YkDaniel", "password": "admin"})
        res.raise_for_status()
        return res.json().get("access_token")
    except Exception as e:
        print(f"Failed to login: {e}")
        return None

def run_tests():
    print("--- Starting KM API Verification ---")
    
    token = get_token()
    if not token:
        print("Stopping tests due to authentication failure.")
        return
        
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Create Article (Replacing category creation since it's now a field)
    try:
        article_data = {
            "title": "如何處理混凝土水灰比異常",
            "content": "# 問題描述\n如果遇到水灰比過高，請按照以下步驟處理：\n1. 停止澆置\n2. 重新檢驗",
            "category": "SOP",
            "status": "Published",
            "tags": "混凝土, SOP"
        }
        res = requests.post(f"{BASE_URL}/km/", json=article_data, headers=headers)
        res.raise_for_status()
        article = res.json()
        print(f"Created Article (Status {res.status_code}): {article.get('id', article)}")
        article_id = article.get('id')
    except Exception as e:
        print(f"Failed to create article: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")
        return
        
    if not article_id:
        print("Stopping tests due to article creation failure.")
        return
        
    # 2. Get Article (Check properties)
    try:
        res = requests.get(f"{BASE_URL}/km/{article_id}", headers=headers)
        res.raise_for_status()
        article_detail = res.json()
        print(f"Get Article Version: {article_detail.get('version_no')}")
        print(f"Get Article Tags: {article_detail.get('tags')}")
    except Exception as e:
        print(f"Failed to get article: {e}")
        
    # 3. Update Article
    try:
        update_data = {
            "status": "Published",
            "content": "# 問題描述\n如果遇到水灰比過高，請按照以下步驟處理：\n1. 停止澆置\n2. 重新檢驗\n3. 通知監造人員",
            "tags": "混凝土, SOP, 安衛",
            "change_summary": "增加通知監造人員步驟"
        }
        res = requests.put(f"{BASE_URL}/km/{article_id}", json=update_data, headers=headers)
        res.raise_for_status()
        updated = res.json()
        print(f"Updated Article Version: {updated.get('version_no')}, Status: {updated.get('status')}")
    except Exception as e:
        print(f"Failed to update article: {e}")
        
    # 4. Check History
    try:
        res = requests.get(f"{BASE_URL}/km/{article_id}/history", headers=headers)
        res.raise_for_status()
        histories = res.json()
        print(f"Get Article Histories Count: {len(histories)}")
        if histories:
            print(f"Latest History Version: {max(h['version_no'] for h in histories)}")
    except Exception as e:
        print(f"Failed to check history: {e}")

    # 5. Search Articles
    try:
        res = requests.get(f"{BASE_URL}/km/?search=水灰比", headers=headers)
        res.raise_for_status()
        articles = res.json()
        print(f"Search for '水灰比' found: {len(articles)} articles")
    except Exception as e:
        print(f"Failed to search: {e}")

if __name__ == "__main__":
    run_tests()

