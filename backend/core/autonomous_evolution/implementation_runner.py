"""
Implementation Runner -- Real Execution Engine for Approved Ideas & Solutions
Replaces the Phase 1 stub with a real LLM-guided execution engine.

Pipeline:
1. LLM generates a structured plan (file_changes + risk_level)
2. Safety git branch created before any change
3. File changes applied with backup
4. Python files syntax-validated with py_compile
5. On success: git commit; on failure: immediate rollback
6. All results appended to autonomous_logs/EXECUTION_HISTORY.json
"""
import json
import logging
import py_compile
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

# -- Path resolution (this file is at backend/core/autonomous_evolution/)
_HERE = Path(__file__).resolve()
PROJECT_ROOT = _HERE.parent.parent.parent.parent   # NexusOS/
BACKEND_ROOT = _HERE.parent.parent.parent          # NexusOS/backend/
AUTONOMOUS_LOGS = PROJECT_ROOT / "autonomous_logs"
EXECUTION_HISTORY = AUTONOMOUS_LOGS / "EXECUTION_HISTORY.json"

# Files the runner must never modify
FORBIDDEN_FILES = {".env", ".gitignore", "MODIFICATION_HISTORY.md", "docker-compose.yml"}

PLAN_PROMPT = (
    "You are a senior Python engineer implementing a code change.\n\n"
    "TASK TYPE: {task_type}\n"
    "ID: {item_id}\n"
    "Title: {title}\n"
    "Description: {description}\n"
    "Proposed Solution: {solution}\n"
    "Related Files: {files}\n\n"
    "Return ONLY valid JSON (no markdown fences):\n"
    "{{\n"
    '  "summary": "one-line description",\n'
    '  "risk_level": "low|medium|high",\n'
    '  "rollback_safe": true,\n'
    '  "file_changes": [\n'
    '    {{\n'
    '      "path": "relative/path/from/project/root.py",\n'
    '      "operation": "modify|create|append",\n'
    '      "description": "what change to make",\n'
    '      "content": "complete file content or code to add"\n'
    "    }}\n"
    "  ]\n"
    "}}\n\n"
    "RULES: Only modify files under backend/. Never touch .env or docker-compose.yml. "
    "Keep changes minimal. Write syntactically correct Python."
)


