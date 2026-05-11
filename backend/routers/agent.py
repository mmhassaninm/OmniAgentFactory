import json
import logging
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional

logger = logging.getLogger(__name__)

from services.providers import provider_registry
from agent.loop import run_agent_loop
from agent.tiered_memory import TieredMemory
from agent.personas import get_all_personas
from agent.run_logger import list_runs, get_run, delete_run

router = APIRouter()


class AgentRunRequest(BaseModel):
    task: str
    provider: Optional[str] = None
    model: str = "auto"
    tools: List[str] = []
    max_iterations: int = 8
    persona: Optional[str] = "general"


@router.post("/run")
async def agent_run(body: AgentRunRequest):
    """
    Run the autonomous agent loop for a complex task.
    Returns an SSE stream with: agent_think, agent_act, agent_observe, agent_finish, status, error events.
    """

    async def sse_stream():
        try:
            # Resolve provider
            if body.provider:
                try:
                    provider = provider_registry.get(body.provider)
                except Exception as e:
                    logger.warning("Provider %s not found, using active: %s", body.provider, e)
                    provider = provider_registry.get_active()
            else:
                provider = provider_registry.get_active()

            # Resolve model
            model = body.model
            if model == "auto":
                model, pname = await provider_registry.auto_select_model()
                try:
                    provider_registry.set_active(pname)
                    provider = provider_registry.get_active()
                except Exception as e:
                    logger.warning("Failed to set active provider to %s: %s", pname, e)
                yield f"event: status\ndata: {json.dumps({'message': f'🤖 AutoDetect: {model} via {pname}'})}\n\n"

            async for chunk in run_agent_loop(
                task=body.task,
                tools=body.tools,
                provider=provider,
                model=model,
                max_iterations=min(body.max_iterations, 15),
                persona_id=body.persona,
            ):
                yield chunk

        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"
        finally:
            yield f"event: done\ndata: {json.dumps({'success': True})}\n\n"

    return StreamingResponse(sse_stream(), media_type="text/event-stream")


@router.get("/memory")
async def get_agent_memory(persistent_limit: int = Query(50, ge=1, le=200)):
    """Return all three tiers of agent memory."""
    tier3 = await TieredMemory.get_persistent(limit=persistent_limit)
    return {
        "tier1_working": [],            # working memory is per-request, always empty at REST time
        "tier2_session": TieredMemory.get_session_facts(),
        "tier3_persistent": tier3,
        "counts": {
            "session": len(TieredMemory.get_session_facts()),
            "persistent": len(tier3),
        },
    }


@router.delete("/memory/session")
async def clear_session_memory():
    TieredMemory.clear_session()
    return {"status": "cleared", "tier": "session"}


@router.post("/memory/persistent")
async def add_persistent_memory(fact: str, source: str = "manual", tags: List[str] = []):
    await TieredMemory.save_persistent(fact, source=source, tags=tags)
    return {"status": "saved"}


@router.get("/personas")
async def list_personas():
    """Return all available agent personas for the frontend persona selector."""
    return {"personas": get_all_personas()}


# ── Agent Replay endpoints (Direction 8 — Wildcard) ──────────────────────────

@router.get("/runs")
async def list_agent_runs(limit: int = Query(30, ge=1, le=100)):
    """List recent agent runs (metadata only, no steps)."""
    runs = await list_runs(limit=limit)
    return {"runs": runs, "count": len(runs)}


@router.get("/runs/{run_id}")
async def get_agent_run(run_id: str):
    """Return a full agent run with all steps — for replay."""
    run = await get_run(run_id)
    if not run:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    return run


@router.delete("/runs/{run_id}")
async def delete_agent_run(run_id: str):
    success = await delete_run(run_id)
    if not success:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    return {"status": "deleted", "run_id": run_id}
