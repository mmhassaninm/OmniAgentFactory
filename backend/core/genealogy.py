"""
OmniBot — Agent Genealogy Tree (Phase 3)

Every agent has parents (the versions it evolved from) and potentially children.
Tracks evolutionary lineages to reveal which bloodlines produce the strongest agents.

MongoDB collection: agent_genealogy
{
  agent_id, version, parent_agent_id, parent_version,
  bred_from_agents[], generation, created_at, score_at_creation
}
"""

import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


async def register_agent_birth(
    db,
    agent_id: str,
    version: int = 0,
    parent_agent_id: Optional[str] = None,
    parent_version: Optional[int] = None,
    bred_from_agents: Optional[list] = None,
    score_at_creation: float = 0.0,
) -> dict:
    """
    Register a new agent (or new version) in the genealogy tree.
    Called when an agent is created or when it reaches a new version.
    """
    # Determine generation
    generation = 0
    if parent_agent_id:
        parent_record = await db.agent_genealogy.find_one({"agent_id": parent_agent_id})
        if parent_record:
            generation = parent_record.get("generation", 0) + 1
    elif bred_from_agents:
        # Bred agent: generation = max(parent generations) + 1
        parent_gens = []
        for pid in bred_from_agents:
            rec = await db.agent_genealogy.find_one({"agent_id": pid})
            if rec:
                parent_gens.append(rec.get("generation", 0))
        generation = (max(parent_gens) + 1) if parent_gens else 1

    doc = {
        "agent_id": agent_id,
        "version": version,
        "parent_agent_id": parent_agent_id,
        "parent_version": parent_version,
        "bred_from_agents": bred_from_agents or [],
        "generation": generation,
        "created_at": datetime.now(),
        "score_at_creation": score_at_creation,
        "children": [],
    }

    # Upsert so re-registration (new version) updates without duplicate
    await db.agent_genealogy.update_one(
        {"agent_id": agent_id},
        {"$set": doc},
        upsert=True,
    )

    # Register this agent as a child of its parent
    if parent_agent_id:
        await db.agent_genealogy.update_one(
            {"agent_id": parent_agent_id},
            {"$addToSet": {"children": agent_id}},
        )
    for pid in (bred_from_agents or []):
        await db.agent_genealogy.update_one(
            {"agent_id": pid},
            {"$addToSet": {"children": agent_id}},
        )

    logger.debug("[GENEALOGY] Registered agent %s (gen=%d, parent=%s)", agent_id[:8], generation, str(parent_agent_id)[:8] if parent_agent_id else "none")
    return doc


async def get_full_tree(db) -> dict:
    """
    Return the complete genealogy tree as a flat list of records plus tree structure.
    Also computes bloodline stats.
    """
    records = await db.agent_genealogy.find({}).to_list(500)

    # Build agent name lookup
    agent_names = {}
    async for agent in db.agents.find({}, {"id": 1, "name": 1, "score": 1, "status": 1}):
        agent_names[agent.get("id", "")] = {
            "name": agent.get("name", "?"),
            "score": agent.get("score", 0.0),
            "status": agent.get("status", "idle"),
        }

    # Augment records with names
    enriched = []
    for r in records:
        r.pop("_id", None)
        aid = r.get("agent_id", "")
        info = agent_names.get(aid, {})
        r["name"] = info.get("name", "?")
        r["current_score"] = info.get("score", 0.0)
        r["status"] = info.get("status", "idle")
        enriched.append(r)

    # Find roots (no parent)
    roots = [r for r in enriched if not r.get("parent_agent_id") and not r.get("bred_from_agents")]

    # Bloodline stats: for each root, sum descendant scores
    bloodline_stats = []
    for root in roots:
        descendants = await _get_descendants(db, root["agent_id"])
        desc_scores = [agent_names.get(d, {}).get("score", 0.0) for d in descendants]
        bloodline_stats.append({
            "root_agent_id": root["agent_id"],
            "root_name": root["name"],
            "descendants": len(descendants),
            "avg_descendant_score": round(sum(desc_scores) / len(desc_scores), 4) if desc_scores else 0.0,
            "max_descendant_score": round(max(desc_scores), 4) if desc_scores else 0.0,
        })

    bloodline_stats.sort(key=lambda x: x["avg_descendant_score"], reverse=True)

    return {
        "nodes": enriched,
        "roots": [r["agent_id"] for r in roots],
        "bloodline_stats": bloodline_stats,
        "total_agents": len(enriched),
        "max_generation": max((r.get("generation", 0) for r in enriched), default=0),
    }


async def get_agent_ancestry(db, agent_id: str) -> dict:
    """
    Return the ancestry chain for a single agent (parents, grandparents, etc.)
    plus its children and their scores.
    """
    record = await db.agent_genealogy.find_one({"agent_id": agent_id})
    if not record:
        return {}

    record.pop("_id", None)

    # Walk upward to build ancestry chain
    ancestry = []
    current_id = record.get("parent_agent_id")
    depth = 0
    while current_id and depth < 10:
        ancestor = await db.agent_genealogy.find_one({"agent_id": current_id})
        if not ancestor:
            break
        ancestor.pop("_id", None)
        agent_info = await db.agents.find_one({"id": current_id}, {"name": 1, "score": 1})
        if agent_info:
            ancestor["name"] = agent_info.get("name", "?")
            ancestor["current_score"] = agent_info.get("score", 0.0)
        ancestry.append(ancestor)
        current_id = ancestor.get("parent_agent_id")
        depth += 1

    # Get children data
    children_data = []
    for child_id in record.get("children", []):
        child_rec = await db.agent_genealogy.find_one({"agent_id": child_id})
        child_agent = await db.agents.find_one({"id": child_id}, {"name": 1, "score": 1, "status": 1})
        if child_rec and child_agent:
            child_rec.pop("_id", None)
            child_rec["name"] = child_agent.get("name", "?")
            child_rec["current_score"] = child_agent.get("score", 0.0)
            child_rec["status"] = child_agent.get("status", "idle")
            children_data.append(child_rec)

    # Current agent info
    agent_info = await db.agents.find_one({"id": agent_id}, {"name": 1, "score": 1, "status": 1})
    if agent_info:
        record["name"] = agent_info.get("name", "?")
        record["current_score"] = agent_info.get("score", 0.0)
        record["status"] = agent_info.get("status", "idle")

    return {
        "agent": record,
        "ancestry": ancestry,
        "children": children_data,
        "generation": record.get("generation", 0),
    }


async def _get_descendants(db, agent_id: str, visited: set = None) -> list:
    """Recursively collect all descendant agent IDs for a given root."""
    if visited is None:
        visited = set()
    if agent_id in visited:
        return []
    visited.add(agent_id)

    record = await db.agent_genealogy.find_one({"agent_id": agent_id})
    if not record:
        return []

    descendants = []
    for child_id in record.get("children", []):
        if child_id not in visited:
            descendants.append(child_id)
            descendants.extend(await _get_descendants(db, child_id, visited))

    return descendants
