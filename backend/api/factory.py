"""
OmniBot — Factory Control API Routes

POST /factory/agents/{id}/control   — Kill Switch (3 modes)
POST /factory/agents/{id}/evolve    — Start evolution
POST /factory/agents/{id}/resume    — Resume from pause
POST /factory/agents/{id}/fix       — Inject priority fix
GET  /factory/status                — Factory health
GET  /factory/models                — Model router health
"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.evolve_engine import get_evolution_manager, StopMode
from core.model_router import get_model_router
from core.config import get_settings
from autonomous_engine import get_autonomous_engine

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Request Models ──────────────────────────────────────────────────────────

class ControlRequest(BaseModel):
    mode: str = Field(..., description="Stop mode: hard_stop, soft_stop, or pause")

class FixRequest(BaseModel):
    instruction: str = Field(..., min_length=1, max_length=2000)

class AutonomousStartRequest(BaseModel):
    goal: str
    interval_minutes: int = Field(default=5, ge=1)
@router.post("/agents/{agent_id}/control")
async def control_agent(agent_id: str, req: ControlRequest):
    """Kill Switch — control an agent's evolution with 3 modes."""
    try:
        mode = StopMode(req.mode)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode: {req.mode}. Must be: hard_stop, soft_stop, or pause",
        )

    manager = get_evolution_manager()
    success = await manager.stop_evolution(agent_id, mode)

    if not success:
        raise HTTPException(status_code=404, detail="Agent not found or not evolving")

    return {"status": "ok", "agent_id": agent_id, "mode": mode.value}


@router.post("/agents/{agent_id}/evolve")
async def start_evolution(agent_id: str):
    """Start the evolution loop for an agent."""
    # Verify agent exists
    from core.factory import get_agent_factory
    factory = get_agent_factory()
    agent = await factory.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    manager = get_evolution_manager()
    success = await manager.start_evolution(agent_id)

    if not success:
        raise HTTPException(
            status_code=429,
            detail=f"Cannot start: concurrent limit reached ({manager.active_count}/{manager._get_max_concurrent()})",
        )

    return {"status": "evolving", "agent_id": agent_id}


@router.post("/agents/{agent_id}/resume")
async def resume_agent(agent_id: str):
    """Resume a paused or stopped agent."""
    manager = get_evolution_manager()
    success = await manager.resume_evolution(agent_id)

    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")

    return {"status": "resumed", "agent_id": agent_id}


