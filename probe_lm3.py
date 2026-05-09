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
        model_id = models[0]['id']
        payload = json.dumps({"model": model_id}).encode('utf-8')
        
        unload_urls = [
            ("http://127.0.0.1:1234/v1/models/unload", payload),
            ("http://127.0.0.1:1234/v1/models/empty", b'{}'),
            ("http://127.0.0.1:1234/api/v0/models/eject", payload),
        ]
        
        for url, data_payload in unload_urls:
            print(f"Trying unload at {url} with {data_payload}...")
            try:
                req = urllib.request.Request(url, data=data_payload, headers={'Content-Type': 'application/json'}, method="POST")
                with urllib.request.urlopen(req, timeout=5) as res:
                    body = res.read().decode('utf-8')
                    print(f"HTTP {res.status} SUCCESS! Response: {body}")
            except urllib.error.HTTPError as e:
                body = e.read().decode('utf-8')
                print(f"HTTP {e.code} FAILED! Response: {body}")
            except Exception as e:
                print(f"Failed {url}: {e}")
                
except Exception as e:
    print(f"Cannot reach LM Studio: {e}")
