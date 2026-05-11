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

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field

from core.database import get_db
from core.factory import get_agent_factory
from core.checkpoint import get_version_history, get_all_snapshots
from utils.thought_logger import get_recent_thoughts
from utils.budget import get_budget_governor
from utils.validators import validate_agent_name, validate_agent_goal, validate_agent_id, ValidationError
from utils.error_response import http_exception, ErrorCode
from utils.query_optimizer import get_query_cache

logger = logging.getLogger(__name__)
router = APIRouter()

# Get the query cache instance
_query_cache = get_query_cache()


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


class UpdateBudgetRequest(BaseModel):
    daily_token_limit: int


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
    try:
        validate_agent_name(req.name)
        validate_agent_goal(req.goal)
    except ValidationError as e:
        raise http_exception(e.message, 400, ErrorCode.VALIDATION_ERROR, {"field": e.field})

    factory = get_agent_factory()
    agent = await factory.create_agent(
        name=req.name,
        goal=req.goal,
        template=req.template,
        config=req.config,
    )

    # Invalidate list caches when new agent is created
    try:
        _query_cache.invalidate_pattern("agents_list:*")
        _query_cache.invalidate("agents_total_count")
    except Exception as e:
        logger.debug("Cache invalidation failed: %s", e)

    return {"status": "created", "agent": agent.to_dict()}


@router.get("")
async def list_agents(skip: int = 0, limit: int = 50):
    """List all agents with pagination."""
    try:
        if skip < 0:
            raise ValueError("Skip must be non-negative")
        if limit < 1 or limit > 500:
            raise ValueError("Limit must be between 1 and 500")
    except ValueError as e:
        raise http_exception(str(e), 400, ErrorCode.BAD_REQUEST, {"field": "skip" if skip < 0 else "limit"})

    # Check cache for count (TTL: 30 seconds for count)
    count_cache_key = "agents_total_count"
    total_count = _query_cache.get(count_cache_key)

    db = get_db()
    # If not cached, fetch total count
    if total_count is None:
        total_count = await db.agents.count_documents({})
        try:
            _query_cache.set(count_cache_key, total_count, ttl_seconds=30)
        except Exception as e:
            logger.debug("Cache set failed for agent count: %s", e)

    # Check cache for this pagination slice (TTL: 60 seconds for list pages)
    list_cache_key = f"agents_list:{skip}:{limit}"
    cached_result = _query_cache.get(list_cache_key)
    if cached_result is not None:
        return cached_result

    # Fetch paginated agents
    agents = []
    async for doc in db.agents.find({}).sort("created_at", -1).skip(skip).limit(limit):
        doc["_id"] = str(doc["_id"])
        agents.append(doc)

    result = {
        "agents": agents,
        "count": len(agents),
        "total": total_count,
        "skip": skip,
        "limit": limit,
        "has_next": (skip + limit) < total_count
    }

    # Cache the paginated result
    try:
        _query_cache.set(list_cache_key, result, ttl_seconds=60)
    except Exception as e:
        logger.debug("Cache set failed for agent list: %s", e)

    return result


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    """Get full agent detail with enriched analytics fields."""
    try:
        validate_agent_id(agent_id)
    except ValidationError as e:
        raise http_exception(e.message, 400, ErrorCode.VALIDATION_ERROR, {"field": "agent_id"})

    # Check cache first (TTL: 60 seconds for agent data)
    cache_key = f"agent_detail:{agent_id}"
    cached_agent = _query_cache.get(cache_key)
    if cached_agent is not None:
        return cached_agent

    from core.database import get_db

    factory = get_agent_factory()
    agent = await factory.get_agent(agent_id)
    if not agent:
        raise http_exception("Agent not found", 404, ErrorCode.NOT_FOUND, {"agent_id": agent_id})

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
    except Exception as e:
        logger.warning("Failed to load version history for agent %s: %s", agent_id, e)
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
    except Exception as e:
        logger.warning("Failed to calculate total tokens for agent %s: %s", agent_id, e)
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
    except Exception as e:
        logger.warning("Failed to parse catalog for agent %s: %s", agent_id, e)
        agent["catalog_parsed"] = agent.get("catalog")

    # Cache the enriched agent data for 60 seconds
    try:
        _query_cache.set(cache_key, agent, ttl_seconds=60)
    except Exception as e:
        logger.debug("Cache set failed for agent %s: %s", agent_id, e)

    return agent


