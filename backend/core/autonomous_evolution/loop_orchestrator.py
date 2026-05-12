"""
Loop Orchestrator -- Central Coordinator of the Autonomous Evolution System
Runs an infinite loop alternating between:
- ODD cycles: Idea generation and evaluation
- EVEN cycles: Problem scanning and solving
- Every 6 cycles: Registry review and statistics
- Every 24 cycles (~48 min): Daily report generation
"""
import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Cycle interval in seconds
CYCLE_INTERVAL_SECONDS = 120
# Generate daily report every N cycles
DAILY_REPORT_EVERY_N_CYCLES = 24


class LoopOrchestrator:
    """Coordinates all autonomous evolution components in an infinite loop."""

    def __init__(self, idea_engine=None, problem_scanner=None, agent_council=None,
                 registry_manager=None, implementation_runner=None, model_router=None):
        self.idea_engine = idea_engine
        self.problem_scanner = problem_scanner
        self.agent_council = agent_council
        self.registry = registry_manager
        self.model_router = model_router

        # Inject model_router into implementation_runner
        if implementation_runner is not None and model_router is not None:
            implementation_runner.model_router = model_router
        self.runner = implementation_runner

        self.cycle_count = 0
        self.running = False
        self.paused = False
        self._last_report_date = ""

    async def run_forever(self):
        """Run the infinite autonomous evolution loop."""
        self.running = True
        logger.info("AUTONOMOUS EVOLUTION LOOP v3.0 STARTED")

        while self.running:
            if self.paused:
                await asyncio.sleep(5)
                continue

            self.cycle_count += 1
            logger.info("CYCLE %d -- %s", self.cycle_count, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

            try:
                # Alternate: odd cycles = ideas, even cycles = problems
                if self.cycle_count % 2 == 1:
                    await self._ideas_cycle()
                else:
                    await self._problems_cycle()

                # Every 6 cycles: review registry
                if self.cycle_count % 6 == 0:
                    await self._registry_review()

                # Every 12 cycles: run dev loop cycle (agent statistics and reflection)
                if self.cycle_count % 12 == 0:
                    await self._dev_loop_phase()

                # Generate daily report periodically
                if self.cycle_count % DAILY_REPORT_EVERY_N_CYCLES == 0:
                    await self._generate_daily_report()

            except asyncio.CancelledError:
                logger.info("Loop cancelled gracefully")
                break
            except Exception as e:
                # Distinguish temporary vs permanent failures
                error_str = str(e).lower()
                is_temp = any(x in error_str for x in ["connection", "timeout", "unavailable", "busy"])
                wait_time = 30 if is_temp else 60
                logger.error(
                    "Cycle error (%s) — waiting %ds: %s",
                    "temporary" if is_temp else "permanent",
                    wait_time,
                    e
                )
                await asyncio.sleep(wait_time)
                continue

            logger.info("Next cycle in %ds...", CYCLE_INTERVAL_SECONDS)
            await asyncio.sleep(CYCLE_INTERVAL_SECONDS)

    async def _ideas_cycle(self):
        """ODD cycles: Generate and evaluate new ideas."""
        logger.info("━━━ CYCLE %d: IDEAS GENERATION PHASE ━━━", self.cycle_count)
        logger.debug("Components: IdeaEngine=%s, Council=%s, Registry=%s, Runner=%s",
                    "OK" if self.idea_engine else "MISSING",
                    "OK" if self.agent_council else "MISSING",
                    "OK" if self.registry else "MISSING",
                    "OK" if self.runner else "MISSING")

        if not self.idea_engine or not self.agent_council or not self.registry:
            logger.warning("⚠️ Ideas cycle: missing required components, skipping")
            return

        try:
            # ── Execute pending manually approved ideas from registry ─────────────────
            try:
                manual_cursor = self.registry.ideas_col.find({"status": "approved_manually"})
                manual_ideas = await manual_cursor.to_list(length=10)
                if manual_ideas:
                    logger.info("Found %d pending manually approved ideas to execute!", len(manual_ideas))
                    for idea in manual_ideas:
                        idea_id = idea.get("id")
                        logger.info("Executing manually approved idea: %s", idea_id)
                        try:
                            if self.runner:
                                # Update status to "implementing" to avoid race conditions
                                await self.registry.ideas_col.update_one(
                                    {"id": idea_id},
                                    {"$set": {"status": "implementing"}}
                                )
                                result = await self.runner.execute_idea(idea_id, idea)
                                status_res = result.get("status", "success")
                                if status_res == "success":
                                    await self.registry.mark_idea_implemented(
                                        idea_id,
                                        files_changed=result.get("files_changed", []),
                                        outcome=result.get("summary", "Implemented successfully")
                                    )
                                    logger.info("Manually approved idea %s implemented successfully", idea_id)
                                else:
                                    await self.registry.mark_idea_rejected(
                                        idea_id,
                                        "Implementation failed: " + result.get("summary", "Unknown error")
                                    )
                            else:
                                logger.warning("Implementation runner not configured, skipping manual idea %s", idea_id)
                        except Exception as inner_e:
                            await self.registry.mark_idea_rejected(idea_id, f"Implementation failed: {inner_e}")
                            logger.error("Manually approved idea %s failed: %s", idea_id, inner_e)
            except Exception as e:
                logger.error("Failed to query/execute manually approved ideas: %s", e)

            # ── Main automated idea research loop ─────────────────────────────────────
            ideas = await self.idea_engine.research_and_generate()
            if not ideas:
                logger.info("No new ideas generated this cycle")
                return

            logger.info("Generated %d potential ideas", len(ideas))

            for idea in ideas:
                logger.info("Evaluating: %s", idea.get("title"))
                try:
                    council_result = await self.agent_council.deliberate(idea)
                    final = council_result.get("final", {})
                    decision = final.get("final_decision", "reject")
                    score = final.get("final_score", 0)

                    logger.info("Council verdict: %s (score: %s/10)", decision, score)

                    idea["council_verdict"] = final
                    idea_id = await self.registry.register_idea(idea)

                    if decision == "approve" and score >= 6:
                        logger.info("Executing idea: %s", idea_id)
                        try:
                            if self.runner:
                                result = await self.runner.execute_idea(idea_id, idea)
                                await self.registry.mark_idea_implemented(
                                    idea_id,
                                    files_changed=result.get("files_changed", []),
                                    outcome=result.get("summary", "Implemented successfully")
                                )
                                logger.info("Idea %s implemented successfully", idea_id)
                            else:
                                logger.warning("Implementation runner not configured, skipping")
                        except Exception as e:
                            await self.registry.mark_idea_rejected(idea_id, "Implementation failed: " + str(e))
                            logger.error("Idea %s implementation failed: %s", idea_id, e)
                    else:
                        await self.registry.mark_idea_rejected(
                            idea_id,
                            "Council rejected: " + final.get("rationale", "Low score")
                        )

                except Exception as e:
                    logger.error("Error processing idea: %s", e)

        except Exception as e:
            logger.error("Ideas cycle failed: %s", e)

    async def _problems_cycle(self):
        """EVEN cycles: Scan for problems and solve them."""
        logger.info("PROBLEMS CYCLE -- Scanning for issues...")

        if not self.problem_scanner or not self.agent_council or not self.registry:
            logger.warning("Problem scanner not configured, skipping")
            return

        try:
            problems = await self.problem_scanner.scan_and_identify()
            if not problems:
                logger.info("No new problems detected this cycle")
                return

            logger.info("Found %d potential problems", len(problems))

            for problem in problems:
                logger.info("Analyzing: %s", problem.get("title"))
                try:
                    council_result = await self.agent_council.deliberate(problem)
                    final = council_result.get("final", {})
                    decision = final.get("final_decision", "modify")

                    problem["council_verdict"] = final
                    prob_id = await self.registry.register_problem(problem)

                    if decision in ["approve", "modify"]:
                        logger.info("Solving problem: %s", prob_id)
                        try:
                            if self.runner:
                                result = await self.runner.execute_solution(prob_id, problem)
                                await self.registry.mark_problem_solved(
                                    prob_id,
                                    solution=result.get("solution_applied", ""),
                                    files=result.get("files_changed", []),
                                    verified=result.get("tested", False)
                                )
                                logger.info("Problem %s solved", prob_id)
                            else:
                                logger.warning("Implementation runner not configured, skipping solution")
                        except Exception as e:
                            logger.error("Problem %s solution failed: %s", prob_id, e)
                    else:
                        logger.info("Problem %s deferred (council: %s)", prob_id, decision)

                except Exception as e:
                    logger.error("Error processing problem: %s", e)

        except Exception as e:
            logger.error("Problems cycle failed: %s", e)

    async def _registry_review(self):
        """Review and report on registry statistics."""
        logger.info("REGISTRY REVIEW -- Auditing records...")
        if not self.registry:
            return
        try:
            stats = await self.registry.get_stats()
            logger.info(
                "STATS: Ideas=%d total, %d implemented (%.1f%%) | Problems=%d total, %d solved (%.1f%%)",
                stats.get("total_ideas", 0),
                stats.get("implemented_ideas", 0),
                stats.get("idea_success_rate", 0),
                stats.get("total_problems", 0),
                stats.get("solved_problems", 0),
                stats.get("problem_resolution_rate", 0),
            )
        except Exception as e:
            logger.error("Registry review failed: %s", e)

    async def _generate_daily_report(self):
        """Generate daily report once per calendar day."""
        try:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            if today == self._last_report_date:
                logger.debug("Daily report already generated today -- skipping")
                return
            logger.info("Generating daily report...")
            from core.autonomous_evolution.daily_reporter import generate_daily_report
            report_path = await generate_daily_report(registry_manager=self.registry)
            if report_path:
                self._last_report_date = today
                logger.info("Daily report written: %s", report_path)
        except Exception as e:
            logger.error("Daily report failed: %s", e)

    async def _dev_loop_phase(self):
        """Periodic dev loop metrics/reflection phase."""
        logger.info("━━━ CYCLE %d: AGENT DEV LOOP METRICS PHASE ━━━", self.cycle_count)
        try:
            from workers.infinite_dev_loop import run_dev_loop_cycle
            await run_dev_loop_cycle()
        except Exception as e:
            logger.error("Failed to run agent dev loop metrics phase: %s", e)

    def pause(self):
        """Pause the loop (remains running but skips cycles)."""
        self.paused = True
        logger.info("Loop paused")

    def resume(self):
        """Resume the paused loop."""
        self.paused = False
        logger.info("Loop resumed")

    def stop(self):
        """Stop the loop gracefully."""
        self.running = False
        logger.info("Loop stopping...")
