"""
OmniBot — Self-Rewriting Prompt Templates (Phase 7: Wildest Idea, Score 63)

The improvement prompt template itself is versioned and evolved using the same
mechanism as the agents it improves. When a prompt version shows diminishing returns
over 20 cycles, the LLM proposes a new version. A/B tested, then promoted if better.

This achieves second-order self-improvement: the factory improves the mechanism
that improves its agents, creating a compounding recursive improvement loop.

MongoDB collection: prompt_templates
{
  version, template_text, status, created_at, cycles_used,
  avg_score_delta, total_cycles, promoted_at, retired_at
}
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from core.model_router import call_model

logger = logging.getLogger(__name__)

DIMINISHING_RETURN_THRESHOLD = 20  # cycles before triggering evaluation
DIMINISHING_RETURN_DELTA = 0.005   # avg score delta below which prompt is "underperforming"
AB_TEST_RATIO = 0.3                 # 30% of cycles use the candidate prompt
PROMOTION_THRESHOLD = 0.15          # new prompt must beat old by 15% to promote


DEFAULT_TEMPLATE_V1 = (
    "You are an expert AI engineer specializing in agent evolution. "
    "Your task is to improve the given agent's code to better achieve its goal. "
    "Return ONLY the improved Python code — no explanations, no markdown fences. "
    "The code must define an async function called 'execute(input_data)' that "
    "returns the agent's result. Keep the code self-contained."
)


class PromptEvolver:
    """
    Manages versioned improvement prompt templates.
    Automatically evolves the template when performance stagnates.
    """

    def __init__(self):
        self._active_template: Optional[str] = None
        self._active_version: int = 1
        self._candidate_template: Optional[str] = None
        self._candidate_version: int = 0
        self._cycle_scores: list = []          # recent cycles for active template
        self._candidate_scores: list = []      # A/B test scores for candidate
        self._ab_active: bool = False
        self._initialized: bool = False
        self._lock = asyncio.Lock()

    async def initialize(self, db):
        """Load the active template from MongoDB or seed with the default."""
        async with self._lock:
            try:
                template = await db.prompt_templates.find_one({"status": "active"})
                if template:
                    self._active_template = template.get("template_text", DEFAULT_TEMPLATE_V1)
                    self._active_version = template.get("version", 1)
                    logger.info("[PROMPT_EVOLVER] Loaded active template v%d", self._active_version)
                else:
                    # Seed with default
                    await db.prompt_templates.insert_one({
                        "version": 1,
                        "template_text": DEFAULT_TEMPLATE_V1,
                        "status": "active",
                        "created_at": datetime.now(),
                        "cycles_used": 0,
                        "avg_score_delta": 0.0,
                        "total_cycles": 0,
                    })
                    self._active_template = DEFAULT_TEMPLATE_V1
                    self._active_version = 1
                    logger.info("[PROMPT_EVOLVER] Seeded default template v1")
            except Exception as e:
                logger.debug("[PROMPT_EVOLVER] Init failed (using in-memory default): %s", e)
                self._active_template = DEFAULT_TEMPLATE_V1
            finally:
                self._initialized = True

    def get_active_template(self, return_meta: bool = False):
        """
        Return the active template text, or None to use the built-in default.
        During A/B test: 30% of calls return the candidate template.
        """
        used_candidate = False
        template_text = None

        if not self._initialized or self._active_template == DEFAULT_TEMPLATE_V1:
            template_text = None
        elif self._ab_active and self._candidate_template:
            # Use A/B test distribution
            import random
            if random.random() < AB_TEST_RATIO:
                template_text = self._candidate_template
                used_candidate = True
            else:
                template_text = self._active_template
        else:
            template_text = self._active_template

        if return_meta:
            return template_text, used_candidate
        return template_text

    async def record_cycle_outcome(self, db, score_delta: float, committed: bool, used_candidate: bool = False):
        """
        Track the score delta for the current template version.
        Triggers evaluation and potential evolution when enough data is collected.
        """
        async with self._lock:
            if used_candidate and self._ab_active:
                self._candidate_scores.append(score_delta if committed else 0.0)
            else:
                self._cycle_scores.append(score_delta if committed else 0.0)
                await self._update_template_stats(db, score_delta, committed)

            # Check if we have enough data to evaluate the current template
            if len(self._cycle_scores) >= DIMINISHING_RETURN_THRESHOLD and not self._ab_active:
                recent_avg = sum(self._cycle_scores[-DIMINISHING_RETURN_THRESHOLD:]) / DIMINISHING_RETURN_THRESHOLD
                if recent_avg < DIMINISHING_RETURN_DELTA:
                    logger.info(
                        "[PROMPT_EVOLVER] Diminishing returns detected (avg_delta=%.5f). Proposing new template.",
                        recent_avg,
                    )
                    asyncio.create_task(self._propose_and_start_ab_test(db, recent_avg))

            # Check if A/B test should conclude
            if self._ab_active and len(self._candidate_scores) >= DIMINISHING_RETURN_THRESHOLD:
                asyncio.create_task(self._conclude_ab_test(db))

    async def _update_template_stats(self, db, score_delta: float, committed: bool):
        """Update the active template's rolling statistics."""
        try:
            recent = self._cycle_scores[-50:] if len(self._cycle_scores) > 50 else self._cycle_scores
            avg = sum(recent) / max(len(recent), 1)
            await db.prompt_templates.update_one(
                {"version": self._active_version, "status": "active"},
                {
                    "$inc": {"cycles_used": 1, "total_cycles": 1},
                    "$set": {"avg_score_delta": avg, "last_updated": datetime.now()},
                },
            )
        except Exception:
            pass

    async def _propose_and_start_ab_test(self, db, current_avg: float):
        """
        Ask the LLM to propose a new, better prompt template.
        Starts an A/B test if the proposal is valid.
        """
        try:
            # Don't start another A/B test if one is already running
            if self._ab_active:
                return

            # Get performance history for context
            recent_failures = await _get_recent_failure_modes(db)
            recent_successes = await _get_recent_successes(db)

            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a prompt engineer optimizing an AI agent evolution system. "
                        "Output ONLY the new system prompt text. No explanation, no markdown, "
                        "no JSON. The prompt will be used verbatim as the system message to "
                        "instruct an LLM to improve Python agent code."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"The current prompt template has shown diminishing returns:\n"
                        f"Current average score improvement per cycle: {current_avg:.5f}\n"
                        f"(Target: >{DIMINISHING_RETURN_DELTA})\n\n"
                        f"Current template:\n{self._active_template}\n\n"
                        f"Recent failure patterns:\n"
                        + "\n".join(f"- {f}" for f in recent_failures[:5])
                        + "\n\nRecent successes:\n"
                        + "\n".join(f"- {s}" for s in recent_successes[:5])
                        + "\n\nWrite a NEW system prompt template that would produce better "
                        "code improvements. Focus on what's failing. "
                        "Must require defining 'async def execute(input_data)'. "
                        "Output the new prompt text only."
                    ),
                },
            ]

            new_template = await call_model(messages, task_type="research")

            if not new_template or len(new_template) < 50:
                logger.warning("[PROMPT_EVOLVER] LLM returned invalid template proposal")
                return

            # Strip any accidental markdown
            new_template = new_template.strip()
            if new_template.startswith("```"):
                new_template = new_template.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            new_version = self._active_version + 1

            # Store candidate in DB
            await db.prompt_templates.insert_one({
                "version": new_version,
                "template_text": new_template,
                "status": "candidate",
                "created_at": datetime.now(),
                "cycles_used": 0,
                "avg_score_delta": 0.0,
                "total_cycles": 0,
                "proposed_because": f"Diminishing returns (avg={current_avg:.5f})",
            })

            self._candidate_template = new_template
            self._candidate_version = new_version
            self._ab_active = True
            self._candidate_scores = []

            logger.info(
                "[PROMPT_EVOLVER] A/B test started: v%d (active) vs v%d (candidate)",
                self._active_version, new_version,
            )

        except Exception as e:
            logger.warning("[PROMPT_EVOLVER] Proposal/A/B start failed: %s", e)

    async def _conclude_ab_test(self, db):
        """Compare active vs candidate template. Promote winner."""
        try:
            active_avg = sum(self._cycle_scores[-DIMINISHING_RETURN_THRESHOLD:]) / DIMINISHING_RETURN_THRESHOLD
            cand_avg = sum(self._candidate_scores) / max(len(self._candidate_scores), 1)

            winner = "candidate" if cand_avg > active_avg * (1 + PROMOTION_THRESHOLD) else "active"

            logger.info(
                "[PROMPT_EVOLVER] A/B concluded: active_avg=%.5f candidate_avg=%.5f → winner: %s",
                active_avg, cand_avg, winner,
            )

            if winner == "candidate":
                # Promote candidate → active
                await db.prompt_templates.update_one(
                    {"version": self._active_version, "status": "active"},
                    {"$set": {"status": "retired", "retired_at": datetime.now(), "final_avg": active_avg}},
                )
                await db.prompt_templates.update_one(
                    {"version": self._candidate_version, "status": "candidate"},
                    {"$set": {
                        "status": "active",
                        "promoted_at": datetime.now(),
                        "beat_active_avg": active_avg,
                        "own_avg": cand_avg,
                        "improvement_pct": round((cand_avg - active_avg) / max(active_avg, 0.0001) * 100, 2),
                    }},
                )

                # Log factory self-upgrade event
                await db.factory_events.insert_one({
                    "event": "prompt_evolver_promoted_new_template",
                    "timestamp": datetime.now(),
                    "old_version": self._active_version,
                    "new_version": self._candidate_version,
                    "improvement_pct": round((cand_avg - active_avg) / max(active_avg, 0.0001) * 100, 2),
                })

                self._active_template = self._candidate_template
                self._active_version = self._candidate_version
                self._cycle_scores = list(self._candidate_scores)  # carry over scores
                logger.info("[PROMPT_EVOLVER] Promoted template v%d (+%.1f%%)",
                            self._active_version, (cand_avg - active_avg) / max(active_avg, 0.0001) * 100)
            else:
                # Retire the candidate
                await db.prompt_templates.update_one(
                    {"version": self._candidate_version, "status": "candidate"},
                    {"$set": {"status": "discarded", "discarded_at": datetime.now(), "reason": "did not beat active"}},
                )
                logger.info("[PROMPT_EVOLVER] Candidate v%d discarded (not better than active)", self._candidate_version)

        except Exception as e:
            logger.warning("[PROMPT_EVOLVER] A/B conclusion failed: %s", e)
        finally:
            self._ab_active = False
            self._candidate_template = None

    def get_status(self) -> dict:
        recent_avg = (
            sum(self._cycle_scores[-20:]) / max(len(self._cycle_scores[-20:]), 1)
            if self._cycle_scores else 0.0
        )
        return {
            "active_version": self._active_version,
            "ab_test_active": self._ab_active,
            "candidate_version": self._candidate_version if self._ab_active else None,
            "total_cycles_tracked": len(self._cycle_scores),
            "recent_avg_score_delta": round(recent_avg, 6),
            "diminishing_return_threshold": DIMINISHING_RETURN_DELTA,
        }


async def _get_recent_failure_modes(db) -> list[str]:
    try:
        pipeline = [
            {"$group": {"_id": "$failure_mode", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5},
        ]
        modes = await db.prompt_autopsies.aggregate(pipeline).to_list(5)
        return [f"{m['_id']} ({m['count']}x)" for m in modes]
    except Exception:
        return []


async def _get_recent_successes(db) -> list[str]:
    try:
        snaps = await db.snapshots.find(
            {"performance_score": {"$gte": 0.5}},
        ).sort("performance_score", -1).limit(5).to_list(5)
        return [s.get("commit_message", "")[:100] for s in snaps]
    except Exception:
        return []


# ── Singleton ────────────────────────────────────────────────────────────────

_evolver: Optional[PromptEvolver] = None


def get_prompt_evolver() -> PromptEvolver:
    global _evolver
    if _evolver is None:
        _evolver = PromptEvolver()
    return _evolver
