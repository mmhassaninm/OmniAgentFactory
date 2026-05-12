"""
Heartbeat Scheduler API — manage proactive recurring jobs.

Endpoints:
  POST   /api/heartbeat/jobs — create a new scheduled job
  GET    /api/heartbeat/jobs — list all jobs
  PATCH  /api/heartbeat/jobs/{job_id}/toggle — enable/disable a job
  POST   /api/heartbeat/jobs/{job_id}/run — trigger a job immediately
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/heartbeat", tags=["Heartbeat"])


class CreateJobRequest(BaseModel):
    name: str
    cron_expr: str
    task_prompt: str
    channel_targets: list[str] = ["telegram"]
    enabled: bool = True


@router.post("/jobs")
async def create_heartbeat_job(body: CreateJobRequest) -> dict[str, Any]:
    """
    Create a new recurring heartbeat job.
    Body: { name, cron_expr, task_prompt, channel_targets, enabled }
    """
    try:
        db = get_db()
        job = {
            "name": body.name,
            "cron_expr": body.cron_expr,
            "task_prompt": body.task_prompt,
            "channel_targets": body.channel_targets,
            "enabled": body.enabled,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_run": None,
        }
        result = await db.heartbeat_jobs.insert_one(job)
        job["_id"] = str(result.inserted_id)
        logger.info("[Heartbeat] Created job: %s (%s)", body.name, body.cron_expr)
        return {"status": "ok", "job": job}
    except Exception as e:
        logger.warning("[Heartbeat] Create job failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)[:200])


@router.get("/jobs")
async def list_heartbeat_jobs() -> dict[str, Any]:
    """
    List all registered heartbeat jobs.
    """
    try:
        db = get_db()
        jobs = await db.heartbeat_jobs.find().to_list(100)
        for j in jobs:
            j["_id"] = str(j["_id"])
        return {"status": "ok", "jobs": jobs}
    except Exception as e:
        logger.warning("[Heartbeat] List jobs failed: %s", e)
        return {"status": "ok", "jobs": []}


@router.patch("/jobs/{job_id}/toggle")
async def toggle_heartbeat_job(job_id: str) -> dict[str, Any]:
    """
    Enable or disable a heartbeat job.
    """
    try:
        from bson.objectid import ObjectId
        db = get_db()
        job = await db.heartbeat_jobs.find_one({"_id": ObjectId(job_id)})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        new_enabled = not job.get("enabled", True)
        await db.heartbeat_jobs.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": {"enabled": new_enabled}},
        )
        return {"status": "ok", "job_id": job_id, "enabled": new_enabled}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("[Heartbeat] Toggle job failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)[:200])


@router.post("/jobs/{job_id}/run")
async def trigger_heartbeat_job(job_id: str) -> dict[str, Any]:
    """
    Trigger a heartbeat job immediately.
    """
    try:
        from bson.objectid import ObjectId
        db = get_db()
        job = await db.heartbeat_jobs.find_one({"_id": ObjectId(job_id)})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        task_prompt = job.get("task_prompt", "")
        channel_targets = job.get("channel_targets", ["telegram"])

        # Trigger the job asynchronously (fire and forget)
        asyncio.create_task(_execute_job(job_id, task_prompt, channel_targets))

        await db.heartbeat_jobs.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": {"last_run": datetime.now(timezone.utc).isoformat()}},
        )
        return {"status": "ok", "job_id": job_id, "message": f"Triggered: {job.get('name', 'unknown')}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("[Heartbeat] Trigger job failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)[:200])


async def _execute_job(job_id: str, task_prompt: str, channel_targets: list[str]) -> None:
    """
    Execute a heartbeat job: send the prompt to the agent loop and broadcast result.
    """
    try:
        from services.channels.channel_router import get_channel_router
        from agent.loop import run_agent_loop
        from core.model_router import get_model_router

        router = get_model_router()
        provider = router.get_fastest_provider()
        model = router.get_fastest_model()

        response_text = ""
        async for event in run_agent_loop(
            task=task_prompt,
            tools=[],
            provider=provider,
            model=model or "openai/gpt-4o-mini",
            max_iterations=4,
        ):
            if "event: agent_finish" in event:
                import json
                data_str = event.replace("event: agent_finish\ndata: ", "").strip()
                try:
                    data = json.loads(data_str)
                    response_text = data.get("answer", "")
                except json.JSONDecodeError:
                    response_text = data_str

        if response_text:
            channel_router = get_channel_router()
            await channel_router.broadcast(response_text, channels=channel_targets)
            logger.info("[Heartbeat] Job %s executed, broadcast to %s", job_id, channel_targets)
    except Exception as e:
        logger.warning("[Heartbeat] Job execution error for %s: %s", job_id, e)