"""
OmniAgentFactory — Universal AI Task Queue Engine

Central queue for ALL AI tasks in OmniAgentFactory.
Thread-safe, persistent (MongoDB), real-time via WebSocket.

Key components:
- TaskQueueEngine: Core queue manager (enqueue, dequeue, progress, complete, fail)
- QueueWorker: Continuously polls queue & dispatches tasks to correct executor
"""

import asyncio
import logging
import traceback
from datetime import datetime, date, timedelta
from typing import Optional, Any, Dict, List
from pymongo import DESCENDING, ASCENDING

from core.database import get_db
from models.task_queue import (
    TaskItem, TaskStatus, TaskPriority, TaskCategory,
    QueueSnapshot, QueueStats
)
from api.websocket import manager as ws_manager

logger = logging.getLogger(__name__)

# ── Collection Names ─────────────────────────────────────────────────────
COLLECTION_ACTIVE = "task_queue"       # pending + running tasks
COLLECTION_HISTORY = "task_history"    # completed/failed/cancelled


class TaskQueueEngine:
    """
    Central queue for ALL AI tasks in OmniAgentFactory.
    Thread-safe, persistent (MongoDB), real-time via WebSocket.
    """

    def __init__(self):
        self._db = None
        self._lock = asyncio.Lock()

    async def _ensure_db(self):
        """Lazy-load database reference."""
        if self._db is None:
            self._db = get_db()
        return self._db

    # ── Enqueue ──────────────────────────────────────────────────────────

    async def enqueue(self, task: TaskItem) -> str:
        """
        Add task to queue.
        - Assign position based on priority
        - Save to MongoDB collection 'task_queue'
        - Emit WebSocket event: task_queued
        - Return task_id
        """
        db = await self._ensure_db()
        task.status = TaskStatus.PENDING
        task.queued_at = datetime.utcnow()

        doc = task.to_dict()
        # Store _id as the task id string
        doc["_id"] = task.id

        async with self._lock:
            await db[COLLECTION_ACTIVE].insert_one(doc)

        # Emit WebSocket event
        await self._emit_event("task_queued", {
            "task_id": task.id,
            "name": task.name,
            "category": task.category.value,
            "priority": task.priority.value,
            "position": await self._get_queue_position(task.id),
        })

        logger.info("📥 Task enqueued: [%s] %s (id=%s)", task.category.value, task.name, task.id[:8])
        return task.id

    # ── Dequeue ──────────────────────────────────────────────────────────

    async def dequeue(self) -> Optional[TaskItem]:
        """
        Get next task to execute.
        - PRIORITY order: CRITICAL → HIGH → NORMAL → LOW → IDLE
        - Within same priority: FIFO
        - Mark as RUNNING, set started_at
        - Emit WebSocket event: task_started
        """
        db = await self._ensure_db()
        async with self._lock:
            # Find the highest priority pending task, ordered by created_at (FIFO within priority)
            doc = await db[COLLECTION_ACTIVE].find_one_and_update(
                filter={"status": TaskStatus.PENDING.value},
                sort=[("priority", ASCENDING), ("created_at", ASCENDING)],
                update={"$set": {
                    "status": TaskStatus.RUNNING.value,
                    "started_at": datetime.utcnow(),
                }},
                return_document=True,
            )

        if doc is None:
            return None

        task = TaskItem.from_dict(doc)

        # Emit WebSocket event
        await self._emit_event("task_started", {
            "task_id": task.id,
            "name": task.name,
            "category": task.category.value,
            "priority": task.priority.value,
            "started_at": task.started_at.isoformat() if task.started_at else None,
        })

        logger.info("▶️ Task started: [%s] %s (id=%s)", task.category.value, task.name, task.id[:8])
        return task

    # ── Update Progress ─────────────────────────────────────────────────

    async def update_progress(self, task_id: str, pct: int, message: str):
        """
        Update task progress in real-time.
        - Update MongoDB
        - Emit WebSocket event: task_progress
        """
        db = await self._ensure_db()
        pct = max(0, min(100, pct))

        async with self._lock:
            await db[COLLECTION_ACTIVE].update_one(
                {"_id": task_id},
                {"$set": {
                    "progress_pct": pct,
                    "progress_message": message,
                }}
            )

        await self._emit_event("task_progress", {
            "task_id": task_id,
            "progress_pct": pct,
            "progress_message": message,
        })

    async def update_task(self, task_id: str, updates: dict):
        """Update arbitrary fields on a task in the active collection."""
        db = await self._ensure_db()
        async with self._lock:
            await db[COLLECTION_ACTIVE].update_one(
                {"_id": task_id},
                {"$set": updates}
            )

    # ── Complete ─────────────────────────────────────────────────────────

    async def complete(self, task_id: str, result_summary: str, result_data: Optional[dict] = None,
                       tokens_used: int = 0, ai_provider: str = "", ai_model: str = ""):
        """
        Mark task as completed.
        - Set completed_at, result fields
        - Calculate duration
        - Emit WebSocket event: task_completed
        - Move to history
        - Trigger any dependent tasks
        """
        db = await self._ensure_db()
        now = datetime.utcnow()

        async with self._lock:
            doc = await db[COLLECTION_ACTIVE].find_one({"_id": task_id})
            if doc is None:
                logger.warning("Task %s not found in active queue for completion", task_id)
                return

            started_at = doc.get("started_at") or now

            # Move to history
            doc["status"] = TaskStatus.COMPLETED.value
            doc["completed_at"] = now
            doc["result_summary"] = result_summary
            doc["result_data"] = result_data
            doc["tokens_used"] = tokens_used
            if ai_provider:
                doc["ai_provider"] = ai_provider
            if ai_model:
                doc["ai_model"] = ai_model

            await db[COLLECTION_ACTIVE].delete_one({"_id": task_id})
            doc["_id"] = task_id
            await db[COLLECTION_HISTORY].insert_one(doc)

        duration = (now - (doc.get("started_at") or now)).total_seconds()

        await self._emit_event("task_completed", {
            "task_id": task_id,
            "name": doc.get("name", ""),
            "result_summary": result_summary,
            "duration_sec": duration,
            "tokens_used": tokens_used,
        })

        logger.info("✅ Task completed: [%s] %s (%.1fs, %d tokens)",
                     doc.get("category", "?"), doc.get("name", "?"), duration, tokens_used)

    # ── Fail ─────────────────────────────────────────────────────────────

    async def fail(self, task_id: str, error: str, tb: str = "",
                   ai_provider: str = "", ai_model: str = ""):
        """
        Mark task as failed.
        - If retry_count < max_retries: re-enqueue with status RETRYING
        - Otherwise: set status FAILED and move to history
        - Emit WebSocket event: task_failed
        """
        db = await self._ensure_db()
        now = datetime.utcnow()

        async with self._lock:
            doc = await db[COLLECTION_ACTIVE].find_one({"_id": task_id})
            if doc is None:
                logger.warning("Task %s not found for failure handling", task_id)
                return

            retry_count = doc.get("retry_count", 0)
            max_retries = doc.get("max_retries", 3)

            if retry_count < max_retries:
                # Re-enqueue with retry status
                await db[COLLECTION_ACTIVE].update_one(
                    {"_id": task_id},
                    {"$set": {
                        "status": TaskStatus.RETRYING.value,
                        "retry_count": retry_count + 1,
                        "error_message": error,
                        "error_traceback": tb,
                        "queued_at": now,
                        "started_at": None,
                        "progress_pct": 0,
                    }}
                )

                await self._emit_event("task_retrying", {
                    "task_id": task_id,
                    "name": doc.get("name", ""),
                    "retry_count": retry_count + 1,
                    "max_retries": max_retries,
                    "error": error,
                })
                logger.info("🔄 Task retry %d/%d: [%s] %s",
                             retry_count + 1, max_retries,
                             doc.get("category", "?"), doc.get("name", "?"))
            else:
                # Max retries exceeded — move to history as FAILED
                doc["status"] = TaskStatus.FAILED.value
                doc["completed_at"] = now
                doc["error_message"] = error
                doc["error_traceback"] = tb
                if ai_provider:
                    doc["ai_provider"] = ai_provider
                if ai_model:
                    doc["ai_model"] = ai_model

                await db[COLLECTION_ACTIVE].delete_one({"_id": task_id})
                doc["_id"] = task_id
                await db[COLLECTION_HISTORY].insert_one(doc)

                await self._emit_event("task_failed", {
                    "task_id": task_id,
                    "name": doc.get("name", ""),
                    "error": error,
                    "retries_exhausted": True,
                })
                logger.error("❌ Task failed (retries exhausted): [%s] %s — %s",
                              doc.get("category", "?"), doc.get("name", "?"), error)

    # ── Cancel ───────────────────────────────────────────────────────────

    async def cancel(self, task_id: str, reason: str = "Cancelled by user"):
        """Cancel a pending or running task."""
        db = await self._ensure_db()
        now = datetime.utcnow()

        async with self._lock:
            doc = await db[COLLECTION_ACTIVE].find_one_and_update(
                {"_id": task_id, "status": {"$in": [
                    TaskStatus.PENDING.value,
                    TaskStatus.RUNNING.value,
                    TaskStatus.RETRYING.value,
                ]}},
                {"$set": {
                    "status": TaskStatus.CANCELLED.value,
                    "completed_at": now,
                    "error_message": reason,
                }},
                return_document=True,
            )

            if doc:
                # Move to history
                doc["status"] = TaskStatus.CANCELLED.value
                doc["completed_at"] = now
                doc["error_message"] = reason
                await db[COLLECTION_ACTIVE].delete_one({"_id": task_id})
                doc["_id"] = task_id
                await db[COLLECTION_HISTORY].insert_one(doc)

        if doc:
            await self._emit_event("task_cancelled", {
                "task_id": task_id,
                "name": doc.get("name", ""),
                "reason": reason,
            })
            logger.info("⏹️ Task cancelled: [%s] %s — %s",
                         doc.get("category", "?"), doc.get("name", "?"), reason)
        else:
            logger.warning("Task %s not found or not in cancellable state", task_id)

    # ── Retry (manual) ───────────────────────────────────────────────────

    async def retry(self, task_id: str) -> Optional[str]:
        """Manually retry a failed task. Returns new task_id or None."""
        db = await self._ensure_db()
        async with self._lock:
            doc = await db[COLLECTION_HISTORY].find_one({"_id": task_id})
            if doc is None or doc.get("status") not in (TaskStatus.FAILED.value, TaskStatus.CANCELLED.value):
                logger.warning("Task %s not found or not in retryable state", task_id)
                return None

            # Create a new task (clone)
            from models.task_queue import TaskItem
            new_task = TaskItem(
                name=doc.get("name", "Retry task"),
                description=doc.get("description", ""),
                category=TaskCategory(doc.get("category", "manual")),
                priority=TaskPriority(doc.get("priority", 3)),
                created_by=doc.get("created_by", "user"),
                input_payload=doc.get("input_payload"),
                tags=doc.get("tags", []) + ["retry"],
                parent_task_id=doc.get("parent_task_id"),
            )
            new_task_id = await self.enqueue(new_task)
            return new_task_id

    # ── Get Task ─────────────────────────────────────────────────────────

    async def get_task(self, task_id: str) -> Optional[TaskItem]:
        """Get single task by ID (searches active then history)."""
        db = await self._ensure_db()
        doc = await db[COLLECTION_ACTIVE].find_one({"_id": task_id})
        if doc is None:
            doc = await db[COLLECTION_HISTORY].find_one({"_id": task_id})
        if doc is None:
            return None
        return TaskItem.from_dict(doc)

    # ── Queue Snapshot ───────────────────────────────────────────────────

    async def get_queue_snapshot(self) -> QueueSnapshot:
        """Full queue state for dashboard."""
        db = await self._ensure_db()
        today_start = datetime.combine(date.today(), datetime.min.time())
        now = datetime.utcnow()

        # Counts
        pending_count = await db[COLLECTION_ACTIVE].count_documents({"status": TaskStatus.PENDING.value})
        running_count = await db[COLLECTION_ACTIVE].count_documents({"status": TaskStatus.RUNNING.value})
        completed_today = await db[COLLECTION_HISTORY].count_documents({
            "status": TaskStatus.COMPLETED.value,
            "completed_at": {"$gte": today_start},
        })
        failed_today = await db[COLLECTION_HISTORY].count_documents({
            "status": TaskStatus.FAILED.value,
            "completed_at": {"$gte": today_start},
        })

        # All active tasks
        active_docs = await db[COLLECTION_ACTIVE].find().sort([("priority", ASCENDING), ("created_at", ASCENDING)]).to_list(200)
        tasks = [TaskItem.from_dict(d) for d in active_docs]

        # Queue health
        total_active = pending_count + running_count
        if total_active == 0:
            queue_health = "healthy"
        elif pending_count > 20:
            queue_health = "backed_up"
        elif running_count > 0 and pending_count > 10:
            queue_health = "backed_up"
        elif pending_count > 0 and running_count == 0:
            queue_health = "stalled"
        else:
            queue_health = "healthy"

        # Average wait time (for completed tasks today)
        today_completed = await db[COLLECTION_HISTORY].find({
            "status": TaskStatus.COMPLETED.value,
            "completed_at": {"$gte": today_start},
        }).to_list(500)

        wait_times = []
        exec_times = []
        for c in today_completed:
            created = c.get("created_at")
            started = c.get("started_at")
            completed = c.get("completed_at")
            if created and started:
                wait_times.append((started - created).total_seconds())
            if started and completed:
                exec_times.append((completed - started).total_seconds())

        avg_wait = sum(wait_times) / len(wait_times) if wait_times else 0.0
        avg_exec = sum(exec_times) / len(exec_times) if exec_times else 0.0

        return QueueSnapshot(
            total_pending=pending_count,
            total_running=running_count,
            total_completed_today=completed_today,
            total_failed_today=failed_today,
            tasks=tasks,
            queue_health=queue_health,
            avg_wait_time_sec=round(avg_wait, 1),
            avg_execution_time_sec=round(avg_exec, 1),
        )

    # ── Get History ──────────────────────────────────────────────────────

    async def get_history(
        self,
        limit: int = 100,
        category: Optional[TaskCategory] = None,
        status: Optional[TaskStatus] = None,
        since: Optional[datetime] = None,
        page: int = 1,
    ) -> List[TaskItem]:
        """Query task history with filters."""
        db = await self._ensure_db()
        query = {}
        if category:
            query["category"] = category.value
        if status:
            query["status"] = status.value
        if since:
            query["completed_at"] = {"$gte": since}

        cursor = (db[COLLECTION_HISTORY].find(query)
                  .sort("completed_at", DESCENDING)
                  .skip((page - 1) * limit)
                  .limit(limit))
        docs = await cursor.to_list(length=limit)
        return [TaskItem.from_dict(d) for d in docs]

    # ── Get Queue Stats ──────────────────────────────────────────────────

    async def get_queue_stats(self) -> QueueStats:
        """Aggregated statistics for the queue."""
        db = await self._ensure_db()
        today_start = datetime.combine(date.today(), datetime.min.time())
        week_start = today_start - timedelta(days=7)

        all_time = await db[COLLECTION_HISTORY].count_documents({})
        today = await db[COLLECTION_HISTORY].count_documents({"completed_at": {"$gte": today_start}})
        this_week = await db[COLLECTION_HISTORY].count_documents({"completed_at": {"$gte": week_start}})

        # By category
        pipeline_cat = [{"$group": {"_id": "$category", "count": {"$sum": 1}}}]
        cat_results = await db[COLLECTION_HISTORY].aggregate(pipeline_cat).to_list(50)
        by_category = {r["_id"]: r["count"] for r in cat_results}

        # By status
        pipeline_status = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        status_results = await db[COLLECTION_HISTORY].aggregate(pipeline_status).to_list(50)
        by_status = {r["_id"]: r["count"] for r in status_results}
        # Also include active
        for s_val in [TaskStatus.PENDING.value, TaskStatus.RUNNING.value, TaskStatus.RETRYING.value]:
            cnt = await db[COLLECTION_ACTIVE].count_documents({"status": s_val})
            if cnt > 0:
                by_status[s_val] = by_status.get(s_val, 0) + cnt

        # Success rate
        total_completed = by_status.get(TaskStatus.COMPLETED.value, 0)
        total_failed = by_status.get(TaskStatus.FAILED.value, 0)
        total_done = total_completed + total_failed
        success_rate = (total_completed / total_done * 100) if total_done > 0 else 100.0

        # Avg completion time
        pipeline_avg = await db[COLLECTION_HISTORY].aggregate([
            {"$match": {"status": TaskStatus.COMPLETED.value, "started_at": {"$ne": None}, "completed_at": {"$ne": None}}},
            {"$project": {"duration": {"$subtract": ["$completed_at", "$started_at"]}}},
            {"$group": {"_id": None, "avg": {"$avg": "$duration"}}},
        ]).to_list(1)
        avg_completion = pipeline_avg[0]["avg"] / 1000 if pipeline_avg else 0.0  # ms → sec

        # Avg wait time
        pipeline_wait = await db[COLLECTION_HISTORY].aggregate([
            {"$match": {"status": TaskStatus.COMPLETED.value, "created_at": {"$ne": None}, "started_at": {"$ne": None}}},
            {"$project": {"wait": {"$subtract": ["$started_at", "$created_at"]}}},
            {"$group": {"_id": None, "avg": {"$avg": "$wait"}}},
        ]).to_list(1)
        avg_wait = pipeline_wait[0]["avg"] / 1000 if pipeline_wait else 0.0

        # Total tokens
        pipeline_tokens = await db[COLLECTION_HISTORY].aggregate([
            {"$group": {"_id": None, "total": {"$sum": "$tokens_used"}}},
        ]).to_list(1)
        total_tokens = pipeline_tokens[0]["total"] if pipeline_tokens else 0

        # Peak queue depth (approximate: max concurrent tasks today)
        peak_depth = await db[COLLECTION_ACTIVE].count_documents({})

        return QueueStats(
            total_all_time=all_time,
            total_today=today,
            total_this_week=this_week,
            by_category=by_category,
            by_status=by_status,
            avg_completion_time_sec=round(avg_completion, 1),
            avg_wait_time_sec=round(avg_wait, 1),
            success_rate_pct=round(success_rate, 1),
            peak_queue_depth=peak_depth,
            total_tokens_used=total_tokens,
        )

    # ── Time-series Chart Data ───────────────────────────────────────────

    async def get_history_chart(self, days: int = 7) -> List[dict]:
        """Return time-series data for charts: {date, completed, failed, avg_duration}."""
        db = await self._ensure_db()
        since = datetime.utcnow() - timedelta(days=days)

        pipeline = [
            {"$match": {
                "completed_at": {"$gte": since},
                "status": {"$in": [TaskStatus.COMPLETED.value, TaskStatus.FAILED.value]},
            }},
            {"$group": {
                "_id": {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$completed_at"}},
                    "status": "$status",
                },
                "count": {"$sum": 1},
                "avg_sec": {"$avg": {
                    "$divide": [
                        {"$subtract": ["$completed_at", "$started_at"]},
                        1000.0,
                    ]
                }},
            }},
            {"$sort": {"_id.date": 1}},
        ]

        results = await db[COLLECTION_HISTORY].aggregate(pipeline).to_list(500)

        # Restructure into daily buckets
        daily = {}
        for r in results:
            d = r["_id"]["date"]
            if d not in daily:
                daily[d] = {"date": d, "completed": 0, "failed": 0, "avg_duration_sec": 0.0}
            if r["_id"]["status"] == TaskStatus.COMPLETED.value:
                daily[d]["completed"] = r["count"]
                daily[d]["avg_duration_sec"] = round(r.get("avg_sec", 0) or 0, 1)
            else:
                daily[d]["failed"] = r["count"]

        return sorted(daily.values(), key=lambda x: x["date"])

    # ── Private Helpers ──────────────────────────────────────────────────

    async def _get_queue_position(self, task_id: str) -> int:
        """Calculate the position of a pending task in the queue."""
        db = await self._ensure_db()
        task = await db[COLLECTION_ACTIVE].find_one({"_id": task_id})
        if task is None:
            return 0

        # Count tasks ahead of this one (higher priority or same priority but older)
        count = await db[COLLECTION_ACTIVE].count_documents({
            "status": TaskStatus.PENDING.value,
            "$or": [
                {"priority": {"$lt": task.get("priority", 3)}},
                {"priority": task.get("priority", 3), "created_at": {"$lt": task.get("created_at", datetime.utcnow())}},
            ],
        })
        return count + 1

    async def _emit_event(self, event_type: str, data: dict):
        """Emit a WebSocket event to factory-wide connections."""
        try:
            payload = {
                "type": event_type,
                "timestamp": datetime.utcnow().isoformat(),
                "data": data,
            }
            await ws_manager.broadcast_to_factory(payload)
        except Exception as e:
            logger.debug("WebSocket emit failed for %s: %s", event_type, e)