@router.put("/{agent_id}")
async def update_agent(agent_id: str, req: UpdateAgentRequest):
    """Update agent configuration."""
    try:
        validate_agent_id(agent_id)
    except ValidationError as e:
        raise http_exception(e.message, 400, ErrorCode.VALIDATION_ERROR, {"field": "agent_id"})

    factory = get_agent_factory()

    # Build updates dict (only non-None fields)
    updates = {}
    try:
        if req.name is not None:
            validate_agent_name(req.name)
            updates["name"] = req.name
        if req.goal is not None:
            validate_agent_goal(req.goal)
            updates["goal"] = req.goal
    except ValidationError as e:
        raise http_exception(e.message, 400, ErrorCode.VALIDATION_ERROR, {"field": e.field})

    if req.config is not None:
        updates["config"] = req.config
    if req.evolve_interval_seconds is not None:
        updates["evolve_interval_seconds"] = req.evolve_interval_seconds

    if not updates:
        raise http_exception("No updates provided", 400, ErrorCode.BAD_REQUEST, {})

    success = await factory.update_agent(agent_id, updates)
    if not success:
        raise http_exception("Agent not found", 404, ErrorCode.NOT_FOUND, {"agent_id": agent_id})

    # Invalidate cache for this agent
    try:
        _query_cache.invalidate(f"agent_detail:{agent_id}")
    except Exception as e:
        logger.debug("Cache invalidation failed: %s", e)

    return {"status": "updated", "agent_id": agent_id}


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    """Delete an agent and all associated data."""
    try:
        validate_agent_id(agent_id)
    except ValidationError as e:
        raise http_exception(e.message, 400, ErrorCode.VALIDATION_ERROR, {"field": "agent_id"})

    factory = get_agent_factory()
    success = await factory.delete_agent(agent_id)
    if not success:
        raise http_exception("Agent not found", 404, ErrorCode.NOT_FOUND, {"agent_id": agent_id})

    # Invalidate caches for this agent and list
    try:
        _query_cache.invalidate(f"agent_detail:{agent_id}")
        _query_cache.invalidate_pattern("agents_list:*")
        _query_cache.invalidate("agents_total_count")
    except Exception as e:
        logger.debug("Cache invalidation failed: %s", e)

    return {"status": "deleted", "agent_id": agent_id}


@router.get("/{agent_id}/thoughts")
async def get_thoughts(agent_id: str, limit: int = 50, phase: Optional[str] = None):
    """Get recent thoughts for an agent."""
    try:
        validate_agent_id(agent_id)
        if limit < 1 or limit > 500:
            raise ValueError("Limit must be between 1 and 500")
    except ValidationError as e:
        raise http_exception(e.message, 400, ErrorCode.VALIDATION_ERROR, {"field": "agent_id"})
    except ValueError as e:
        raise http_exception(str(e), 400, ErrorCode.BAD_REQUEST, {"field": "limit"})

    # Check cache for thoughts (TTL: 30 seconds for recent thoughts)
    thoughts_cache_key = f"thoughts:{agent_id}:{limit}:{phase or 'all'}"
    cached_result = _query_cache.get(thoughts_cache_key)
    if cached_result is not None:
        return cached_result

    thoughts = await get_recent_thoughts(agent_id, limit=limit, phase=phase)
    result = {"thoughts": thoughts, "count": len(thoughts)}

    # Cache the result
    try:
        _query_cache.set(thoughts_cache_key, result, ttl_seconds=30)
    except Exception as e:
        logger.debug("Cache set failed for thoughts: %s", e)

    return result


@router.get("/{agent_id}/versions")
async def get_versions(agent_id: str, limit: int = 10):
    """Get version history for an agent."""
    try:
        validate_agent_id(agent_id)
        if limit < 1 or limit > 100:
            raise ValueError("Limit must be between 1 and 100")
    except ValidationError as e:
        raise http_exception(e.message, 400, ErrorCode.VALIDATION_ERROR, {"field": "agent_id"})
    except ValueError as e:
        raise http_exception(str(e), 400, ErrorCode.BAD_REQUEST, {"field": "limit"})

    # Check cache for versions (TTL: 120 seconds for version history)
    versions_cache_key = f"versions:{agent_id}:{limit}"
    cached_result = _query_cache.get(versions_cache_key)
    if cached_result is not None:
        return cached_result

    versions = await get_version_history(agent_id, limit=limit)
    result = {"versions": versions, "count": len(versions)}

    # Cache the result
    try:
        _query_cache.set(versions_cache_key, result, ttl_seconds=120)
    except Exception as e:
        logger.debug("Cache set failed for versions: %s", e)

    return result


