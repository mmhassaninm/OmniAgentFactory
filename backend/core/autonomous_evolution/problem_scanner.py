"""
Problem Scanner — Detects Issues via Static Analysis + AI Diagnosis
Scans code, runs heuristics, and uses LLM to diagnose problems
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# ── Absolute path resolution ───────────────────────────────────────────────────
# This file: backend/core/autonomous_evolution/problem_scanner.py
# BACKEND_ROOT = backend/
# PROJECT_ROOT = NexusOS/
_HERE = Path(__file__).resolve()
BACKEND_ROOT = _HERE.parent.parent.parent   # NexusOS/backend/
PROJECT_ROOT = BACKEND_ROOT.parent          # NexusOS/

PROBLEM_DIAGNOSIS_PROMPT = """
أنت مهندس قائد في تشخيص مشاكل الأنظمة AI.
You are a lead engineer diagnosing AI system issues.

# Static Analysis Results
{static_issues}

# Code Samples
{code_samples}

# Already Solved Problems (ignore these)
{solved_problems}

# Your Task
Identify 2-3 REAL problems that:
1. Actually exist in the provided code/analysis
2. Are different from solved problems
3. Impact reliability, performance, or security
4. Have clear root causes

Output ONLY valid JSON:
{{
  "problems": [
    {{
      "title": "Problem Title",
      "description": "What's wrong and why",
      "location": "backend/file.py:line_range",
      "severity": "critical|high|medium|low",
      "root_cause": "The underlying reason",
      "proposed_solution": "How to fix it",
      "category": "reliability|performance|security|code_quality|architecture"
    }}
  ]
}}
"""


class ProblemScanner:
    """Scans the codebase to detect issues and problems."""

    def __init__(self, model_router, registry_manager):
        self.model_router = model_router
        self.registry = registry_manager
        # ── FIX: Use absolute paths so scanner works regardless of cwd ────────
        self.scan_paths = [
            BACKEND_ROOT / "core",
            BACKEND_ROOT / "tools",
            BACKEND_ROOT / "shopify",
            BACKEND_ROOT / "workers",
            BACKEND_ROOT / "agent",
        ]

    async def scan_and_identify(self) -> List[Dict[str, Any]]:
        """Main entry point: scan code + identify problems."""
        try:
            logger.info("🔍 ProblemScanner: Starting code scan...")

            # Step 1: Static analysis
            static_issues = await self._static_analysis()

            # Step 2: Sample code from important files
            code_samples = await self._sample_code()

            # Step 3: Get solved problems to avoid rehashing
            solved = await self.registry.get_solved_problems(limit=15)

            # Step 4: Use LLM to diagnose
            problems = await self._diagnose_via_llm(static_issues, code_samples, solved)

            # Step 5: Filter known problems
            filtered = await self.registry.filter_known_problems(problems)

            logger.info(f"🔴 Found {len(filtered)} new problems (from {len(problems)} total)")
            return filtered

        except Exception as e:
            logger.error(f"Problem scanning failed: {e}")
            return []

    async def _static_analysis(self) -> List[Dict[str, str]]:
        """Run basic static analysis heuristics."""
        issues = []
        try:
            logger.info("  Running static analysis...")

            for scan_path in self.scan_paths:
                path = Path(scan_path)  # already absolute Path objects
                if not path.exists():
                    logger.debug(f"  Scan path not found (skipped): {path}")
                    continue

                for py_file in path.rglob("*.py"):
                    try:
                        content = py_file.read_text(encoding="utf-8", errors="ignore")

                        # Check 1: Hardcoded timeouts
                        if "sleep(10)" in content or "sleep(15)" in content:
                            issues.append({
                                "type": "hardcoded_timeout",
                                "file": str(py_file),
                                "detail": "Hardcoded sleep value (should be dynamic or configurable)"
                            })

                        # Check 2: Bare except
                        if "\nexcept:" in content and "except Exception" not in content:
                            issues.append({
                                "type": "bare_except",
                                "file": str(py_file),
                                "detail": "Bare except clause hides errors and prevents proper debugging"
                            })

                        # Check 3: Missing error handling in async
                        if "await" in content and "try:" not in content:
                            issues.append({
                                "type": "missing_async_error_handling",
                                "file": str(py_file),
                                "detail": "Async operation without try/except (can crash silently)"
                            })

                        # Check 4: No logging in critical paths
                        if "def run" in content and "logger." not in content:
                            issues.append({
                                "type": "missing_logging",
                                "file": str(py_file),
                                "detail": "Run method without logging (hard to debug)"
                            })

                        # Check 5: Unused imports (improved heuristic)
                        lines = content.split("\n")
                        imports = [l for l in lines if l.startswith("import ") or l.startswith("from ")]
                        for imp in imports:
                            module = imp.split()[1].split(".")[0] if len(imp.split()) > 1 else ""
                            if module and f"{module}." not in content and f" {module}(" not in content:
                                issues.append({
                                    "type": "unused_import",
                                    "file": str(py_file),
                                    "detail": f"Import '{module}' may be unused"
                                })

                        # Check 6: Functions > 50 lines (complexity)
                        func_count = content.count("\ndef ")
                        if func_count > 0:
                            avg_lines = len(content.split("\n")) / func_count
                            if avg_lines > 50:
                                issues.append({
                                    "type": "complex_function",
                                    "file": str(py_file),
                                    "detail": f"Average function size {int(avg_lines)} lines (refactor into smaller functions)"
                                })

                        # Check 7: TODO comments
                        if "TODO" in content or "FIXME" in content:
                            todo_count = content.count("TODO") + content.count("FIXME")
                            issues.append({
                                "type": "incomplete_code",
                                "file": str(py_file),
                                "detail": f"File contains {todo_count} TODO/FIXME comments (needs completion)"
                            })

                    except Exception as e:
                        logger.debug(f"Error analyzing {py_file}: {e}")

            logger.info(f"  Found {len(issues)} static issues")
            return issues[:15]  # Limit to top issues

        except Exception as e:
            logger.warning(f"Static analysis failed: {e}")
            return []

    async def _sample_code(self) -> List[Dict[str, Any]]:
        """Sample code from important files."""
        samples = []
        # ── FIX: Use absolute paths via BACKEND_ROOT ────────────────────────
        important_files = [
            BACKEND_ROOT / "core" / "evolve_engine.py",
            BACKEND_ROOT / "core" / "autonomous_evolution" / "loop_orchestrator.py",
            BACKEND_ROOT / "workers" / "infinite_dev_loop.py",
            BACKEND_ROOT / "tools" / "executor.py",
        ]

        try:
            logger.info("  Sampling code...")
            for filename in important_files:
                path = Path(filename)
                if not path.exists():
                    logger.debug(f"  Sample file not found: {path}")
                    continue

                try:
                    content = path.read_text(encoding="utf-8", errors="ignore")
                    lines = content.split("\n")[:40]  # First 40 lines
                    samples.append({
                        "file": str(path),  # absolute path as string
                        "code_preview": "\n".join(lines[:30])
                    })
                except Exception as e:
                    logger.debug(f"Error sampling {filename}: {e}")

            logger.info(f"  Sampled {len(samples)} files")
            return samples

        except Exception as e:
            logger.warning(f"Code sampling failed: {e}")
            return []

    async def _diagnose_via_llm(self, static_issues: List[dict],
                               code_samples: List[dict],
                               solved: List[dict]) -> List[Dict[str, Any]]:
        """Use LLM to diagnose real problems."""
        try:
            # Format inputs
            static_text = "\n".join([
                f"- {i['file']}: {i['type']} — {i['detail']}"
                for i in static_issues[:5]
            ])

            code_text = "\n".join([
                f"[{s['file']}]\n{s['code_preview']}\n"
                for s in code_samples[:3]
            ])

            solved_text = "\n".join([
                f"- {p.get('title')}: {p.get('solution_applied', '')[:50]}"
                for p in solved[:5]
            ])

            prompt = PROBLEM_DIAGNOSIS_PROMPT.format(
                static_issues=static_text or "(No static issues)",
                code_samples=code_text or "(No samples)",
                solved_problems=solved_text or "(None yet)"
            )

            # Call LLM
            logger.info("  Calling LLM for diagnosis...")
            response = await self.model_router.call_model(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.4,
                max_tokens=1000
            )

            # Parse JSON — strip markdown fences if present
            try:
                clean = response.strip()
                if clean.startswith("```json"):
                    clean = clean[7:]
                elif clean.startswith("```"):
                    clean = clean[3:]
                if clean.endswith("```"):
                    clean = clean[:-3]
                data = json.loads(clean.strip())
                problems = data.get("problems", [])
                logger.info(f"  LLM identified {len(problems)} problems")
                return problems
            except json.JSONDecodeError:
                logger.warning(f"LLM returned invalid JSON: {response[:100]}")
                return []

        except Exception as e:
            logger.error(f"LLM diagnosis failed: {e}")
            return []
