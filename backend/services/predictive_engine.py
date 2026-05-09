import os
import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from models.database import db
from services.encryption import encrypt, decrypt
from models.settings import get_settings

logger = logging.getLogger(__name__)

class AIQueueManager:
    """
    Manages the AI Task Queue in MongoDB.
    Categorizes tasks by priority and encrypts prompts for security.
    """
    COLLECTION = "ai_task_queue"

    @staticmethod
    async def add_to_queue(prompt: str, priority: str = "NORMAL", task_type: str = "general", metadata: Dict[str, Any] = None) -> str:
        """
        Adds a new AI task to the secure MongoDB queue if background processing is enabled.
        """
        # --- Settings Check ---
        settings = await get_settings()
        if not settings.proactiveBackgroundProcessing and priority.upper() in ["LOW", "NORMAL"]:
            logger.info(f"[AIQueueManager] Background processing disabled. Dropping {priority} task.")
            return "DROPPED"

        logger.info(f"[AIQueueManager] Queuing {priority} task: {task_type}")
        
        # Priority mapping for sorting (higher number = higher priority)
        priority_map = {"HIGH": 3, "NORMAL": 2, "LOW": 1}
        priority_val = priority_map.get(priority.upper(), 0)

        task_doc = {
            "prompt_encrypted": encrypt(prompt),
            "priority": priority.upper(),
            "priority_val": priority_val,
            "task_type": task_type,
            "status": "QUEUED",
            "created_at": datetime.now(timezone.utc),
            "metadata": metadata or {}
        }
        
        result = await db[AIQueueManager.COLLECTION].insert_one(task_doc)
        return str(result.inserted_id)

    @staticmethod
    async def get_next_batch(limit: int = 5) -> List[Dict[str, Any]]:
        """
        Retrieves the next batch of queued tasks based on priority and age.
        """
        cursor = db[AIQueueManager.COLLECTION].find({"status": "QUEUED"}).sort([
            ("priority_val", -1), 
            ("created_at", 1)
        ]).limit(limit)
        
        tasks = await cursor.to_list(length=limit)
        
        # De-serialize and decrypt
        for task in tasks:
            task["_id"] = str(task["_id"])
            if "prompt_encrypted" in task:
                task["prompt"] = decrypt(task["prompt_encrypted"])
                
        return tasks

    @staticmethod
    async def mark_processing(task_id: str):
        await db[AIQueueManager.COLLECTION].update_one(
            {"_id": task_id}, 
            {"$set": {"status": "PROCESSING", "started_at": datetime.now(timezone.utc)}}
        )

    @staticmethod
    async def mark_complete(task_id: str):
        await db[AIQueueManager.COLLECTION].update_one(
            {"_id": task_id}, 
            {"$set": {"status": "COMPLETED", "completed_at": datetime.now(timezone.utc)}}
        )

    @staticmethod
    async def get_queue_stats() -> Dict[str, Any]:
        """Returns statistics about the current queue state."""
        pipeline = [
            {"$match": {"status": "QUEUED"}},
            {"$group": {"_id": "$task_type", "count": {"$sum": 1}}}
        ]
        counts = await db[AIQueueManager.COLLECTION].aggregate(pipeline).to_list(length=100)
        
        total = sum(c["count"] for c in counts)
        task_breakdown = {c["_id"]: c["count"] for c in counts}
        
        return {
            "total_queued": total,
            "breakdown": task_breakdown
        }

queue_manager = AIQueueManager()