@router.get("/{agent_id}/snapshots")
async def get_snapshots(agent_id: str, limit: int = 50):
    """Get all snapshots (including failed) for debugging."""
    try:
        validate_agent_id(agent_id)
        if limit < 1 or limit > 500:
            raise ValueError("Limit must be between 1 and 500")
    except ValidationError as e:
        raise http_exception(e.message, 400, ErrorCode.VALIDATION_ERROR, {"field": "agent_id"})
    except ValueError as e:
        raise http_exception(str(e), 400, ErrorCode.BAD_REQUEST, {"field": "limit"})

    # Check cache for snapshots (TTL: 60 seconds for snapshot data)
    snapshots_cache_key = f"snapshots:{agent_id}:{limit}"
    cached_result = _query_cache.get(snapshots_cache_key)
    if cached_result is not None:
        return cached_result

    snapshots = await get_all_snapshots(agent_id, limit=limit)
    result = {"snapshots": snapshots, "count": len(snapshots)}

    # Cache the result
    try:
        _query_cache.set(snapshots_cache_key, result, ttl_seconds=60)
    except Exception as e:
        logger.debug("Cache set failed for snapshots: %s", e)

    return result


@router.get("/{agent_id}/catalog")
async def get_catalog(agent_id: str):
    """Get the auto-generated catalog for an agent."""
    try:
        validate_agent_id(agent_id)
    except ValidationError as e:
        raise http_exception(e.message, 400, ErrorCode.VALIDATION_ERROR, {"field": "agent_id"})

    factory = get_agent_factory()
    agent = await factory.get_agent(agent_id)
    if not agent:
        raise http_exception("Agent not found", 404, ErrorCode.NOT_FOUND, {"agent_id": agent_id})

    catalog = agent.get("catalog")
    if not catalog:
        # Generate on first request
        catalog = await factory.generate_catalog(agent_id)
        if not catalog:
            raise http_exception("Catalog generation failed", 500, ErrorCode.INTERNAL_ERROR, {"agent_id": agent_id})

    return catalog


@router.post("/{agent_id}/catalog/regenerate")
async def regenerate_catalog(agent_id: str):
    """Force regeneration of agent catalog."""
    try:
        validate_agent_id(agent_id)
    except ValidationError as e:
        raise http_exception(e.message, 400, ErrorCode.VALIDATION_ERROR, {"field": "agent_id"})

    factory = get_agent_factory()
    catalog = await factory.generate_catalog(agent_id)
    if not catalog:
        raise http_exception("Catalog generation failed", 500, ErrorCode.INTERNAL_ERROR, {"agent_id": agent_id})
    return catalog


def _extract_behavior_description(code: str) -> str:
    """Extract docstrings, comments, or key structure from agent code to describe its behavior."""
    if not code:
        return "Use your goal to guide responses."

    import ast
    try:
        tree = ast.parse(code)
        docstring = ast.get_docstring(tree)
        if docstring:
            return docstring

        # Check if execute function has a docstring
        for node in tree.body:
            if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                if node.name == "execute":
                    func_doc = ast.get_docstring(node)
                    if func_doc:
                        return func_doc
    except Exception as e:
        logger.debug("Failed to parse agent code for behavior description: %s", e)

    # Fallback: extract comments or first few lines of functions
    lines = code.splitlines()
    comments = [ln.strip("#").strip() for ln in lines if ln.strip().startswith("#")]
    if comments:
        desc = "\n".join(comments[:15])
        if len(desc) > 50:
            return desc

    # If no docstring or comments, just provide the actual code as behavior reference
    return f"Execute the logic defined in this evolved code block:\n{code[:2000]}"


