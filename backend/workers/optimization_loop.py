import asyncio
import logging
from datetime import datetime
from services.swarm.orchestrator import swarm_orchestrator
from services.vector_db import vector_memory
from models.settings import get_settings
import os

logger = logging.getLogger(__name__)

# List of autonomous tasks to continuously cycle through
SWARM_AUTONOMOUS_TASKS = [
    "Scan the backend API routers in backend/routers for performance optimizations. Propose asynchronous refactoring or better error handling where applicable.",
    "Draft a new Playwright scraper script that extracts the latest 5 local AI news articles from a reliable tech site (e.g., hacker news) and stores them in semantic memory. Code it in Python.",
    "Audit the omni_action_engine.py security. Check if there are any sandbox escape vulnerabilities that could be exploited when executing untrusted docker containers.",
    "Refine the System Prompt for the CortexAI frontend chat to better synthesize search results and avoid hallucinations. Draft the proposed new prompt in Markdown.",
]

async def _run_optimization_loop():
    """Inner loop that runs forever, drawing tasks and passing them to the Swarm."""
    logger.info("🐝 [Swarm] Infinite Optimization Loop Activated. Initiating autonomous R&D phase.")
    
    # Wait lightly before starting to ensure the whole system is up
    await asyncio.sleep(20)
    
    loop_count = 0
    while True:
        try:
            settings = await get_settings()
            if not settings.proactiveBackgroundProcessing:
                logger.debug("🐝 [Swarm Loop] Global background AI disabled. Sleeping.")
                await asyncio.sleep(60)
                continue

            task = SWARM_AUTONOMOUS_TASKS[loop_count % len(SWARM_AUTONOMOUS_TASKS)]
            logger.info(f"🐝 [Swarm Loop {loop_count}] Selecting task: {task[:60]}...")
            
            # Execute Swarm
            result = await swarm_orchestrator.execute_task(task, max_iterations=2)
            
            # Log results to devlog to simulate 'silent logging'
            devlog_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "Project_Docs", "Logs", "DEVLOG.md")
            if os.path.exists(devlog_path):
                now_str = datetime.now().strftime("%Y-%m-%d | %H:%M")
                log_entry = f"\n**{now_str}** - **Task:** Autonomous Swarm R&D Optimization Loop - **Status:** {result['status']} - **Logic:** Swarm executed: {task[:60]}...\n---\n"
                with open(devlog_path, 'a', encoding='utf-8') as f:
                    f.write(log_entry)
            
            logger.info(f"🐝 [Swarm Loop {loop_count}] Task completed. Resting Swarm.")
            
        except asyncio.CancelledError:
            logger.warning("🐝 [Swarm Loop] Optimization Loop Cancelled by Application Shutdown.")
            break
        except Exception as e:
            logger.error(f"🐝 [Swarm Loop] Error during execution: {e}")
            
        loop_count += 1
        # Wait 5 minutes between large autonomous cycles to save background compute
        await asyncio.sleep(300)

def start_optimization_loop():
    """Starts the asyncio task in the background."""
    asyncio.create_task(_run_optimization_loop())
