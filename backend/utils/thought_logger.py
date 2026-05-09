"""
OmniBot — Thought Logger

Writes structured thought records to MongoDB and broadcasts via WebSocket.
Every agent action, decision, and evolution step is logged here.
"""

import logging
from datetime import datetime
from typing import Optional

from core.config import get_settings

logger = logging.getLogger(__name__)

# WebSocket broadcast function — set by websocket module at startup
_broadcast_fn = None


def set_broadcast_function(fn):
    """Called by the WebSocket module to register the broadcast callback."""
    global _broadcast_fn
    _broadcast_fn = fn


async def log_thought(
    agent_id: str,
    message: str,
    phase: str = "general",
    model_used: Optional[str] = None,
    tokens_used: int = 0,
):
    """
    Log a thought/action to MongoDB and broadcast via WebSocket.

    Args:
        agent_id: The agent this thought belongs to
        message: Human-readable description of what happened
        phase: One of: draft, testing, commit, rollback, evolve, general, error
        model_used: Which model was used (if any)
        tokens_used: Token count for this action
    """
    settings = get_settings()

    # Add [NIGHT] prefix during night mode
    if settings.is_night_mode():
        message = f"[NIGHT] {message}"

    thought = {
        "agent_id": agent_id,
        "timestamp": datetime.now(),
        "phase": phase,
        "message": message,
        "model_used": model_used,
        "tokens_used": tokens_used,
    }

    # Write to MongoDB
    try:
        from core.database import get_db
        db = get_db()
        await db.thoughts.insert_one(thought)
    except Exception as e:
        logger.error("Failed to log thought to MongoDB: %s", e)

    # Broadcast via WebSocket
    if _broadcast_fn:
        try:
            await _broadcast_fn(agent_id, {
                "type": "thought",
                "agent_id": agent_id,
                "timestamp": thought["timestamp"].isoformat(),
                "phase": phase,
                "message": message,
                "model_used": model_used,
            })
        except Exception as e:
            logger.debug("WebSocket broadcast failed: %s", e)

    logger.debug("Thought [%s/%s]: %s", agent_id[:8], phase, message[:100])


async def get_recent_thoughts(
    agent_id: str,
    limit: int = 50,
    phase: Optional[str] = None,
) -> list:
    """Retrieve recent thoughts for an agent."""
    try:
        from core.database import get_db
        db = get_db()
        query = {"agent_id": agent_id}
        if phase:
            query["phase"] = phase

        cursor = db.thoughts.find(query, sort=[("timestamp", -1)]).limit(limit)
        thoughts = []
        async for t in cursor:
            t["_id"] = str(t["_id"])
            thoughts.append(t)
        return thoughts
    except Exception as e:
        logger.error("Failed to get thoughts: %s", e)
        return []
