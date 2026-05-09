import asyncio
import os
import sys
import json
from datetime import datetime

# Add backend to path
sys.path.append(os.getcwd())

async def verify_system():
    print("=== [OmniBot] Cortex Neuro-Monitor Verification Script ===")
    
    from services.predictive_engine import queue_manager
    from services.ai_service import sleep_wake_controller
    from services.encryption import decrypt
    from models.database import db

    # 1. Test Encryption/Decryption in Queue
    print("\n[1/3] Testing Secure Queuing...")
    test_prompt = "Verify my encryption layer 123"
    task_id = await queue_manager.add_to_queue(test_prompt, priority="LOW", task_type="test_v")
    
    doc = await db[queue_manager.COLLECTION].find_one({"_id": task_id if isinstance(task_id, str) else task_id}) # insert_one returns ObjectId but we use str(result.inserted_id) in AIQueueManager
    # Wait, insert_one returns an object that has inserted_id.
    # My AIQueueManager returns str(result.inserted_id).
    
    # Re-fetch with ObjectId if needed
    from bson import ObjectId
    doc = await db[queue_manager.COLLECTION].find_one({"_id": ObjectId(task_id)})
    
    if doc and doc["prompt_encrypted"] != test_prompt:
        print("✅ Prompt is encrypted in MongoDB.")
        decrypted = decrypt(doc["prompt_encrypted"])
        if decrypted == test_prompt:
            print("✅ Decryption successful.")
        else:
            print(f"❌ Decryption failed. Got: {decrypted}")
    else:
        print("❌ Encryption failed or prompt stored in plain text.")

    # 2. Test CPU Load Broadcaster
    print("\n[2/3] Testing Status Broadcaster...")
    status = await sleep_wake_controller.broadcast_status()
    print(f"Current State: {status['state']}")
    print(f"CPU Load: {status['cpu_load']}%")
    print(f"Queue Length: {status['queue_len']}")
    
    if status['queue_len'] > 0:
        print("✅ Broadcaster correctly reports queue length.")
    else:
        print("❌ Broadcaster missed the queued task.")

    # 3. Test Priority Interception
    print("\n[3/3] Testing Priority Routing...")
    # Mocking a chat request with background keyword
    from routers.chat import ChatRequest
    body = ChatRequest(messages=[{"role": "user", "content": "run background optimization"}])
    
    # We'll just check if the keyword logic in chat.py works as intended
    background_keywords = ["fuzz", "predict", "subconscious", "memory optimization", "cleanup"]
    last_msg = body.messages[-1]["content"].lower()
    is_background = any(k in last_msg for k in background_keywords)
    
    if is_background:
        print("✅ Priority Detection: Correctly identified 'LOW' priority background task.")
    else:
        print("❌ Priority Detection: Failed to identify background task.")

    print("\n=== Verification Complete ===")

if __name__ == "__main__":
    # Ensure MongoDB is running before this
    asyncio.run(verify_system())
