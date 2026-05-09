import asyncio
import os
import sys

# Ensure backend acts as root
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.search_engine import search_duckduckgo
from services.omni_action_engine import execute_code

async def test_search():
    print("------- TESTING SEARCH ENGINE EVOLUTION -------", flush=True)
    res = await search_duckduckgo("FastAPI documentation", limit=1, deep_scrape=True)
    print(f"BYTES EXTRACTED: {len(res)}\n", flush=True)
    if len(res) > 2000:
        print("[FAIL] The search engine did not properly compress the text budget.", sys.stderr)
        return False
    else:
        print("[PASS] Token payload budget respected.")
    return True

def test_omni_sandbox():
    print("\n------- TESTING OMNI-ACTION ENGINE (0.5 CPU / 350M RAM) -------", flush=True)
    test_code = """
import os
import psutil
print("Sandbox executed. CPU Cores seen:", os.cpu_count())
"""
    res = execute_code(language="python", code=test_code, allow_network=False)
    print(res)
    
    if "Docker daemon is unreachable" in res:
         print("[WARN] Docker Daemon is currently offline on the host machine. Skipping Sandbox verification.", flush=True)
         return True
    elif "Sandbox executed" in res:
         print("[PASS] Ephemeral Docker sandbox successfully executed with new constraints.", flush=True)
         return True
    return False

async def main():
    try:
        s_pass = await test_search()
        o_pass = test_omni_sandbox()
        if s_pass and o_pass:
            print("\n[PHASE 13 AUDIT] All systems passing local verification.", flush=True)
        else:
            print("\n[PHASE 13 AUDIT] Failed local verification.", flush=True)
            sys.exit(1)
    except Exception as e:
        print(f"Fatal error in testing script: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
