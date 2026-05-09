"""
OmniBot — Infinite Development Loop Orchestrator (System 8 True Autonomous Loop)

A continuous, self-improving development loop that:
1. ANALYZE: Gathers logs and database metrics.
2. IDENTIFY: Harnesses binary signals from SignalHarvester to locate poor performances.
3. IDEATE: Proposes candidate improvements based on diagnostic lessons.
4. APPROVAL GATE: Routes proposals through the deterministic Watcher Agent.
5. EXECUTE: Applies changes, injecting relevant procedural skills matching task semantics.
6. TEST & VALIDATE: Benchmarks results, triggering auto-rollbacks or synthesizing new skills.
7. REINFORCE & EXTRACT: Submits patterns to HiveMind, logs events.
8. REFLECT: Prompts the Idea Engine, evolving SOUL system prompts every 10 cycles.
"""

import asyncio
import logging
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from bson import ObjectId

from core.database import get_db, check_db_health
from core.config import get_settings
from core.checkpoint import checkpoint_draft, checkpoint_testing, checkpoint_commit, checkpoint_rollback
from core.model_router import call_model, route_completion
from core.evolve_engine import build_improvement_prompt, test_agent, _clean_code
from core.benchmarker import snapshot_agent_metrics, compare_snapshots, score_improvement, store_benchmark
from core.idea_engine import generate_ideas, store_idea
from core.collective_memory import contribute_memory
from core.hivemind import get_hivemind
from core.prompt_autopsy import analyze_failure
from utils.thought_logger import log_thought

# New Autonomous Modules
from core.signal_harvester import SignalHarvester
from core.skill_library_engine import SkillLibraryEngine
from core.watcher_agent import WatcherAgent, start_watcher_agent
from core.soul_evolver import SoulEvolver

logger = logging.getLogger(__name__)

# Global status tracking dictionary for DevLoopDashboard
dev_loop_status = {
    "status": "idle",  # idle, running, sleeping, error
    "current_phase": "N/A",
    "last_execution_time": None,
    "next_execution_time": None,
    "problems_found": 0,
    "improvements_applied": 0,
    "regressions_caught": 0,
    "total_cycles_completed": 0,
    "current_cycle_id": None,
}


async def get_dev_loop_status() -> dict:
    """Returns the live in-memory status of the Dev Loop."""
    return dev_loop_status


