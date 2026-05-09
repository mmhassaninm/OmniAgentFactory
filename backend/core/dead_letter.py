"""
OmniBot — Dead Letter System (Phase 4)

When an agent fails completely (score never above 0.05 after 10 evolution cycles):

1. Failure Autopsy: LLM analyzes what fundamentally went wrong
2. Lessons Extracted: 3-5 concrete lessons stored in collective_memory with tag=failure_lesson
3. Ghost Agent: Failed agents become Ghosts (👻) visible in UI with their lessons
4. Resurrection: Ghost agents can be reborn, inheriting their failure lessons
"""

import logging
from datetime import datetime
from typing import Optional

from core.model_router import call_model

logger = logging.getLogger(__name__)

FAILURE_THRESHOLD_SCORE = 0.05
FAILURE_THRESHOLD_CYCLES = 10


async def check_for_complete_failure(db, agent_id: str) -> bool:
    """
    Return True if this agent qualifies as a complete failure:
    - At least FAILURE_THRESHOLD_CYCLES evolution attempts (snapshots)
    - Score never exceeded FAILURE_THRESHOLD_SCORE
    """
    try:
        agent = await db.agents.find_one({"id": agent_id})
        if not agent:
            return False

        # Ghost or already processed
        if agent.get("status") in ("ghost", "extinct", "resurrected"):
            return False

        current_score = agent.get("score", 0.0)
        version = agent.get("version", 0)

        if version < FAILURE_THRESHOLD_CYCLES:
            return False

        if current_score > FAILURE_THRESHOLD_SCORE:
            return False

        # Check if the agent ever exceeded the threshold in any committed snapshot
        best_snapshot = await db.snapshots.find_one(
            {"agent_id": agent_id, "performance_score": {"$gt": FAILURE_THRESHOLD_SCORE}},
        )
        return best_snapshot is None

    except Exception as e:
        logger.debug("[DEAD_LETTER] Failure check error for %s: %s", agent_id[:8], e)
        return False


async def process_dead_agent(db, agent_id: str) -> Optional[dict]:
    """
    Full dead letter processing pipeline:
    1. Generate failure autopsy via LLM
    2. Extract and store 3-5 lessons in collective_memory
    3. Convert agent to Ghost status in MongoDB
    Returns the ghost_record or None on error.
    """
    try:
        agent = await db.agents.find_one({"id": agent_id})
        if not agent:
            return None

        # Don't double-process
        existing = await db.ghost_agents.find_one({"agent_id": agent_id})
        if existing:
            return existing

        from utils.thought_logger import log_thought
        await log_thought(agent_id, "👻 Entering dead letter processing — generating failure autopsy...", phase="general")

        # Get last 5 evolution attempts for context
        last_snapshots = await db.snapshots.find(
            {"agent_id": agent_id},
        ).sort("committed_at", -1).limit(5).to_list(5)

        # Get autopsy hints already collected
        existing_autopsies = await db.prompt_autopsies.find(
            {"agent_id": agent_id},
        ).sort("timestamp", -1).limit(3).to_list(3)

        autopsy_summary = "\n".join(
            f"- Attempt (score: {a.get('score_after', 0):.3f}): {a.get('failure_mode', '?')} — {a.get('root_cause', '')}"
            for a in existing_autopsies
        )

        snapshot_summary = "\n".join(
            f"- v{s.get('version', 0)}: score={s.get('performance_score', 0):.3f} — {s.get('commit_message', '')}"
            for s in last_snapshots
        )

        # Step 1: Generate full failure autopsy
        messages = [
            {
                "role": "system",
                "content": (
                    "You are an AI agent failure analyst. Your job is to deeply understand "
                    "why an AI agent completely failed to improve after many attempts. "
                    "Be insightful and specific. Output valid JSON only — no markdown fences."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"This agent COMPLETELY FAILED after {agent.get('version', 0)} evolution cycles.\n\n"
                    f"Agent Name: {agent.get('name', '?')}\n"
                    f"Agent Goal: {agent.get('goal', '?')}\n"
                    f"Best Score Ever: {agent.get('score', 0):.4f} (target was > {FAILURE_THRESHOLD_SCORE})\n"
                    f"Last Code:\n{agent.get('agent_code', 'N/A')[:500]}\n\n"
                    f"Evolution History:\n{snapshot_summary}\n\n"
                    f"Failure Mode Patterns:\n{autopsy_summary}\n\n"
                    f"Analyze the fundamental reason this agent could not improve. Output JSON:\n"
                    f"{{\"fundamental_problem\": \"2-3 sentences on root cause\","
                    f" \"what_was_tried\": \"1-2 sentences on approaches that failed\","
                    f" \"what_would_have_worked\": \"2-3 sentences on what a successful approach would look like\","
                    f" \"lessons\": [\"lesson1\", \"lesson2\", \"lesson3\"],"
                    f" \"difficulty_assessment\": \"one of: goal_too_vague / insufficient_context / wrong_architecture / conflicting_constraints / goal_unreachable\"}}"
                ),
            },
        ]

        import json
        raw = await call_model(messages, task_type="fast", agent_id=agent_id)
        autopsy = json.loads(raw.strip())

        # Step 2: Store lessons in collective_memory with failure_lesson tag
        lessons_stored = 0
        for lesson in autopsy.get("lessons", []):
            if lesson and len(lesson) > 10:
                try:
                    await db.collective_memory.insert_one({
                        "agent_id": agent_id,
                        "discovery": f"[FAILURE LESSON] {lesson}",
                        "context": agent.get("goal", ""),
                        "score_delta": 0.0,
                        "timestamp": datetime.now(),
                        "times_helped": 0,
                        "tag": "failure_lesson",
                        "source_goal": agent.get("goal", ""),
                    })
                    lessons_stored += 1
                except Exception:
                    pass

        # Step 3: Create ghost record
        ghost_record = {
            "agent_id": agent_id,
            "name": agent.get("name", "?"),
            "goal": agent.get("goal", "?"),
            "original_status": agent.get("status", "stopped"),
            "final_score": agent.get("score", 0.0),
            "total_versions": agent.get("version", 0),
            "autopsy": autopsy,
            "lessons_count": lessons_stored,
            "died_at": datetime.now(),
            "resurrected": False,
        }
        await db.ghost_agents.insert_one(ghost_record)

        # Step 4: Mark agent as ghost in agents collection
        await db.agents.update_one(
            {"id": agent_id},
            {
                "$set": {
                    "status": "ghost",
                    "ghost_data": {
                        "fundamental_problem": autopsy.get("fundamental_problem", ""),
                        "lessons": autopsy.get("lessons", []),
                        "died_at": datetime.now(),
                    },
                    "updated_at": datetime.now(),
                }
            },
        )

        await log_thought(
            agent_id,
            f"👻 Agent has become a Ghost. {lessons_stored} failure lessons stored for future agents.",
            phase="general",
        )
        logger.info(
            "[DEAD_LETTER] Agent %s (%s) became a Ghost. Lessons stored: %d",
            agent_id[:8], agent.get("name"), lessons_stored,
        )

        ghost_record.pop("_id", None)
        return ghost_record

    except Exception as e:
        logger.warning("[DEAD_LETTER] Failed to process dead agent %s: %s", agent_id[:8], e)
        return None


