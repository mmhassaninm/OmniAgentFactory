"""
OmniBot — Infinite Development Loop API Routes (System 8 True Autonomous Loop)

End points for status tracking, triggers, and full telemetry:
- GET  /api/dev-loop/status
- POST /api/dev-loop/trigger
- GET  /api/dev-loop/pending
- POST /api/dev-loop/approve/{id}
- POST /api/dev-loop/reject/{id}
- GET  /api/dev-loop/history

NEW NUCLEAR UPGRADE ENDPOINTS:
- GET  /api/dev-loop/signals/{agent_id}
- GET  /api/dev-loop/skills
- GET  /api/dev-loop/skills/{skill_name}
- GET  /api/dev-loop/watcher/log
- GET  /api/dev-loop/souls
- GET  /api/dev-loop/autonomy-score
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bson import ObjectId

from core.database import get_db
from workers.infinite_dev_loop import get_dev_loop_status, run_dev_loop_cycle

logger = logging.getLogger(__name__)
router = APIRouter()


class ApproveRejectResponse(BaseModel):
    status: str
    message: str


@router.get("/status")
async def get_loop_status():
    """Returns the live in-memory state, current phase, and execution telemetry."""
    status = await get_dev_loop_status()
    return status


@router.post("/trigger")
async def trigger_loop_cycle():
    """Force run an autonomous 8-phase optimization cycle."""
    from core.database import get_db
    db = get_db()
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="MongoDB is offline. Cannot start optimization cycle. Check database connection."
        )

    status = await get_dev_loop_status()
    if status.get("status") == "running":
        raise HTTPException(
            status_code=400,
            detail="A development loop cycle is already in progress.",
        )

    import asyncio
    asyncio.create_task(run_dev_loop_cycle(force=True))

    return {
        "status": "triggered",
        "message": "8-phase optimization cycle initiated successfully in background.",
    }


@router.get("/bootstrap/status")
async def get_bootstrap_status():
    """Returns the current state of the synthetic self-play bootstrap process."""
    from core.bootstrap_engine import BootstrapEngine
    db = get_db()
    if not db:
        raise HTTPException(status_code=500, detail="DB offline")
        
    doc = await db.system.find_one({"key": "bootstrap_state"})
    if doc and doc.get("bootstrap_complete"):
        return {
            "state": "complete",
            "progress": {
                "tasks_completed": doc.get("synthetic_sessions_created", 40),
                "tasks_total": doc.get("synthetic_sessions_created", 40),
                "current_task": "Complete",
                "skills_synthesized_so_far": doc.get("skills_synthesized", 0),
                "estimated_minutes_remaining": 0
            },
            "result": {
                "avg_session_score": doc.get("avg_session_score", 0.0),
                "skills_created": doc.get("skills_synthesized", 0),
                "sessions_seeded": doc.get("synthetic_sessions_created", 40)
            }
        }
        
    return BootstrapEngine.state


@router.post("/bootstrap/reset")
async def reset_bootstrap():
    """Clears the bootstrap flag, allowing the self-play to run again on next startup."""
    db = get_db()
    if not db:
        raise HTTPException(status_code=500, detail="DB offline")
        
    await db.system.update_one({"key": "bootstrap_state"}, {"$set": {"bootstrap_complete": False}})
    from core.bootstrap_engine import BootstrapEngine
    BootstrapEngine.state["status"] = "not_started"
    return {"status": "ok", "message": "Bootstrap flag cleared. Restart backend to re-run."}


@router.get("/pending")
async def get_pending_improvements():
    """Returns all pending structural/prompt optimizations waiting for approval."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection offline.")

    try:
        cursor = db.pending_improvements.find({"status": "pending"}).sort("created_at", -1)
        pending = await cursor.to_list(100)

        for p in pending:
            p["_id"] = str(p["_id"])
            if "created_at" in p and p["created_at"]:
                p["created_at"] = p["created_at"].isoformat()
            if "expires_at" in p and p["expires_at"]:
                p["expires_at"] = p["expires_at"].isoformat()

        return pending
    except Exception as e:
        logger.error("[API_DEV_LOOP] Failed to get pending: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/approve/{improvement_id}", response_model=ApproveRejectResponse)
