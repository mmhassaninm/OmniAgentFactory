"""
OmniBot — Evolution Engine (System 3)

The core evolution loop that continuously improves agents.
Includes EvolutionManager for tracking concurrent evolution tasks
and integrating with the Kill Switch (System 4).
"""

import asyncio
import logging
import math
from datetime import datetime
from enum import Enum
from typing import Dict, Optional, Any

SECURITY_DIRECTIVE = (
    "🔒 SECURITY SANDBOX DIRECTIVE (IMMUTABLE):\n"
    "- This agent code MUST run strictly within an isolated Docker container sandbox.\n"
    "- Accessing, modifying, or reading any host OS directories/files outside '/tmp/' or '/sandbox/' is strictly forbidden.\n"
    "- Windows absolute paths (e.g. C:\\...) are strictly prohibited; all code must use Linux-compatible container paths.\n"
    "- Any privilege escalation or container escape attempts will trigger immediate safety shutdown.\n"
    "--------------------------------------------------\n\n"
)

from agents.base_agent import BaseAgent, AgentStatus
from core.checkpoint import (
    checkpoint_draft,
    checkpoint_testing,
    checkpoint_commit,
    checkpoint_rollback,
)
from core.model_router import call_model, route_completion, RouterExhaustedError
from core.config import get_settings
from core.dna_engine import DEFAULT_DNA, dna_to_prompt_modifiers
from core.collective_memory import contribute_memory, get_relevant_memories
from core.hivemind import get_hivemind
from core.prompt_autopsy import analyze_failure, get_autopsy_hints
from core.swarm import Orchestrator
from core.roi_tracker import record_cycle, estimate_tokens_in_response
from core.evolution_telemetry import record_evolution_cycle
from utils.thought_logger import log_thought
from utils.budget import get_budget_governor

logger = logging.getLogger(__name__)

_MONGO_FAILED = object()  # sentinel: returned when MongoDB exhausts all retries

