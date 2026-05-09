"""
OmniBot — Evolution Engine (System 3)

The core evolution loop that continuously improves agents.
Includes EvolutionManager for tracking concurrent evolution tasks
and integrating with the Kill Switch (System 4).
"""

import asyncio
import logging
from datetime import datetime
from enum import Enum
from typing import Dict, Optional

from agents.base_agent import BaseAgent, AgentStatus
from core.checkpoint import (
    checkpoint_draft,
    checkpoint_testing,
    checkpoint_commit,
    checkpoint_rollback,
)
from core.model_router import call_model
from core.config import get_settings
from core.dna_engine import DEFAULT_DNA, dna_to_prompt_modifiers
from core.collective_memory import contribute_memory, get_relevant_memories
from core.prompt_autopsy import analyze_failure, get_autopsy_hints
from core.roi_tracker import record_cycle, estimate_tokens_in_response
from utils.thought_logger import log_thought
from utils.budget import get_budget_governor

logger = logging.getLogger(__name__)

_MONGO_FAILED = object()  # sentinel: returned when MongoDB exhausts all retries


async def _mongo_retry(agent_id: str, fn, retries: int = 5):
    """Retry a MongoDB coroutine callable up to `retries` times with 10s sleep."""
    for attempt in range(retries):
        try:
            return await fn()
        except Exception as e:
            await log_thought(
                agent_id,
                f"⚠ MongoDB error (attempt {attempt + 1}/{retries}): {type(e).__name__}",
                phase="error",
            )
            if attempt < retries - 1:
                await asyncio.sleep(10)
    await log_thought(agent_id, "MongoDB: exhausted retries — skipping cycle", phase="error")
    return _MONGO_FAILED


class StopMode(str, Enum):
    HARD_STOP = "hard_stop"
    SOFT_STOP = "soft_stop"
    PAUSE = "pause"


# ── Improvement Prompt Builder ──────────────────────────────────────────────

def build_improvement_prompt(
    agent: BaseAgent,
    dna: dict = None,
    collective_memories: list = None,
    autopsy_hints: list = None,
    active_template: str = None,
) -> list:
    """
    Construct the prompt that asks the LLM to improve the agent's code.
    Injects DNA behavioral modifiers, collective memory discoveries, and autopsy hints.
    When a prompt_evolver active_template is provided, it overrides the default system content.
    """
    dna = dna or DEFAULT_DNA
    dna_modifiers = dna_to_prompt_modifiers(dna)

    if active_template:
        system_content = active_template
    else:
        system_content = (
            "You are an expert AI engineer specializing in agent evolution. "
            "Your task is to improve the given agent's code to better achieve its goal. "
            "Return ONLY the improved Python code — no explanations, no markdown fences. "
            "The code must define an async function called 'execute(input_data)' that "
            "returns the agent's result. Keep the code self-contained."
        )
    if dna_modifiers:
        system_content += f" {dna_modifiers}"

    memory_section = ""
    if collective_memories:
        memory_section = (
            "\n--- Collective Memory (successful patterns discovered by other agents) ---\n"
            + "\n".join(f"- {m}" for m in collective_memories)
            + "\n"
        )

    autopsy_section = ""
    if autopsy_hints:
        autopsy_section = (
            "\n--- Autopsy Hints (lessons from this agent's previous failed attempts) ---\n"
            + "\n".join(f"- {h}" for h in autopsy_hints)
            + "\n"
        )

    user_content = (
        f"Agent Name: {agent.name}\n"
        f"Agent Goal: {agent.goal}\n"
        f"Current Version: v{agent.version}\n"
        f"Current Score: {agent.current_score:.2f}\n"
        f"\n--- Current Agent Code ---\n"
        f"{agent.agent_code or 'No code yet — create the initial implementation.'}\n"
        f"\n--- Test Cases ---\n"
        f"{_format_test_cases(agent.test_cases)}\n"
        f"{memory_section}"
        f"{autopsy_section}"
        f"\n--- Configuration ---\n"
        f"{agent.config}\n"
        f"\nImprove this agent to score higher on its test cases and better achieve its goal. "
        f"Focus on: correctness, robustness, and performance."
    )

    return [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_content},
    ]


