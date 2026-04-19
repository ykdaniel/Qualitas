
import json
import urllib.error
import urllib.request


def test_api_fetch():
    url = "http://localhost:8001/api/itp/"
    print(f"Fetching {url}...")
    try:
        with urllib.request.urlopen(url) as response:
            data = response.read()
            print("Success!")
            json_data = json.loads(data)
            print(f"Fetched {len(json_data)} items")
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} {e.reason}")
        print(e.read().decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_api_fetch()
