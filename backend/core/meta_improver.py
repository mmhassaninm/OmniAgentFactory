"""
OmniBot — Meta Improver (Phase 5: Factory Self-Improvement)

Every 50 evolution cycles factory-wide, the factory improves its OWN evolution
algorithm by analyzing which improvement prompts worked best and proposing
a better one via LLM. A/B tests the new prompt for 10 cycles.

MongoDB collections:
  factory_meta_scores — factory performance metrics over time
  prompt_ab_tests     — ongoing A/B test state
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

from core.model_router import call_model

logger = logging.getLogger(__name__)

META_CYCLE_TRIGGER = 50      # Analyze after this many cycles factory-wide
AB_TEST_CYCLES = 20          # Run A/B test for this many cycles
AB_TEST_SPLIT = 0.5          # 50% get new prompt, 50% keep old
MIN_IMPROVEMENT_DELTA = 0.1  # New prompt must beat old by 10% to replace


class MetaImprover:
    """
    Tracks factory-wide cycle count and triggers self-improvement when the threshold is hit.
    Manages A/B testing of new prompt templates.
    """

    def __init__(self):
        self._cycle_counter: int = 0
        self._ab_test_active: bool = False
        self._ab_candidate_template: Optional[str] = None
        self._ab_cycles_run: int = 0
        self._ab_old_scores: list = []
        self._ab_new_scores: list = []
        self._lock = asyncio.Lock()

    async def record_cycle(self, db, agent_id: str, score_delta: float, committed: bool, prompt_version: str = "default"):
        """
        Called after every evolution cycle (committed or rolled back).
        Tracks metrics and triggers meta-improvement when threshold is hit.
        """
        async with self._lock:
            self._cycle_counter += 1

            # A/B test tracking
            if self._ab_test_active and self._ab_candidate_template:
                # Alternate assignment: odd cycles get new prompt, even get old
                if self._cycle_counter % 2 == 1:
                    self._ab_new_scores.append(score_delta if committed else 0.0)
                else:
                    self._ab_old_scores.append(score_delta if committed else 0.0)

                self._ab_cycles_run += 1
                if self._ab_cycles_run >= AB_TEST_CYCLES:
                    await self._conclude_ab_test(db)

            # Save meta score to MongoDB
            try:
                current_prompt_version = await self._get_current_prompt_version(db)
                avg_rate = await self._compute_recent_avg_improvement(db)
                await db.factory_meta_scores.insert_one({
                    "timestamp": datetime.now(),
                    "cycle_number": self._cycle_counter,
                    "avg_improvement_rate": avg_rate,
                    "prompt_version": current_prompt_version,
                    "ab_test_active": self._ab_test_active,
                })
            except Exception as e:
                logger.debug("[META] Failed to save meta score: %s", e)

            # Trigger meta-improvement analysis
            if self._cycle_counter % META_CYCLE_TRIGGER == 0 and not self._ab_test_active:
                asyncio.create_task(self._trigger_meta_improvement(db))

    async def _trigger_meta_improvement(self, db):
        """Collect metrics, ask LLM for better prompt, start A/B test."""
        try:
            logger.info("[META] [IMPROVER] Triggering factory self-improvement analysis (cycle %d)", self._cycle_counter)

            metrics = await self._collect_performance_metrics(db)
            current_template = await self._get_current_template_text(db)
            top_prompts = await self._get_top_performing_prompts(db, limit=5)
            worst_prompts = await self._get_worst_performing_prompts(db, limit=5)

            new_template = await self._propose_new_template(
                current_template, metrics, top_prompts, worst_prompts,
            )

            if new_template and len(new_template) > 50:
                # Store the candidate
                await db.prompt_ab_tests.insert_one({
                    "started_at": datetime.now(),
                    "status": "running",
                    "old_template": current_template,
                    "new_template": new_template,
                    "metrics_at_start": metrics,
                    "cycles_run": 0,
                    "old_scores": [],
                    "new_scores": [],
                })

                self._ab_candidate_template = new_template
                self._ab_test_active = True
                self._ab_cycles_run = 0
                self._ab_old_scores = []
                self._ab_new_scores = []

                logger.info("[META] [IMPROVER] A/B test started with new prompt template (length=%d)", len(new_template))
            else:
                logger.warning("[META] LLM did not produce a valid new template")

        except Exception as e:
            logger.warning("[META] Meta improvement trigger failed: %s", e)

    async def _conclude_ab_test(self, db):
        """Decide winner between old and new prompt templates."""
        try:
            old_avg = sum(self._ab_old_scores) / max(len(self._ab_old_scores), 1)
            new_avg = sum(self._ab_new_scores) / max(len(self._ab_new_scores), 1)

            winner = "new" if (new_avg > old_avg * (1 + MIN_IMPROVEMENT_DELTA)) else "old"

            logger.info(
                "[META] A/B test concluded — old_avg=%.5f new_avg=%.5f → winner: %s",
                old_avg, new_avg, winner,
            )

            if winner == "new" and self._ab_candidate_template:
                # Promote new template
                await db.prompt_templates.update_one(
                    {"status": "active"},
                    {"$set": {"status": "archived"}},
                )
                await db.prompt_templates.insert_one({
                    "template_text": self._ab_candidate_template,
                    "status": "active",
                    "created_at": datetime.now(),
                    "promoted_from_ab": True,
                    "old_avg_score_delta": old_avg,
                    "new_avg_score_delta": new_avg,
                })

                # Log to MODIFICATION_HISTORY equivalent
                await db.factory_events.insert_one({
                    "event": "factory_self_upgraded_evolution_prompt",
                    "timestamp": datetime.now(),
                    "old_avg": old_avg,
                    "new_avg": new_avg,
                    "improvement_pct": round((new_avg - old_avg) / max(old_avg, 0.0001) * 100, 2),
                })
                logger.info("[META] Factory self-upgraded its evolution prompt! Improvement: +%.1f%%",
                            (new_avg - old_avg) / max(old_avg, 0.0001) * 100)

            # Update A/B test record
            await db.prompt_ab_tests.update_one(
                {"status": "running"},
                {"$set": {
                    "status": "completed",
                    "winner": winner,
                    "old_avg": old_avg,
                    "new_avg": new_avg,
                    "completed_at": datetime.now(),
                    "old_scores": self._ab_old_scores,
                    "new_scores": self._ab_new_scores,
                }},
            )

        except Exception as e:
            logger.warning("[META] A/B test conclusion failed: %s", e)
        finally:
            self._ab_test_active = False
            self._ab_candidate_template = None

    def should_use_new_prompt(self) -> bool:
        """
        During A/B test: returns True for odd-numbered cycles (50% split).
        The caller injects the new template when this returns True.
        """
        if not self._ab_test_active:
            return False
        return self._cycle_counter % 2 == 1

    def get_ab_candidate_template(self) -> Optional[str]:
        """Return the candidate template text if an A/B test is active."""
        if self._ab_test_active:
            return self._ab_candidate_template
        return None

    async def _collect_performance_metrics(self, db) -> dict:
        """Gather factory-wide performance metrics for the LLM analysis."""
        try:
            # Recent 50 cycles vs previous 50
            recent_records = await db.roi_records.find(
                {},
            ).sort("timestamp", -1).limit(50).to_list(50)

            prev_records = await db.roi_records.find(
                {},
            ).sort("timestamp", -1).skip(50).limit(50).to_list(50)

            def avg_delta(records):
                deltas = [r.get("score_delta", 0.0) for r in records if r.get("committed")]
                return sum(deltas) / max(len(deltas), 1)

            def commit_rate(records):
                committed = sum(1 for r in records if r.get("committed"))
                return committed / max(len(records), 1)

            # Cycles to reach 0.5 score
            agents_that_reached_half = await db.snapshots.count_documents(
                {"performance_score": {"$gte": 0.5}},
            )

            return {
                "recent_avg_score_delta": round(avg_delta(recent_records), 5),
                "previous_avg_score_delta": round(avg_delta(prev_records), 5),
                "recent_commit_rate": round(commit_rate(recent_records), 3),
                "previous_commit_rate": round(commit_rate(prev_records), 3),
                "agents_reached_half_score": agents_that_reached_half,
                "total_cycles": self._cycle_counter,
            }
        except Exception as e:
            logger.debug("[META] Metrics collection failed: %s", e)
            return {}

    async def _get_top_performing_prompts(self, db, limit: int = 5) -> list:
        """Get the highest-delta committed snapshots' associated prompt hints."""
        try:
            top = await db.snapshots.find(
                {"performance_score": {"$exists": True}},
            ).sort("performance_score", -1).limit(limit).to_list(limit)
            return [s.get("commit_message", "") for s in top if s.get("commit_message")]
        except Exception:
            return []

    async def _get_worst_performing_prompts(self, db, limit: int = 5) -> list:
        """Get the most common failure modes from autopsies."""
        try:
            pipeline = [
                {"$group": {"_id": "$failure_mode", "count": {"$sum": 1}, "example": {"$first": "$root_cause"}}},
                {"$sort": {"count": -1}},
                {"$limit": limit},
            ]
            worst = await db.prompt_autopsies.aggregate(pipeline).to_list(limit)
            return [f"{w['_id']} ({w['count']} times): {w.get('example', '')}" for w in worst]
        except Exception:
            return []

    async def _propose_new_template(
        self,
        current_template: str,
        metrics: dict,
        top_prompts: list,
        worst_prompts: list,
    ) -> Optional[str]:
        """Ask the LLM to propose a better improvement prompt template."""
        messages = [
            {
                "role": "system",
                "content": (
                    "You are improving an AI agent evolution system. "
                    "Your output must be ONLY the new improvement prompt template text — "
                    "no explanations, no markdown fences, no JSON wrappers. "
                    "The template will be used as the system prompt for improving agents."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"You are improving an AI agent evolution system.\n\n"
                    f"Current performance metrics:\n{_format_metrics(metrics)}\n\n"
                    f"Current improvement prompt template:\n{current_template}\n\n"
                    f"Top 5 evolution attempts that succeeded:\n"
                    + "\n".join(f"- {p}" for p in top_prompts) + "\n\n"
                    f"Top 5 failure patterns to avoid:\n"
                    + "\n".join(f"- {p}" for p in worst_prompts) + "\n\n"
                    f"Suggest ONE specific change to the improvement prompt template that would "
                    f"increase average score improvement per cycle. "
                    f"Output ONLY the new improvement prompt template. Nothing else."
                ),
            },
        ]

        try:
            return await call_model(messages, task_type="research")
        except Exception as e:
            logger.debug("[META] Template proposal failed: %s", e)
            return None

    async def _get_current_template_text(self, db) -> str:
        """Get the currently active prompt template text from DB, or the default."""
        try:
            template = await db.prompt_templates.find_one({"status": "active"})
            if template:
                return template.get("template_text", _DEFAULT_TEMPLATE)
        except Exception:
            pass
        return _DEFAULT_TEMPLATE

    async def _get_current_prompt_version(self, db) -> str:
        """Get the version identifier of the current active template."""
        try:
            template = await db.prompt_templates.find_one({"status": "active"})
            if template:
                return str(template.get("_id", "v1"))
        except Exception:
            pass
        return "default"

    async def _compute_recent_avg_improvement(self, db) -> float:
        """Compute average score delta from last 50 committed cycles."""
        try:
            records = await db.roi_records.find(
                {"committed": True},
            ).sort("timestamp", -1).limit(50).to_list(50)
            if not records:
                return 0.0
            return sum(r.get("score_delta", 0.0) for r in records) / len(records)
        except Exception:
            return 0.0

    def get_status(self) -> dict:
        return {
            "total_cycles": self._cycle_counter,
            "ab_test_active": self._ab_test_active,
            "ab_cycles_run": self._ab_cycles_run,
            "next_trigger_at": META_CYCLE_TRIGGER - (self._cycle_counter % META_CYCLE_TRIGGER),
        }


def _format_metrics(metrics: dict) -> str:
    lines = []
    for k, v in metrics.items():
        lines.append(f"  {k}: {v}")
    return "\n".join(lines)


_DEFAULT_TEMPLATE = (
    "You are an expert AI engineer specializing in agent evolution. "
    "Your task is to improve the given agent's code to better achieve its goal. "
    "Return ONLY the improved Python code — no explanations, no markdown fences. "
    "The code must define an async function called 'execute(input_data)' that "
    "returns the agent's result. Keep the code self-contained."
)


# ── Singleton ────────────────────────────────────────────────────────────────

_meta_improver: Optional[MetaImprover] = None


def get_meta_improver() -> MetaImprover:
    global _meta_improver
    if _meta_improver is None:
        _meta_improver = MetaImprover()
    return _meta_improver
