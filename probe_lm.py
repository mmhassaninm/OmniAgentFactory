import urllib.request
import urllib.error
import json

base_url = "http://127.0.0.1:1234/v1"

try:
    req = urllib.request.Request(f"{base_url}/models", method="GET")
    with urllib.request.urlopen(req, timeout=5) as response:
        data = json.loads(response.read().decode('utf-8'))
        models = data.get("data", [])
        
    print(f"Loaded models: {[m['id'] for m in models]}")
    
    if models:
        # Try unloading the first one
        model_id = models[0]['id']
        payload = json.dumps({"model": model_id}).encode('utf-8')
        
        unload_urls = [
            f"{base_url}/models/{model_id}/unload",
            "http://127.0.0.1:1234/api/v0/models/unload",
            "http://127.0.0.1:1234/v1/internal/model/unload"
        ]
        
        for url in unload_urls:
            print(f"Trying unload at {url}...")
            try:
                # Some endpoints expect POST with no body for {model_id}/unload, others expect {"model": ...}
                req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method="POST")
                with urllib.request.urlopen(req, timeout=5) as res:
                    print(f"Success with {url}! Response: {res.read().decode('utf-8')}")
                    break
            except Exception as e:
                print(f"Failed {url}: {e}")
                
except Exception as e:
    print(f"Cannot reach LM Studio: {e}")
