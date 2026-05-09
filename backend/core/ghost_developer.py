"""
GhostDeveloper: An agent that reads OmniBot's own source code
and autonomously improves it. The factory repairs and upgrades itself.
"""
import os
from pathlib import Path
import json

from core.model_router import call_model
from utils.thought_logger import log_thought


class GhostDeveloper:
    WATCHED_FILES = [
        "backend/core/evolve_engine.py",
        "backend/core/model_router.py",
        "backend/core/swarm/orchestrator.py",
        "backend/core/hivemind.py",
        "backend/core/revenue_engine.py",
    ]

    async def analyze_codebase(self) -> str:
        """Read key files and identify improvement opportunities."""
        code_snapshot = ""
        for filepath in self.WATCHED_FILES:
            if Path(filepath).exists():
                content = Path(filepath).read_text(encoding="utf-8")[:3000]
                code_snapshot += f"\n\n### {filepath}\n{content}"
        return code_snapshot

    async def identify_improvements(self, code: str) -> list[dict]:
        """Ask the LLM what should be improved in the codebase."""
        prompt = f"""
        You are reviewing this AI agent factory's source code.
        
        {code}
        
        Identify the top 3 specific improvements that would:
        1. Make agents more effective
        2. Reduce failures
        3. Increase revenue generation
        
        For each improvement:
        - file: which file to change
        - current_problem: what's wrong now
        - proposed_fix: exact code change (Python)
        - impact: HIGH/MEDIUM/LOW
        
        Return JSON array only.
        """
        response = await call_model(prompt, task_type="code")
        return self.parse_json(response)

    async def apply_improvement(self, improvement: dict) -> bool:
        """Apply a code improvement to the actual codebase."""
        filepath = improvement.get("file", "")
        fix = improvement.get("proposed_fix", "")

        if not filepath or not fix or not Path(filepath).exists():
            return False

        await log_thought(
            "ghost_developer",
            f"[GHOST] Applying improvement to {filepath}: {improvement.get('current_problem', '')[:100]}",
        )

        staging_path = f"{filepath}.ghost_improvement.py"
        Path(staging_path).write_text(fix, encoding="utf-8")

        try:
            compile(fix, staging_path, "exec")
            Path(filepath).write_text(fix, encoding="utf-8")
            Path(staging_path).unlink()
            return True
        except SyntaxError:
            Path(staging_path).unlink()
            return False

    async def run_improvement_cycle(self):
        """One complete ghost developer cycle."""
        code = await self.analyze_codebase()
        improvements = await self.identify_improvements(code)

        applied = 0
        if not isinstance(improvements, list):
            return 0

        for imp in improvements:
            if imp.get("impact") == "HIGH":
                success = await self.apply_improvement(imp)
                if success:
                    applied += 1

        return applied

    def parse_json(self, text: str) -> list[dict]:
        text = text.strip()
        if text.startswith("```"):
            text = text.strip("`")
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                return [data]
        except json.JSONDecodeError:
            pass
        return []
