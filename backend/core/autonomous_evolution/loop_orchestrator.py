"""
Loop Orchestrator — Central Coordinator of the Autonomous Evolution System
Runs an infinite loop alternating between:
- ODD cycles: Idea generation and evaluation
- EVEN cycles: Problem scanning and solving
- Every 6 cycles: Registry review and statistics
"""
import asyncio
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class LoopOrchestrator:
    """Coordinates all autonomous evolution components in an infinite loop."""

    def __init__(self, idea_engine=None, problem_scanner=None, agent_council=None,
                 registry_manager=None, implementation_runner=None):
        self.idea_engine = idea_engine
        self.problem_scanner = problem_scanner
        self.agent_council = agent_council
        self.registry = registry_manager
        self.runner = implementation_runner

        self.cycle_count = 0
        self.running = False
        self.paused = False

    async def run_forever(self):
        """Run the infinite autonomous evolution loop."""
        self.running = True
        logger.info("🚀 ========================================")
        logger.info("🚀 AUTONOMOUS EVOLUTION LOOP v3.0 STARTED")
        logger.info("🚀 ========================================")

        while self.running:
            if self.paused:
                await asyncio.sleep(5)
                continue

            self.cycle_count += 1
            logger.info(f"\n{'='*60}")
            logger.info(f"🔄 CYCLE {self.cycle_count} — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            logger.info(f"{'='*60}")

            try:
                # Alternate: odd cycles = ideas, even cycles = problems
                if self.cycle_count % 2 == 1:
                    await self._ideas_cycle()
                else:
                    await self._problems_cycle()

                # Every 6 cycles: review registry
                if self.cycle_count % 6 == 0:
                    await self._registry_review()

            except asyncio.CancelledError:
                logger.info("⏹️ Loop cancelled gracefully")
                break
            except Exception as e:
                logger.error(f"⚠️ Cycle error (recovering): {e}")
                await asyncio.sleep(30)
                continue

            # Wait before next cycle
            wait_time = 120  # 2 minutes between cycles (configurable)
            logger.info(f"💤 Next cycle in {wait_time}s...")
            await asyncio.sleep(wait_time)

    async def _ideas_cycle(self):
        """ODD cycles: Generate and evaluate new ideas."""
        logger.info("💡 IDEAS CYCLE — Searching for development ideas...")

        if not self.idea_engine or not self.agent_council or not self.registry:
            logger.warning("⏭️ Ideas engine not configured, skipping")
            return

        try:
            # Step 1: Generate ideas
            ideas = await self.idea_engine.research_and_generate()
            if not ideas:
                logger.info("ℹ️ No new ideas generated this cycle")
                return

            logger.info(f"✨ Generated {len(ideas)} potential ideas")

            # Step 2: Evaluate each idea
            for idea in ideas:
                logger.info(f"📋 Evaluating: {idea.get('title')}")

                try:
                    # Get council verdict
                    council_result = await self.agent_council.deliberate(idea)
                    final = council_result.get("final", {})
                    decision = final.get("final_decision", "reject")
                    score = final.get("final_score", 0)

                    logger.info(f"⚖️ Council verdict: {decision} (score: {score}/10)")

                    # Step 3: Register idea
                    idea["council_verdict"] = final
                    idea_id = await self.registry.register_idea(idea)

                    # Step 4: Execute if approved
                    if decision == "approve" and score >= 6:
                        logger.info(f"🚀 Executing idea: {idea_id}")
                        try:
                            if self.runner:
                                result = await self.runner.execute_idea(idea_id, idea)
                                await self.registry.mark_idea_implemented(
                                    idea_id,
                                    files_changed=result.get("files_changed", []),
                                    outcome=result.get("summary", "Implemented successfully")
                                )
                                logger.info(f"✅ Idea {idea_id} implemented successfully")
                            else:
                                logger.warning(f"Implementation runner not configured, skipping execution")
                        except Exception as e:
                            await self.registry.mark_idea_rejected(idea_id, f"Implementation failed: {e}")
                            logger.error(f"❌ Idea {idea_id} implementation failed: {e}")
                    else:
                        await self.registry.mark_idea_rejected(
                            idea_id,
                            f"Council rejected: {final.get('rationale', 'Low score')}"
                        )

                except Exception as e:
                    logger.error(f"Error processing idea: {e}")

        except Exception as e:
            logger.error(f"Ideas cycle failed: {e}")

    async def _problems_cycle(self):
        """EVEN cycles: Scan for problems and solve them."""
        logger.info("🔍 PROBLEMS CYCLE — Scanning for issues...")

        if not self.problem_scanner or not self.agent_council or not self.registry:
            logger.warning("⏭️ Problem scanner not configured, skipping")
            return

        try:
            # Step 1: Scan for problems
            problems = await self.problem_scanner.scan_and_identify()
            if not problems:
                logger.info("ℹ️ No new problems detected this cycle")
                return

            logger.info(f"🔴 Found {len(problems)} potential problems")

            # Step 2: Evaluate each problem
            for problem in problems:
                logger.info(f"🔧 Analyzing: {problem.get('title')}")

                try:
                    # Get council verdict
                    council_result = await self.agent_council.deliberate(problem)
                    final = council_result.get("final", {})
                    decision = final.get("final_decision", "modify")

                    # Step 3: Register problem
                    problem["council_verdict"] = final
                    prob_id = await self.registry.register_problem(problem)

                    # Step 4: Solve if approved
                    if decision in ["approve", "modify"]:
                        logger.info(f"🔨 Solving problem: {prob_id}")
                        try:
                            if self.runner:
                                result = await self.runner.execute_solution(prob_id, problem)
                                await self.registry.mark_problem_solved(
                                    prob_id,
                                    solution=result.get("solution_applied", ""),
                                    files=result.get("files_changed", []),
                                    verified=result.get("tested", False)
                                )
                                logger.info(f"✅ Problem {prob_id} solved")
                            else:
                                logger.warning(f"Implementation runner not configured, skipping solution")
                        except Exception as e:
                            logger.error(f"❌ Problem {prob_id} solution failed: {e}")
                    else:
                        logger.info(f"⏭️ Problem {prob_id} deferred (council decision: {decision})")

                except Exception as e:
                    logger.error(f"Error processing problem: {e}")

        except Exception as e:
            logger.error(f"Problems cycle failed: {e}")

    async def _registry_review(self):
        """Review and report on registry statistics."""
        logger.info("📊 REGISTRY REVIEW — Auditing records...")

        if not self.registry:
            return

        try:
            stats = await self.registry.get_stats()
            logger.info(f"📈 STATISTICS:")
            logger.info(f"   Ideas: {stats.get('total_ideas')} total, "
                       f"{stats.get('implemented_ideas')} implemented "
                       f"({stats.get('idea_success_rate', 0):.1f}%)")
            logger.info(f"   Problems: {stats.get('total_problems')} total, "
                       f"{stats.get('solved_problems')} solved "
                       f"({stats.get('problem_resolution_rate', 0):.1f}%)")
        except Exception as e:
            logger.error(f"Registry review failed: {e}")

    def pause(self):
        """Pause the loop (remains running but skips cycles)."""
        self.paused = True
        logger.info("⏸️ Loop paused")

    def resume(self):
        """Resume the paused loop."""
        self.paused = False
        logger.info("▶️ Loop resumed")

    def stop(self):
        """Stop the loop gracefully."""
        self.running = False
        logger.info("⏹️ Loop stopping...")