def _format_test_cases(test_cases: list) -> str:
    if not test_cases:
        return "No test cases defined."
    lines = []
    for i, tc in enumerate(test_cases, 1):
        lines.append(f"  Test {i}: input={tc.get('input')} → expected={tc.get('expected')}")
    return "\n".join(lines)


# ── Agent Testing ───────────────────────────────────────────────────────────

async def test_agent(new_code: str, test_cases: list, agent_name: str = "test") -> float:
    """
    Test new agent code against test cases in a sandboxed execution.
    Returns score between 0.0 and 1.0.
    """
    temp_agent = BaseAgent(
        name=agent_name,
        goal="testing",
        agent_code=new_code,
        test_cases=test_cases,
    )
    try:
        score = await temp_agent.test(test_cases)
        return score
    except Exception as e:
        logger.error("Agent test failed: %s", e)
        return 0.0


# ── Evolution Loop ──────────────────────────────────────────────────────────

async def evolve_agent(agent_id: str, stop_event: asyncio.Event):
    """
    Main evolution loop for a single agent.
    Runs continuously until stop_event is set.
    """
    from core.database import get_db

    while not stop_event.is_set():
        try:
            # Verify MongoDB is reachable before each cycle
            from core.database import check_db_health
            if not await check_db_health():
                await log_thought(agent_id, "MongoDB unreachable — waiting 10s", phase="error")
                await asyncio.sleep(10)
                continue

            # 1. Load current agent from MongoDB
            db = get_db()
            agent_doc = await _mongo_retry(agent_id, lambda: db.agents.find_one({"id": agent_id}))
            if agent_doc is _MONGO_FAILED:
                await asyncio.sleep(30)
                continue
            if not agent_doc:
                await log_thought(agent_id, "Agent not found in DB — stopping evolution", phase="error")
                return

            agent = BaseAgent.from_dict(agent_doc)
            agent_dna = agent_doc.get("dna", DEFAULT_DNA)

            # Check if soft_stop flag is set
            if agent.config.get("_stop_after_commit"):
                await log_thought(agent_id, "Soft stop flag detected — stopping after last commit", phase="general")
                await db.agents.update_one(
                    {"id": agent_id},
                    {"$set": {"status": "stopped"}, "$unset": {"config._stop_after_commit": ""}},
                )
                return

            # Check budget
            governor = get_budget_governor()
            if not await governor.check_budget(agent_id, estimated_tokens=2000):
                await log_thought(agent_id, "Daily token budget exhausted — pausing evolution", phase="general")
                await asyncio.sleep(300)  # Wait 5 minutes
                continue

            # Mark agent as evolving
            await _mongo_retry(
                agent_id,
                lambda: db.agents.update_one(
                    {"id": agent_id},
                    {"$set": {"status": AgentStatus.EVOLVING.value}},
                ),
            )

            await log_thought(agent_id, f"Starting evolution cycle (current: v{agent.version}, score: {agent.current_score:.2f})", phase="evolve")

            # 2. DRAFT: Generate improved version
            await checkpoint_draft(agent_id, agent.agent_code, agent.config, agent.current_score)
            await log_thought(agent_id, "Phase DRAFT: generating improved version...", phase="draft")

            # Fetch collective memory discoveries to guide the improvement
            collective_memories = await get_relevant_memories(db, agent.goal)
            if collective_memories:
                await log_thought(agent_id, f"[COLLECTIVE_MEMORY] Injecting {len(collective_memories)} shared discoveries", phase="draft")

            # Fetch failure lessons from Ghost agents with similar goals
            try:
                from core.dead_letter import get_failure_lessons_for_goal
                failure_lessons = await get_failure_lessons_for_goal(db, agent.goal, limit=2)
                if failure_lessons:
                    collective_memories = (collective_memories or []) + failure_lessons
                    await log_thought(agent_id, f"[GHOST_LESSONS] Injecting {len(failure_lessons)} failure lessons from ghost agents", phase="draft")
            except Exception:
                pass

            # Fetch autopsy hints from previous failed cycles
            autopsy_hints = await get_autopsy_hints(db, agent_id)
            if autopsy_hints:
                await log_thought(agent_id, f"[AUTOPSY] Injecting {len(autopsy_hints)} failure lessons into prompt", phase="draft")

            # Get active prompt template: meta_improver A/B candidate or prompt_evolver override
            active_template = None
            try:
                from core.meta_improver import get_meta_improver
                meta = get_meta_improver()
                if meta.should_use_new_prompt():
                    active_template = meta.get_ab_candidate_template()
            except Exception:
                pass
            if not active_template:
                try:
                    from core.prompt_evolver import get_prompt_evolver
                    evolver = get_prompt_evolver()
                    active_template = evolver.get_active_template()
                except Exception:
                    pass

            improvement_prompt = build_improvement_prompt(
                agent,
                dna=agent_dna,
                collective_memories=collective_memories,
                autopsy_hints=autopsy_hints,
                active_template=active_template,
            )
            new_code = await call_model(improvement_prompt, task_type="code", agent_id=agent_id)

            # Check for model router error
            if new_code.startswith("[MODEL_ROUTER_ERROR]"):
                await log_thought(agent_id, f"Model call failed: {new_code}", phase="error")
                await checkpoint_rollback(agent_id)
                await asyncio.sleep(90)
                continue

            # Clean the code (remove markdown fences if present)
            new_code = _clean_code(new_code)

            # 3. TEST: Evaluate new version
            await checkpoint_testing(agent_id)
            await log_thought(agent_id, "Phase TEST: evaluating new version...", phase="testing")

            score = await test_agent(new_code, agent.test_cases, agent.name)

            # 3b. RED TEAM: adversarial robustness gate (only when code improves)
            red_team_passed = True
            if score > agent.current_score and agent.version >= 2:
                try:
                    from core.red_team import run_red_team_attack
                    from core.model_router import get_model_router
                    await log_thought(agent_id, "[RED_TEAM] Running adversarial attack suite...", phase="testing")
                    rt_result = await run_red_team_attack(
                        agent_code=new_code,
                        agent_goal=agent.goal,
                        model_router=get_model_router(),
                        agent_id=agent_id,
                    )
                    red_team_passed = rt_result["passed"]
                    if not red_team_passed:
                        vulns = len(rt_result.get("vulnerabilities", []))
                        await log_thought(
                            agent_id,
                            f"[RED_TEAM] ✗ Failed — {vulns} vulnerabilities found. Triggering additional evolution.",
                            phase="testing",
                        )
                    else:
                        await log_thought(agent_id, f"[RED_TEAM] ✓ Passed ({rt_result['attacks_tried']} attacks)", phase="testing")
                except Exception as e:
                    logger.warning("Red team error for agent %s: %s", agent_id, e)

            # Estimate token cost of this cycle for ROI tracking
            tokens_used = await estimate_tokens_in_response(new_code)
            score_before_cycle = agent.current_score

            # 4. COMMIT or ROLLBACK
            if score > agent.current_score and red_team_passed:
                new_version = await checkpoint_commit(
                    agent_id,
                    new_code,
                    score,
                    f"Evolved from v{agent.version}: score {agent.current_score:.2f} → {score:.2f}",
                )
                await log_thought(
                    agent_id,
                    f"✅ Evolved to v{new_version}, score: {score:.2f} (was {agent.current_score:.2f})",
                    phase="commit",
                )

                # Record ROI for this successful cycle
                try:
                    await record_cycle(db, agent_id, tokens_used, score_before_cycle, score, committed=True)
                except Exception as e:
                    logger.debug("ROI record failed: %s", e)

                # Notify meta improver of successful cycle
                try:
                    from core.meta_improver import get_meta_improver
                    meta = get_meta_improver()
                    await meta.record_cycle(db, agent_id, score - score_before_cycle, committed=True)
                except Exception as e:
                    logger.debug("Meta improver record failed: %s", e)

                # Reset failure tax counter on successful commit
                manager = get_evolution_manager()
                manager._failure_counts[agent_id] = 0

                # Update agent record with new code
                await _mongo_retry(
                    agent_id,
                    lambda: db.agents.update_one(
                        {"id": agent_id},
                        {
                            "$set": {
                                "agent_code": new_code,
                                "score": score,
                                "version": new_version,
                                "status": AgentStatus.EVOLVING.value,
                                "updated_at": datetime.utcnow(),
                            }
                        },
                    ),
                )

                # Contribute successful pattern to collective memory
                score_delta = score - agent.current_score
                try:
                    await contribute_memory(
                        db, agent_id,
                        discovery=new_code[:800],
                        context=agent.goal,
                        score_delta=score_delta,
                    )
                except Exception as e:
                    logger.debug("Collective memory contribution failed: %s", e)

                # Breeding trigger: at version 10 milestone, breed top 2 agents
                if new_version == 10:
                    try:
                        await _trigger_breeding(db, agent, agent_id)
                    except Exception as e:
                        logger.warning("Breeding trigger failed: %s", e)

                # Check soft stop after successful commit
                if agent.config.get("_stop_after_commit"):
                    await log_thought(agent_id, f"Soft stopped after commit v{new_version}", phase="general")
                    await db.agents.update_one(
                        {"id": agent_id},
                        {"$set": {"status": "stopped"}, "$unset": {"config._stop_after_commit": ""}},
                    )
                    return
            else:
                await checkpoint_rollback(agent_id)
                reason = "Red Team failed" if not red_team_passed else f"score {score:.2f} ≤ {agent.current_score:.2f}"
                await log_thought(
                    agent_id,
                    f"❌ Evolution attempt rolled back ({reason}), keeping current",
                    phase="rollback",
                )

                # Record ROI for this failed cycle
                try:
                    await record_cycle(db, agent_id, tokens_used, score_before_cycle, score, committed=False)
                except Exception as e:
                    logger.debug("ROI record failed: %s", e)

                # Notify meta improver of failed cycle
                try:
                    from core.meta_improver import get_meta_improver
                    meta = get_meta_improver()
                    await meta.record_cycle(db, agent_id, 0.0, committed=False)
                except Exception as e:
                    logger.debug("Meta improver record failed: %s", e)

                # Prompt Autopsy: analyze why this cycle failed
                try:
                    await analyze_failure(
                        db, agent_id,
                        improvement_prompt=improvement_prompt,
                        bad_code=new_code,
                        score_before=agent.current_score,
                        score_after=score,
                    )
                except Exception as e:
                    logger.debug("Autopsy analysis failed: %s", e)

                # Failure Tax: increment failure counter and apply backoff
                manager = get_evolution_manager()
                manager._failure_counts[agent_id] = manager._failure_counts.get(agent_id, 0) + 1
                failure_count = manager._failure_counts[agent_id]

                # Plateau check after rollback: if stuck for many cycles, trigger extinction
                try:
                    from core.extinction import check_for_plateau, trigger_extinction_event
                    if await check_for_plateau(db, agent_id):
                        total_active = await db.agents.count_documents({"status": {"$nin": ["extinct"]}})
                        if total_active > 3:
                            await log_thought(agent_id, f"[EXTINCTION] Plateau detected — triggering extinction event", phase="evolve")
                            result = await trigger_extinction_event(db)
                            await log_thought(
                                agent_id,
                                f"[EXTINCTION] Complete: {result['survivors']} survivors, {result['culled']} culled",
                                phase="evolve",
                            )
                except Exception as e:
                    logger.debug("Extinction check failed: %s", e)

                # Dead Letter check: if agent completely failed after many cycles
                try:
                    from core.dead_letter import check_for_complete_failure, process_dead_agent
                    if await check_for_complete_failure(db, agent_id):
                        ghost = await process_dead_agent(db, agent_id)
                        if ghost:
                            await log_thought(
                                agent_id,
                                f"👻 Agent converted to Ghost after {agent.version} failed cycles. "
                                f"{ghost.get('lessons_count', 0)} lessons saved for future agents.",
                                phase="general",
                            )
                            return  # Stop the evolution loop — agent is now a ghost
                except Exception as e:
                    logger.debug("Dead letter check failed: %s", e)

            # 5. Sleep between cycles (configurable per agent, with failure tax backoff)
            interval = 60

            # Night mode: double the interval (slower but more efficient)
            settings = get_settings()
            if settings.is_night_mode():
                interval = int(interval * 2)

            # Failure Tax: exponential backoff after consecutive failures (cap at 1800s)
            manager = get_evolution_manager()
            consecutive_failures = manager._failure_counts.get(agent_id, 0)
            if consecutive_failures > 0:
                tax_multiplier = min(1.5 ** consecutive_failures, 12.0)  # max 12x base
                taxed_interval = int(interval * tax_multiplier)
                taxed_interval = min(taxed_interval, 1800)  # cap at 30 minutes
                if taxed_interval > interval:
                    await log_thought(
                        agent_id,
                        f"[FAILURE_TAX] Backing off {taxed_interval}s after {consecutive_failures} consecutive failures",
                        phase="general",
                    )
                    interval = taxed_interval

            await log_thought(agent_id, f"Sleeping {interval}s until next evolution cycle", phase="general")

            # Interruptible sleep — check stop_event every second
            for _ in range(interval):
                if stop_event.is_set():
                    break
                await asyncio.sleep(1)

        except asyncio.CancelledError:
            await log_thought(agent_id, "Evolution loop cancelled", phase="general")
            raise
        except Exception as e:
            logger.error("Evolution loop error for agent %s: %s", agent_id, e, exc_info=True)
            await log_thought(agent_id, f"⚠ Unexpected error: {type(e).__name__}: {str(e)[:200]}", phase="error")
            await log_thought(agent_id, "↺ Recovering — next cycle in 30s", phase="error")
            await asyncio.sleep(30)
            continue


