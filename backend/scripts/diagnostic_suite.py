import asyncio
import httpx
import time
import os
import psutil
from datetime import datetime
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Force UTF-8 encoding for Windows terminal
sys.stdout.reconfigure(encoding='utf-8')

from services.omni_action_engine import execute_code

# Constants
API_BASE = "http://localhost:3001/api"
EPOCH_DELAY = 10  # Seconds between loop iterations
MAX_RAM_GB = 8.0

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def log(msg: str, color: str = Colors.OKCYAN):
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"{color}[{timestamp}] {msg}{Colors.ENDC}")

async def ping_backend() -> bool:
    """Verify the FastAPI backend is responsive."""
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{API_BASE}/models", timeout=5.0)
            if res.status_code == 200:
                log("Backend Ping: SUCCESS (LM Studio Connected)", Colors.OKGREEN)
                return True
            else:
                log(f"Backend Ping: FAILED (Status {res.status_code})", Colors.WARNING)
                return False
    except Exception as e:
        log(f"Backend Ping: FAILED ({e})", Colors.FAIL)
        return False

def test_docker_sandbox() -> bool:
    """Verify the Omni-Action Engine isolated Docker execution works."""
    log("Initiating Zero-Trust Docker Sandbox Test...", Colors.OKBLUE)
    
    test_code = """
import sys
import math
print("SANDBOX_SECURE_EXECUTION_PASS")
print(f"Math Test: 2 + 2 = {2+2}")
    """
    
    try:
        # We explicitly don't allow network for this basic math test
        output = execute_code(language="python", code=test_code, allow_network=False)
        
        if "SANDBOX_SECURE_EXECUTION_PASS" in output and "2 + 2 = 4" in output:
            log("Docker Sandbox Test: SUCCESS", Colors.OKGREEN)
            return True
        else:
            log("Docker Sandbox Test: FAILED (Incorrect or missing output)", Colors.WARNING)
            print(output)
            return False
    except Exception as e:
        log(f"Docker Sandbox Test: CRITICAL FAILURE ({e})", Colors.FAIL)
        return False

def check_memory_budget() -> bool:
    """Ensure the system respects the 8GB RAM ceiling rule for background processes."""
    # Getting total memory used by Python process (rough estimate for this suite)
    process = psutil.Process(os.getpid())
    mem_info = process.memory_info()
    ram_used_gb = mem_info.rss / (1024 ** 3)
    
    # We also check overall system memory to be safe
    sys_mem = psutil.virtual_memory()
    sys_used_gb = sys_mem.used / (1024 ** 3)
    sys_total_gb = sys_mem.total / (1024 ** 3)

    log(f"Memory Check: Suite Used = {ram_used_gb:.3f} GB | System Total Used = {sys_used_gb:.1f} GB / {sys_total_gb:.1f} GB", Colors.OKCYAN)

    if ram_used_gb > MAX_RAM_GB:
        log(f"MEMORY BREACH! Suite using {ram_used_gb:.2f} GB (Limit: {MAX_RAM_GB} GB). Initiating panic stop.", Colors.FAIL)
        return False
    return True

async def run_omni_diagnostic_loop():
    """The infinite background loop for testing and optimization."""
    log("==================================================", Colors.HEADER)
    log("🚀 INITIATING OMNI-ACTION ENGINE DIAGNOSTIC LOOP", Colors.HEADER + Colors.BOLD)
    log("==================================================", Colors.HEADER)
    
    epoch = 1
    consecutive_failures = 0
    
    while True:
        log(f"\n--- EPOCH {epoch} ---", Colors.HEADER)
        
        # 1. Hardware Budget Check
        if not check_memory_budget():
            log("HALTING LOOP DUE TO MEMORY BREACH.", Colors.FAIL)
            break
            
        # 2. Backend Connectivity Check
        backend_ok = await ping_backend()
        
        # 3. Docker Sandbox Execution Check
        sandbox_ok = test_docker_sandbox()
        
        if backend_ok and sandbox_ok:
            log(f"Epoch {epoch} COMPLETED SUCCESSFULLY.", Colors.OKGREEN)
            consecutive_failures = 0
        else:
            consecutive_failures += 1
            log(f"Epoch {epoch} FAILED. Consecutive Failures: {consecutive_failures}", Colors.FAIL)
            
            if consecutive_failures >= 3:
                log("CRITICAL: Repeated failures detected. Initiating autonomous healing logic...", Colors.WARNING)
                # In a full implementation, this might restart Docker or the FastAPI service
                log("Healing logic simulated. Waiting 30s before retry.", Colors.WARNING)
                time.sleep(30)
                consecutive_failures = 0 # reset to try again
        
        # Wait for next epoch
        log(f"Idling for {EPOCH_DELAY} seconds...", Colors.OKBLUE)
        await asyncio.sleep(EPOCH_DELAY)
        epoch += 1

if __name__ == "__main__":
    try:
        asyncio.run(run_omni_diagnostic_loop())
    except KeyboardInterrupt:
        log("\nDiagnostic Loop Terminated by User.", Colors.WARNING)
