"""
OmniBot — Skill Library (System 7)

A growing collection of reusable Python functions discovered by agents.
When an agent evolution produces a useful new capability, it's extracted
and made available to all future agents.
"""

import ast
import logging
from datetime import datetime
from typing import List, Optional

from core.database import get_db

logger = logging.getLogger(__name__)


class SkillLibrary:
    """
    Manages reusable skills discovered during agent evolution.
    Skills are stored in MongoDB and available to all agents at creation time.
    """

    async def extract_skill(
        self,
        code: str,
        description: str,
        agent_id: str,
    ) -> List[dict]:
        """
        Parse agent code and extract standalone functions as skills.
        Returns list of extracted skill dicts.
        """
        extracted = []
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    # Skip the main 'execute' function
                    if node.name == "execute":
                        continue

                    # Extract function source
                    func_code = ast.get_source_segment(code, node)
                    if not func_code:
                        continue

                    # Get docstring if present
                    docstring = ast.get_docstring(node) or ""

                    skill = {
                        "name": node.name,
                        "code": func_code,
                        "description": docstring or description,
                        "is_async": isinstance(node, ast.AsyncFunctionDef),
                        "args": [arg.arg for arg in node.args.args],
                        "source_agent_id": agent_id,
                    }
                    extracted.append(skill)

        except SyntaxError as e:
            logger.warning("Failed to parse agent code for skill extraction: %s", e)

        return extracted

    async def register_skill(
        self,
        name: str,
        code: str,
        description: str,
        agent_id: str,
        success_rate: float = 1.0,
    ) -> bool:
        """Register a new skill or update an existing one."""
        db = get_db()

        try:
            await db.skills.update_one(
                {"name": name},
                {
                    "$set": {
                        "name": name,
                        "code": code,
                        "description": description,
                        "success_rate": success_rate,
                        "updated_at": datetime.now(),
                    },
                    "$addToSet": {"used_by": agent_id},
                    "$setOnInsert": {
                        "created_at": datetime.now(),
                    },
                },
                upsert=True,
            )
            logger.info("Skill registered: %s (from agent %s)", name, agent_id)
            return True
        except Exception as e:
            logger.error("Failed to register skill %s: %s", name, e)
            return False

    async def get_available_skills(self) -> List[dict]:
        """List all available skills with metadata."""
        db = get_db()
        skills = []
        async for skill in db.skills.find({}).sort("name", 1):
            skill["_id"] = str(skill["_id"])
            skills.append(skill)
        return skills

    async def get_skill(self, name: str) -> Optional[dict]:
        """Retrieve a specific skill by name."""
        db = get_db()
        skill = await db.skills.find_one({"name": name})
        if skill:
            skill["_id"] = str(skill["_id"])
        return skill

    async def get_skills_for_agent(self) -> str:
        """
        Get a formatted string of available skills for injection into agent prompts.
        Used when creating new agents.
        """
        skills = await self.get_available_skills()
        if not skills:
            return "No shared skills available yet."

        lines = ["Available shared skills:"]
        for skill in skills:
            lines.append(
                f"  - {skill['name']}: {skill.get('description', 'No description')[:80]} "
                f"(success rate: {skill.get('success_rate', 0):.0%})"
            )
        return "\n".join(lines)

    async def update_success_rate(self, name: str, success: bool):
        """Update a skill's success rate based on usage feedback."""
        db = get_db()
        skill = await db.skills.find_one({"name": name})
        if not skill:
            return

        current_rate = skill.get("success_rate", 1.0)
        # Exponential moving average
        new_rate = current_rate * 0.9 + (1.0 if success else 0.0) * 0.1

        await db.skills.update_one(
            {"name": name},
            {"$set": {"success_rate": new_rate, "updated_at": datetime.now()}},
        )

    async def delete_skill(self, name: str) -> bool:
        """Delete a skill."""
        db = get_db()
        result = await db.skills.delete_one({"name": name})
        return result.deleted_count > 0


# ── Singleton ───────────────────────────────────────────────────────────────

_library: Optional[SkillLibrary] = None


def get_skill_library() -> SkillLibrary:
    global _library
    if _library is None:
        _library = SkillLibrary()
    return _library