async def run_dev_loop_cycle(force: bool = False) -> dict:
    """
    Executes a single 8-phase optimization cycle.
    Can be force-triggered via REST.
    """
    db = get_db()
    if db is None:
        logger.error("[DEV_LOOP] MongoDB is offline. Cannot run dev loop cycle.")
        return {"error": "MongoDB offline"}

    cycle_id = f"cycle_{int(datetime.now(timezone.utc).timestamp())}"
    dev_loop_status["status"] = "running"
    dev_loop_status["current_cycle_id"] = cycle_id
    dev_loop_status["last_execution_time"] = datetime.now(timezone.utc).isoformat()
    dev_loop_status["current_phase"] = "START"

    logger.info("🚀 Starting True Autonomous Infinite Development Loop Cycle: %s", cycle_id)

    cycle_log = {
        "cycle_id": cycle_id,
        "timestamp": datetime.now(timezone.utc),
        "phases_completed": [],
        "problems": [],
        "improvements": [],
        "benchmarks": [],
        "ideas": [],
    }

    try:
        # Initialize helper modules
        harvester = SignalHarvester()
        skill_engine = SkillLibraryEngine()
        
        try:
            watcher = WatcherAgent()
        except Exception as w_err:
            logger.error("[DEV_LOOP] Failed to initialize WatcherAgent: %s. Fallbacks will apply.", w_err)
            watcher = None

        # ──────────────────────────────────────────────────────────────────────
        # PHASE 1: ANALYZE
        # ──────────────────────────────────────────────────────────────────────
        dev_loop_status["current_phase"] = "1. ANALYZE"
        logger.info("[DEV_LOOP] Phase 1: Gathering database execution profiles.")
        
        agents_cursor = db.agents.find({"status": {"$nin": ["extinct", "archived"]}})
        agents = await agents_cursor.to_list(100)
        
        logger.info("[DEV_LOOP] Found %d active agents for analysis.", len(agents))
        cycle_log["phases_completed"].append("ANALYZE")

        # ──────────────────────────────────────────────────────────────────────
        # PHASE 2: IDENTIFY
        # ──────────────────────────────────────────────────────────────────────
        dev_loop_status["current_phase"] = "2. IDENTIFY"
        logger.info("[DEV_LOOP] Phase 2: Detecting failures via SignalHarvester (Objective Metrics).")
        
        problems_to_solve = []

        # Rule A: Query objective low-score sessions from SignalHarvester (pure metrics)
        low_sessions = await harvester.get_low_score_sessions(threshold=0.4, last_n=50)
        for s in low_sessions:
            agent_id = s["agent_id"]
            agent_doc = await db.agents.find_one({"id": agent_id})
            if agent_doc:
                problems_to_solve.append({
                    "agent_id": agent_id,
                    "agent_name": agent_doc.get("name", "Unknown"),
                    "score": s["score"],
                    "version": agent_doc.get("version", 0),
                    "issue": "low_execution_signal",
                    "description": s["description"],
                    "goal": agent_doc.get("goal", "")
                })

        # Rule B: Stagnant Check (version >= 5, score has not increased recently)
        for agent in agents:
            agent_id = agent.get("id")
            version = agent.get("version", 0)
            if version >= 5 and agent_id not in [p["agent_id"] for p in problems_to_solve]:
                recent_thoughts = await db.thoughts.find(
                    {"agent_id": agent_id, "phase": "commit"}
                ).sort("timestamp", -1).limit(5).to_list(5)
                
                if len(recent_thoughts) < 2:
                    problems_to_solve.append({
                        "agent_id": agent_id,
                        "agent_name": agent.get("name", "Unknown"),
                        "score": agent.get("score", 0.0),
                        "version": version,
                        "issue": "stagnant",
                        "description": f"Agent '{agent.get('name')}' is stagnant at version {version} with unchanging scoring.",
                        "goal": agent.get("goal", "")
                    })

        dev_loop_status["problems_found"] += len(problems_to_solve)
        cycle_log["problems"] = problems_to_solve
        cycle_log["phases_completed"].append("IDENTIFY")

        # ──────────────────────────────────────────────────────────────────────
        # PHASE 3: IDEATE
        # ──────────────────────────────────────────────────────────────────────
        dev_loop_status["current_phase"] = "3. IDEATE"
        logger.info("[DEV_LOOP] Phase 3: Drafting architectural optimizations and prompt proposals.")
        
        new_pending_improvements = []
        
        for prob in problems_to_solve:
            agent_id = prob["agent_id"]
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are the Meta-Improver subsystem. Propose a specific prompt instruction rewrite, "
                        "structural optimization, or config adjustment to solve the agent's bottleneck. "
                        "Determine estimated impact (high/medium/low) and risk level (high/medium/low). "
                        "Your output must be a valid JSON object with keys: 'proposed_fix', 'fix_type' "
                        "(prompt, structure, or config), 'estimated_impact' (0.0-1.0), and 'risk_level' "
                        "(low, medium, or high). Output ONLY valid JSON."
                    )
                },
                {
                    "role": "user",
                    "content": f"Agent: {prob['agent_name']}\nGoal: {prob.get('goal', 'Optimize performance')}\nCurrent Score: {prob['score']}\nIssue: {prob['description']}"
                }
            ]
            
            try:
                raw_improver = await call_model(messages, task_type="research", agent_id=agent_id)
                raw_improver = raw_improver.strip()
                if raw_improver.startswith("```"):
                    raw_improver = raw_improver.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                
                improver_data = json.loads(raw_improver)
                proposed_fix = improver_data.get("proposed_fix", "")
                fix_type = improver_data.get("fix_type", "prompt")
                estimated_impact = float(improver_data.get("estimated_impact", 0.5))
                risk_level = improver_data.get("risk_level", "medium")
                
                improvement_doc = {
                    "cycle_id": cycle_id,
                    "problem_description": prob["description"],
                    "proposed_fix": proposed_fix,
                    "fix_type": fix_type,
                    "target_agent_id": agent_id,
                    "estimated_impact": estimated_impact,
                    "risk_level": risk_level,
                    "status": "pending",
                    "created_at": datetime.now(timezone.utc),
                    "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
                }
                
                # Insert into DB
                await db.pending_improvements.insert_one(improvement_doc)
                new_pending_improvements.append(improvement_doc)
                
            except Exception as idea_err:
                logger.error("[DEV_LOOP] Ideation failed for agent %s: %s", agent_id[:8], idea_err)

        cycle_log["phases_completed"].append("IDEATE")

        # ──────────────────────────────────────────────────────────────────────
        # PHASE 4: APPROVAL GATE (Watcher Agent Integration)
        # ──────────────────────────────────────────────────────────────────────
        dev_loop_status["current_phase"] = "4. APPROVAL GATE"
        logger.info("[DEV_LOOP] Phase 4: Running Watcher Agent rules to resolve approvals autonomously.")
        
        # Dispatched structured Telegram notifications
        if new_pending_improvements:
            settings = get_settings()
            if settings.telegram_bot_token and settings.telegram_chat_id:
                try:
                    from services.telegram_commander import TelegramCommander
                    commander = TelegramCommander(settings.telegram_bot_token, settings.telegram_chat_id)
                    telegram_msg = f"🛡️ *OmniBot Watcher Loop Dispatch: {cycle_id}*\n"
                    telegram_msg += f"Running safety rules on {len(new_pending_improvements)} optimizations:\n"
                    for imp in new_pending_improvements[:5]:
                        telegram_msg += f"• *Agent:* `{imp['target_agent_id'][:8]}` | *Type:* `{imp['fix_type'].upper()}`\n"
                    await commander.send(telegram_msg)
                except Exception as tg_err:
                    logger.warning("[DEV_LOOP] Failed to send Telegram notice: %s", tg_err)

        # Apply Watcher decisions
        for imp in new_pending_improvements:
            if watcher:
                try:
                    verdict = await watcher.evaluate_improvement(imp)
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
                        imp["status"] = "approved"
                        logger.info("[DEV_LOOP] Watcher APPROVED improvement for agent %s. Risk: %s", imp["target_agent_id"][:8], imp["risk_level"])
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
                        imp["status"] = "rejected"
                        logger.info("[DEV_LOOP] Watcher REJECTED improvement for agent %s. Reason: %s", imp["target_agent_id"][:8], verdict.rule_triggered)
                except Exception as eval_err:
                    logger.error("[DEV_LOOP] Watcher crashed. Fallback to default applied. Error: %s", eval_err)
                    # Safe fallback
                    if imp["risk_level"] == "low" or force:
                        await db.pending_improvements.update_one(
                            {"_id": imp["_id"]},
                            {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc)}}
                        )
                        imp["status"] = "approved"
                    else:
                        await db.pending_improvements.update_one(
                            {"_id": imp["_id"]},
                            {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc), "rejection_reason": "watcher_error"}}
                        )
                        imp["status"] = "rejected"
            else:
                # No watcher agent initialized: use low-risk fallback auto-approvals
                if imp["risk_level"] == "low" or force:
                    await db.pending_improvements.update_one(
                        {"_id": imp["_id"]},
                        {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc)}}
                    )
                    imp["status"] = "approved"
                else:
                    await db.pending_improvements.update_one(
                        {"_id": imp["_id"]},
                        {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc), "rejection_reason": "watcher_offline"}}
                    )
                    imp["status"] = "rejected"

        cycle_log["phases_completed"].append("APPROVAL_GATE")

        # ──────────────────────────────────────────────────────────────────────
        # PHASE 5: EXECUTE (Autonomous Skill Injection)
        # ──────────────────────────────────────────────────────────────────────
        dev_loop_status["current_phase"] = "5. EXECUTE"
        logger.info("[DEV_LOOP] Phase 5: Injecting context skills and compiling evolutions.")
        
        approved_cursor = db.pending_improvements.find({
            "status": "approved",
            "cycle_id": cycle_id
        })
        approved_list = await approved_cursor.to_list(100)
        
        for imp in approved_list:
            agent_id = imp["target_agent_id"]
            proposed_fix = imp["proposed_fix"]
            
            agent_doc = await db.agents.find_one({"id": agent_id})
            if not agent_doc:
                continue
                
            from agents.base_agent import BaseAgent
            agent_obj = BaseAgent.from_dict(agent_doc)
            
            # Fetch and inject similar procedural skills via Vector recall
            relevant_skills = await skill_engine.load_relevant_skills(agent_obj.goal, max_skills=3)
            if relevant_skills:
                skills_context = "\n\nInherited Procedural Knowledge from successful runs:\n" + "\n---\n".join(relevant_skills)
                proposed_fix = f"{proposed_fix}\n{skills_context}"
                logger.info("[DEV_LOOP] Injected %d active skills into prompt template for: %s", len(relevant_skills), agent_id[:8])

            # Capture BEFORE metrics
            before_metrics = await snapshot_agent_metrics(agent_id)
            await store_benchmark(agent_id, cycle_id, "before", before_metrics)
            
            # Start Checkpoint lifecycle
            await checkpoint_draft(agent_id, agent_obj.agent_code, agent_obj.config, agent_obj.current_score)
            
            # Run LLM single-step evolution using proposed_fix
            improvement_prompt = build_improvement_prompt(
                agent_obj,
                dna=agent_doc.get("dna"),
                fix_directive=proposed_fix
            )
            
            from core.swarm import Orchestrator
            orchestrator = Orchestrator()
            new_code = await orchestrator.run_swarm(agent_obj.goal, agent_id, db)
            
            if new_code.startswith("[MODEL_ROUTER_ERROR]"):
                await checkpoint_rollback(agent_id)
                await db.pending_improvements.update_one(
                    {"_id": imp["_id"]},
                    {"$set": {"status": "failed", "error": "Model Router Error"}}
                )
                continue
                
            new_code = _clean_code(new_code)
            
            # ──────────────────────────────────────────────────────────────────────
            # PHASE 6: TEST & VALIDATE
            # ──────────────────────────────────────────────────────────────────────
            dev_loop_status["current_phase"] = "6. TEST & VALIDATE"
            logger.info("[DEV_LOOP] Phase 6: Verifying score metrics and compiling.")
            
            await checkpoint_testing(agent_id)
            score = await test_agent(new_code, agent_obj.test_cases, agent_obj.name, old_code=agent_obj.agent_code, goal=agent_obj.goal)
            
            # Capture AFTER metrics
            after_metrics = {
                "success_rate": round(score, 4),
                "avg_latency_ms": before_metrics.get("avg_latency_ms", 500.0),
                "output_quality_score": before_metrics.get("output_quality_score", 5.0),
                "error_rate": before_metrics.get("error_rate", 0.0),
            }
            await store_benchmark(agent_id, cycle_id, "after", after_metrics)
            
            deltas = compare_snapshots(before_metrics, after_metrics)
            improvement_delta = score_improvement(deltas)
            
            # Rollback check: if there is score regression
            if score < agent_obj.current_score:
                await checkpoint_rollback(agent_id)
                dev_loop_status["regressions_caught"] += 1
                logger.warning("[DEV_LOOP] Regression caught for agent %s! Score: %.2f -> %.2f", agent_id[:8], agent_obj.current_score, score)
                
                await db.pending_improvements.update_one(
                    {"_id": imp["_id"]},
                    {"$set": {"status": "failed", "error": "Score regression"}}
                )
                
                # Analyze failure patterns (Prompt Autopsy)
                await analyze_failure(db, agent_id, improvement_prompt, new_code, agent_obj.current_score, score)
            else:
                # Commit successful improvement!
                new_version = await checkpoint_commit(
                    agent_id,
                    new_code,
                    score,
                    f"Infinite Dev Loop optimization: score {agent_obj.current_score:.2f} -> {score:.2f}"
                )
                dev_loop_status["improvements_applied"] += 1
                logger.info("[DEV_LOOP] Success! Committed v%d for agent %s. Score: %.2f -> %.2f", new_version, agent_id[:8], agent_obj.current_score, score)
                
                await db.pending_improvements.update_one(
                    {"_id": imp["_id"]},
                    {"$set": {"status": "applied", "applied_version": new_version}}
                )
                
                await db.agents.update_one(
                    {"id": agent_id},
                    {"$set": {
                        "agent_code": new_code,
                        "score": score,
                        "version": new_version,
                        "updated_at": datetime.now(timezone.utc)
                    }}
                )

                # ── Skill Synthesis ──
                # Synthesize new skills from highly successful execution records
                if score > 0.7:
                    latest_run = await db.agent_runs.find_one(
                        {"agent_id": agent_id},
                        sort=[("started_at", -1)]
                    )
                    if latest_run:
                        logger.info("[DEV_LOOP] High scoring run completed. Synthesizing reusable skill...")
                        await skill_engine.synthesize_skill_from_session(agent_id, latest_run["run_id"])

                # ──────────────────────────────────────────────────────────────────────
                # PHASE 7: REINFORCE & EXTRACT
                # ──────────────────────────────────────────────────────────────────────
                dev_loop_status["current_phase"] = "7. REINFORCE & EXTRACT"
                logger.info("[DEV_LOOP] Phase 7: Writing lessons to collective memory and HiveMind.")
                
                await contribute_memory(
                    db, agent_id,
                    discovery=new_code[:800],
                    context=agent_obj.goal,
                    score_delta=score - agent_obj.current_score
                )
                
                hivemind = get_hivemind()
                await hivemind.remember(
                    agent_id=agent_id,
                    agent_name=agent_obj.name,
                    knowledge=f"Optimization committed v{new_version}. Approved improvement applied.",
                    category="infinite_dev_loop"
                )

        cycle_log["phases_completed"].append("EXECUTE")
        cycle_log["phases_completed"].append("TEST_VALIDATE")
        cycle_log["phases_completed"].append("REINFORCE_EXTRACT")

        # ──────────────────────────────────────────────────────────────────────
        # PHASE 8: REFLECT (SOUL prompt tuning)
        # ──────────────────────────────────────────────────────────────────────
        dev_loop_status["current_phase"] = "8. REFLECT"
        logger.info("[DEV_LOOP] Phase 8: Seeding future ideas & evolving active agent SOUL prompts.")
        
        future_ideas = await generate_ideas(cycle_log)
        for idea in future_ideas:
            idea["cycle_id"] = cycle_id
            await store_idea(idea)
            cycle_log["ideas"].append(idea)
            
        cycle_log["phases_completed"].append("REFLECT")

        # Evolve active agent SOUL (System Prompt) personas every 10 complete cycles
        dev_loop_status["total_cycles_completed"] += 1
        if dev_loop_status["total_cycles_completed"] % 10 == 0:
            logger.info("[DEV_LOOP] Cycle 10 threshold reached. Initializing system-wide SOUL evolutions.")
            soul_engine = SoulEvolver()
            for agent in agents:
                await soul_engine.run(agent.get("id"))

        # Log completion
        dev_loop_status["status"] = "idle"
        dev_loop_status["current_phase"] = "COMPLETE"
        
        await db.dev_loop_history.insert_one(cycle_log)
        logger.info("🎉 Infinite Development Loop Cycle %s completed successfully!", cycle_id)
        return {"status": "success", "cycle_id": cycle_id}

    except Exception as e:
        logger.error("[DEV_LOOP] Infinite Dev Loop Cycle %s failed with exception: %s", cycle_id, e, exc_info=True)
        dev_loop_status["status"] = "error"
        dev_loop_status["current_phase"] = f"ERROR: {str(e)[:50]}"
        return {"status": "error", "error": str(e)}


