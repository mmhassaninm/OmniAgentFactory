"""
OmniBot — Extinction Events System

When all agents plateau, wipe 70% and restart from survivors.
Inspired by punctuated equilibrium in evolutionary biology.
"""

import logging
from datetime import datetime

logger = logging.getLogger(__name__)

PLATEAU_THRESHOLD_CYCLES = 10   # consecutive committed versions with no improvement = plateau
EXTINCTION_SURVIVOR_RATE = 0.3  # keep top 30%
EXTINCTION_MIN_AGENTS = 3       # don't trigger extinction if fewer agents than this


async def check_for_plateau(db, agent_id: str) -> bool:
    """Check if agent's score hasn't improved in last N committed cycles."""
    recent = await db.snapshots.find(
        {"agent_id": agent_id, "status": "committed"},
    ).sort("version", -1).limit(PLATEAU_THRESHOLD_CYCLES).to_list(PLATEAU_THRESHOLD_CYCLES)

    if len(recent) < PLATEAU_THRESHOLD_CYCLES:
        return False

    scores = [s.get("performance_score", 0) for s in recent]
    improvement = max(scores) - min(scores)
    is_plateau = improvement < 0.01

    if is_plateau:
        logger.info("[EXTINCTION] Plateau detected for agent %s (max improvement=%.4f over %d cycles)",
                    agent_id[:8], improvement, PLATEAU_THRESHOLD_CYCLES)

    return is_plateau


async def trigger_extinction_event(db, evolution_manager=None) -> dict:
    """
    Trigger extinction: archive 70% of weakest agents, keep top 30%.
    Culled agents are marked extinct (archived, not deleted).
    Returns summary of survivors vs culled.
    """
    all_agents = await db.agents.find(
        {"status": {"$nin": ["extinct"]}}
    ).to_list(1000)

    if len(all_agents) < EXTINCTION_MIN_AGENTS:
        logger.info("[EXTINCTION] Too few agents (%d) — skipping extinction event", len(all_agents))
        return {"survivors": len(all_agents), "culled": 0, "generation": len(all_agents)}

    # Sort by score descending
    all_agents.sort(key=lambda a: a.get("score", a.get("current_score", 0)), reverse=True)

    cutoff = max(1, int(len(all_agents) * EXTINCTION_SURVIVOR_RATE))
    survivors = all_agents[:cutoff]
    culled = all_agents[cutoff:]

    # Archive culled agents — never delete, mark as extinct for archaeology
    for agent in culled:
        await db.agents.update_one(
            {"_id": agent["_id"]},
            {"$set": {"status": "extinct", "extinct_at": datetime.utcnow()}},
        )

        # Stop evolution if running
        if evolution_manager:
            try:
                from core.evolve_engine import StopMode
                if agent.get("id") in getattr(evolution_manager, "_tasks", {}):
                    await evolution_manager.stop_evolution(agent["id"], StopMode.HARD_STOP)
            except Exception:
                pass

    # Log the extinction event
    await db.extinction_events.insert_one({
        "timestamp": datetime.utcnow(),
        "total_agents": len(all_agents),
        "survivor_ids": [a.get("id") for a in survivors],
        "culled_ids": [a.get("id") for a in culled],
        "trigger": "plateau_detected",
        "survivor_rate": EXTINCTION_SURVIVOR_RATE,
    })

    logger.info("[EXTINCTION] Event complete: %d survivors, %d culled from %d total",
                len(survivors), len(culled), len(all_agents))

    return {
        "survivors": len(survivors),
        "culled": len(culled),
        "generation": len(all_agents),
    }