async def _trigger_breeding(db, parent_agent: BaseAgent, trigger_agent_id: str):
    """
    At v10 milestone: find top 2 agents by score, breed their DNAs,
    and create a new agent carrying the combined behavioral genetics.
    """
    from core.dna_engine import breed_agents, DEFAULT_DNA

    top_agents = await db.agents.find(
        {"status": {"$nin": ["extinct"]}},
    ).sort("score", -1).limit(2).to_list(2)

    if len(top_agents) < 2:
        return

    dna_a = top_agents[0].get("dna", DEFAULT_DNA)
    dna_b = top_agents[1].get("dna", DEFAULT_DNA)
    child_dna = breed_agents(dna_a, dna_b)

    parent_a_name = top_agents[0].get("name", "Agent-A")
    parent_b_name = top_agents[1].get("name", "Agent-B")
    child_name = f"Bred-{parent_a_name[:6]}x{parent_b_name[:6]}"

    from core.factory import get_agent_factory
    factory = get_agent_factory()
    bred = await factory.create_agent(
        name=child_name,
        goal=parent_agent.goal,
        template="general",
        config={"bred_from": [top_agents[0].get("id"), top_agents[1].get("id")]},
    )

    # Stamp DNA onto the bred agent
    await db.agents.update_one(
        {"id": bred.agent_id},
        {"$set": {"dna": child_dna}},
    )

    await log_thought(
        trigger_agent_id,
        f"[DNA] Bred new agent '{child_name}' ({bred.agent_id[:8]}) from top performers at v10 milestone",
        phase="evolve",
    )
    logger.info("[DNA] Bred agent %s from %s + %s", bred.agent_id[:8], parent_a_name, parent_b_name)


