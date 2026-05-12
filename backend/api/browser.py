"""
Browser API — endpoints for autonomous browser task queue.

Endpoints:
  POST /api/browser/task — enqueue a browser task
  GET  /api/browser/task/{task_id} — get task result
"""

import logging
from typing import Any

from fastapi import APIRouter

from core.browser_task_queue import get_browser_task_queue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/browser", tags=["Browser"])


@router.post("/task")
async def enqueue_browser_task(body: dict[str, Any]) -> dict[str, Any]:
    """
    Enqueue a browser task for execution.
    Body: { action: str, url?: str, params?: dict }
    """
    url = body.get("url", "")
    action = body.get("action", "navigate")
    params = body.get("params", {})

    try:
        queue = get_browser_task_queue()
        result = await queue.enqueue(url=url, action=action, params=params)
        return {"status": "ok", "task_id": result["task_id"], "queue_status": result["status"]}
    except Exception as e:
        logger.warning("[Browser API] Enqueue error: %s", e)
        return {"status": "error", "error": str(e)[:200]}


@router.get("/task/{task_id}")
async def get_browser_task_result(task_id: str) -> dict[str, Any]:
    """
    Get the result of a browser task by task_id.
    """
    try:
        queue = get_browser_task_queue()
        result = await queue.get_result(task_id)
        return {"status": "ok", "task": result}
    except Exception as e:
        logger.warning("[Browser API] Get result error: %s", e)
        return {"status": "error", "error": str(e)[:200]}