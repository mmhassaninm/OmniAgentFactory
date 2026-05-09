import os
import psutil
import asyncio
import logging
import httpx
from typing import Dict, Any, List
from services.predictive_engine import queue_manager
from models.settings import get_settings
from services.llm_interceptor import BackgroundLLMClient, BackgroundAIDisabledException

logger = logging.getLogger(__name__)

# Constants
CPU_IDLE_THRESHOLD = 20.0
LM_STUDIO_CHAT_URL = os.getenv("LM_STUDIO_CHAT_URL", "http://127.0.0.1:1234/v1/chat/completions")

class SleepWakeController:
    """
    Monitors CPU and LM Studio state to manage AI background traffic.
    """
    def __init__(self):
        self.state = "SLEEP" # SLEEP, WAKE, BUSY
        self.active_tasks = []
        self._loop_running = False

    def get_system_load(self) -> float:
        return psutil.cpu_percent(interval=None)

    async def broadcast_status(self):
        """
        Used to feed the neuro_stream SSE channel.
        This will be called by the SSE router.
        """
        stats = await queue_manager.get_queue_stats()
        settings = await get_settings()
        return {
            "state": self.state if settings.proactiveBackgroundProcessing else "DISABLED",
            "cpu_load": self.get_system_load(),
            "queue_len": stats["total_queued"],
            "active_tasks": self.active_tasks,
            "proactive_enabled": settings.proactiveBackgroundProcessing,
            "timestamp": os.getpid()
        }

    async def process_queue_batch(self):
        """
        Executes a batch of background tasks.
        """
        tasks = await queue_manager.get_next_batch(limit=3)
        if not tasks:
            return

        self.state = "WAKE"
        logger.info(f"[SleepWakeController] Waking up to process {len(tasks)} tasks.")

        for task in tasks:
            # Update HUD state
            self.active_tasks.append({
                "id": task["_id"],
                "type": task["task_type"],
                "status": "PROCESSING"
            })
            
            try:
                # Execute task via LM Studio
                payload = {
                    "model": "qwen2.5-coder-7b-instruct", # Default or from metadata
                    "messages": [{"role": "user", "content": task["prompt"]}],
                    "temperature": 0.3
                }
                
                async with BackgroundLLMClient() as client:
                    await client.post(LM_STUDIO_CHAT_URL, json=payload, timeout=60.0)
                
                await queue_manager.mark_complete(task["_id"])
                logger.info(f"[SleepWakeController] Task {task['_id']} completed.")
            except BackgroundAIDisabledException as e:
                logger.warning(f"[SleepWakeController] Task {task['_id']} aborted: {e}")
                # We do not mark as failed or complete, let it stay in queue or handle as dropped
            except Exception as e:
                logger.error(f"[SleepWakeController] Task {task['_id']} failed: {e}")
            finally:
                # Remove from active tasks display
                self.active_tasks = [t for t in self.active_tasks if t["id"] != task["_id"]]

        self.state = "SLEEP"

    async def start_autonomous_loop(self):
        """
        Background sentinel that wakes up AI batch processing when CPU is low.
        """
        if self._loop_running:
            return
        
        self._loop_running = True
        logger.info("[SleepWakeController] Autonomous Traffic Controller Started.")
        
        while self._loop_running:
            settings = await get_settings()
            
            if not settings.proactiveBackgroundProcessing:
                # System is disabled, skip checking load
                await asyncio.sleep(10)
                continue

            cpu_load = self.get_system_load()
            stats = await queue_manager.get_queue_stats()
            
            if cpu_load < CPU_IDLE_THRESHOLD and stats["total_queued"] > 0 and self.state == "SLEEP":
                logger.info(f"[SleepWakeController] CPU IDLE ({cpu_load}%). Triggering Batch Processing.")
                asyncio.create_task(self.process_queue_batch())
            
            await asyncio.sleep(5) # Check every 5 seconds

sleep_wake_controller = SleepWakeController()
