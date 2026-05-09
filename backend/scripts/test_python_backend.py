import httpx
import asyncio
import json
import sys

BACKEND_URL = "http://localhost:3001/api/chat"
LM_STUDIO_API = "http://127.0.0.1:1234/api/v1"

async def unload_all_models():
    print("[TEST] 🧹 Nuking all models from LM Studio VRAM to trigger Python Auto-Ignition...")
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get("http://127.0.0.1:1234/v1/models")
            models = res.json().get("data", [])
            for m in models:
                if m["id"] != "text-embedding-bge-m3":
                    await client.post(f"{LM_STUDIO_API}/models/unload", json={"model": m["id"]})
                    print(f"[TEST] Unloaded: {m['id']}")
            print("[TEST] 🟢 VRAM is now fully empty.")
        except Exception as e:
            print(f"[TEST] Failed to unload: {e}")

async def run_chat_test():
    print("[TEST] 🚀 Sending code execution task to Python Swarm...")
    payload = {
        "model": "auto",
        "messages": [{"role": "user", "content": "Write a python script that prints 'Hello from the Python OmniBot Backend!' and execute it using your sandbox tool."}]
    }
    
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            async with client.stream("POST", BACKEND_URL, json=payload) as response:
                if response.status_code != 200:
                    print(f"❌ Backend returned error: {response.status_code}")
                    print(await response.aread())
                    sys.exit(1)
                    
                print("[TEST] 🌐 Reading SSE Stream from Python Backend:\n")
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])
                            if "message" in data:
                                print(f"\033[96m[STATUS]\033[0m {data['message']}")
                            elif "token" in data:
                                print(data["token"], end="", flush=True)
                        except: pass
                print("\n\n[TEST] ✅ Stream Complete.")
        except httpx.ConnectError:
            print("❌ Backend is offline. Could not connect to port 3001.")
            sys.exit(1)

async def main():
    await unload_all_models()
    await asyncio.sleep(2)
    await run_chat_test()

if __name__ == "__main__":
    asyncio.run(main())
