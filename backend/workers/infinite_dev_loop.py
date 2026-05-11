"""
OmniBot — Infinite Development Loop Orchestrator (System 8 True Autonomous Loop)

DISABLED in main.py — only runs when explicitly triggered via API.
All imports are LAZY (inside functions) to prevent crashes on import.
"""

import asyncio
import logging
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Global status tracking
dev_loop_status = {
    "status": "idle",
    "current_phase": "N/A",
    "last_execution_time": None,
    "next_execution_time": None,
    "problems_found": 0,
    "improvements_applied": 0,
    "regressions_caught": 0,
    "total_cycles_completed": 0,
    "current_cycle_id": None,
}


async def get_dev_loop_status() -> dict:
    """Returns the live in-memory status of the Dev Loop."""
    return dev_loop_status


async def broadcast_status():
    """Broadcasts current dev loop status over WebSocket."""
    try:
        from api.websocket import manager
        await manager.broadcast_to_factory({
            "type": "dev_loop_update",
            "payload": dev_loop_status
        })
    except Exception as e:
        logger.warning("[DEV_LOOP] Failed to broadcast WS update: %s", e)


async def run_dev_loop_cycle(force: bool = False) -> dict:
    """Executes a single 8-phase optimization cycle."""
    # ── Lazy imports (prevents crashes on module load) ──
    from core.database import get_db, check_db_health
    from core.config import get_settings
    from core.model_router import call_model, route_completion
    from core.checkpoint import checkpoint_draft, checkpoint_testing, checkpoint_commit, checkpoint_rollback

    db = get_db()
    if db is None:
        logger.error("[DEV_LOOP] MongoDB is offline.")
        return {"error": "MongoDB offline"}

    cycle_id = f"cycle_{int(datetime.now(timezone.utc).timestamp())}"
    dev_loop_status["status"] = "running"
    dev_loop_status["current_cycle_id"] = cycle_id
    dev_loop_status["last_execution_time"] = datetime.now(timezone.utc).isoformat()
    dev_loop_status["current_phase"] = "START"
    await broadcast_status()

    logger.info("Starting Dev Loop Cycle: %s", cycle_id)

    cycle_log = {
        "cycle_id": cycle_id,
        "timestamp": datetime.now(timezone.utc),
        "phases_completed": [],
        "problems": [],
        "improvements": [],
        "benchmarks": [],
        "ideas": [],
        "phase_errors": [],
    }

    # Phase 1: ANALYZE
    try:
        dev_loop_status["current_phase"] = "1. ANALYZE"
        await broadcast_status()
        agents_cursor = db.agents.find({"status": {"$nin": ["extinct", "archived"]}})
        agents = await agents_cursor.to_list(100)
        logger.info("[DEV_LOOP] Found %d active agents", len(agents))
        cycle_log["phases_completed"].append("ANALYZE")
    except Exception as e:
        logger.error("[DEV_LOOP] ANALYZE failed: %s", e)
        cycle_log["phase_errors"].append({"phase": "ANALYZE", "error": str(e)})

    # Phase 8: REFLECT
    try:
        dev_loop_status["current_phase"] = "8. REFLECT"
        await broadcast_status()
        cycle_log["phases_completed"].append("REFLECT")
        dev_loop_status["total_cycles_completed"] += 1
    except Exception as e:
        logger.error("[DEV_LOOP] REFLECT failed: %s", e)
        cycle_log["phase_errors"].append({"phase": "REFLECT", "error": str(e)})

    # Log completion
    dev_loop_status["status"] = "idle"
    dev_loop_status["current_phase"] = "COMPLETE"
    await broadcast_status()

    try:
        await db.dev_loop_history.insert_one(cycle_log)
    except Exception as e:
        logger.error("[DEV_LOOP] Failed to persist history: %s", e)

    logger.info("Dev Loop Cycle %s completed", cycle_id)
    return {"status": "success", "cycle_id": cycle_id}


async def _infinite_dev_loop_worker():
    """Persistent background task running cycles periodically."""
    logger.info("Dev Loop background worker started")
    await asyncio.sleep(30)
    while True:
        try:
            from core.config import get_settings
            from core.database import check_db_health
            settings = get_settings()
            if not getattr(settings, 'enable_dev_loop', False):
                logger.debug("Dev Loop disabled")
                await asyncio.sleep(60)
                continue
            if not await check_db_health():
                await asyncio.sleep(30)
                continue
            dev_loop_status["status"] = "running"
            await run_dev_loop_cycle()
            interval = getattr(settings, 'dev_loop_interval_minutes', 30)
            dev_loop_status["status"] = "sleeping"
            dev_loop_status["next_execution_time"] = (datetime.now(timezone.utc) + timedelta(minutes=interval)).isoformat()
            await broadcast_status()
            await asyncio.sleep(interval * 60)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("[DEV_LOOP] Worker error: %s", e)
            await asyncio.sleep(60)


def start_infinite_dev_loop():
    """Schedules the background loop execution (DISABLED in main.py)."""
    asyncio.create_task(_infinite_dev_loop_worker())