@router.post("/{agent_id}/run")
async def run_agent(agent_id: str, req: RunAgentRequest, background_tasks: BackgroundTasks):
    """Execute an agent dynamically via LLM using its goal and evolved behavior context."""
    db = get_db()
    agent_doc = await db.agents.find_one({"id": agent_id})
    if not agent_doc:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent_code = agent_doc.get("agent_code") or ""
    version = agent_doc.get("version", 0)
    now = datetime.now(timezone.utc).isoformat()

    # Save user message first to persist in conversation history
    await db.agent_conversations.insert_one({
        "agent_id": agent_id,
        "role": "user",
        "content": req.message,
        "timestamp": now,
    })

    # Build the dynamic system prompt with goal and evolved behavioral context
    extracted_behavior = _extract_behavior_description(agent_code)
    system_prompt = f"""You are {agent_doc['name']}.

YOUR CURRENT GOAL AND CAPABILITIES:
{agent_doc['goal']}

YOUR CURRENT EVOLVED BEHAVIOR:
{extracted_behavior}

Respond to the user based on your specialized role. Be specific, detailed, and use 
your full capabilities. Never give generic responses."""

    # Fetch last 10 conversation messages (including the one just inserted)
    history_docs = await db.agent_conversations.find(
        {"agent_id": agent_id}
    ).sort("timestamp", -1).limit(10).to_list(10)
    history_docs.reverse()

    messages = [{"role": "system", "content": system_prompt}]
    for doc in history_docs:
        messages.append({
            "role": doc.get("role", "user"),
            "content": doc.get("content", "")
        })

    start_ms = time.monotonic()
    result = ""

    # Call the model router dynamically
    try:
        from core.model_router import call_model
        result = await call_model(messages, task_type="general", agent_id=agent_id)
        if not result or result.startswith("[MODEL_ROUTER_ERROR]"):
            raise ValueError(f"Model router failure: {result}")
    except Exception as e:
        logger.warning("Dynamic chat model call failed: %s. Falling back to local python execution.", e)
        # Fallback to direct Python code execution if "def execute" is in the code
        if "def execute" in agent_code:
            safe_code = _sanitize_code(agent_code)
            try:
                namespace: dict = {}
                try:
                    from tools.tools.web_search import web_search as ws_fn
                    import asyncio
                    class web_search_tool:
                        @staticmethod
                        async def run(query: str, max_results: int = 5) -> str:
                            return await asyncio.to_thread(ws_fn, query, max_results)
                    namespace["web_search"] = web_search_tool.run
                except Exception as ex_ws:
                    logger.warning("Failed to inject web_search: %s", ex_ws)

                exec(compile(safe_code, "<agent>", "exec"), namespace)  # noqa: S102
                execute_fn = namespace.get("execute")
                if execute_fn is not None:
                    raw = await asyncio.wait_for(execute_fn(req.message), timeout=30.0)
                    result = str(raw) if raw is not None else "(no output)"
                else:
                    result = "⚠ execute() function not found after loading agent code."
            except asyncio.TimeoutError:
                result = "⏱ Agent took too long to respond (>30 s). Try evolving it for better performance."
            except Exception as exc:
                result = f"⚠ Agent error: {type(exc).__name__}: {exc}"
        else:
            result = f"⚠ Provider Connection Issue: Could not reach LLM providers for dynamic chat, and no executable code is built yet."

    elapsed_ms = int((time.monotonic() - start_ms) * 1000)

    # Save assistant's response to conversation history
    await db.agent_conversations.insert_one({
        "agent_id": agent_id,
        "role": "assistant",
        "content": result,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": version,
        "execution_time_ms": elapsed_ms,
    })

    # Fire and forget rule extraction — does NOT block the chat response
    try:
        from services.rule_extractor import extract_rules_from_message
        background_tasks.add_task(
            extract_rules_from_message,
            agent_id=agent_id,
            user_message=req.message,
            db=db
        )
    except Exception as e:
        logger.warning("Failed to queue rule extraction background task: %s", e)

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


@router.get("/{agent_id}/budget")
async def get_agent_budget(agent_id: str):
    """Get dynamic agent budget detail."""
    gov = get_budget_governor()
    summary = await gov.get_usage_summary(agent_id)
    return {
        "daily_limit": summary.get("max_daily", 0),
        "tokens_today": summary.get("tokens_today", 0),
        "cost_estimate": summary.get("spent_total", 0.0),
        "utilization_pct": summary.get("utilization_pct", 0.0),
    }


@router.put("/{agent_id}/budget")
async def update_agent_budget(agent_id: str, req: UpdateBudgetRequest):
    """Update dynamic agent budget limit in MongoDB."""
    db = get_db()
    await db.economy.update_one(
        {"agent_id": agent_id},
        {"$set": {"daily_limit": req.daily_token_limit, "updated_at": datetime.now()}},
        upsert=True
    )
    return {"status": "success", "agent_id": agent_id, "daily_token_limit": req.daily_token_limit}


