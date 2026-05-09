import asyncio
import os
import sys
import httpx
import json

# Add backend to path
sys.path.append(os.getcwd())

async def verify_toggle():
    print("=== [OmniBot] Proactive Toggle Final Verification ===")
    
    BASE_URL = "http://127.0.0.1:3001/api/settings"
    CHAT_URL = "http://127.0.0.1:3001/api/chat"

    async with httpx.AsyncClient() as client:
        # 1. Test Persistence (Set to False)
        print("\n[1/3] Testing Settings Persistence (OFF)...")
        res = await client.patch(BASE_URL, json={"proactiveBackgroundProcessing": False})
        if res.status_code == 200 and not res.json()["proactiveBackgroundProcessing"]:
            print("✅ Setting updated to OFF via API.")
        else:
            print(f"❌ Failed to update setting. Code: {res.status_code}")

        # 2. Test Task Suppression
        print("\n[2/3] Testing Background Task Suppression...")
        # Send a prompt that would trigger 'background' detection
        payload = {
            "messages": [{"role": "user", "content": "run background memory optimization"}],
            "isSwarmEnabled": False,
            "isSearchEnabled": False
        }
        res = await client.post(CHAT_URL, json=payload)
        data = res.json()
        if data.get("status") == "QUEUED":
             # This means it WAS queued, but it should be DROPPED if settings check works inside add_to_queue
             # Wait, my chat.py calls add_to_queue. If add_to_queue returns "DROPPED", chat.py should handle it.
             # Let's check what chat.py does.
             pass
        
        # Re-check the AIQueueManager logic: 
        # result = await queue_manager.add_to_queue(...)
        # return {"status": "QUEUED", "task_id": result, ...}
        
        if data.get("task_id") == "DROPPED":
            print("✅ Background task correctly DROPPED when setting is OFF.")
        else:
            print(f"❌ Task result unexpected: {data}")

        # 3. Test Persistence (Set back to True)
        print("\n[3/3] Testing Settings Persistence (ON)...")
        res = await client.patch(BASE_URL, json={"proactiveBackgroundProcessing": True})
        if res.status_code == 200 and res.json()["proactiveBackgroundProcessing"]:
            print("✅ Setting restored to ON via API.")
        else:
            print("❌ Failed to restore setting.")

    print("\n=== Verification Complete ===")

if __name__ == "__main__":
    asyncio.run(verify_toggle())
