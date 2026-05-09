"""
OmniBot — Collective Memory Graph

All agents share a knowledge graph in MongoDB.
When one agent discovers something useful, it's stored and available
to all future agents, accelerating the entire factory's evolution.
"""

import logging
from datetime import datetime

logger = logging.getLogger(__name__)

MEMORY_SCORE_THRESHOLD = 0.05  # only share discoveries that improved score by at least 5%


async def contribute_memory(
    db,
    agent_id: str,
    discovery: str,
    context: str,
    score_delta: float,
):
    """
    Store a successful discovery in the collective memory.
    Only stores discoveries that meaningfully improved agent performance.
    """
    if score_delta < MEMORY_SCORE_THRESHOLD:
        return

    await db.collective_memory.insert_one({
        "agent_id": agent_id,
        "discovery": discovery[:1000],   # cap to keep docs small
        "context": context[:500],
        "score_delta": score_delta,
        "timestamp": datetime.now(),
        "times_helped": 0,
    })

    logger.info(
        "[COLLECTIVE_MEMORY] Agent %s contributed discovery (score_delta=+%.3f)",
        agent_id[:8], score_delta,
    )


async def get_relevant_memories(db, goal: str, limit: int = 3) -> list[str]:
    """
    Fetch the top past discoveries for context injection.
    Sorted by score_delta (most impactful first), then by usage count.
    """
    try:
        memories = await db.collective_memory.find(
            {"score_delta": {"$gt": MEMORY_SCORE_THRESHOLD}},
        ).sort([("score_delta", -1), ("times_helped", -1)]).limit(limit).to_list(limit)

        if not memories:
            return []

        # Increment times_helped counter for retrieved memories (fire-and-forget)
        ids = [m["_id"] for m in memories]
        await db.collective_memory.update_many(
            {"_id": {"$in": ids}},
            {"$inc": {"times_helped": 1}},
        )

        return [m["discovery"] for m in memories]

    except Exception as e:
        logger.debug("[COLLECTIVE_MEMORY] Failed to fetch memories: %s", e)
        return []
