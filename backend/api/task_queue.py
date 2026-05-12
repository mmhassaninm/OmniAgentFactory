"""
OmniAgentFactory — Task Queue API Endpoints

Full REST API for queue management:
- GET /api/queue/snapshot  → Dashboard real-time view
- GET /api/queue/tasks     → Paginated task list with filters
- GET /api/queue/tasks/{id} → Single task detail
- POST /api/queue/tasks/{id}/cancel → Cancel a task
- POST /api/queue/tasks/{id}/retry  → Retry a failed task
- GET /api/queue/stats     → Aggregated stats
- GET /api/queue/history/chart → Time-series chart data
- WS /ws/queue/stream      → Real-time task events
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from core.task_queue_engine import get_queue_engine
from core.database import get_db
from models.task_queue import TaskCategory, TaskStatus

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/queue", tags=["Task Queue"])


@router.get("/snapshot")
async def get_queue_snapshot():
    """Full queue state for dashboard."""
    engine = get_queue_engine()
    try:
        snapshot = await engine.get_queue_snapshot()
        return snapshot.model_dump()
    except Exception as e:
        logger.error("Failed to get queue snapshot: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks")
async def get_tasks(
    status: Optional[str] = Query(None, description="Filter by status"),
    category: Optional[str] = Query(None, description="Filter by category"),
    priority: Optional[int] = Query(None, ge=1, le=5, description="Filter by priority"),
    since: Optional[str] = Query(None, description="ISO datetime filter"),
    limit: int = Query(50, ge=1, le=500),
    page: int = Query(1, ge=1),
):
    """Paginated task list with filters."""
    engine = get_queue_engine()
    try:
        # Parse filters
        cat_enum = None
        if category:
            try:
                cat_enum = TaskCategory(category)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid category: {category}")

        status_enum = None
        if status:
            try:
                status_enum = TaskStatus(status)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

        since_dt = None
        if since:
            try:
                since_dt = datetime.fromisoformat(since)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid datetime: {since}")

        # If no specific status filter, show all active + history
        if status_enum:
            tasks = await engine.get_history(
                limit=limit,
                category=cat_enum,
                status=status_enum,
                since=since_dt,
                page=page,
            )
        else:
            # Show active tasks first, then history
            snapshot = await engine.get_queue_snapshot()
            active_tasks = snapshot.tasks

            history_tasks = await engine.get_history(
                limit=limit - len(active_tasks),
                category=cat_enum,
                since=since_dt,
                page=page,
            )

            # Filter by priority client-side if needed
            if priority:
                active_tasks = [t for t in active_tasks if t.priority.value == priority]
                history_tasks = [t for t in history_tasks if t.priority.value == priority]

            tasks = active_tasks + history_tasks

        return {
            "tasks": [t.model_dump() for t in tasks[:limit]],
            "total": len(tasks[:limit]),
            "page": page,
            "limit": limit,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get tasks: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    """Single task detail."""
    engine = get_queue_engine()
    task = await engine.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return task.model_dump()


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str, reason: str = "Cancelled by user"):
    """Cancel a pending or running task."""
    engine = get_queue_engine()
    task = await engine.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    if task.status not in (TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.RETRYING):
        raise HTTPException(status_code=400, detail=f"Task {task_id} is not cancellable (status: {task.status.value})")
    await engine.cancel(task_id, reason)
    return {"status": "cancelled", "task_id": task_id, "reason": reason}


@router.post("/tasks/{task_id}/retry")
async def retry_task(task_id: str):
    """Retry a failed task manually."""
    engine = get_queue_engine()
    task = await engine.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    if task.status not in (TaskStatus.FAILED, TaskStatus.CANCELLED):
        raise HTTPException(status_code=400, detail=f"Task {task_id} is not retryable (status: {task.status.value})")
    new_task_id = await engine.retry(task_id)
    if new_task_id is None:
        raise HTTPException(status_code=500, detail="Failed to retry task")
    return {"status": "retried", "original_task_id": task_id, "new_task_id": new_task_id}


@router.get("/stats")
async def get_queue_stats():
    """Aggregated statistics for the queue."""
    engine = get_queue_engine()
    try:
        stats = await engine.get_queue_stats()
        return stats.model_dump()
    except Exception as e:
        logger.error("Failed to get queue stats: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/chart")
async def get_history_chart(days: int = Query(7, ge=1, le=90)):
    """Time-series data for charts."""
    engine = get_queue_engine()
    try:
        data = await engine.get_history_chart(days=days)
        return {"days": days, "data": data}
    except Exception as e:
        logger.error("Failed to get history chart: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── WebSocket Event Stream ─────────────────────────────────────────────────

@router.websocket("/ws/queue/stream")
async def websocket_queue_stream(websocket: WebSocket):
    """
    Real-time task events stream.
    Uses the existing factory WebSocket system.
    """
    from api.websocket import manager as ws_manager

    await ws_manager.connect_factory(websocket)
    logger.info("Queue stream WebSocket connected")

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": datetime.utcnow().isoformat(),
                })
    except WebSocketDisconnect:
        ws_manager.disconnect_factory(websocket)
        logger.info("Queue stream WebSocket disconnected")
    except Exception as e:
        logger.debug("Queue stream WebSocket error: %s", e)
        ws_manager.disconnect_factory(websocket)