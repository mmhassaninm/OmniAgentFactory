"""
OmniBot — Agent CRUD API Routes

POST   /agents          — Create new agent
GET    /agents          — List all agents
GET    /agents/{id}     — Get agent detail
PUT    /agents/{id}     — Update agent config
DELETE /agents/{id}     — Delete agent
GET    /agents/{id}/thoughts   — Get agent thoughts
GET    /agents/{id}/versions   — Get version history
GET    /agents/{id}/catalog    — Get agent catalog
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.database import get_db
from core.factory import get_agent_factory
from core.checkpoint import get_version_history, get_all_snapshots
from utils.thought_logger import get_recent_thoughts
from utils.budget import get_budget_governor

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request/Response Models ─────────────────────────────────────────────────

class CreateAgentRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    goal: str = Field(..., min_length=1, max_length=5000)
    template: str = Field(default="general")
    config: Optional[dict] = None


class UpdateAgentRequest(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    config: Optional[dict] = None
    evolve_interval_seconds: Optional[int] = None


class RunAgentRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)


class RunAgentResponse(BaseModel):
    result: str
    execution_time_ms: int
    version: int


_DANGEROUS_PATTERNS = [
    "os.system(",
    "subprocess.",
    "__import__(",
    "socket.socket",
    "socket.connect",
]


def _sanitize_code(code: str) -> str:
    """Remove lines containing known dangerous patterns."""
    lines = code.splitlines()
    safe = [ln for ln in lines if not any(pat in ln for pat in _DANGEROUS_PATTERNS)]
    return "\n".join(safe)


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post("")
async def create_agent(req: CreateAgentRequest):
    """Create a new agent from a template."""
    factory = get_agent_factory()
    agent = await factory.create_agent(
        name=req.name,
        goal=req.goal,
        template=req.template,
        config=req.config,
    )
    return {"status": "created", "agent": agent.to_dict()}


@router.get("")
async def list_agents():
    """List all agents."""
    factory = get_agent_factory()
    agents = await factory.list_agents()
    return {"agents": agents, "count": len(agents)}


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    """Get full agent detail with enriched analytics fields."""
    from core.database import get_db

    factory = get_agent_factory()
    agent = await factory.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Daily budget and token usage
    try:
        gov = get_budget_governor()
        agent["budget"] = await gov.get_usage_summary(agent_id)
    except Exception as e:
        logger.warning("Failed to load budget summary for agent %s: %s", agent_id, e)
        agent["budget"] = None

    # Version history from checkpoints (up to 50)
    try:
        agent["version_history"] = await get_version_history(agent_id, limit=50)
    except Exception:
        agent["version_history"] = []

    # Thought summary, cycle counts, cascade stats — one pass over thoughts collection
    try:
        db = get_db()
        phase_counts: dict = {}
        cascade_count = 0
        last_model: Optional[str] = None

        async for t in db.thoughts.find(
            {"agent_id": agent_id},
            {"phase": 1, "message": 1, "model_used": 1},
        ):
            p = t.get("phase", "general")
            phase_counts[p] = phase_counts.get(p, 0) + 1
            if t.get("model_used"):
                last_model = t["model_used"]
            msg = (t.get("message") or "").lower()
            if "cascade" in msg or "fallback" in msg:
                cascade_count += 1

        commits = phase_counts.get("commit", 0)
        rollbacks = phase_counts.get("rollback", 0)
        total_cycles = commits + rollbacks

        agent["thought_summary"] = {
            "draft": phase_counts.get("draft", 0),
            "test": phase_counts.get("testing", 0),
            "commit": commits,
            "error": phase_counts.get("error", 0),
            "cascade": cascade_count,
        }
        agent["cycles_completed"] = commits
        agent["success_rate"] = (
            round(commits / total_cycles * 100, 1) if total_cycles > 0 else 0
        )
        agent["cascade_stats"] = {
            "total_switches": cascade_count,
            "last_provider": last_model,
        }
    except Exception as e:
        logger.warning("Failed to compute thought summary for %s: %s", agent_id, e)
        agent["thought_summary"] = {"draft": 0, "test": 0, "commit": 0, "error": 0, "cascade": 0}
        agent["cycles_completed"] = 0
        agent["success_rate"] = 0
        agent["cascade_stats"] = {"total_switches": 0, "last_provider": None}

    # Total tokens from budget summary
    try:
        agent["total_tokens_used"] = (
            agent["budget"].get("tokens_today", 0) if agent.get("budget") else 0
        )
    except Exception:
        agent["total_tokens_used"] = 0

    # Parse catalog JSON (stored as string in some cases)
    try:
        catalog = agent.get("catalog") or {}
        catalog_text = catalog.get("catalog_text") if isinstance(catalog, dict) else None
        if catalog_text and isinstance(catalog_text, str):
            agent["catalog_parsed"] = json.loads(catalog_text)
        elif isinstance(catalog, dict) and catalog:
            agent["catalog_parsed"] = catalog
        else:
            agent["catalog_parsed"] = None
    except Exception:
        agent["catalog_parsed"] = agent.get("catalog")

    return agent


@router.put("/{agent_id}")
async def update_agent(agent_id: str, req: UpdateAgentRequest):
    """Update agent configuration."""
    factory = get_agent_factory()

    # Build updates dict (only non-None fields)
    updates = {}
    if req.name is not None:
        updates["name"] = req.name
    if req.goal is not None:
        updates["goal"] = req.goal
    if req.config is not None:
        updates["config"] = req.config
    if req.evolve_interval_seconds is not None:
        updates["evolve_interval_seconds"] = req.evolve_interval_seconds

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    success = await factory.update_agent(agent_id, updates)
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"status": "updated", "agent_id": agent_id}


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    """Delete an agent and all associated data."""
    factory = get_agent_factory()
    success = await factory.delete_agent(agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"status": "deleted", "agent_id": agent_id}


@router.get("/{agent_id}/thoughts")
async def get_thoughts(agent_id: str, limit: int = 50, phase: Optional[str] = None):
    """Get recent thoughts for an agent."""
    thoughts = await get_recent_thoughts(agent_id, limit=limit, phase=phase)
    return {"thoughts": thoughts, "count": len(thoughts)}


@router.get("/{agent_id}/versions")
async def get_versions(agent_id: str, limit: int = 10):
    """Get version history for an agent."""
    versions = await get_version_history(agent_id, limit=limit)
    return {"versions": versions, "count": len(versions)}


@router.get("/{agent_id}/snapshots")
async def get_snapshots(agent_id: str, limit: int = 50):
    """Get all snapshots (including failed) for debugging."""
    snapshots = await get_all_snapshots(agent_id, limit=limit)
    return {"snapshots": snapshots, "count": len(snapshots)}


@router.get("/{agent_id}/catalog")
async def get_catalog(agent_id: str):
    """Get the auto-generated catalog for an agent."""
    factory = get_agent_factory()
    agent = await factory.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    catalog = agent.get("catalog")
    if not catalog:
        # Generate on first request
        catalog = await factory.generate_catalog(agent_id)
        if not catalog:
            raise HTTPException(status_code=500, detail="Catalog generation failed")

    return catalog


@router.post("/{agent_id}/catalog/regenerate")
async def regenerate_catalog(agent_id: str):
    """Force regeneration of agent catalog."""
    factory = get_agent_factory()
    catalog = await factory.generate_catalog(agent_id)
    if not catalog:
        raise HTTPException(status_code=500, detail="Catalog generation failed")
    return catalog


@router.post("/{agent_id}/run")
async def run_agent(agent_id: str, req: RunAgentRequest):
    """Execute an agent's execute() function with a user message."""
    db = get_db()
    agent_doc = await db.agents.find_one({"id": agent_id})
    if not agent_doc:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent_code = agent_doc.get("agent_code") or ""
    version = agent_doc.get("version", 0)
    now = datetime.now(timezone.utc).isoformat()

    # Save user message
    await db.agent_conversations.insert_one({
        "agent_id": agent_id,
        "role": "user",
        "content": req.message,
        "timestamp": now,
    })

    # Guard: no execute function yet
    if "def execute" not in agent_code:
        result = "⚠ This agent has no execute() function yet. Click Evolve to improve it first."
        await db.agent_conversations.insert_one({
            "agent_id": agent_id,
            "role": "assistant",
            "content": result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": version,
            "execution_time_ms": 0,
        })
        return RunAgentResponse(result=result, execution_time_ms=0, version=version)

    safe_code = _sanitize_code(agent_code)
    start_ms = time.monotonic()
    result = ""

    try:
        namespace: dict = {}
        exec(compile(safe_code, "<agent>", "exec"), namespace)  # noqa: S102
        execute_fn = namespace.get("execute")
        if execute_fn is None:
            result = "⚠ execute() function not found after loading agent code."
        else:
            raw = await asyncio.wait_for(execute_fn(req.message), timeout=30.0)
            result = str(raw) if raw is not None else "(no output)"
    except asyncio.TimeoutError:
        result = "⏱ Agent took too long to respond (>30 s). Try evolving it for better performance."
    except Exception as exc:
        result = f"⚠ Agent error: {type(exc).__name__}: {exc}"

    elapsed_ms = int((time.monotonic() - start_ms) * 1000)

    await db.agent_conversations.insert_one({
        "agent_id": agent_id,
        "role": "assistant",
        "content": result,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": version,
        "execution_time_ms": elapsed_ms,
    })

    return RunAgentResponse(result=result, execution_time_ms=elapsed_ms, version=version)


@router.get("/{agent_id}/conversations")
async def get_conversations(agent_id: str):
    """Return last 50 conversation messages for an agent."""
    db = get_db()
    docs = await db.agent_conversations.find(
        {"agent_id": agent_id},
        {"_id": 0},
    ).sort("timestamp", 1).limit(50).to_list(50)
    return {"messages": docs, "count": len(docs)}
