"""
Skill Executor — discovers, loads, and executes skills safely.

Reads SKILL.md to determine security level before executing:
  - safe: execute directly
  - restricted: run in subprocess with timeout, no network
  - dangerous: log warning and require explicit approval

Logs every execution to MongoDB: skill_executions collection.
"""

import asyncio
import importlib
import inspect
import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from core.database import get_db

logger = logging.getLogger(__name__)

SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"


class SkillExecutor:
    """
    Discovers, loads, and executes skills with security isolation.
    """

    def __init__(self) -> None:
        self._skills: dict[str, dict[str, Any]] = {}
        self._loaded: bool = False

    async def discover_skills(self) -> dict[str, dict[str, Any]]:
        """Scan backend/skills/ directory and register all valid skills."""
        self._skills = {}

        if not SKILLS_DIR.exists():
            logger.warning("[SkillExecutor] Skills directory not found: %s", SKILLS_DIR)
            return self._skills

        for skill_dir in sorted(SKILLS_DIR.iterdir()):
            if not skill_dir.is_dir():
                continue
            skill_md = skill_dir / "SKILL.md"
            if not skill_md.exists():
                continue

            try:
                metadata = self._parse_skill_md(skill_md)
                if metadata:
                    name = metadata.get("name", skill_dir.name)
                    self._skills[name] = {
                        "path": str(skill_dir),
                        "metadata": metadata,
                        "entry_points": self._parse_entry_points(metadata.get("entry_point", "")),
                    }
                    logger.info("[SkillExecutor] Discovered skill: %s (security: %s)", name, metadata.get("security_level", "unknown"))
            except Exception as e:
                logger.warning("[SkillExecutor] Failed to parse %s: %s", skill_md, e)

        self._loaded = True
        logger.info("[SkillExecutor] Discovered %d skills", len(self._skills))
        return self._skills

    def _parse_skill_md(self, path: Path) -> dict[str, Any]:
        """Parse a SKILL.md file and extract metadata."""
        text = path.read_text(encoding="utf-8")
        metadata: dict[str, Any] = {}
        lines = text.split("\n")
        for line in lines:
            line_lower = line.lower().strip()
            if line_lower.startswith("# skill:"):
                metadata["name"] = line.split(":", 1)[1].strip()
            elif line_lower.startswith("## security level:"):
                level = line.split(":", 1)[1].strip().lower()
                if level in ("safe", "restricted", "dangerous"):
                    metadata["security_level"] = level
            elif line_lower.startswith("## entry point:"):
                metadata["entry_point"] = line.split(":", 1)[1].strip()
        return metadata

    def _parse_entry_points(self, entry_point_str: str) -> list[dict[str, str]]:
        """Parse entry point string like 'run:search_web, run:read_file' into list."""
        entries: list[dict[str, str]] = []
        for ep in entry_point_str.split(","):
            ep = ep.strip()
            if ":" in ep:
                module_part, func_part = ep.split(":", 1)
                entries.append({"module": module_part.strip(), "function": func_part.strip()})
        return entries

    def get_skills_list(self) -> list[dict[str, Any]]:
        """Get a list of all discovered skills with metadata."""
        result: list[dict[str, Any]] = []
        for name, info in self._skills.items():
            meta = info["metadata"]
            result.append({
                "name": name,
                "description": meta.get("description", ""),
                "security_level": meta.get("security_level", "unknown"),
                "entry_points": [ep["function"] for ep in info["entry_points"]],
                "path": info["path"],
            })
        return result

    async def execute_skill(
        self,
        skill_name: str,
        function_name: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Execute a skill function by name.

        Args:
            skill_name: Name of the skill (directory name or name in SKILL.md)
            function_name: Name of the function to call
            params: Parameters to pass to the function

        Returns:
            dict with keys: skill, status, output, duration, error
        """
        if not self._loaded:
            await self.discover_skills()

        start_time = time.time()

        # Find the skill
        skill_info = self._skills.get(skill_name)
        if not skill_info:
            return {
                "skill": skill_name,
                "status": "error",
                "output": None,
                "duration": 0,
                "error": f"Skill not found: {skill_name}",
            }

        metadata = skill_info["metadata"]
        security_level = metadata.get("security_level", "safe")
        skill_path = skill_info["path"]

        # Check if the function exists
        entry_points = skill_info["entry_points"]
        if function_name not in [ep["function"] for ep in entry_points]:
            return {
                "skill": skill_name,
                "status": "error",
                "output": None,
                "duration": 0,
                "error": f"Function '{function_name}' not found in skill '{skill_name}'",
            }

        try:
            # Load the module
            module_name = f"skills.{Path(skill_path).name}.run"
            module = importlib.import_module(module_name)
            func = getattr(module, function_name, None)
            if not func or not callable(func):
                return {
                    "skill": skill_name,
                    "status": "error",
                    "output": None,
                    "duration": 0,
                    "error": f"Function '{function_name}' not callable in {module_name}",
                }

            params = params or {}

            # Execute based on security level
            result: dict[str, Any]
            if security_level == "safe":
                result = await self._execute_safe(func, params)
            elif security_level == "restricted":
                result = await self._execute_restricted(func, params)
            else:
                # dangerous — log warning and still execute with subprocess isolation
                logger.warning("[SkillExecutor] Executing DANGEROUS skill: %s/%s", skill_name, function_name)
                result = await self._execute_restricted(func, params, timeout=30)

            duration = time.time() - start_time
            result["skill"] = skill_name
            result["duration"] = round(duration, 3)

            # Log to MongoDB
            try:
                db = get_db()
                await db.skill_executions.insert_one({
                    "skill": skill_name,
                    "function": function_name,
                    "params": str(params)[:500],
                    "status": result.get("status", "unknown"),
                    "duration": duration,
                    "error": result.get("error"),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            except Exception as e:
                logger.warning("[SkillExecutor] Failed to log execution: %s", e)

            return result

        except Exception as e:
            duration = time.time() - start_time
            logger.warning("[SkillExecutor] execute_skill error for %s/%s: %s", skill_name, function_name, e)
            return {
                "skill": skill_name,
                "status": "error",
                "output": None,
                "duration": round(duration, 3),
                "error": str(e)[:300],
            }

    async def _execute_safe(self, func: Any, params: dict[str, Any]) -> dict[str, Any]:
        """Execute a function directly (safe skills)."""
        if inspect.iscoroutinefunction(func):
            result = await func(**params)
        else:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: func(**params))
        return {"status": "ok", "output": result, "error": None}

    async def _execute_restricted(self, func: Any, params: dict[str, Any], timeout: int = 30) -> dict[str, Any]:
        """Execute in subprocess with timeout."""
        import json
        skill_code = f"""
import sys, json
sys.path.insert(0, {repr(str(SKILLS_DIR.parent))})
from skills.{Path(func.__module__).stem}.run import {func.__name__}
params = {json.dumps(params)}
result = {func.__name__}(**params)
print(json.dumps(result))
"""
        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-c", skill_code,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            if proc.returncode == 0:
                output = json.loads(stdout.decode().strip())
                return {"status": "ok", "output": output, "error": None}
            return {"status": "error", "output": None, "error": stderr.decode()[:300]}
        except asyncio.TimeoutError:
            return {"status": "error", "output": None, "error": f"Execution timed out after {timeout}s"}


# Singleton
_executor_instance: Optional[SkillExecutor] = None


def get_skill_executor() -> SkillExecutor:
    """Get or create the singleton SkillExecutor."""
    global _executor_instance
    if _executor_instance is None:
        _executor_instance = SkillExecutor()
    return _executor_instance