def _clean_code(code: str) -> str:
    """Remove markdown code fences if the LLM wrapped the response."""
    code = code.strip()
    if code.startswith("```python"):
        code = code[len("```python"):].strip()
    elif code.startswith("```"):
        code = code[3:].strip()
    if code.endswith("```"):
        code = code[:-3].strip()
    return code


# ── Evolution Manager ───────────────────────────────────────────────────────

class EvolutionManager:
    """
    Manages all running evolution tasks.
    Enforces concurrency limits and handles stop modes.
    """

    def __init__(self):
        self._tasks: Dict[str, asyncio.Task] = {}
        self._stop_events: Dict[str, asyncio.Event] = {}
        self._paused_states: Dict[str, dict] = {}
        self._failure_counts: Dict[str, int] = {}  # Failure Tax: consecutive rollback counter per agent

    @property
    def active_count(self) -> int:
        return sum(1 for t in self._tasks.values() if not t.done())

    def _get_max_concurrent(self) -> int:
        settings = get_settings()
        if settings.is_night_mode():
            return settings.max_concurrent_agents_night
        return settings.max_concurrent_agents_day

    async def start_evolution(self, agent_id: str) -> bool:
        """Start the evolution loop for an agent. Returns False if at capacity."""
        # Check if already running
        if agent_id in self._tasks and not self._tasks[agent_id].done():
            logger.info("Evolution already running for agent %s", agent_id)
            return True

        # Check concurrency limit
        if self.active_count >= self._get_max_concurrent():
            await log_thought(
                agent_id,
                f"Cannot start: {self.active_count}/{self._get_max_concurrent()} concurrent slots used",
                phase="error",
            )
            return False

        # Create stop event and start task
        stop_event = asyncio.Event()
        self._stop_events[agent_id] = stop_event
        task = asyncio.create_task(evolve_agent(agent_id, stop_event))
        self._tasks[agent_id] = task

        # Clean up when task completes
        task.add_done_callback(lambda t: self._on_task_done(agent_id, t))

        await log_thought(agent_id, "Evolution started", phase="evolve")
        return True

    def _on_task_done(self, agent_id: str, task: asyncio.Task):
        """Callback when an evolution task completes."""
        if task.exception():
            logger.error(
                "Evolution task for %s ended with error: %s",
                agent_id, task.exception(),
            )

    async def stop_evolution(self, agent_id: str, mode: StopMode) -> bool:
        """Stop evolution for an agent using the specified mode."""
        from core.database import get_db
        db = get_db()

        if mode == StopMode.HARD_STOP:
            return await self._hard_stop(agent_id, db)
        elif mode == StopMode.SOFT_STOP:
            return await self._soft_stop(agent_id, db)
        elif mode == StopMode.PAUSE:
            return await self._pause(agent_id, db)

        return False

    async def _hard_stop(self, agent_id: str, db) -> bool:
        """HARD_STOP: Immediately set stop_event, save as paused_unsafe."""
        stop_event = self._stop_events.get(agent_id)
        if stop_event:
            stop_event.set()

        task = self._tasks.get(agent_id)
        if task and not task.done():
            task.cancel()
            try:
                await asyncio.wait_for(task, timeout=5)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass

        await db.agents.update_one(
            {"id": agent_id},
            {"$set": {"status": "paused_unsafe", "updated_at": datetime.utcnow()}},
        )
        await log_thought(agent_id, "🛑 Hard stopped — will restart from last COMMIT", phase="general")
        await checkpoint_rollback(agent_id)
        return True

    async def _soft_stop(self, agent_id: str, db) -> bool:
        """SOFT_STOP: Set stop_after_commit flag, let current cycle finish."""
        await db.agents.update_one(
            {"id": agent_id},
            {"$set": {"config._stop_after_commit": True}},
        )
        await log_thought(agent_id, "⏹ Soft stop requested — will stop after next commit", phase="general")
        return True

    async def _pause(self, agent_id: str, db) -> bool:
        """PAUSE: Serialize complete agent state and stop cleanly."""
        # Get current agent state
        agent_doc = await db.agents.find_one({"id": agent_id})
        if agent_doc:
            self._paused_states[agent_id] = agent_doc

        # Set stop event
        stop_event = self._stop_events.get(agent_id)
        if stop_event:
            stop_event.set()

        await db.agents.update_one(
            {"id": agent_id},
            {"$set": {"status": "paused", "updated_at": datetime.utcnow()}},
        )
        await log_thought(agent_id, "⏸ Paused safely — can resume from exact state", phase="general")
        return True

    async def resume_evolution(self, agent_id: str) -> bool:
        """Resume a paused or stopped agent."""
        from core.database import get_db
        db = get_db()

        agent_doc = await db.agents.find_one({"id": agent_id})
        if not agent_doc:
            return False

        # If paused_unsafe, rollback to last commit first
        if agent_doc.get("status") == "paused_unsafe":
            await checkpoint_rollback(agent_id)
            await log_thought(agent_id, "Resumed from HARD_STOP — rolled back to last commit", phase="general")

        return await self.start_evolution(agent_id)

    def get_status(self) -> dict:
        """Get the status of all managed agents."""
        settings = get_settings()
        return {
            "active_evolutions": self.active_count,
            "max_concurrent": self._get_max_concurrent(),
            "is_night_mode": settings.is_night_mode(),
            "agents": {
                agent_id: {
                    "running": not task.done(),
                    "paused": agent_id in self._paused_states,
                }
                for agent_id, task in self._tasks.items()
            },
        }


# ── Singleton ───────────────────────────────────────────────────────────────

_manager: Optional[EvolutionManager] = None


def get_evolution_manager() -> EvolutionManager:
    global _manager
    if _manager is None:
        _manager = EvolutionManager()
    return _manager
