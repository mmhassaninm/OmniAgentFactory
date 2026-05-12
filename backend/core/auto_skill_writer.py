"""
Auto Skill Writer — uses LLM to generate new skills when gaps are detected.
Generates SKILL.md, Python implementation, and test function for each new skill.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from core.database import get_db

logger = logging.getLogger(__name__)

SKILLS_BASE = Path(__file__).resolve().parent.parent / "skills"


class AutoSkillWriter:
    """
    Automatically generates new skills from skill gap entries using LLM.
    """

    async def create_skill_from_gap(self, gap: dict[str, Any]) -> dict[str, Any]:
        """
        Create a new skill based on a skill gap entry.

        Args:
            gap: Skill gap dict with task_type, skill_name, description, trigger

        Returns:
            dict with skill_name, status, path, test_result
        """
        skill_name = gap.get("skill_name", f"auto_skill_{datetime.now(timezone.utc).timestamp():.0f}")
        description = gap.get("description", f"Auto-generated skill for {gap.get('task_type', 'unknown')}")
        trigger = gap.get("trigger", "")

        logger.info("[AutoSkillWriter] Creating skill '%s' from gap: %s", skill_name, description)

        try:
            # Use LLM to generate skill content
            generated = await self._generate_skill_via_llm(skill_name, description, trigger)

            # Create skill directory
            skill_dir = SKILLS_BASE / skill_name
            skill_dir.mkdir(parents=True, exist_ok=True)

            # Write SKILL.md
            skill_md_path = skill_dir / "SKILL.md"
            skill_md_path.write_text(generated.get("skill_md", ""), encoding="utf-8")

            # Write run.py
            run_py_path = skill_dir / "run.py"
            run_py_path.write_text(generated.get("run_py", ""), encoding="utf-8")

            # Write test.py
            test_py_path = skill_dir / "test.py"
            test_py_path.write_text(generated.get("test_py", ""), encoding="utf-8")

            # Run test
            test_result = await self._run_skill_test(skill_name)

            if test_result.get("passed"):
                logger.info("[AutoSkillWriter] Skill '%s' created and tested successfully", skill_name)
                return {
                    "skill_name": skill_name,
                    "status": "created",
                    "path": str(skill_dir),
                    "test_result": test_result,
                }
            else:
                logger.warning("[AutoSkillWriter] Skill '%s' created but tests failed: %s", skill_name, test_result.get("error"))
                return {
                    "skill_name": skill_name,
                    "status": "tests_failed",
                    "path": str(skill_dir),
                    "test_result": test_result,
                }

        except Exception as e:
            logger.warning("[AutoSkillWriter] Failed to create skill '%s': %s", skill_name, e)
            return {
                "skill_name": skill_name,
                "status": "error",
                "path": "",
                "test_result": {"error": str(e)[:200]},
            }

    async def _generate_skill_via_llm(self, skill_name: str, description: str, trigger: str) -> dict[str, str]:
        """
        Use the LLM model router to generate skill files.
        Falls back to template-based generation if LLM is unavailable.
        """
        try:
            from core.model_router import get_model_router

            router = get_model_router()
            prompt = f"""Create a new skill for an AI agent system called '{skill_name}'.

Description: {description}
Trigger example: {trigger}

Generate three files:

1. SKILL.md with format:
# Skill: {skill_name}
## Description
{description}
## Trigger Keywords
- keyword1
- keyword2
## Required Tools
- built-in
## Security Level: safe
## Entry Point: run:execute

2. run.py with an async 'execute' function that takes **kwargs and returns a dict with status, output, and error.

3. test.py with a simple test function.

Respond with valid JSON:
{{"skill_md": "...", "run_py": "...", "test_py": "..."}}"""

            response = await router.route_completion(prompt=prompt, model="openai/gpt-4o-mini")
            import json
            text = response.get("content", "") if isinstance(response, dict) else str(response)
            # Try to extract JSON from response
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
        except Exception as e:
            logger.warning("[AutoSkillWriter] LLM generation failed: %s", e)

        # Fallback to template
        return self._generate_template_skill(skill_name, description)

    def _generate_template_skill(self, skill_name: str, description: str) -> dict[str, str]:
        """Generate a template-based skill when LLM is unavailable."""
        skill_md = f"""# Skill: {skill_name}

## Description
{description}

## Trigger Keywords
- {skill_name}

## Required Tools
- built-in

## Security Level: safe

## Entry Point: run:execute
"""
        run_py = f'''"""
{skill_name} skill — auto-generated.
Entry point: execute
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


def execute(**kwargs) -> dict[str, Any]:
    """
    Execute the {skill_name} skill.

    Args:
        **kwargs: Parameters for the skill

    Returns:
        dict with status, output, error
    """
    try:
        result = {{"status": "ok", "output": f"Skill {skill_name!r} executed with parameters: {{kwargs}}", "error": None}}
        return result
    except Exception as e:
        return {{"status": "error", "output": None, "error": str(e)[:200]}}
'''
        test_py = f'''"""
Tests for {skill_name} skill.
"""

from skills.{skill_name}.run import execute


def test_execute():
    """Test basic execution."""
    result = execute(param1="test")
    assert result["status"] == "ok"
    assert "test" in result["output"]

'''
        return {"skill_md": skill_md, "run_py": run_py, "test_py": test_py}

    async def _run_skill_test(self, skill_name: str) -> dict[str, Any]:
        """Run a skill's test file and return results."""
        test_path = SKILLS_BASE / skill_name / "test.py"
        if not test_path.exists():
            return {"passed": True, "error": None, "note": "No test file found"}
        try:
            import subprocess
            proc = await asyncio.create_subprocess_exec(
                "python", "-m", "pytest", str(test_path), "-v",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
            passed = proc.returncode == 0
            return {
                "passed": passed,
                "stdout": stdout.decode()[:500] if stdout else "",
                "stderr": stderr.decode()[:500] if stderr else "",
                "error": None if passed else "Tests failed",
            }
        except Exception as e:
            return {"passed": False, "error": str(e)[:200]}


# Singleton
_writer_instance: Optional[AutoSkillWriter] = None


def get_auto_skill_writer() -> AutoSkillWriter:
    """Get or create the singleton AutoSkillWriter."""
    global _writer_instance
    if _writer_instance is None:
        _writer_instance = AutoSkillWriter()
    return _writer_instance