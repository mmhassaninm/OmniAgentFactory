"""
Memory API — endpoints for the Knowledge Graph memory system.

Endpoints:
  GET    /api/memory/{user_id}/profile — full user knowledge graph summary
  GET    /api/memory/{user_id}/context — LLM-ready context string
  DELETE /api/memory/{user_id} — wipe user memory
  POST   /api/memory/{user_id}/note — manually add a fact to the graph
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from core.knowledge_graph import get_knowledge_graph

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/memory", tags=["Memory"])


@router.get("/{user_id}/profile")
async def get_user_profile(user_id: str) -> dict[str, Any]:
    """
    Get the full knowledge graph profile for a user.
    Returns preferences, tasks, skills, and entities.
    """
    try:
        kg = get_knowledge_graph()
        await kg.load()
        profile = kg.get_user_profile(user_id)
        return {"status": "ok", "profile": profile}
    except Exception as e:
        logger.warning("[Memory] Profile error for %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail=str(e)[:200])


@router.get("/{user_id}/context")
async def get_user_context(user_id: str) -> dict[str, str]:
    """
    Get an LLM-ready context string for a user.
    This is injected into the agent's system prompt for personalization.
    """
    try:
        kg = get_knowledge_graph()
        await kg.load()
        context = kg.export_context_for_llm(user_id)
        return {"status": "ok", "context": context}
    except Exception as e:
        logger.warning("[Memory] Context error for %s: %s", user_id, e)
        return {"status": "ok", "context": "[MEMORY CONTEXT]: No prior knowledge about this user."}


@router.delete("/{user_id}")
async def delete_user_memory(user_id: str) -> dict[str, Any]:
    """
    Wipe all memory for a user from the knowledge graph.
    """
    try:
        kg = get_knowledge_graph()
        await kg.load()
        deleted = await kg.delete_user(user_id)
        return {"status": "ok", "deleted": deleted}
    except Exception as e:
        logger.warning("[Memory] Delete error for %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail=str(e)[:200])


@router.post("/{user_id}/note")
async def add_user_note(user_id: str, body: dict[str, str]) -> dict[str, str]:
    """
    Manually add a fact/note to the knowledge graph for a user.
    Body: { "fact": "User prefers Telegram over email" }
    """
    fact = body.get("fact", "")
    if not fact:
        raise HTTPException(status_code=400, detail="'fact' field is required")
    try:
        kg = get_knowledge_graph()
        await kg.load()
        await kg.add_fact(user_id, fact)
        return {"status": "ok", "note": fact}
    except Exception as e:
        logger.warning("[Memory] Note error for %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail=str(e)[:200])