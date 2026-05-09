import asyncio
import httpx
import json

async def test_swarm_api():
    print("🐝 Initiating Direct Swarm Verification Test...")
    url = "http://localhost:3001/api/hive/orchestrateTask"
    
    payload = {
        "text": "Write a python script that calculates the 15th Fibonacci number and prints it. Return only the code.",
        "model": "local-model"
    }

    try:
        print(f"Sending task to Swarm Orchestrator: '{payload['text']}'")
        # High timeout because the Swarm coordinates 3 separate LLM calls recursively
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            
            data = response.json()
            if data.get("success"):
                print("\n✅ SWARM VERIFICATION SUCCESSFUL")
                print("="*50)
                print(data["response"])
                print("="*50)
            else:
                print("❌ SWARM REPORTED FAILURE:", data)
                
    except Exception as e:
        print(f"❌ SWARM VERIFICATION FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(test_swarm_api())