@router.post("/agents/{agent_id}/fix")
async def fix_agent(agent_id: str, req: FixRequest):
    """
    Inject a priority fix instruction into an agent's config.
    The evolution engine will use this as a priority directive.
    """
    from core.database import get_db
    from utils.thought_logger import log_thought

    db = get_db()
    result = await db.agents.update_one(
        {"id": agent_id},
        {
            "$set": {
                "config.priority_fix": req.instruction,
                "config.additional_instructions": f"PRIORITY FIX: {req.instruction}",
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")

    await log_thought(
        agent_id,
        f"🔧 Priority fix injected: {req.instruction[:100]}",
        phase="general",
    )

    return {"status": "fix_applied", "agent_id": agent_id, "instruction": req.instruction}


@router.get("/status")
async def factory_status():
    """Get factory-wide health status."""
    manager = get_evolution_manager()
    settings = get_settings()
    router_instance = get_model_router()

    return {
        "factory": manager.get_status(),
        "night_mode": settings.is_night_mode(),
        "night_mode_window": {
            "start": settings.night_mode_start.isoformat(),
            "end": settings.night_mode_end.isoformat(),
        },
        "models": router_instance.get_health_status(),
        "autonomous": get_autonomous_engine().to_dict(),
        "limits": {
            "max_concurrent_day": settings.max_concurrent_agents_day,
            "max_concurrent_night": settings.max_concurrent_agents_night,
            "default_evolve_interval": settings.default_evolve_interval,
        },
    }


@router.get("/models")
async def model_health():
    """Get model router health dashboard data."""
    router_instance = get_model_router()
    return router_instance.get_health_status()


@router.get("/activity")
async def factory_activity(limit: int = 50):
    """Return the most recent thoughts across all agents — pre-loads the Live Activity Feed."""
    from core.database import get_db
    db = get_db()
    try:
        cursor = db.thoughts.find({}, {"_id": 0}).sort("timestamp", -1).limit(min(limit, 200))
        events = []
        async for t in cursor:
            if isinstance(t.get("timestamp"), object) and hasattr(t["timestamp"], "isoformat"):
                t["timestamp"] = t["timestamp"].isoformat()
            events.append(t)
        return {"events": events}
    except Exception as e:
        logger.error("Failed to fetch factory activity: %s", e)
        return {"events": []}


@router.get("/mirror")
async def factory_mirror():
    """
    Factory self-awareness: 5 LLM-generated insights about the factory's current state.
    Results cached for 30 minutes.
    """
    from core.factory_mirror import get_factory_mirror
    from core.database import get_db
    db = get_db()
    mirror = get_factory_mirror()
    insights = await mirror.get_mirror(db)
    return {"insights": insights, "cache_ttl_minutes": 30}


@router.delete("/mirror/cache")
async def clear_mirror_cache():
    """Force-invalidate the mirror cache so the next GET regenerates fresh insights."""
    from core.database import get_db
    db = get_db()
    await db.factory_mirror_cache.delete_one({"_id": "mirror_snapshot"})
    return {"status": "cache_cleared"}


@router.get("/roi")
async def factory_roi():
    """Get token ROI rankings for all agents."""
    from core.roi_tracker import get_factory_roi_rankings
    from core.database import get_db
    db = get_db()
    rankings = await get_factory_roi_rankings(db)
    return {"rankings": rankings}


@router.get("/genealogy")
async def factory_genealogy():
    """Get the full agent genealogy tree with bloodline statistics."""
    from core.genealogy import get_full_tree
    from core.database import get_db
    db = get_db()
    return await get_full_tree(db)


@router.get("/genealogy/{agent_id}")
async def agent_ancestry(agent_id: str):
    """Get ancestry chain and children for a specific agent."""
    from core.genealogy import get_agent_ancestry
    from core.database import get_db
    db = get_db()
    data = await get_agent_ancestry(db, agent_id)
    if not data:
        raise HTTPException(status_code=404, detail="Agent genealogy record not found")
    return data


@router.get("/ghosts")
async def list_ghost_agents():
    """List all Ghost Agents (👻) — failed agents with failure autopsies."""
    from core.dead_letter import get_all_ghosts
    from core.database import get_db
    db = get_db()
    ghosts = await get_all_ghosts(db)
    return {"ghosts": ghosts, "count": len(ghosts)}


@router.post("/ghosts/{agent_id}/resurrect")
async def resurrect_ghost_agent(agent_id: str):
    """
    Resurrect a Ghost Agent: creates a new agent that inherits the ghost's failure lessons.
    The new agent will know what NOT to do from its predecessor's failure analysis.
    """
    from core.dead_letter import resurrect_ghost
    from core.database import get_db
    db = get_db()
    result = await resurrect_ghost(db, agent_id)
    if not result:
        raise HTTPException(status_code=404, detail="Ghost agent not found or resurrection failed")
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/meta")
async def factory_meta_status():
    """Get the meta-improver status: cycle count, A/B test state, prompt evolution history."""
    from core.meta_improver import get_meta_improver
    from core.database import get_db
    db = get_db()
    meta = get_meta_improver()
    status = meta.get_status()

    # Fetch last 10 meta scores
    try:
        recent_scores = await db.factory_meta_scores.find().sort("timestamp", -1).limit(10).to_list(10)
        for s in recent_scores:
            s.pop("_id", None)
            if "timestamp" in s:
                s["timestamp"] = s["timestamp"].isoformat()
        status["recent_scores"] = recent_scores
    except Exception:
        status["recent_scores"] = []

    # Fetch factory upgrade events
    try:
        upgrades = await db.factory_events.find(
            {"event": "factory_self_upgraded_evolution_prompt"},
        ).sort("timestamp", -1).limit(5).to_list(5)
        for u in upgrades:
            u.pop("_id", None)
            if "timestamp" in u:
                u["timestamp"] = u["timestamp"].isoformat()
        status["upgrades"] = upgrades
    except Exception:
        status["upgrades"] = []

    return status


@router.get("/prompt-evolver")
async def prompt_evolver_status():
    """Get the status of the Self-Rewriting Prompt Template system (Phase 7)."""
    from core.prompt_evolver import get_prompt_evolver
    from core.database import get_db
    db = get_db()
    evolver = get_prompt_evolver()

    status = evolver.get_status()

    # Fetch all template versions from DB
    try:
        templates = await db.prompt_templates.find(
            {}, {"template_text": 0}  # exclude text for brevity
        ).sort("version", -1).limit(10).to_list(10)
        for t in templates:
            t.pop("_id", None)
            if "created_at" in t:
                t["created_at"] = t["created_at"].isoformat()
        status["templates"] = templates
    except Exception:
        status["templates"] = []

    return status


@router.get("/morning-report")
async def get_morning_report():
    """Get the latest morning factory health report (generated at 06:00 by night scheduler)."""
    from core.database import get_db
    db = get_db()
    try:
        report = await db.morning_reports.find_one({}, sort=[("generated_at", -1)])
        if not report:
            return {"status": "no_report", "message": "No morning report yet — generated daily at 06:00"}
        report.pop("_id", None)
        if "generated_at" in report:
            report["generated_at"] = report["generated_at"].isoformat()
        return report
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/agents/{agent_id}/dead-letter-check")
async def trigger_dead_letter_check(agent_id: str):
    """Manually trigger dead letter processing for an agent."""
    from core.dead_letter import check_for_complete_failure, process_dead_agent
    from core.database import get_db
    db = get_db()
    is_dead = await check_for_complete_failure(db, agent_id)
    if not is_dead:
        return {"status": "alive", "agent_id": agent_id, "message": "Agent does not meet dead letter criteria"}
    ghost = await process_dead_agent(db, agent_id)
    return {"status": "ghosted", "agent_id": agent_id, "ghost": ghost}


# ── Autonomous Mode Central Endpoints ─────────────────────────────────────────

@router.post("/autonomous/start")
async def start_autonomous(req: AutonomousStartRequest):
    engine = get_autonomous_engine()
    engine.start(req.goal, req.interval_minutes)
    return {"status": "started", "goal": req.goal, "interval_minutes": req.interval_minutes}

@router.post("/autonomous/stop")
async def stop_autonomous():
    engine = get_autonomous_engine()
    engine.stop()
    return {"status": "stopped"}

@router.get("/autonomous/status")
async def status_autonomous():
    engine = get_autonomous_engine()
    return engine.to_dict()

@router.get("/autonomous/log")
async def log_autonomous(limit: int = 50):
    from core.database import get_db
    db = get_db()
    try:
        cursor = db.autonomous_log.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit)
        logs = []
        async for log in cursor:
            if "timestamp" in log and hasattr(log["timestamp"], "isoformat"):
                log["timestamp"] = log["timestamp"].isoformat()
            logs.append(log)
        return {"logs": logs}
    except Exception as e:
        logger.error("Failed to fetch autonomous logs: %s", e)
        return {"logs": []}

# Legacy/CLI Compatible mounts
@router.post("/start")
async def start_autonomous_legacy(req: AutonomousStartRequest):
    return await start_autonomous(req)

@router.post("/stop")
async def stop_autonomous_legacy():
    return await stop_autonomous()
