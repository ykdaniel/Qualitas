import requests
import sys

BASE_URL = "http://localhost:8000/api"

endpoints = [
    "/itp/",
    "/ncr/",
    "/noi/",
    "/itr/",
    "/obs/",
    "/pqp/",
    "/contractors/",
    "/fat/",
    "/settings/naming-rules"
]

def test_endpoints():
    print("Verifying all modules...")
    all_passed = True
    for ep in endpoints:
        try:
            url = f"{BASE_URL}{ep}"
            resp = requests.get(url)
            if resp.status_code == 200:
                print(f"✅ {ep:<25} OK ({len(resp.json())} items)")
            else:
                print(f"❌ {ep:<25} FAILED ({resp.status_code}) - {resp.text}")
                all_passed = False
        except Exception as e:
            print(f"❌ {ep:<25} ERROR - {e}")
            all_passed = False
    
    if all_passed:
        print("\n🎉 All backend modules are reachable and functioning!")
    else:
        print("\n⚠️ Some modules failed verification.")
        sys.exit(1)

if __name__ == "__main__":
    test_endpoints()
