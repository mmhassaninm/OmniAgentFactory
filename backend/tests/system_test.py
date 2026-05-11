import httpx
import asyncio
import os
import sys

async def wait_for_server():
    print("Waiting for FastApi server to start...")
    async with httpx.AsyncClient() as client:
        for _ in range(10):
            try:
                r = await client.get("http://127.0.0.1:3001/api/health", timeout=2.0)
                if r.status_code == 200:
                    print(f"Health OK: {r.json()}")
                    return True
            except (httpx.RequestError, httpx.HTTPError, asyncio.TimeoutError):
                pass
            await asyncio.sleep(1)
    return False

async def test_models():
    print("Testing /api/models endpoint...")
    async with httpx.AsyncClient() as client:
        r = await client.get("http://127.0.0.1:3001/api/models", timeout=5.0)
        print(f"Models Response: {r.status_code}")
        if r.status_code == 200:
            print("Successfully connected and fetched models.")

async def test_chat():
    print("Testing /api/chat endpoint (stream mode)...")
    payload = {
        "model": "mock-llama-3-8b-instruct",
        "messages": [{"role": "user", "content": "Hello, Test System"}],
        "temperature": 0.6,
        "isSearchEnabled": False
    }
    # Expect error from LM Studio if offline, but server shouldn't crash
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream("POST", "http://127.0.0.1:3001/api/chat", json=payload, timeout=5.0) as resp:
                print(f"Chat Response Status: {resp.status_code}")
                async for chunk in resp.aiter_text():
                    if chunk.strip():
                        print(f"Chat Streaming Chunk: {chunk.strip()}")
                        break # Only need first chunk to verify SSE
    except Exception as e:
        print(f"Chat stream test completed with Exception (Safe if LM Studio offline): {e}")

async def main():
    if not await wait_for_server():
        print("Backend failed to start.")
        sys.exit(1)
        
    await test_models()
    await test_chat()
    print("\n[DIAGNOSTIC TEST COMPLETE]")

if __name__ == "__main__":
    asyncio.run(main())
