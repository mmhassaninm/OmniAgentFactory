import asyncio
import httpx
import json
import os
import sys

# Test configuration
BACKEND_URL = "http://localhost:3001/api/chat"
DESKTOP_PATH = os.path.join(os.path.expanduser("~"), "Desktop")
FOLDER_NAME = "أشرف"
TEST_FOLDER_PATH = os.path.join(DESKTOP_PATH, FOLDER_NAME)

async def test_interrogation_protocol():
    print("====================================================")
    print("🧪 OMNIBOT DIAGNOSTIC: INTERROGATION PROTOCOL TEST")
    print("====================================================")
    
    # Pre-clean the desktop folder if it exists from a previous run
    if os.path.exists(TEST_FOLDER_PATH):
        try:
            os.rmdir(TEST_FOLDER_PATH)
            print(f"🧹 Cleaned up existing test folder at {TEST_FOLDER_PATH}")
        except Exception as e:
            print(f"⚠️ Could not remove existing folder: {e}")

    # Phase 1: Trigger the Host Execution Request
    print("\n[PHASE 1] Sending hostile/direct Host Execution payload...")
    payload_1 = {
        "messages": [{"role": "user", "content": "اعملي فولدر على الديسكتوب اسمه أشرف"}],
        "conversationId": "test_interrogation_123",
        "isSwarmEnabled": True,
        "isSearchEnabled": False,
        "activeFolder": None,
        "model": "deepseek-r1-distill-llama-8b"
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            print("⏳ Awaiting AI response (Expecting Clarifying Questions)...")
            response = await client.post(BACKEND_URL, json=payload_1)
            
            # The backend streams SSE. We need to collect the chunks.
            full_reply = ""
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        if "token" in data:
                            content = data["token"]
                            full_reply += content
                            print(content, end="", flush=True)
                        elif "message" in data:
                            print(f"\n[Status]: {data['message']}")
                    except json.JSONDecodeError:
                        pass
            
            print("\n\n📊 [PHASE 1 RESULTS]:")
            if "?" in full_reply or "استفسار" in full_reply or "سؤال" in full_reply:
                print("✅ PASS: AI initiated the Interrogation Protocol and asked questions.")
            else:
                print("❌ FAIL: AI did not seem to ask clarifying questions.")
                print(f"Full Reply: {full_reply}")
                return

    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return

    # Phase 2: Provide the Answers and authorise execution
    import re
    clean_reply = re.sub(r'<tool_call>.*?</tool_call>', '', full_reply, flags=re.DOTALL)
    clean_reply = re.sub(r'<tool_response>.*?</tool_response>', '', clean_reply, flags=re.DOTALL)
    clean_reply = clean_reply.strip()

    print("\n[PHASE 2] Supplying answers to trigger Host Execution...")
    payload_2 = {
        "messages": [
            {"role": "user", "content": "اعملي فولدر على الديسكتوب اسمه أشرف"},
            {"role": "assistant", "content": clean_reply}, # Passing the clean AI questions back
            {"role": "user", "content": f"1. الديسكتوب في المسار: {DESKTOP_PATH}\n2. لو موجود تجاهله.\n3. مفيش ملفات تانية. نفذ الأمر واعمل الفولدر."}
        ],
        "conversationId": "test_interrogation_123",
        "isSwarmEnabled": True,
        "isSearchEnabled": False,
        "activeFolder": None,
        "model": "deepseek-r1-distill-llama-8b"
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            print("⏳ Awaiting AI code generation and Host execution...")
            response = await client.post(BACKEND_URL, json=payload_2)
            
            full_reply = ""
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        if "token" in data:
                            content = data["token"]
                            full_reply += content
                            print(content, end="", flush=True)
                        elif "message" in data:
                            print(f"\n[Status]: {data['message']}")
                    except json.JSONDecodeError:
                        pass
            
            print("\n\n📊 [PHASE 2 RESULTS]:")
            
            # Physical File System Verification
            time.sleep(2) # Give OS a moment to sync
            if os.path.exists(TEST_FOLDER_PATH):
                print(f"✅ PASS: Folder successfully created on Host at: {TEST_FOLDER_PATH}")
                # Clean up
                try:
                    os.rmdir(TEST_FOLDER_PATH)
                    print(f"🧹 Cleaned up test folder.")
                except Exception:
                    pass
            else:
                print(f"❌ FAIL: Folder was NOT created at {TEST_FOLDER_PATH}")
                print(f"AI Final Reply: {full_reply}")

    except Exception as e:
        print(f"❌ Connection Error in Phase 2: {e}")

if __name__ == "__main__":
    import time
    asyncio.run(test_interrogation_protocol())