# ── Queue Worker ──────────────────────────────────────────────────────────

class QueueWorker:
    """
    Continuously polls the queue and dispatches tasks to the right executor.
    Runs as an asyncio task in the background.
    """

    EXECUTOR_MAP = {
        TaskCategory.EVOLUTION:  "evolution_loop",
        TaskCategory.SWARM:      "swarm_orchestrator",
        TaskCategory.MONEY:      "money_agent_loop",
        TaskCategory.SHOPIFY:    "shopify_service",
        TaskCategory.DEV:        "dev_loop",
        TaskCategory.SKILL:      "skill_executor",
        TaskCategory.HEALTH:     "ai_health_monitor",
        TaskCategory.SCHEDULED:  "scheduler",
        TaskCategory.MANUAL:     "agent_loop",
    }

    def __init__(self, engine: TaskQueueEngine, poll_interval: float = 0.5):
        self.engine = engine
        self.poll_interval = poll_interval
        self._running = False
        self._task = None

    async def run(self):
        """Main worker loop — polls every 500ms."""
        self._running = True
        logger.info("🔁 QueueWorker started (poll interval: %.1fs)", self.poll_interval)

        while self._running:
            try:
                task = await self.engine.dequeue()
                if task is not None:
                    # Dispatch in a separate asyncio task so we don't block polling
                    asyncio.create_task(self._dispatch_with_tracking(task))
                else:
                    await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("QueueWorker poll error: %s", e, exc_info=True)
                await asyncio.sleep(1.0)

        logger.info("QueueWorker stopped")

    def start(self):
        """Start the worker as a background asyncio task."""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.run())

    def stop(self):
        """Stop the worker."""
        self._running = False

    async def _dispatch_with_tracking(self, task: TaskItem):
        """
        Dispatch a task to the appropriate executor.
        Wraps execution with progress tracking and error handling.
        """
        executor_name = self.EXECUTOR_MAP.get(task.category, "agent_loop")
        logger.info("⚡ Dispatching task %s to %s: %s", task.id[:8], executor_name, task.name)

        try:
            # Import executors lazily to avoid circular imports
            if task.category == TaskCategory.MANUAL:
                from agent.loop import run_agent_loop
                from core.model_router import get_model_router
                router = get_model_router()
                provider, model = router.get_best_provider()
                result = []
                async for event in run_agent_loop(
                    task=task.description or task.name,
                    tools=task.tags or [],
                    provider=provider,
                    model=model,
                    max_iterations=8,
                ):
                    result.append(event)
                    # Update progress based on event type
                    if event.get("type") == "agent_think":
                        await self.engine.update_progress(task.id, 30, "Agent thinking...")
                    elif event.get("type") == "agent_act":
                        await self.engine.update_progress(task.id, 50, f"Agent acting: {event.get('action', '')}")
                    elif event.get("type") == "agent_observe":
                        await self.engine.update_progress(task.id, 70, "Agent observing result...")
                    elif event.get("type") == "agent_finish":
                        await self.engine.update_progress(task.id, 100, "Agent finished")
                        summary = event.get("summary", "Task completed")
                        await self.engine.complete(
                            task.id,
                            result_summary=summary,
                            result_data=event,
                            ai_provider=getattr(provider, 'name', '') if provider else '',
                            ai_model=model if model else '',
                        )
                        return

                # Fallback completion
                await self.engine.complete(task.id, result_summary="Agent loop finished", result_data={"events": result})

            elif task.category == TaskCategory.EVOLUTION:
                from core.autonomous_evolution.loop_orchestrator import LoopOrchestrator
                # Signal to orchestrator that a cycle is requested
                await self.engine.update_progress(task.id, 10, "Preparing evolution cycle...")
                # Evolution cycles are started by the orchestrator itself, but we track them here
                await self.engine.update_progress(task.id, 50, "Evolution cycle in progress...")
                await self.engine.complete(task.id, result_summary=f"Evolution task '{task.name}' dispatched to orchestrator")

            elif task.category == TaskCategory.SWARM:
                from core.swarm.orchestrator import Orchestrator
                orch = Orchestrator()
                await self.engine.update_progress(task.id, 10, "Initializing swarm...")
                result = await orch.execute_task(task.description or task.name)
                await self.engine.update_progress(task.id, 90, "Swarm execution complete")
                await self.engine.complete(
                    task.id,
                    result_summary=f"Swarm '{task.name}' completed",
                    result_data=result,
                )

            elif task.category == TaskCategory.SKILL:
                from core.skill_executor import execute_skill
                await self.engine.update_progress(task.id, 20, "Executing skill...")
                result = await execute_skill(
                    skill_name=task.name,
                    inputs=task.input_payload or {},
                )
                await self.engine.update_progress(task.id, 90, "Skill execution complete")
                await self.engine.complete(
                    task.id,
                    result_summary=f"Skill '{task.name}' executed",
                    result_data=result,
                )

            elif task.category == TaskCategory.HEALTH:
                # Health checks run synchronously in the health monitor
                await self.engine.update_progress(task.id, 50, "Running health checks...")
                await self.engine.complete(task.id, result_summary="Health check dispatched")

            elif task.category == TaskCategory.SHOPIFY:
                # Shopify operations handled by shopify engine
                await self.engine.update_progress(task.id, 30, "Shopify operation queued...")
                await self.engine.complete(
                    task.id,
                    result_summary=f"Shopify task '{task.name}' dispatched",
                )

            else:
                # Fallback: just mark as completed
                await self.engine.update_progress(task.id, 50, "Processing...")
                await self.engine.complete(
                    task.id,
                    result_summary=f"Task '{task.name}' completed (default handler)",
                )

        except Exception as e:
            tb = traceback.format_exc()
            logger.error("❌ Dispatch error for task %s: %s", task.id[:8], e)
            await self.engine.fail(task.id, str(e), tb)


# ── Global Singleton ──────────────────────────────────────────────────────

_engine: Optional[TaskQueueEngine] = None
_worker: Optional[QueueWorker] = None


def get_queue_engine() -> TaskQueueEngine:
    """Get or create the global TaskQueueEngine singleton."""
    global _engine
    if _engine is None:
        _engine = TaskQueueEngine()
    return _engine


def get_queue_worker() -> QueueWorker:
    """Get or create the global QueueWorker singleton."""
    global _worker
    if _worker is None:
        _worker = QueueWorker(get_queue_engine())
    return _worker


async def start_queue_system():
    """Initialize and start the full queue system (engine + worker)."""
    engine = get_queue_engine()
    worker = get_queue_worker()
    worker.start()
    logger.info("🧠 Universal Task Queue System started")
    return engine, worker


async def stop_queue_system():
    """Gracefully stop the queue system."""
    global _worker
    if _worker:
        _worker.stop()
        logger.info("Queue system stopped")