async def approve_improvement(improvement_id: str):
    """Approve a proposed agent improvement manually (Human-in-the-loop fallback)."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection offline.")

    try:
        res = await db.pending_improvements.update_one(
            {"_id": ObjectId(improvement_id), "status": "pending"},
            {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc)}},
        )

        if res.modified_count == 0:
            raise HTTPException(
                status_code=404,
                detail="Pending improvement not found or already processed.",
            )

        return {
            "status": "success",
            "message": "Improvement manually approved and queued for compilation.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[API_DEV_LOOP] Approval error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reject/{improvement_id}", response_model=ApproveRejectResponse)
async def reject_improvement(improvement_id: str):
    """Reject a proposed agent improvement manually."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection offline.")

    try:
        res = await db.pending_improvements.update_one(
            {"_id": ObjectId(improvement_id), "status": "pending"},
            {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc)}},
        )

        if res.modified_count == 0:
            raise HTTPException(
                status_code=404,
                detail="Pending improvement not found or already processed.",
            )

        return {
            "status": "success",
            "message": "Improvement successfully rejected manually.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[API_DEV_LOOP] Rejection error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_cycle_history(limit: int = 20):
    """Retrieve logs and outcomes of previously completed optimization loops."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=500, detail="Database offline.")

    try:
        cursor = db.dev_loop_history.find({}).sort("timestamp", -1).limit(limit)
        history = await cursor.to_list(limit)

        for h in history:
            h["_id"] = str(h["_id"])
            if "timestamp" in h and h["timestamp"]:
                h["timestamp"] = h["timestamp"].isoformat()

        return history
    except Exception as e:
        logger.error("[API_DEV_LOOP] Failed to load history: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── NUCLEAR UPGRADE CHANNELS ───────────────────────────────────────────────

@router.get("/signals/{agent_id}")
async def get_agent_signals(agent_id: str):
    """Returns the last 100 objective execution signals for the targeted agent."""
    db = get_db()
    try:
        cursor = db.agent_signals.find({"agent_id": agent_id}).sort("created_at", -1).limit(100)
        signals = await cursor.to_list(100)
        
        for s in signals:
            s["_id"] = str(s["_id"])
            if "created_at" in s and s["created_at"]:
                s["created_at"] = s["created_at"].isoformat()
        return signals
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch signals: {e}")


@router.get("/skills")
async def get_active_skills():
    """Returns all active, versioned skills with usage statistics and success parameters."""
    db = get_db()
    try:
        cursor = db.skills.find({}).sort("name", 1)
        skills = await cursor.to_list(100)
        
        for s in skills:
            s["_id"] = str(s["_id"])
            if "last_used" in s and s["last_used"]:
                s["last_used"] = s["last_used"].isoformat()
            if "created_at" in s and s["created_at"]:
                s["created_at"] = s["created_at"].isoformat()
            if "updated_at" in s and s["updated_at"]:
                s["updated_at"] = s["updated_at"].isoformat()
        return skills
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch skills: {e}")


@router.get("/skills/{skill_name}")
async def get_skill_detail(skill_name: str):
    """Returns the raw SKILL.md file contents and complete performance profile."""
    db = get_db()
    skill = await db.skills.find_one({"name": skill_name})
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found.")
        
    file_path = skill.get("file_path")
    content = ""
    if file_path and os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            logger.error("Failed to read skill file: %s", e)
            content = "Failed to load skill content."
            
    skill["_id"] = str(skill["_id"])
    skill["content"] = content
    if "last_used" in skill and skill["last_used"]:
        skill["last_used"] = skill["last_used"].isoformat()
    return skill


@router.get("/watcher/log")
async def get_watcher_decision_log():
    """Returns the last 50 safety decisions resolved by the autonomous Watcher Agent."""
    db = get_db()
    try:
        cursor = db.watcher_decisions.find({}).sort("created_at", -1).limit(50)
        logs = await cursor.to_list(50)
        
        for log in logs:
            log["_id"] = str(log["_id"])
            if "created_at" in log and log["created_at"]:
                log["created_at"] = log["created_at"].isoformat()
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load Watcher log: {e}")


@router.get("/souls")
async def get_souls_history():
    """Returns the active system prompt (SOUL) for each agent and its complete evolution lineage."""
    db = get_db()
    try:
        agents_cursor = db.agents.find({"status": {"$nin": ["extinct", "archived"]}})
        agents = await agents_cursor.to_list(100)
        
        result = []
        for agent in agents:
            agent_id = agent.get("id")
            
            # Fetch evolution lineage from soul_versions
            versions_cursor = db.soul_versions.find({"agent_id": agent_id}).sort("version", 1)
            history = await versions_cursor.to_list(100)
            
            for h in history:
                h["_id"] = str(h["_id"])
                if "replaced_at" in h and h["replaced_at"]:
                    h["replaced_at"] = h["replaced_at"].isoformat()
                    
            result.append({
                "agent_id": agent_id,
                "name": agent.get("name"),
                "goal": agent.get("goal"),
                "current_soul": agent.get("config", {}).get("system_prompt") or agent.get("goal"),
                "score": agent.get("score", 0.0),
                "history": history
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load SOUL history: {e}")


@router.get("/autonomy-score")
async def get_autonomy_score():
    """Computes a single float (0.0 to 1.0) metric representing the system's operational autonomy ratio."""
    db = get_db()
    try:
        auto_count = await db.watcher_decisions.count_documents({})
        
        # Human manual approvals/rejections have watcher_verdict field as null or unset
        human_cursor = db.pending_improvements.find({
            "status": {"$in": ["approved", "rejected"]},
            "watcher_verdict": {"$exists": False}
        })
        human_list = await human_cursor.to_list(1000)
        human_count = len(human_list)
        
        total = auto_count + human_count
        ratio = float(auto_count) / float(total) if total > 0 else 1.0
        
        return {
            "autonomy_score": round(ratio, 4),
            "autonomous_actions": auto_count,
            "human_actions": human_count,
            "total_actions": total
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate autonomy score: {e}")
