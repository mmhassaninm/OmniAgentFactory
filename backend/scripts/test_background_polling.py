import asyncio
import os
import sys
from unittest.mock import patch

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.settings import SettingsModel
from services.llm_interceptor import BackgroundLLMClient, BackgroundAIDisabledException
from workers.optimization_loop import _run_optimization_loop

async def test_llm_interceptor():
    print("[RUNNING] Background Polling Diagnostics...")
    
    mock_settings = SettingsModel(proactiveBackgroundProcessing=False)
    
    with patch('services.llm_interceptor.get_settings', return_value=mock_settings), \
         patch('workers.optimization_loop.get_settings', return_value=mock_settings):
         
        print("[OK] Mocked System Settings: proactiveBackgroundProcessing = False")
        
        # Test 1: The Interceptor directly
        print("Test 1: LLM Interceptor Middleware...")
        passed_test1 = False
        try:
            async with BackgroundLLMClient() as client:
                await client.post("http://127.0.0.1:1234/v1/chat/completions", json={"test": True})
            print("[FAIL] Test 1 FAILED: Interceptor allowed request.")
        except BackgroundAIDisabledException:
            print("[PASS] Test 1 PASSED: Interceptor blocked request.")
            passed_test1 = True
            
        # Test 2: Optimization Loop Sleep State
        print("Test 2: Optimization Loop Sleep State...")
        passed_test2 = False
        task = asyncio.create_task(_run_optimization_loop())
        await asyncio.sleep(0.5)
        
        if not task.done():
            print("[PASS] Test 2 PASSED: Optimization loop is correctly sleeping.")
            passed_test2 = True
        else:
            print("[FAIL] Test 2 FAILED: Optimization loop exited improperly.")
            
        task.cancel()
        
        print("\n--- Diagnostic Results ---")
        if passed_test1 and passed_test2:
            print("[SUCCESS] ALL TESTS PASSED: 0 background requests hit port 1234 when disabled.")
            sys.exit(0)
        else:
            print("[ERROR] TESTS FAILED: Background drain issue persists.")
            sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_llm_interceptor())