async def _infinite_dev_loop_worker():
    """Persistent background task running cycles periodically."""
    logger.info("⚙️ [DEV_LOOP] Starting Infinite Development Loop background worker...")
    
    # Wait for Mongo & other services to warm up
    await asyncio.sleep(30)
    
    while True:
        try:
            settings = get_settings()
            if not settings.enable_dev_loop:
                logger.debug("[DEV_LOOP] Infinite Dev Loop is disabled. Sleeping 1 minute.")
                await asyncio.sleep(60)
                continue
                
            # Verify Mongo connection
            if not await check_db_health():
                logger.warning("[DEV_LOOP] Database is down. Waiting 30s to retry.")
                await asyncio.sleep(30)
                continue

            # Run a development cycle
            dev_loop_status["status"] = "running"
            await run_dev_loop_cycle()
            
            # Calculate sleep window
            interval_minutes = settings.dev_loop_interval_minutes
            logger.info("[DEV_LOOP] Cycle complete. Resting for %d minutes.", interval_minutes)
            
            dev_loop_status["status"] = "sleeping"
            dev_loop_status["next_execution_time"] = (datetime.now(timezone.utc) + timedelta(minutes=interval_minutes)).isoformat()
            
            # Interruptible sleep
            for _ in range(interval_minutes * 60):
                await asyncio.sleep(1)
                
        except asyncio.CancelledError:
            logger.warning("[DEV_LOOP] Background worker cancelled.")
            break
        except Exception as e:
            logger.error("[DEV_LOOP] Error in infinite dev loop background worker: %s", e, exc_info=True)
            await asyncio.sleep(60)


async def _bootstrap_or_start_worker():
    """Checks if bootstrap is needed, otherwise starts the main worker loop."""
    db = get_db()
    bootstrap_state = await db.system.find_one({"key": "bootstrap_state"})
    
    if not bootstrap_state or not bootstrap_state.get("bootstrap_complete"):
        logger.info("[BOOTSTRAP] First run detected. Starting self-play bootstrap...")
        logger.info("[BOOTSTRAP] This will take ~15 minutes. The loop starts after.")
        from core.bootstrap_engine import BootstrapEngine
        asyncio.create_task(BootstrapEngine.run())
    else:
        logger.info(f"[BOOTSTRAP] Already complete ({bootstrap_state.get('completed_at')})")
        logger.info(f"[BOOTSTRAP] {bootstrap_state.get('skills_synthesized', 0)} skills loaded.")
        settings = get_settings()
        if settings.enable_dev_loop:
            asyncio.create_task(_infinite_dev_loop_worker())


def start_infinite_dev_loop():
    """Schedules the background loop execution."""
    # Start the Watcher agent's background approval scanner
    start_watcher_agent()
    
    # Start the optimizer loop worker or bootstrap engine
    asyncio.create_task(_bootstrap_or_start_worker())