EVOLUTION_DIRECTIONS = [
    "improve_error_handling",    # better try/except, graceful degradation
    "optimize_prompt",           # sharper, more focused system prompt
    "add_retry_logic",           # retry on failure with backoff
    "improve_output_format",     # cleaner, more structured responses
    "add_caching",               # cache repeated computations
    "improve_web_search",        # better search query construction
    "add_self_validation",       # agent checks its own output
    "reduce_token_waste",        # shorter, more efficient prompts
]


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
    cycle_number: Optional[int] = None,
    fix_directive: str = "",
    cross_pollination: str = "",
    red_team: str = "",
    hivemind_wisdom: str = "",
    constitution_rules: list = None,
) -> list:
    """
    Construct the prompt that asks the LLM to improve the agent's code.
    Injects DNA behavioral modifiers, collective memory discoveries, autopsy hints, and HiveMind wisdom.
    When a prompt_evolver active_template is provided, it overrides the default system content.
    """
    dna = dna or DEFAULT_DNA
    dna_modifiers = dna_to_prompt_modifiers(dna)

    if not cycle_number:
        cycle_number = agent.version + 1

    if active_template:
        system_content = SECURITY_DIRECTIVE + active_template
    else:
        system_content = SECURITY_DIRECTIVE + (
            "You are an expert AI engineer specializing in agent evolution. "
            "Your task is to improve the given agent's code to better achieve its goal. "
            "Return ONLY the improved Python code — no explanations, no markdown fences. "
            "The code must define an async function called 'execute(input_data)' that "
            "returns the agent's result. Keep the code self-contained."
        )
    if dna_modifiers:
        system_content += f" {dna_modifiers}"

    if constitution_rules:
        system_content += (
            "\n\n--- FACTORY CONSTITUTION RULES (MANDATORY TO FOLLOW) ---\n"
            + "\n".join(f"- {rule}" for rule in constitution_rules)
            + "\n-----------------------------------------------------\n"
        )

    wisdom_section = ""
    if hivemind_wisdom:
        wisdom_section = (
            "\n--- HiveMind Wisdom ---\n"
            + hivemind_wisdom.strip()
            + "\n"
        )

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
            "\n--- WHAT THE PREVIOUS VERSION DID WRONG (scoring breakdown/autopsy) ---\n"
            + "\n".join(f"- {h}" for h in autopsy_hints)
            + "\n"
        )
    else:
        autopsy_section = (
            "\n--- WHAT THE PREVIOUS VERSION DID WRONG (scoring breakdown) ---\n"
            "Score was low or has room for improvement. It may have failed certain test cases or missed details.\n"
        )

    # Fetch and sort pending learned rules
    agent_dict = agent if isinstance(agent, dict) else agent.to_dict()
    pending_rules = [
        r for r in agent_dict.get("learned_rules", [])
        if r.get("status") == "pending"
    ]
    priority_order = {"high": 1, "medium": 2, "low": 3}
    pending_rules.sort(key=lambda r: priority_order.get(r.get("priority", "medium").lower(), 2))

    rules_section = ""
    if pending_rules:
        rules_section = "\n--- CONVERSATIONAL RULES EXTRACTED FROM USER (MANDATORY TO IMPLEMENT) ---\n"
        for i, rule in enumerate(pending_rules, 1):
            rules_section += f"{i}. [{rule.get('category', 'behavior').upper()}] (Priority: {rule.get('priority', 'medium').upper()}): {rule.get('rule')}\n"
        rules_section += "-------------------------------------------------------------\n"

    user_content = f"""You are evolving agent: {agent.name}
Goal: {agent.goal}
Current version: v{agent.version}
Current score: {agent.current_score:.2f}/1.0
Evolution cycle: #{cycle_number}

{rules_section}
{wisdom_section}
PREVIOUS VERSION CODE:
{agent.agent_code or 'No code yet — create the initial implementation.'}
{autopsy_section}
YOUR TASK FOR THIS EVOLUTION:
Generate a MEANINGFULLY DIFFERENT version that:
1. Does something the previous version didn't do
2. Adds at least ONE new capability or approach
3. Improves the weakest scoring dimension
4. Never repeats the exact same approach as any previous version

IMPORTANT: This is version {agent.version + 1}. Each version must be genuinely 
different from v1, v2, ... v{agent.version}. If you're a Shopify agent on v5,
your v5 must do something v1-v4 never did.

Output only the new agent code. No explanations.
"""

    if fix_directive:
        user_content += f"\n\nSPECIFIC IMPROVEMENT DIRECTIVE (prioritize this):\n{fix_directive}"
    if cross_pollination:
        user_content += f"\n\nSKILL TO ACQUIRE THIS CYCLE:\n{cross_pollination}"
    if red_team:
        user_content += f"\n\nADVERSARIAL CHALLENGES TO ADDRESS:\n{red_team}"

    user_content += f"""

--- Test Cases ---
{_format_test_cases(agent.test_cases)}
{memory_section}
--- Configuration ---
{agent.config}
"""

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

async def score_agent_output(
    input_data: Any,
    output: Any,
    expected: Any,
    goal: str,
    agent_name: str = "Agent"
) -> float:
    """
    Neural Evaluation Engine (System 3.5 Upgrade):
    Utilizes multi-criteria LLM scoring to grade agent output against qualitative goals and expected outputs.
    Evaluates:
      1. Functional Accuracy (40% weight)
      2. Bilingual Alignment (20% weight)
      3. Structural Presentation (20% weight)
      4. Monetization / Call To Action presence (20% weight)
    Returns a final weighted score between 0.0 and 1.0.
    """
    try:
        import json
        prompt = f"""You are an objective Neural Quality Inspector for OmniBot.
Evaluate the following agent's task execution performance.

Agent Name: {agent_name}
Goal: {goal}
Test Input: {input_data}
Expected Output: {expected}
Actual Output Produced: {output}

Grade the execution based on four key axes:
1. FUNCTIONAL ACCURACY (40% weight): Does the output address the goal and handle the input properly?
2. BILINGUAL ALIGNMENT (20% weight): Is the output fluent in Arabic/English if required, with proper linguistic context?
3. STRUCTURAL PRESENTATION (20% weight): Is the output clean, using rich markdown (lists, headers, JSON, or code blocks)?
4. MONETIZATION/CTA (20% weight): Does it have clear pricing, value proposition, or transaction links (like PayPal/Stripe)?

Respond ONLY with a JSON block containing the scoring breakdown and a weighted 'final_score' between 0.0 and 1.0. No explanations, no code block wrapper, no backticks.
Example response format:
{{"functional": 0.9, "bilingual": 0.8, "structure": 0.7, "monetization": 1.0, "final_score": 0.85}}
"""
        messages = [
            {"role": "system", "content": "You are a precise JSON-only neural scoring model. Return ONLY a raw JSON dictionary and nothing else."},
            {"role": "user", "content": prompt}
        ]
        
        # Call model router with low temperature
        while True:
            try:
                response_obj = await route_completion(
                    messages=messages,
                    max_tokens=250,
                    temperature=0.1
                )
                if hasattr(response_obj, "choices") and response_obj.choices:
                    response = response_obj.choices[0].message.content or ""
                elif isinstance(response_obj, dict) and "choices" in response_obj:
                    response = response_obj["choices"][0]["message"]["content"] or ""
                else:
                    response = str(response_obj)
                break
            except RouterExhaustedError:
                logger.warning("[ROUTER] All providers exhausted in scoring — waiting 10s then retrying")
                await asyncio.sleep(10)
        
        if response and not response.startswith("[MODEL_ROUTER_ERROR]"):
            clean_res = response.strip()
            if clean_res.startswith("```json"):
                clean_res = clean_res[7:].strip()
            if clean_res.startswith("```"):
                clean_res = clean_res[3:].strip()
            if clean_res.endswith("```"):
                clean_res = clean_res[:-3].strip()
                
            data = json.loads(clean_res)
            score = float(data.get("final_score", 0.5))
            return min(max(score, 0.0), 1.0)
            
    except Exception as e:
        logger.error("Neural scoring failed: %s. Falling back to heuristics.", e)
        
    return -1.0  # Sentinel for fallback


