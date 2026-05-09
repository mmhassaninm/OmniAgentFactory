"""
OmniBot — Agent Factory (System 6)

Creates, manages, and catalogs agents.
Includes auto-catalog generation.
"""

import uuid
import logging
from datetime import datetime
from typing import List, Optional

from agents.base_agent import BaseAgent, AgentStatus
from core.config import get_settings
from core.model_router import call_model
from core.database import get_db
from core.dna_engine import DEFAULT_DNA
from utils.thought_logger import log_thought

logger = logging.getLogger(__name__)


# ── Agent Templates ─────────────────────────────────────────────────────────

AGENT_TEMPLATES = {
    "general": {
        "description": "General-purpose agent",
        "code": '''async def execute(input_data):
    """General-purpose agent — processes input and returns a result."""
    if input_data is None:
        return "Ready to work. Please provide input."
    return f"Processed: {input_data}"
''',
        "test_cases": [
            {"input": "hello", "expected": "Processed: hello", "weight": 1.0},
            {"input": None, "expected": "Ready to work. Please provide input.", "weight": 0.5},
        ],
    },
    "code": {
        "description": "Code generation and analysis agent",
        "code": '''async def execute(input_data):
    """Code agent — generates or analyzes code based on input."""
    if not input_data:
        return "Please provide a code task description."
    
    task = str(input_data).lower()
    if "python" in task or "function" in task:
        return f"# Code solution for: {input_data}\\ndef solution():\\n    pass  # TODO: implement"
    return f"Code analysis: {input_data}"
''',
        "test_cases": [
            {"input": "write a python function", "weight": 1.0},
            {"input": None, "expected": "Please provide a code task description.", "weight": 0.5},
        ],
    },
    "research": {
        "description": "Web research and information gathering agent",
        "code": '''async def execute(input_data):
    """Research agent — gathers and synthesizes information."""
    if not input_data:
        return "Please provide a research topic."
    return f"Research findings for: {input_data}\\n- Finding 1: Initial analysis complete\\n- Finding 2: Further research needed"
''',
        "test_cases": [
            {"input": "AI trends 2026", "weight": 1.0},
            {"input": None, "expected": "Please provide a research topic.", "weight": 0.5},
        ],
    },
}


# ── Agent Factory ───────────────────────────────────────────────────────────

