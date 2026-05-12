"""
Skills API — endpoints for skill discovery and execution.

Endpoints:
  GET  /api/skills — list all installed skills with metadata
  POST /api/skills/{name}/run — execute a skill with parameters
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from core.skill_executor import get_skill_executor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/skills", tags=["Skills"])


@router.get("")
async def list_skills() -> dict[str, Any]:
    """
    List all discovered skills with their metadata (description, security level, entry points).
    """
    try:
        executor = get_skill_executor()
        await executor.discover_skills()
        skills = executor.get_skills_list()
        return {"status": "ok", "skills": skills, "count": len(skills)}
    except Exception as e:
        logger.warning("[Skills] List error: %s", e)
        return {"status": "ok", "skills": [], "count": 0}


@router.post("/{skill_name}/run")
async def run_skill(skill_name: str, body: dict[str, Any]) -> dict[str, Any]:
    """
    Execute a skill by name with parameters.
    Body: { function: str, params: dict }
    """
    function_name = body.get("function", "execute")
    params = body.get("params", {})

    try:
        executor = get_skill_executor()
        result = await executor.execute_skill(
            skill_name=skill_name,
            function_name=function_name,
            params=params,
        )
        return result
    except Exception as e:
        logger.warning("[Skills] Run error for %s: %s", skill_name, e)
        raise HTTPException(status_code=500, detail=str(e)[:200])