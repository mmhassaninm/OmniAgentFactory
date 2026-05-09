"""
OmniBot — Token ROI Calculator (Nuclear Idea #2, Score 72)

Tracks tokens consumed vs. score improvement per evolution cycle.
Computes a running "return on investment" ratio (score_delta / tokens_spent)
per agent and exposes it as a scheduling priority signal.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


async def record_cycle(
    db,
    agent_id: str,
    tokens_used: int,
    score_before: float,
    score_after: float,
    committed: bool = False,
) -> None:
    """
    Record a completed evolution cycle's token cost and score outcome.
    `committed=True` means the cycle produced an improvement that was committed.
    """
    score_delta = max(0.0, score_after - score_before)
    roi = (score_delta / tokens_used) * 1000 if tokens_used > 0 else 0.0  # ROI per 1k tokens

    try:
        await db.roi_records.insert_one({
            "agent_id": agent_id,
            "tokens_used": tokens_used,
            "score_before": score_before,
            "score_after": score_after,
            "score_delta": score_delta,
            "roi": roi,
            "committed": committed,
            "timestamp": datetime.now(),
        })
    except Exception as e:
        logger.debug("[ROI] Failed to record cycle for agent %s: %s", agent_id[:8], e)


async def get_agent_roi(db, agent_id: str, last_n: int = 10) -> dict:
    """
    Get the rolling ROI stats for a single agent over its last N cycles.
    Returns: {avg_roi, total_tokens, total_score_delta, cycles_committed, cycles_total}
    """
    try:
        records = await db.roi_records.find(
            {"agent_id": agent_id},
        ).sort("timestamp", -1).limit(last_n).to_list(last_n)

        if not records:
            return {"avg_roi": 0.0, "total_tokens": 0, "total_score_delta": 0.0, "cycles_committed": 0, "cycles_total": 0}

        total_tokens = sum(r.get("tokens_used", 0) for r in records)
        total_delta = sum(r.get("score_delta", 0.0) for r in records)
        committed = sum(1 for r in records if r.get("committed", False))
        avg_roi = (total_delta / total_tokens) * 1000 if total_tokens > 0 else 0.0

        return {
            "avg_roi": round(avg_roi, 6),
            "total_tokens": total_tokens,
            "total_score_delta": round(total_delta, 4),
            "cycles_committed": committed,
            "cycles_total": len(records),
        }
    except Exception as e:
        logger.debug("[ROI] Failed to get ROI for agent %s: %s", agent_id[:8], e)
        return {"avg_roi": 0.0, "total_tokens": 0, "total_score_delta": 0.0, "cycles_committed": 0, "cycles_total": 0}


async def get_factory_roi_rankings(db, limit: int = 20) -> list[dict]:
    """
    Aggregate ROI across all agents and return them sorted by ROI descending.
    Used for scheduling priority and factory health reporting.
    """
    try:
        pipeline = [
            {
                "$group": {
                    "_id": "$agent_id",
                    "total_tokens": {"$sum": "$tokens_used"},
                    "total_score_delta": {"$sum": "$score_delta"},
                    "cycles": {"$sum": 1},
                    "committed": {"$sum": {"$cond": ["$committed", 1, 0]}},
                }
            },
            {
                "$addFields": {
                    "avg_roi": {
                        "$cond": [
                            {"$gt": ["$total_tokens", 0]},
                            {"$multiply": [{"$divide": ["$total_score_delta", "$total_tokens"]}, 1000]},
                            0.0,
                        ]
                    }
                }
            },
            {"$sort": {"avg_roi": -1}},
            {"$limit": limit},
        ]

        results = await db.roi_records.aggregate(pipeline).to_list(limit)
        return [
            {
                "agent_id": r["_id"],
                "avg_roi": round(r.get("avg_roi", 0.0), 6),
                "total_tokens": r.get("total_tokens", 0),
                "total_score_delta": round(r.get("total_score_delta", 0.0), 4),
                "cycles": r.get("cycles", 0),
                "commit_rate": round(r.get("committed", 0) / max(r.get("cycles", 1), 1), 3),
            }
            for r in results
        ]
    except Exception as e:
        logger.debug("[ROI] Failed to get factory rankings: %s", e)
        return []


async def estimate_tokens_in_response(response_text: str) -> int:
    """
    Rough token count estimation when the LLM doesn't return usage metadata.
    Approximation: 1 token ≈ 4 characters.
    """
    return max(1, len(response_text) // 4)
