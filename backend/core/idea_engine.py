"""
OmniBot — Automated Agent Idea Generator (Phase 7 Wildest Idea Upgrade)

Based on validated improvements and remaining problems, generates structural and prompt-based
ideas using LLM ideation mode, scores them for impact/feasibility, and stores them to seed the
next evolution cycle.
"""

import logging
import json
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from core.database import get_db
from core.model_router import call_model

logger = logging.getLogger(__name__)


async def generate_ideas(cycle_results: dict) -> List[dict]:
    """
    Generates a list of structural improvement ideas using the LLM.
    Uses 'ideation mode' to suggest capabilities that should be explored.
    """
    try:
        results_summary = json.dumps(cycle_results, default=str)
        prompt = [
            {
                "role": "system",
                "content": (
                    "You are the ideation subsystem of a self-evolving autonomous AI agent factory. "
                    "Based on the results of the recent optimization cycle, propose 3 new structural, "
                    "prompt-based, or capability-based ideas for our agents. "
                    "Your output must be a valid JSON array of objects, with no markdown formatting or fences. "
                    "Each object must have exactly these keys:\n"
                    " - 'idea_text': a clear, actionable description of the capability or improvement\n"
                    " - 'source_phase': the phase identifier (e.g. 'ideation')\n"
                    " - 'priority_score': an estimated value score from 0.1 to 1.0"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Recent Cycle Results:\n{results_summary}\n\n"
                    "Given these results, what new capabilities or improvements should be explored to increase performance, "
                    "robustness, and autonomy? Propose 3 high-impact ideas. Return ONLY valid JSON."
                ),
            },
        ]

        raw_output = await call_model(prompt, task_type="research")
        raw_output = raw_output.strip()

        # Clean markdown if present
        if raw_output.startswith("```"):
            raw_output = raw_output.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        ideas = []
        try:
            ideas = json.loads(raw_output)
        except json.JSONDecodeError:
            # Fallback regex extraction of JSON list if output is messy
            match = re.search(r"\[\s*\{.*\}\s*\]", raw_output, re.DOTALL)
            if match:
                try:
                    ideas = json.loads(match.group(0))
                except Exception as e:
                    logger.debug("Failed to parse extracted JSON from raw output: %s", e)

        validated_ideas = []
        for item in ideas:
            if isinstance(item, dict) and "idea_text" in item:
                validated_ideas.append({
                    "idea_text": item.get("idea_text"),
                    "source_phase": item.get("source_phase", "ideation"),
                    "priority_score": float(item.get("priority_score", 0.5)),
                })

        return validated_ideas
    except Exception as e:
        logger.error("[IDEA_ENGINE] Error generating ideas: %s", e)
        return []


async def score_idea(idea_text: str) -> float:
    """
    Asks the LLM to rate feasibility and impact of an idea, and returns a priority score (0.0 to 1.0).
    """
    try:
        prompt = [
            {
                "role": "system",
                "content": (
                    "You are a professional AI engineering evaluator. "
                    "Evaluate the feasibility and impact of the following proposed capability idea. "
                    "Return ONLY a JSON object with keys 'feasibility' (0.0-1.0) and 'impact' (0.0-1.0). "
                    "Output nothing else — no explanations, no markdown fences."
                ),
            },
            {
                "role": "user",
                "content": f"Proposed Idea: {idea_text}",
            },
        ]
        raw_score = await call_model(prompt, task_type="fast")
        raw_score = raw_score.strip()
        if raw_score.startswith("```"):
            raw_score = raw_score.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        score_data = json.loads(raw_score)
        feasibility = float(score_data.get("feasibility", 0.5))
        impact = float(score_data.get("impact", 0.5))
        return round(feasibility * impact, 4)
    except Exception as e:
        logger.warning("[IDEA_ENGINE] Error scoring idea: %s", e)
        return 0.5


async def store_idea(idea: dict) -> bool:
    """
    Saves an idea to the `future_ideas` collection.
    """
    db = get_db()
    if db is None:
        return False
    try:
        doc = {
            "idea_text": idea.get("idea_text"),
            "source_phase": idea.get("source_phase", "ideation"),
            "cycle_id": idea.get("cycle_id"),
            "priority_score": idea.get("priority_score", 0.5),
            "status": "new",
            "created_at": datetime.now(),
        }
        await db.future_ideas.insert_one(doc)
        return True
    except Exception as e:
        logger.error("[IDEA_ENGINE] Failed to store idea: %s", e)
        return False


async def get_top_ideas(n: int = 5) -> List[dict]:
    """
    Retrieves highest-priority ideas to seed next cycle.
    """
    db = get_db()
    if db is None:
        return []
    try:
        cursor = db.future_ideas.find({"status": "new"}).sort("priority_score", -1).limit(n)
        ideas = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            ideas.append(doc)
        return ideas
    except Exception as e:
        logger.error("[IDEA_ENGINE] Failed to get top ideas: %s", e)
        return []


async def mark_idea_implemented(idea_id: str) -> bool:
    """
    Closes the loop when an idea becomes an improvement.
    """
    db = get_db()
    if db is None:
        return False
    try:
        from bson import ObjectId

        await db.future_ideas.update_one(
            {"_id": ObjectId(idea_id)},
            {"$set": {"status": "implemented", "implemented_at": datetime.now()}},
        )
        return True
    except Exception as e:
        logger.error("[IDEA_ENGINE] Failed to mark idea implemented: %s", e)
        return False
