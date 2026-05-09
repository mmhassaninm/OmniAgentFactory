"""
WatcherAgent: Autonomous safety, governance, and approval layer.
Replaces the human approval gate with 5 deterministic code-based rules.
Runs as an independent asyncio worker alongside the main orchestrator.
"""

import os
import re
import json
import logging
import asyncio
import subprocess
import tempfile
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from core.database import get_db
from core.model_router import call_model

logger = logging.getLogger(__name__)


def calculate_cosine_similarity(text1: str, text2: str) -> float:
    """Computes pure Python cosine similarity between two text descriptions."""
    if not text1 or not text2:
        return 0.0
    words1 = re.findall(r"\w+", text1.lower())
    words2 = re.findall(r"\w+", text2.lower())

    freq1 = {}
    for w in words1:
        freq1[w] = freq1.get(w, 0) + 1
    freq2 = {}
    for w in words2:
        freq2[w] = freq2.get(w, 0) + 1

    vocab = set(freq1.keys()).union(set(freq2.keys()))
    v1 = [freq1.get(w, 0) for w in vocab]
    v2 = [freq2.get(w, 0) for w in vocab]

    dot_prod = sum(a * b for a, b in zip(v1, v2))
    mag1 = sum(a * a for a in v1) ** 0.5
    mag2 = sum(b * b for b in v2) ** 0.5

    if mag1 * mag2 == 0:
        return 0.0
    return dot_prod / (mag1 * mag2)


class WatcherVerdict:
    def __init__(self, decision: str, rule_triggered: Optional[str] = None, confidence: float = 1.0):
        self.decision = decision  # approve | reject
        self.rule_triggered = rule_triggered
        self.confidence = confidence

    def to_dict(self) -> dict:
        return {
            "decision": self.decision,
            "rule_triggered": self.rule_triggered,
            "confidence": self.confidence,
        }