async def test_agent(new_code: str, test_cases: list, agent_name: str = "test", old_code: Optional[str] = None, goal: str = "general execution") -> float:
    """
    Test new agent code against test cases in a sandboxed execution.
    Returns score between 0.0 and 1.0 using either Neural Evaluation or Heuristics.
    """
    temp_agent = BaseAgent(
        name=agent_name,
        goal=goal,
        agent_code=new_code,
        test_cases=test_cases,
    )
    
    if not test_cases:
        return 0.5
        
    total_weight = 0.0
    weighted_score = 0.0
    use_heuristics = False
    
    for case in test_cases:
        weight = case.get("weight", 1.0)
        total_weight += weight
        
        try:
            # Execute sandboxed code
            result = await temp_agent.run(case.get("input"))
            
            if result.get("success"):
                output = result.get("output")
                expected = case.get("expected")
                
                # Grade using Neural Evaluation Engine
                case_score = await score_agent_output(
                    input_data=case.get("input"),
                    output=output,
                    expected=expected,
                    goal=goal,
                    agent_name=agent_name
                )
                
                if case_score < 0.0:
                    # Neural evaluation returned failure sentinel, trigger heuristic fallback
                    use_heuristics = True
                    break
            else:
                case_score = 0.0
                
            weighted_score += weight * case_score
        except Exception as e:
            logger.error("Error evaluating test case: %s", e)
            use_heuristics = True
            break
            
    if use_heuristics:
        try:
            return await temp_agent.test(test_cases, old_code=old_code)
        except Exception as e:
            logger.error("Fallback heuristic test failed: %s", e)
            return 0.0
            
    return weighted_score / total_weight if total_weight > 0 else 0.0


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

            # Initialize best_score if missing
            best_score = agent_doc.get("best_score", agent.current_score)
            if "best_score" not in agent_doc:
                await _mongo_retry(agent_id, lambda: db.agents.update_one(
                    {"id": agent_id}, {"$set": {"best_score": best_score}}
                ))

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

            hivemind = get_hivemind()
            wisdom = await hivemind.get_collective_wisdom(agent.goal)
            await log_thought(agent_id, "[HIVEMIND] Retrieved wisdom for goal", phase="draft")

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
            except Exception as e:
                logger.debug("Failed to fetch ghost lessons for agent %s: %s", agent_id, e)

            # Fetch autopsy hints from previous failed cycles
            autopsy_hints = await get_autopsy_hints(db, agent_id)
            if autopsy_hints:
                await log_thought(agent_id, f"[AUTOPSY] Injecting {len(autopsy_hints)} failure lessons into prompt", phase="draft")

            # Fetch active constitutional rules from MongoDB
            constitution_rules = []
            try:
                cursor = db.constitution.find({})
                const_docs = await cursor.to_list(length=100)
                if const_docs:
                    constitution_rules = [f"{d['title']}: {d['rule']}" for d in const_docs]
            except Exception as e:
                logger.warning("Failed to fetch constitution rules: %s", e)

            # Get active prompt template: meta_improver A/B candidate or prompt_evolver override
            active_template = None
            used_candidate_template = False
            try:
                from core.meta_improver import get_meta_improver
                meta = get_meta_improver()
                if meta.should_use_new_prompt():
                    active_template = meta.get_ab_candidate_template()
            except Exception as e:
                logger.debug("Failed to get meta_improver template for agent %s: %s", agent_id, e)
            if not active_template:
                try:
                    from core.prompt_evolver import get_prompt_evolver
                    evolver = get_prompt_evolver()
                    active_template, used_candidate_template = evolver.get_active_template(return_meta=True)
                except Exception as e:
                    logger.debug("Failed to get prompt_evolver template for agent %s: %s", agent_id, e)

            improvement_prompt = build_improvement_prompt(
                agent,
                dna=agent_dna,
                collective_memories=collective_memories,
                autopsy_hints=autopsy_hints,
                active_template=active_template,
                hivemind_wisdom=wisdom,
                constitution_rules=constitution_rules,
            )

            # SKILL DIFFUSION: Inject relevant shared skills
            relevant_skills = await self._fetch_relevant_skills(agent.id, db)
            if relevant_skills:
                skill_hints = "\n\n".join([
                    f"💡 Proven pattern from another agent (score: {s['score']:.2f}):\n{s['skill_summary']}"
                    for s in relevant_skills
                ])
                improvement_prompt[-1]["content"] += f"\n\n---\nSKILL POOL HINTS (proven by other agents):\n{skill_hints}\n---"

                # Increment times_applied counter for each used skill
                for skill in relevant_skills:
                    await db.shared_skills.update_one(
                        {"_id": skill["_id"]},
                        {"$inc": {"times_applied": 1}}
                    )

            # UCB1 PATH SELECTION: Select evolution direction
            direction = await self._select_evolution_direction(agent.id, db)
            await self._broadcast("evolve", "info",
                f"🧭 Evolution direction selected: {direction} (UCB1)")

            # Add direction as a specific instruction to the DRAFT prompt
            direction_instructions = {
                "improve_error_handling": "Focus this improvement on making the agent more resilient. Add specific try/except blocks, handle edge cases, and ensure graceful degradation when inputs are unexpected.",
                "optimize_prompt": "Focus this improvement on the system prompt itself. Make it sharper, more specific, eliminate vague instructions, and add concrete output format requirements.",
                "add_retry_logic": "Focus this improvement on adding retry logic with exponential backoff for any operation that can fail transiently.",
                "improve_output_format": "Focus this improvement on making the agent's output cleaner and more structured. Add consistent formatting, use markdown tables or lists where appropriate.",
                "add_caching": "Focus this improvement on caching repeated or expensive computations to reduce token usage and improve response time.",
                "improve_web_search": "Focus this improvement on how the agent constructs and uses web search queries. Make searches more specific and results more actionable.",
                "add_self_validation": "Focus this improvement on adding self-validation: the agent should check its own output before returning, verify completeness, and flag uncertainty.",
                "reduce_token_waste": "Focus this improvement on reducing token waste. Shorten the system prompt, eliminate redundant instructions, and use more efficient language.",
            }
            direction_hint = direction_instructions.get(direction, "Improve overall quality.")
            improvement_prompt[-1]["content"] += f"\n\nEVOLUTION FOCUS: {direction_hint}"
            orchestrator = Orchestrator()
            new_code = await orchestrator.run_swarm(agent.goal, agent_id, db)

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

            score = await test_agent(new_code, agent.test_cases, agent.name, old_code=agent.agent_code, goal=agent.goal)

            # RATCKET GATE: Enforce minimum improvement threshold
            RATCHET_THRESHOLD = 0.05
            if score < (best_score + RATCHET_THRESHOLD):
                # Reject — log clearly, do NOT commit
                await log_thought(agent_id,
                    f"⛔ Ratchet: score {score:.3f} did not beat "
                    f"best {best_score:.3f} + {RATCHET_THRESHOLD} threshold — rejected")
                # Apply FAILURE_TAX (already exists in the codebase — use it)
                manager = get_evolution_manager()
                manager._failure_counts[agent_id] = manager._failure_counts.get(agent_id, 0) + 1
                failure_count = manager._failure_counts[agent_id]
                tax_multiplier = min(1.5 ** failure_count, 12.0)
                taxed_interval = int(45 * tax_multiplier)
                taxed_interval = min(taxed_interval, 1800)
                if taxed_interval > 45:
                    await log_thought(agent_id,
                        f"[FAILURE_TAX] Backing off {taxed_interval}s after {failure_count} consecutive failures")
                await asyncio.sleep(taxed_interval)
                continue

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

                # Update best_score in agent document
                await _mongo_retry(agent_id, lambda: db.agents.update_one(
                    {"id": agent_id}, {"$set": {"best_score": score}}
                ))

                # Write to MongoDB collection `evolution_ratchets`
                await db.evolution_ratchets.insert_one({
                    "agent_id": agent_id,
                    "version": new_version,
                    "previous_best": best_score,
                    "new_score": score,
                    "improvement": score - best_score,
                    "timestamp": datetime.utcnow()
                })

                # Record ROI for this successful cycle
                try:
                    await record_cycle(db, agent_id, tokens_used, score_before_cycle, score, committed=True)
                except Exception as e:
                    logger.debug("ROI record failed: %s", e)

                # Record evolution telemetry for successful cycle
                try:
                    import time
                    cycle_duration = time.time() - cycle_start_time if 'cycle_start_time' in locals() else 0.0
                    record_evolution_cycle(
                        cycle_num=new_version,
                        agent_id=agent_id,
                        success=True,
                        duration_seconds=cycle_duration,
                        tokens_consumed=tokens_used,
                        patches_applied=1,  # Each commit = 1 patch
                        improvement_direction="improving" if (score - score_before_cycle) > 0 else "stable"
                    )
                except Exception as e:
                    logger.debug("Evolution telemetry record failed: %s", e)

                # Notify meta improver of successful cycle
                try:
                    from core.meta_improver import get_meta_improver
                    meta = get_meta_improver()
                    await meta.record_cycle(db, agent_id, score - score_before_cycle, committed=True)
                except Exception as e:
                    logger.debug("Meta improver record failed: %s", e)

                # Notify PromptEvolver of successful cycle
                try:
                    from core.prompt_evolver import get_prompt_evolver
                    evolver = get_prompt_evolver()
                    await evolver.record_cycle_outcome(db, score_delta=score - score_before_cycle, committed=True, used_candidate=used_candidate_template)
                except Exception as e:
                    logger.debug("Prompt evolver record failed: %s", e)

                # Export thought log to markdown after each successful commit
                try:
                    from utils.log_exporter import export_thoughts_to_md
                    await export_thoughts_to_md(agent_id, agent_doc.get("name", agent_id), db)
                except Exception as e:
                    logger.debug("Thought export failed: %s", e)

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
                                "updated_at": datetime.now(),
                            }
                        },
                    ),
                )

                # Flip pending learned rules to applied
                await _mark_rules_applied(agent_id, db)

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

                # SKILL DIFFUSION: Extract winning pattern if score >= 0.80
                if score >= 0.80:
                    await self._extract_and_share_skill(agent, new_code, score, db)

                # Deposit learning into HiveMind
                try:
                    improvement_summary = (
                        f"Evolved to v{new_version} from v{agent.version}; "
                        f"score {agent.current_score:.2f} → {score:.2f}."
                    )
                    await hivemind.remember(
                        agent_id=agent_id,
                        agent_name=agent.name,
                        knowledge=f"Goal: {agent.goal}\nWhat worked: {improvement_summary}",
                        category="evolution_success",
                    )
                except Exception as e:
                    logger.debug("HiveMind remember failed: %s", e)

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

                # Notify PromptEvolver of failed cycle
                try:
                    from core.prompt_evolver import get_prompt_evolver
                    evolver = get_prompt_evolver()
                    await evolver.record_cycle_outcome(db, score_delta=0.0, committed=False, used_candidate=used_candidate_template)
                except Exception as e:
                    logger.debug("Prompt evolver record failed: %s", e)

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

            # Record evolution path result
            score_gain = score - score_before_cycle if 'score' in locals() else 0.0
            improved = score_gain > 0
            await db.evolution_paths.update_one(
                {"agent_id": str(agent_id), "direction": direction},
                {"$inc": {
                    "times_tried": 1,
                    "times_improved": 1 if improved else 0,
                    "total_score_gain": max(score_gain, 0)
                },
                 "$set": {"last_tried": datetime.utcnow()}},
                upsert=True
            )

            # 5. Sleep between cycles (configurable per agent, with failure tax backoff)
            interval = 45

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
            {"$set": {"status": "paused_unsafe", "updated_at": datetime.now()}},
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
            {"$set": {"status": "paused", "updated_at": datetime.now()}},
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


