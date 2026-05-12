"""
Browser Task Queue — queues browser actions in MongoDB and processes them sequentially.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from core.database import get_db

logger = logging.getLogger(__name__)


class BrowserTaskQueue:
    """
    Queues browser tasks in MongoDB and processes them sequentially.
    Only one browser session runs at a time.
    """

    def __init__(self) -> None:
        self._processing: bool = False

    async def enqueue(self, url: str, action: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """
        Enqueue a browser task. Returns the task ID.
        Task is processed in the background.
        """
        db = get_db()
        task = {
            "url": url,
            "action": action,
            "params": params or {},
            "status": "queued",
            "result": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "done_at": None,
        }
        result = await db.browser_tasks.insert_one(task)
        task_id = str(result.inserted_id)
        logger.info("[BrowserTaskQueue] Task %s enqueued: %s %s", task_id, action, url)

        # Start processing if not already running
        if not self._processing:
            asyncio.create_task(self._process_queue())

        return {"task_id": task_id, "status": "queued"}

    async def get_result(self, task_id: str) -> dict[str, Any]:
        """Get the result of a browser task."""
        from bson.objectid import ObjectId
        db = get_db()
        task = await db.browser_tasks.find_one({"_id": ObjectId(task_id)})
        if not task:
            return {"status": "not_found"}
        return {
            "task_id": task_id,
            "url": task.get("url"),
            "action": task.get("action"),
            "status": task.get("status"),
            "result": task.get("result"),
            "created_at": task.get("created_at"),
            "done_at": task.get("done_at"),
        }

    async def _process_queue(self) -> None:
        """Process tasks sequentially from the queue."""
        if self._processing:
            return
        self._processing = True

        try:
            from core.browser_agent import get_browser_agent

            browser = get_browser_agent()
            db = get_db()

            while True:
                task = await db.browser_tasks.find_one_and_update(
                    {"status": "queued"},
                    {"$set": {"status": "processing"}},
                )
                if not task:
                    break

                task_id = str(task["_id"])
                action = task.get("action", "navigate")
                url = task.get("url", "")
                params = task.get("params", {})

                try:
                    result: dict[str, Any] = {"status": "error", "error": "Unknown action"}
                    if action == "navigate":
                        result = await browser.navigate(url)
                    elif action == "click":
                        result = await browser.click(params.get("selector", ""))
                    elif action == "fill_form":
                        result = await browser.fill_form(params.get("fields", {}))
                    elif action == "extract_text":
                        result = await browser.extract_text(params.get("selector", ""))
                    elif action == "screenshot":
                        result = await browser.screenshot()
                    elif action == "search_google":
                        result = await browser.search_google(params.get("query", ""))
                    elif action == "scroll_and_read":
                        result = await browser.scroll_and_read(url)

                    await db.browser_tasks.update_one(
                        {"_id": task["_id"]},
                        {
                            "$set": {
                                "status": "completed" if result.get("status") == "ok" else "failed",
                                "result": result,
                                "done_at": datetime.now(timezone.utc).isoformat(),
                            }
                        },
                    )
                except Exception as e:
                    logger.warning("[BrowserTaskQueue] Task %s failed: %s", task_id, e)
                    await db.browser_tasks.update_one(
                        {"_id": task["_id"]},
                        {
                            "$set": {
                                "status": "failed",
                                "result": {"error": str(e)[:300]},
                                "done_at": datetime.now(timezone.utc).isoformat(),
                            }
                        },
                    )
        except Exception as e:
            logger.warning("[BrowserTaskQueue] Queue processor error: %s", e)
        finally:
            self._processing = False


# Singleton
_queue_instance: Optional[BrowserTaskQueue] = None


def get_browser_task_queue() -> BrowserTaskQueue:
    """Get or create the singleton BrowserTaskQueue."""
    global _queue_instance
    if _queue_instance is None:
        _queue_instance = BrowserTaskQueue()
    return _queue_instance