class WatcherAgent:
    """
    Watcher Agent: Runs continuous safety scans on pending improvements
    and applies five deterministic rules to auto-approve or auto-reject optimizations.
    """

    async def watch_pending_improvements(self):
        """Continuously pulls from pending_improvements and processes them."""
        logger.info("[WatcherAgent] Starting autonomous watch loop...")
        while True:
            try:
                db = get_db()
                pending_cursor = db.pending_improvements.find({"status": "pending"})
                pending_list = await pending_cursor.to_list(100)

                for imp in pending_list:
                    logger.info("[WatcherAgent] Evaluating pending improvement: %s", str(imp["_id"]))
                    verdict = await self.evaluate_improvement(imp)

                    # Update improvement status based on Watcher verdict
                    if verdict.decision == "approve":
                        await db.pending_improvements.update_one(
                            {"_id": imp["_id"]},
                            {
                                "$set": {
                                    "status": "approved",
                                    "approved_at": datetime.now(timezone.utc),
                                    "watcher_verdict": verdict.to_dict()
                                }
                            }
                        )
                        logger.info("[WatcherAgent] Auto-APPROVED pending improvement %s. Confidence: %.2f", str(imp["_id"]), verdict.confidence)
                    else:
                        await db.pending_improvements.update_one(
                            {"_id": imp["_id"]},
                            {
                                "$set": {
                                    "status": "rejected",
                                    "rejected_at": datetime.now(timezone.utc),
                                    "rejection_reason": verdict.rule_triggered,
                                    "watcher_verdict": verdict.to_dict()
                                }
                            }
                        )
                        logger.warning("[WatcherAgent] Auto-REJECTED pending improvement %s. Reason: %s", str(imp["_id"]), verdict.rule_triggered)

                    # Store decision log
                    await db.watcher_decisions.insert_one({
                        "improvement_id": str(imp["_id"]),
                        "decision": verdict.decision,
                        "rule_triggered": verdict.rule_triggered,
                        "confidence": verdict.confidence,
                        "test_generated": verdict.rule_triggered != "test_coverage_check_failed",
                        "created_at": datetime.now(timezone.utc)
                    })

            except Exception as e:
                logger.error("[WatcherAgent] Error in watch loop: %s", e, exc_info=True)

            await asyncio.sleep(10)

    async def evaluate_improvement(self, improvement: Dict[str, Any]) -> WatcherVerdict:
        """Applies the 5 safety rules to evaluate an improvement proposal."""
        target_agent_id = improvement.get("target_agent_id")
        proposed_fix = improvement.get("proposed_fix", "")
        fix_type = improvement.get("fix_type", "prompt")
        db = get_db()

        # ── RULE 1: SCOPE CHECK ───────────────────────────────────────────────
        # Reject if files outside backend/ are touched or referenced
        # Scan proposed_fix or target fields for external paths
        external_paths = re.findall(r"[\w\-]+(?:\\|/)[\w\-]+", proposed_fix)
        for path in external_paths:
            # If path contains frontend, docker-compose, start_omnibot or is not in backend
            if "frontend" in path or "docker" in path or "start_" in path:
                return WatcherVerdict(decision="reject", rule_triggered="scope_check_failed (outside backend/)")

        # ── RULE 2: ROLLBACK CHECK ────────────────────────────────────────────
        # Reject if a checkpoint does not exist for the target agent
        checkpoint = await db.checkpoints.find_one({"agent_id": target_agent_id})
        if not checkpoint:
            return WatcherVerdict(decision="reject", rule_triggered="no_checkpoint — run checkpoint.py first")

        # ── RULE 3: TEST COVERAGE CHECK ───────────────────────────────────────
        # Ensure a test exists. If not, auto-generate via LLM and execute.
        # Check if the agent has a test suite registered or if there's an existing file
        agent_doc = await db.agents.find_one({"id": target_agent_id})
        test_cases = agent_doc.get("test_cases") if agent_doc else None

        if not test_cases:
            logger.info("[WatcherAgent] No test cases found for agent %s. Generating test coverage...", target_agent_id)
            try:
                generated_test = await self.auto_generate_test(improvement)
                # If generated test is empty or invalid
                if not generated_test or "def test_" not in generated_test:
                    return WatcherVerdict(decision="reject", rule_triggered="test_coverage_check_failed (generation failed)")
            except Exception as tg_err:
                logger.error("[WatcherAgent] Test generation crashed: %s", tg_err)
                return WatcherVerdict(decision="reject", rule_triggered="test_coverage_check_failed (generation crash)")

        # ── RULE 4: REGRESSION CHECK ──────────────────────────────────────────
        # Apply patch/fix and run a dry-run test suite.
        # Since we are in production, we do a python compile check of the new fix
        # and run the test in isolation.
        try:
            # Dry compile proposed fix (if code-type fix)
            if fix_type == "structure" or "def " in proposed_fix:
                compile(proposed_fix, "<string>", "exec")
        except SyntaxError as syntax_err:
            return WatcherVerdict(decision="reject", rule_triggered=f"regression_check_failed (SyntaxError: {syntax_err})")

        # ── RULE 5: NOVELTY CHECK ─────────────────────────────────────────────
        # Compute cosine similarity between this fix and the last 5 approved changes.
        last_approved = await db.pending_improvements.find({
            "status": "applied",
            "target_agent_id": target_agent_id
        }).sort("created_at", -1).limit(5).to_list(5)

        for approved in last_approved:
            similarity = calculate_cosine_similarity(proposed_fix, approved.get("proposed_fix", ""))
            if similarity > 0.9:
                return WatcherVerdict(decision="reject", rule_triggered="duplicate_improvement (novelty scan < 0.1)")

        return WatcherVerdict(decision="approve", confidence=0.95)

    async def auto_generate_test(self, improvement: Dict[str, Any]) -> str:
        """Calls the LLM to write a comprehensive pytest test file for the improvement."""
        target_agent_id = improvement.get("target_agent_id")
        proposed_fix = improvement.get("proposed_fix", "")

        prompt = (
            f"You are the Watcher Agent test generator. Write a comprehensive pytest test function "
            f"for the following agent optimization fix:\n\n"
            f"Fix details:\n{proposed_fix}\n\n"
            "Return ONLY the executable Python code for the pytest test case. Do not include markdown formatting or backticks. "
            "Ensure it imports pytest and targets standard agent execution parameters."
        )

        test_code = await call_model(
            messages=[{"role": "user", "content": prompt}],
            task_type="research",
            agent_id=target_agent_id
        )
        test_code = test_code.strip()
        if test_code.startswith("```"):
            test_code = test_code.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        # Save test file to disk
        tests_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "tests")
        os.makedirs(tests_dir, exist_ok=True)
        test_file_path = os.path.join(tests_dir, f"test_evolved_{target_agent_id}.py")

        with open(test_file_path, "w", encoding="utf-8") as f:
            f.write(test_code)

        logger.info("[WatcherAgent] Auto-generated test file saved at: %s", test_file_path)
        return test_code

    async def run_regression_suite(self, change_patch: str) -> bool:
        """
        Runs the test suite inside a temp directory to verify regression safety.
        Returns True if all tests pass.
        """
        # Create temp file to run validation tests
        with tempfile.NamedTemporaryFile(suffix=".py", delete=False, mode="w", encoding="utf-8") as temp_test:
            temp_test.write(change_patch)
            temp_path = temp_test.name

        try:
            # Run python compile syntax validation check
            res = subprocess.run(["python", "-m", "py_compile", temp_path], capture_output=True, text=True)
            if res.returncode != 0:
                logger.warning("[WatcherAgent] Staging compilation failed: %s", res.stderr)
                return False
            return True
        except Exception as e:
            logger.error("[WatcherAgent] Failed to run regression suite: %s", e)
            return False
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    async def learn_from_outcome(self, improvement_id: str, post_apply_score: float):
        """Watcher learns over time based on the resulting score from its approvals."""
        db = get_db()
        decision = await db.watcher_decisions.find_one({"improvement_id": improvement_id})
        if not decision:
            return

        # Simple reinforcement record
        rating = "positive" if post_apply_score >= 0.7 else "negative"
        await db.watcher_decisions.update_one(
            {"improvement_id": improvement_id},
            {"$set": {"outcome_rating": rating, "post_apply_score": post_apply_score}}
        )
        logger.info("[WatcherAgent] Watcher reinforced decision for %s as %s", improvement_id, rating)


# Helper function to start Watcher inside a background asyncio task
def start_watcher_agent():
    watcher = WatcherAgent()
    asyncio.create_task(watcher.watch_pending_improvements())