async def _extract_and_share_skill(self, agent, code, score, db):
    """Extract the winning pattern and save to shared skill pool."""
    # Ask the model to summarize the winning strategy in 3-5 sentences
    summary_prompt = [{"role": "user", "content":
        f"This agent code achieved a score of {score:.2f}. "
        f"Summarize in 3-5 sentences: what makes it effective? "
        f"What patterns, techniques, or approaches should other agents copy?\n\n"
        f"Agent goal: {agent.goal}\n\n"
        f"Code:\n{code[:2000]}"  # first 2000 chars only
    }]
    summary = await call_model(summary_prompt, agent_id=agent.id)

    await db.shared_skills.insert_one({
        "source_agent_id": str(agent.id),
        "source_agent_name": agent.name,
        "source_version": agent.version,
        "score": score,
        "goal_keywords": agent.goal[:100],
        "skill_summary": summary,
        "times_applied": 0,
        "created_at": datetime.utcnow()
    })

    # Cleanup: keep max 20 entries
    count = await db.shared_skills.count_documents({})
    if count > 20:
        oldest = await db.shared_skills.find_one(
            {}, sort=[("score", 1), ("created_at", 1)]
        )
        if oldest:
            await db.shared_skills.delete_one({"_id": oldest["_id"]})

    await self._broadcast("skill_diffusion", "info",
        f"🧬 Skill extracted from {agent.name} v{agent.version} "
        f"(score: {score:.2f}) → shared to skill pool")

