import requests

BASE_URL = "http://127.0.0.1:3001/api"

def test_login_node():
    url = f"{BASE_URL}/auth/login"
    payload = {
        "username": "admin@example.com",
        "password": "admin"
    }
    print(f"Testing login via Node Proxy: {url}")
    try:
        response = requests.post(url, json=payload) # server.js expects body, uses express.json/urlencoded
        # server.js: const { username, password } = req.body;
        # server.js consumes JSON or URL-encoded. Frontend sends URL-encoded.
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_login_node()