class AgentFactory:
    """
    Creates, manages, and catalogs agents.
    Central control point for the OmniBot factory.
    """

    async def create_agent(
        self,
        name: str,
        goal: str,
        template: str = "general",
        config: Optional[dict] = None,
    ) -> BaseAgent:
        """Create a new agent from a template and store in MongoDB."""
        db = get_db()
        settings = get_settings()

        # Get template
        tmpl = AGENT_TEMPLATES.get(template, AGENT_TEMPLATES["general"])

        agent = BaseAgent(
            name=name,
            goal=goal,
            agent_code=tmpl["code"],
            test_cases=tmpl["test_cases"],
            config=config or {},
            evolve_interval_seconds=settings.default_evolve_interval,
        )

        # Store in MongoDB — stamp with DEFAULT_DNA so the evolution engine can read it
        agent_doc = agent.to_dict()
        agent_doc["dna"] = config.get("dna", DEFAULT_DNA) if config else DEFAULT_DNA
        await db.agents.insert_one(agent_doc)

        await log_thought(
            agent.agent_id,
            f"Agent '{name}' created from template '{template}' with goal: {goal}",
            phase="general",
        )

        # Register in genealogy tree (no parent for freshly created agents)
        try:
            from core.genealogy import register_agent_birth
            bred_from = (config or {}).get("bred_from")
            await register_agent_birth(
                db,
                agent_id=agent.agent_id,
                version=0,
                bred_from_agents=bred_from if isinstance(bred_from, list) else None,
            )
        except Exception as e:
            logger.debug("Genealogy registration failed: %s", e)

        # Generate initial catalog
        try:
            await self.generate_catalog(agent.agent_id)
        except Exception as e:
            logger.warning("Initial catalog generation failed: %s", e)

        logger.info("Created agent: %s (id=%s, template=%s)", name, agent.agent_id, template)
        return agent

    async def list_agents(self) -> List[dict]:
        """List all agents with their current status."""
        db = get_db()
        agents = []
        async for doc in db.agents.find({}).sort("created_at", -1):
            doc["_id"] = str(doc["_id"])
            agents.append(doc)
        return agents

    async def get_agent(self, agent_id: str) -> Optional[dict]:
        """Get a single agent by ID."""
        db = get_db()
        doc = await db.agents.find_one({"id": agent_id})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def update_agent(self, agent_id: str, updates: dict) -> bool:
        """Update agent configuration."""
        db = get_db()
        updates["updated_at"] = datetime.utcnow()
        result = await db.agents.update_one({"id": agent_id}, {"$set": updates})
        return result.modified_count > 0

    async def delete_agent(self, agent_id: str) -> bool:
        """Delete an agent and all associated data."""
        db = get_db()

        # Stop evolution if running
        from core.evolve_engine import get_evolution_manager
        manager = get_evolution_manager()
        if agent_id in manager._tasks:
            from core.evolve_engine import StopMode
            await manager.stop_evolution(agent_id, StopMode.HARD_STOP)

        # Delete from all collections
        await db.agents.delete_one({"id": agent_id})
        await db.snapshots.delete_many({"agent_id": agent_id})
        await db.thoughts.delete_many({"agent_id": agent_id})
        await db.economy.delete_one({"agent_id": agent_id})

        logger.info("Deleted agent: %s", agent_id)
        return True

    async def generate_catalog(self, agent_id: str) -> dict:
        """
        Auto-generate a catalog document for an agent using LLM.
        Called on creation and every 5th committed evolution.
        """
        db = get_db()
        agent_doc = await db.agents.find_one({"id": agent_id})
        if not agent_doc:
            return {}

        # Get version history
        from core.checkpoint import get_version_history
        versions = await get_version_history(agent_id, limit=5)

        # Build catalog prompt
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a technical documentation writer. Generate a structured catalog "
                    "document for an AI agent. Be concise and precise. Use plain language. "
                    "Return the catalog as a JSON object with these keys: "
                    "summary, how_it_works, tools_used, input_description, output_description, "
                    "performance_notes, known_limitations."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Agent Name: {agent_doc.get('name')}\n"
                    f"Goal: {agent_doc.get('goal')}\n"
                    f"Version: v{agent_doc.get('version', 0)}\n"
                    f"Score: {agent_doc.get('score', 0):.2f}\n"
                    f"Code:\n{agent_doc.get('agent_code', 'N/A')}\n"
                    f"Config: {agent_doc.get('config', {})}\n"
                    f"\nVersion history:\n"
                    + "\n".join(
                        f"  v{v.get('version')}: {v.get('commit_message', 'N/A')} (score: {v.get('performance_score', 0):.2f})"
                        for v in versions
                    )
                ),
            },
        ]

        try:
            catalog_text = await call_model(messages, task_type="general", agent_id=agent_id)

            catalog = {
                "agent_id": agent_id,
                "agent_name": agent_doc.get("name"),
                "goal": agent_doc.get("goal"),
                "catalog_text": catalog_text,
                "version": agent_doc.get("version", 0),
                "score": agent_doc.get("score", 0),
                "generated_at": datetime.utcnow(),
                "version_history": [
                    {
                        "version": v.get("version"),
                        "message": v.get("commit_message"),
                        "score": v.get("performance_score", 0),
                    }
                    for v in versions
                ],
            }

            # Upsert catalog
            await db.agents.update_one(
                {"id": agent_id},
                {"$set": {"catalog": catalog}},
            )

            await log_thought(agent_id, f"Catalog generated for v{agent_doc.get('version', 0)}", phase="general")
            return catalog

        except Exception as e:
            logger.error("Catalog generation failed for %s: %s", agent_id, e)
            return {}


# ── Singleton ───────────────────────────────────────────────────────────────

_factory: Optional[AgentFactory] = None


def get_agent_factory() -> AgentFactory:
    global _factory
    if _factory is None:
        _factory = AgentFactory()
    return _factory