async def resurrect_ghost(db, agent_id: str) -> Optional[dict]:
    """
    Resurrect a Ghost Agent:
    1. Load its failure lessons
    2. Create a new agent with the same goal but injected with failure lessons
    3. Mark the ghost as resurrected
    Returns the new agent or None on error.
    """
    try:
        ghost = await db.ghost_agents.find_one({"agent_id": agent_id})
        if not ghost:
            return None

        if ghost.get("resurrected"):
            return {"error": "Agent already resurrected"}

        # Fetch failure lessons for this goal
        lessons = await db.collective_memory.find(
            {"source_goal": ghost.get("goal", ""), "tag": "failure_lesson"},
        ).sort("timestamp", -1).limit(5).to_list(5)
        lesson_texts = [l.get("discovery", "") for l in lessons]

        # Create the resurrected agent with failure lessons in config
        from core.factory import get_agent_factory
        factory = get_agent_factory()

        resurrection_config = {
            "resurrection_of": agent_id,
            "failure_lessons": lesson_texts,
            "additional_instructions": (
                f"You are a resurrected agent. Your predecessor failed completely at this goal. "
                f"Previous approach fundamental problem: {ghost.get('autopsy', {}).get('fundamental_problem', 'unknown')}. "
                f"What would have worked: {ghost.get('autopsy', {}).get('what_would_have_worked', 'unknown')}."
            ),
        }

        new_agent = await factory.create_agent(
            name=f"🔄 {ghost.get('name', 'Agent')} (Reborn)",
            goal=ghost.get("goal", ""),
            template="general",
            config=resurrection_config,
        )

        # Mark ghost as resurrected
        await db.ghost_agents.update_one(
            {"agent_id": agent_id},
            {"$set": {"resurrected": True, "resurrected_as": new_agent.agent_id, "resurrected_at": datetime.now()}},
        )

        logger.info("[DEAD_LETTER] Ghost %s resurrected as %s", agent_id[:8], new_agent.agent_id[:8])
        return {"new_agent_id": new_agent.agent_id, "name": new_agent.name, "lessons_inherited": len(lesson_texts)}

    except Exception as e:
        logger.warning("[DEAD_LETTER] Resurrection failed for %s: %s", agent_id[:8], e)
        return None


async def get_all_ghosts(db) -> list:
    """Return all ghost agents with their autopsy data."""
    try:
        ghosts = await db.ghost_agents.find({}).sort("died_at", -1).to_list(100)
        for g in ghosts:
            g.pop("_id", None)
        return ghosts
    except Exception as e:
        logger.debug("[DEAD_LETTER] Failed to list ghosts: %s", e)
        return []


async def get_failure_lessons_for_goal(db, goal: str, limit: int = 3) -> list[str]:
    """
    Fetch failure lessons relevant to a goal, for injection into new agent prompts.
    These are distinct from successful collective memories — they tell agents what NOT to do.
    """
    try:
        lessons = await db.collective_memory.find(
            {"tag": "failure_lesson", "source_goal": {"$regex": goal[:30], "$options": "i"}},
        ).sort("timestamp", -1).limit(limit).to_list(limit)

        if not lessons:
            lessons = await db.collective_memory.find(
                {"tag": "failure_lesson"},
            ).sort("times_helped", -1).limit(limit).to_list(limit)

        return [l.get("discovery", "") for l in lessons if l.get("discovery")]
    except Exception:
        return []