@router.get("/{agent_id}/preview-data")
async def get_agent_preview_data(agent_id: str, db=Depends(get_db)):
    """
    Returns real-time preview data for the agent live visualizer.
    Includes: current phase, recent thoughts, web searches performed,
    current model being used, score history, and active tool calls.
    """
    agent = await db.agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(404, "Agent not found")
    
    # Last 20 thoughts
    thoughts = await db.thoughts.find(
        {"agent_id": agent_id},
        sort=[("timestamp", -1)],
        limit=20
    ).to_list(20)
    
    # Score history from snapshots
    snapshots = await db.snapshots.find(
        {"agent_id": agent_id, "status": "committed"},
        sort=[("version", 1)]
    ).to_list(50)
    
    score_history = [
        {"version": s.get("version", 0), "score": s.get("performance_score", 0)}
        for s in snapshots
    ]
    
    return {
        "agent": {
            "id": agent_id,
            "name": agent.get("name", ""),
            "goal": agent.get("goal", ""),
            "status": agent.get("status", "idle"),
            "version": agent.get("version", 0),
            "score": agent.get("current_score", 0),
        },
        "thoughts": [
            {
                "timestamp": str(t.get("timestamp", "")),
                "message": t.get("message", ""),
                "phase": t.get("phase", ""),
                "model_used": t.get("model_used", ""),
            }
            for t in reversed(thoughts)
        ],
        "score_history": score_history,
        "current_phase": agent.get("current_phase", "idle"),
        "evolving": agent.get("status") == "evolving",
    }


# ── Conversational Rule Management Endpoints ─────────────────────────────────

class AddRuleRequest(BaseModel):
    rule: str = Field(..., min_length=1, max_length=5000)
    category: str = "behavior"
    priority: str = "medium"


class UpdateRuleRequest(BaseModel):
    rule: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


@router.get("/{agent_id}/rules")
async def get_agent_rules(agent_id: str):
    """Retrieve all rules learned or manually added for an agent."""
    db = get_db()
    agent = await db.agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    rules = agent.get("learned_rules", [])
    return {"rules": rules, "count": len(rules)}


@router.post("/{agent_id}/rules")
async def add_agent_rule(agent_id: str, req: AddRuleRequest):
    """Manually add an evolutionary rule for an agent."""
    import uuid
    db = get_db()
    agent = await db.agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    new_rule = {
        "id": str(uuid.uuid4()),
        "rule": req.rule,
        "category": req.category,
        "priority": req.priority,
        "source_message": "Manually entered by user",
        "extracted_at": datetime.now(),
        "applied_cycles": 0,
        "status": "pending"
    }
    
    await db.agents.update_one(
        {"id": agent_id},
        {"$push": {"learned_rules": new_rule}}
    )
    
    return {"status": "success", "rule": new_rule}


@router.patch("/{agent_id}/rules/{rule_id}")
async def update_agent_rule(agent_id: str, rule_id: str, req: UpdateRuleRequest):
    """Modify an existing rule's text, category, priority, or status."""
    db = get_db()
    agent = await db.agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    rules = agent.get("learned_rules", [])
    rule_found = False
    
    for r in rules:
        if r.get("id") == rule_id:
            rule_found = True
            if req.rule is not None:
                r["rule"] = req.rule
            if req.category is not None:
                r["category"] = req.category
            if req.priority is not None:
                r["priority"] = req.priority
            if req.status is not None:
                r["status"] = req.status
            break
            
    if not rule_found:
        raise HTTPException(status_code=404, detail="Rule not found")
        
    await db.agents.update_one(
        {"id": agent_id},
        {"$set": {"learned_rules": rules}}
    )
    
    return {"status": "success"}


@router.delete("/{agent_id}/rules/{rule_id}")
async def delete_agent_rule(agent_id: str, rule_id: str):
    """Delete a learned rule from the agent."""
    db = get_db()
    agent = await db.agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    rules = agent.get("learned_rules", [])
    updated_rules = [r for r in rules if r.get("id") != rule_id]
    
    if len(rules) == len(updated_rules):
        raise HTTPException(status_code=404, detail="Rule not found")
        
    await db.agents.update_one(
        {"id": agent_id},
        {"$set": {"learned_rules": updated_rules}}
    )
    
    return {"status": "success"}
