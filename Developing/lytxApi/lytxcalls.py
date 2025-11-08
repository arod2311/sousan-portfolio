import requests
import json

# Replace these with your real values:
BASE_URL = "https://lytx-api.prod5.ph.lytx.com"  # Example: https://api.05.sd.lytx.com
ENDPOINT = "/vehicles"                           # Example endpoint
API_KEY = "Cepx3VWEHgZzKBtx1zaACyyu5Cj45kl2"

def main():
    """
    Simple script to test Lytx API connectivity using an API key.
    Make sure you have the correct BASE_URL (including your pod),
    endpoint path, and a valid API key.
    """
    print("=== Starting Lytx API Test ===")

    # Construct the full URL for this test
    url = f"{BASE_URL}{ENDPOINT}"

    # Example query parameters (pageSize, page, etc.)
    params = {
        "pageSize": 10,
        "page": 1
    }

    # Required headers, including your API key
    headers = {
        "accept": "application/json",
        "x-apiKey": API_KEY
    }

    print(f"Requesting: {url} with params {params}")

    # Wrap the request in try/except to catch any connection errors
    try:
        response = requests.get(url, headers=headers, params=params)
        print("HTTP status code:", response.status_code)

        # Check the HTTP status code
        if response.status_code == 200:
            data = response.json()  # Parse JSON
            print("Request succeeded! Data returned:")
            # Pretty-print the JSON response for readability
            print(json.dumps(data, indent=2))
        else:
            print("Request failed!")
            print(f"Status code: {response.status_code}")
            print(f"Response: {response.text}")

    except Exception as e:
        print("An error occurred:", e)

if __name__ == "__main__":
    main()