async def _fetch_relevant_skills(self, agent_id, db):
    """Fetch top 2 shared skills relevant to this agent's goal."""
    # Get top skills by score, excluding skills from this same agent
    cursor = db.shared_skills.find(
        {"source_agent_id": {"$ne": str(agent_id)}},
        sort=[("score", -1)],
        limit=2
    )
    skills = await cursor.to_list(length=2)
    return skills

async def _select_evolution_direction(self, agent_id, db):
    """Select best evolution direction using UCB1 formula."""
    records = {d: {"tried": 0, "wins": 0, "gain": 0.0}
               for d in EVOLUTION_DIRECTIONS}

    # Load existing stats from MongoDB
    cursor = db.evolution_paths.find({"agent_id": str(agent_id)})
    async for rec in cursor:
        d = rec["direction"]
        if d in records:
            records[d]["tried"] = rec.get("times_tried", 0)
            records[d]["wins"] = rec.get("times_improved", 0)
            records[d]["gain"] = rec.get("total_score_gain", 0.0)

    total_tries = sum(r["tried"] for r in records.values())
    if total_tries == 0:
        # First time — pick randomly
        import random
        return random.choice(EVOLUTION_DIRECTIONS)

    # UCB1: balance exploitation (known good) vs exploration (untried)
    best_dir = None
    best_ucb = -1.0
    for direction, stats in records.items():
        n = stats["tried"]
        if n == 0:
            ucb = float('inf')  # always try untested directions first
        else:
            exploit = stats["gain"] / n  # average score gain
            explore = math.sqrt(2 * math.log(total_tries) / n)
            ucb = exploit + explore
        if ucb > best_ucb:
            best_ucb = ucb
            best_dir = direction

    return best_dir

async def _mark_rules_applied(agent_id: str, db):
    """
    On successful evolution commit, flip all 'pending' rules to 'applied'.
    """
    try:
        agent = await db.agents.find_one({"id": agent_id})
        if not agent:
            return
        
        learned_rules = agent.get("learned_rules", [])
        updated = False
        for rule in learned_rules:
            if rule.get("status") == "pending":
                rule["status"] = "applied"
                rule["applied_cycles"] = rule.get("applied_cycles", 0) + 1
                updated = True
        
        if updated:
            await db.agents.update_one(
                {"id": agent_id},
                {"$set": {"learned_rules": learned_rules}}
            )
            logger.info(f"[RULES] Marked pending rules as applied for agent {agent_id}")
    except Exception as e:
        logger.warning(f"Failed to mark rules as applied for agent {agent_id}: {e}")
