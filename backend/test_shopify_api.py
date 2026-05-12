import sys
import os
import requests

store_url = "shopx-xwy4kjdn.myshopify.com"
token = os.environ.get("SHOPIFY_ACCESS_TOKEN")
api_version = "2025-01"

if not token:
    print("ERROR: SHOPIFY_ACCESS_TOKEN environment variable is not set.")
    print("Create a .env file with: SHOPIFY_ACCESS_TOKEN=your_shopify_token_here")
    sys.exit(1)

headers = {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json"
}

print(f"--- Shopify API Test on {store_url} ({api_version}) ---")

# 1. List all themes
themes_url = f"https://{store_url}/admin/api/{api_version}/themes.json"
try:
    resp = requests.get(themes_url, headers=headers, timeout=15)
    print(f"List Themes Status Code: {resp.status_code}")
    if resp.status_code != 200:
        print(f"Error listing themes: {resp.text}")
        sys.exit(1)

    themes = resp.json().get("themes", [])
    print(f"Found {len(themes)} themes:")
    active_theme = None
    for theme in themes:
        print(f"- ID: {theme['id']} | Name: {theme['name']} | Role: {theme['role']}")
        if theme["role"] == "main":
            active_theme = theme

    # 2. Get active theme ID
    if active_theme:
        print(f"\nActive Theme: {active_theme['name']} (ID: {active_theme['id']})")
        active_theme_id = active_theme['id']

        # 3. List assets of the active theme
        assets_url = f"https://{store_url}/admin/api/{api_version}/themes/{active_theme_id}/assets.json"
        assets_resp = requests.get(assets_url, headers=headers, timeout=15)
        print(f"List Assets Status Code: {assets_resp.status_code}")
        if assets_resp.status_code == 200:
            assets = assets_resp.json().get("assets", [])
            print(f"Total assets found in active theme: {len(assets)}")
            # Show first 15 assets
            print("First 15 assets:")
            for asset in assets[:15]:
                print(f"  - Key: {asset['key']} | Updated: {asset.get('updated_at', 'N/A')}")
        else:
            print(f"Error listing assets: {assets_resp.text}")
    else:
        print("\nNo main/active theme found.")
except Exception as e:
    print(f"An error occurred: {e}")