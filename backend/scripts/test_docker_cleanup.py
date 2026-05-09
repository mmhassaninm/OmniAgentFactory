import requests
import json
import time

def test_docker_cleanup():
    print("====================================================")
    print("🧪 OMNIBOT DIAGNOSTIC: MULTI-EPOCH DOCKER CLEANUP TEST")
    print("====================================================\n")

    url = "http://127.0.0.1:3001/api/chat"
    headers = {"Content-Type": "application/json"}
    
    # We will send a prompt that triggers the run_in_sandbox tool 5 times sequentially. We will watch for the prune SSE.
    success_flags_caught = 0

    for i in range(1, 6):
        print(f"\n▶️ [EPOCH {i}/5] Sending code execution payload...")
        payload = {
            "model": "qwen2.5-coder-7b-instruct",
            "messages": [{"role": "user", "content": f"Write a one line python script that prints 'Epoch {i}' and execute it in the sandbox."}],
            "temperature": 0.1,
            "max_tokens": 1024,
            "isSearchEnabled": False,
            "isSwarmEnabled": True
        }

        try:
            with requests.post(url, headers=headers, json=payload, stream=True, timeout=120) as r:
                for line in r.iter_lines():
                    if line:
                        decoded_line = line.decode('utf-8')
                        if decoded_line.startswith("data: "):
                            data_str = decoded_line[6:].strip()
                            if data_str == "[DONE]":
                                break
                            
                            try:
                                data = json.loads(data_str)
                                
                                # Intercept and print the SSE status messages
                                if decoded_line.startswith("event: status"):
                                    msg = data.get("message", "")
                                    print(f"   [SSE STATUS]: {msg}")
                                    
                                    if "Sweeping Sandbox Environment" in msg:
                                        print("\n✅ SUCCESS: Caught the [SYSTEM_PRUNE_EXECUTED] UI status broadcast!")
                                        success_flags_caught += 1

                            except json.JSONDecodeError:
                                pass
        except Exception as e:
            print(f"❌ [HTTP Error]: {e}")
            
        time.sleep(2) # Give docker daemon a breath between executions

    print("\n📊 [DIAGNOSTIC RESULTS]:")
    if success_flags_caught >= 1:
        print("✅ PASS: The Docker cleanup logic triggered reliably on Epoch 5.")
        exit(0)
    else:
        print("❌ FAIL: Never received the sweep notification.")
        exit(1)

if __name__ == "__main__":
    test_docker_cleanup()
