import requests
import sys

BASE_URL = "http://localhost:8000/api"

def get_auth_token():
    """登入並取得認證 token"""
    try:
        login_data = {
            "username": "admin@example.com",
            "password": "admin"
        }
        resp = requests.post(f"{BASE_URL}/auth/login", data=login_data)
        if resp.status_code == 200:
            return resp.json()["access_token"]
        else:
            print(f"❌ Login failed: {resp.status_code}")
            return None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

endpoints = [
    "/itp/",
    "/ncr/",
    "/noi/",
    "/itr/",
    "/obs/",
    "/pqp/",
    "/contractors/",
    "/fat/",
    "/checklist/",
    "/audit/",
    "/followup/",
    "/settings/naming-rules"
]


def test_endpoints():
    print("正在驗證所有模組...")
    print("=" * 60)
    
    # 先登入取得 token
    print("🔐 正在登入...")
    token = get_auth_token()
    if not token:
        print("❌ 無法取得認證令牌，測試中止")
        sys.exit(1)
    print("✅ 登入成功\n")
    
    headers = {"Authorization": f"Bearer {token}"}
    all_passed = True
    
    for ep in endpoints:
        try:
            url = f"{BASE_URL}{ep}"
            resp = requests.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                count = len(data) if isinstance(data, list) else "N/A"
                print(f"✅ {ep:<30} OK (數量: {count})")
            else:
                print(f"❌ {ep:<30} FAILED ({resp.status_code}) - {resp.text[:100]}")
                all_passed = False
        except Exception as e:
            print(f"❌ {ep:<30} ERROR - {str(e)[:100]}")
            all_passed = False
    
    print("=" * 60)
    if all_passed:
        print("\n🎉 所有後端模組都正常運作！")
    else:
        print("\n⚠️ 部分模組驗證失敗。")
        sys.exit(1)

if __name__ == "__main__":
    test_endpoints()