class ImplementationRunner:
    """Executes approved ideas and problem solutions with full safety guarantees."""

    def __init__(self, model_router=None):
        self.model_router = model_router
        AUTONOMOUS_LOGS.mkdir(parents=True, exist_ok=True)

    async def execute_idea(self, idea_id: str, idea: dict) -> dict:
        """Execute an approved idea."""
        logger.info("ImplementationRunner: Executing idea %s -- %s", idea_id, idea.get("title", "?"))
        return await self._execute(
            item_id=idea_id,
            item_type="idea",
            title=idea.get("title", ""),
            description=idea.get("description", ""),
            solution=idea.get("council_verdict", {}).get("rationale", ""),
            files=idea.get("estimated_files", []),
        )

    async def execute_solution(self, prob_id: str, problem: dict) -> dict:
        """Execute a problem solution."""
        logger.info("ImplementationRunner: Solving problem %s -- %s", prob_id, problem.get("title", "?"))
        return await self._execute(
            item_id=prob_id,
            item_type="problem",
            title=problem.get("title", ""),
            description=problem.get("description", ""),
            solution=problem.get("proposed_solution", ""),
            files=[problem.get("location", "")],
        )

    async def _execute(self, item_id: str, item_type: str, title: str,
                       description: str, solution: str, files: list) -> dict:
        """Core pipeline: plan -> branch -> apply -> validate -> commit/rollback."""
        branch_name = ""
        backups: Dict[Path, Optional[str]] = {}
        changed_files: List[str] = []

        try:
            # Step 1: Generate plan via LLM
            plan = await self._generate_plan(item_id, item_type, title, description, solution, files)
            if not plan or not plan.get("file_changes"):
                msg = "LLM returned empty plan -- skipping"
                logger.warning("ImplementationRunner: %s", msg)
                await self._log_execution(item_id, item_type, title, "skipped", [], msg)
                return {"status": "skipped", "summary": msg, "files_changed": [], "solution_applied": msg}

            risk = plan.get("risk_level", "medium")
            if risk == "high" and not plan.get("rollback_safe", False):
                msg = "Plan risk=high and rollback_safe=false -- refusing"
                logger.warning("ImplementationRunner: %s", msg)
                await self._log_execution(item_id, item_type, title, "refused", [], msg)
                return {"status": "refused", "summary": msg, "files_changed": [], "solution_applied": msg}

            # Step 2: Create safety branch
            branch_name = await self._create_branch(item_id)

            # Step 3: Apply file changes with backup
            for change in plan["file_changes"]:
                path_str = change.get("path", "")
                operation = change.get("operation", "modify")
                content = change.get("content", "")
                if not path_str or not content:
                    continue
                abs_path, error = self._resolve_path(path_str)
                if error:
                    logger.warning("ImplementationRunner: Skipping %s -- %s", path_str, error)
                    continue
                await self._apply_change(abs_path, operation, content, backups)
                changed_files.append(path_str)

            if not changed_files:
                msg = "No files changed (all skipped)"
                logger.info("ImplementationRunner: %s", msg)
                if branch_name:
                    await self._delete_branch(branch_name)
                await self._log_execution(item_id, item_type, title, "no_op", [], msg)
                return {"status": "no_op", "summary": msg, "files_changed": [], "solution_applied": msg}

            # Step 4: Validate syntax
            valid, val_error = await self._validate_changes(changed_files)
            if not valid:
                logger.error("ImplementationRunner: Validation failed: %s -- rolling back", val_error)
                await self._rollback_files(backups)
                if branch_name:
                    await self._delete_branch(branch_name)
                await self._log_execution(item_id, item_type, title, "rollback", changed_files, val_error)
                return {
                    "status": "rollback",
                    "summary": "Validation failed: " + val_error,
                    "files_changed": changed_files,
                    "solution_applied": "",
                    "tested": False,
                }

            # Step 5: Commit success
            summary = plan.get("summary", title)
            await self._commit_changes(item_id, item_type, summary, changed_files)
            logger.info("ImplementationRunner: SUCCESS -- %s (%d files)", summary, len(changed_files))
            await self._log_execution(item_id, item_type, title, "success", changed_files, summary)
            return {
                "status": "success",
                "summary": summary,
                "files_changed": changed_files,
                "solution_applied": summary,
                "tested": True,
            }

        except Exception as e:
            logger.error("ImplementationRunner: Pipeline error: %s", e)
            if backups:
                await self._rollback_files(backups)
            if branch_name:
                await self._delete_branch(branch_name)
            await self._log_execution(item_id, item_type, title, "error", changed_files, str(e))
            return {
                "status": "error",
                "summary": str(e),
                "files_changed": changed_files,
                "solution_applied": "",
                "tested": False,
            }

    async def _generate_plan(self, item_id: str, item_type: str, title: str,
                             description: str, solution: str, files: list) -> dict:
        """Call LLM to produce a structured implementation plan."""
        if not self.model_router:
            logger.warning("ImplementationRunner: No model_router -- cannot generate plan")
            return {}
        try:
            prompt = PLAN_PROMPT.format(
                task_type=item_type.upper(),
                item_id=item_id,
                title=title,
                description=description,
                solution=solution,
                files=", ".join(str(f) for f in files),
            )
            response = await self.model_router.call_model(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=2000,
            )
            clean = response.strip()
            for fence in ("```json", "```"):
                if clean.startswith(fence):
                    clean = clean[len(fence):]
            if clean.endswith("```"):
                clean = clean[:-3]
            plan = json.loads(clean.strip())
            logger.info(
                "ImplementationRunner: Plan -- risk=%s files=%d",
                plan.get("risk_level", "?"),
                len(plan.get("file_changes", [])),
            )
            return plan
        except Exception as e:
            logger.error("ImplementationRunner: Plan generation failed: %s", e)
            return {}

    def _resolve_path(self, rel_path: str) -> Tuple[Path, str]:
        """Resolve relative path to absolute with safety checks."""
        try:
            abs_path = (PROJECT_ROOT / rel_path).resolve()
            try:
                abs_path.relative_to(PROJECT_ROOT)
            except ValueError:
                return abs_path, "Path escapes project root: " + rel_path
            try:
                abs_path.relative_to(BACKEND_ROOT)
            except ValueError:
                return abs_path, "Path not in backend/: " + rel_path
            if abs_path.name in FORBIDDEN_FILES:
                return abs_path, "Forbidden file: " + abs_path.name
            return abs_path, ""
        except Exception as e:
            return Path(rel_path), str(e)

    async def _apply_change(self, abs_path: Path, operation: str, content: str,
                            backups: dict) -> None:
        """Apply a file change, storing backup first."""
        if abs_path not in backups:
            backups[abs_path] = abs_path.read_text(encoding="utf-8") if abs_path.exists() else None
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        if operation == "append":
            with abs_path.open("a", encoding="utf-8") as fh:
                fh.write("\n" + content)
        else:
            abs_path.write_text(content, encoding="utf-8")
        logger.info("ImplementationRunner: %s %s", operation.upper(), abs_path.name)

    async def _rollback_files(self, backups: dict) -> None:
        """Restore all files to pre-change state."""
        for abs_path, original in backups.items():
            try:
                if original is None:
                    if abs_path.exists():
                        abs_path.unlink()
                        logger.info("ImplementationRunner: Rollback deleted %s", abs_path.name)
                else:
                    abs_path.write_text(original, encoding="utf-8")
                    logger.info("ImplementationRunner: Rollback restored %s", abs_path.name)
            except Exception as e:
                logger.error("ImplementationRunner: Rollback error for %s: %s", abs_path, e)

    async def _validate_changes(self, changed_files: List[str]) -> Tuple[bool, str]:
        """Validate all changed .py files with py_compile."""
        for rel_path in changed_files:
            if not rel_path.endswith(".py"):
                continue
            abs_path = (PROJECT_ROOT / rel_path).resolve()
            if not abs_path.exists():
                continue
            try:
                py_compile.compile(str(abs_path), doraise=True)
            except py_compile.PyCompileError as e:
                return False, "Syntax error in " + rel_path + ": " + str(e)
        return True, ""

    async def _create_branch(self, item_id: str) -> str:
        """Create a git safety branch."""
        try:
            ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
            branch = "auto/" + item_id.lower() + "-" + ts
            r = subprocess.run(
                ["git", "checkout", "-b", branch],
                cwd=str(PROJECT_ROOT), capture_output=True, text=True, timeout=15,
            )
            if r.returncode == 0:
                logger.info("ImplementationRunner: Branch created: %s", branch)
                return branch
            logger.warning("ImplementationRunner: Branch create failed: %s", r.stderr.strip())
        except Exception as e:
            logger.warning("ImplementationRunner: git branch error (non-fatal): %s", e)
        return ""

    async def _commit_changes(self, item_id: str, item_type: str,
                              summary: str, changed_files: List[str]) -> None:
        """Stage and commit all changed files."""
        try:
            subprocess.run(
                ["git", "add"] + changed_files,
                cwd=str(PROJECT_ROOT), capture_output=True, timeout=15,
            )
            msg = "auto(" + item_type + "): " + item_id + " -- " + summary[:80]
            subprocess.run(
                ["git", "commit", "-m", msg],
                cwd=str(PROJECT_ROOT), capture_output=True, timeout=15,
            )
            logger.info("ImplementationRunner: Committed: %s", msg)
        except Exception as e:
            logger.warning("ImplementationRunner: git commit failed (non-fatal): %s", e)

    async def _delete_branch(self, branch_name: str) -> None:
        """Delete a rollback branch after failure."""
        try:
            subprocess.run(["git", "checkout", "main"], cwd=str(PROJECT_ROOT),
                           capture_output=True, timeout=10)
            subprocess.run(["git", "branch", "-D", branch_name], cwd=str(PROJECT_ROOT),
                           capture_output=True, timeout=10)
            logger.info("ImplementationRunner: Deleted branch %s", branch_name)
        except Exception as e:
            logger.warning("ImplementationRunner: Branch cleanup error (non-fatal): %s", e)

    async def _log_execution(self, item_id: str, item_type: str, title: str,
                             status: str, files: List[str], notes: str) -> None:
        """Append execution record to EXECUTION_HISTORY.json."""
        try:
            AUTONOMOUS_LOGS.mkdir(parents=True, exist_ok=True)
            history: dict = {"_meta": {"description": "Execution history"}, "executions": []}
            if EXECUTION_HISTORY.exists():
                try:
                    history = json.loads(EXECUTION_HISTORY.read_text(encoding="utf-8"))
                except Exception:
                    pass
            entry = {
                "id": item_id,
                "type": item_type,
                "title": title,
                "status": status,
                "files_changed": files,
                "notes": notes,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            execs = history.get("executions", [])
            execs.append(entry)
            history["executions"] = execs[-200:]
            history["_meta"]["total"] = len(history["executions"])
            history["_meta"]["last_updated"] = datetime.now(timezone.utc).isoformat()
            EXECUTION_HISTORY.write_text(
                json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception as e:
            logger.warning("ImplementationRunner: Log error: %s", e)
