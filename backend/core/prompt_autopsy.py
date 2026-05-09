"""
OmniBot — Prompt Autopsy System (Nuclear Idea #1, Score 72)

After every failed evolution cycle, the LLM analyzes WHY the improvement prompt
failed and stores a structured "autopsy" document. Future prompts for the same
agent get "avoid these failure patterns" context injected automatically.
"""

import hashlib
import logging
from datetime import datetime
from typing import Optional

from core.model_router import call_model

logger = logging.getLogger(__name__)


async def analyze_failure(
    db,
    agent_id: str,
    improvement_prompt: list,
    bad_code: str,
    score_before: float,
    score_after: float,
) -> Optional[dict]:
    """
    Ask the LLM to perform a post-mortem on a failed evolution cycle.
    Stores the result in MongoDB `prompt_autopsies` collection.
    Returns the autopsy document or None on error.
    """
    try:
        prompt_hash = hashlib.md5(str(improvement_prompt).encode()).hexdigest()[:12]

        # Build the autopsy request
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a diagnostic AI analyzing why an agent evolution cycle failed. "
                    "Be concise and specific. Output valid JSON only — no markdown fences."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"An AI agent evolution cycle failed. The improvement attempt produced code "
                    f"that scored {score_after:.3f} (was {score_before:.3f}).\n\n"
                    f"--- Improvement Prompt Used ---\n"
                    f"{_summarize_messages(improvement_prompt)}\n\n"
                    f"--- Produced Code (first 600 chars) ---\n"
                    f"{bad_code[:600]}\n\n"
                    f"Analyze the failure. Output JSON with exactly these keys:\n"
                    f"{{\"failure_mode\": \"one of: wrong_approach / hallucinated_api / syntax_error / logic_regression / prompt_too_vague / over_engineered / test_mismatch\","
                    f" \"root_cause\": \"1-2 sentences\","
                    f" \"next_prompt_suggestion\": \"1-2 sentences on what the next prompt should do differently\","
                    f" \"confidence\": 0.0-1.0}}"
                ),
            },
        ]

        raw = await call_model(messages, task_type="fast", agent_id=agent_id)

        import json
        autopsy_data = json.loads(raw.strip())

        doc = {
            "agent_id": agent_id,
            "prompt_hash": prompt_hash,
            "failure_mode": autopsy_data.get("failure_mode", "unknown"),
            "root_cause": autopsy_data.get("root_cause", ""),
            "next_prompt_suggestion": autopsy_data.get("next_prompt_suggestion", ""),
            "confidence": float(autopsy_data.get("confidence", 0.5)),
            "score_before": score_before,
            "score_after": score_after,
            "timestamp": datetime.utcnow(),
        }

        await db.prompt_autopsies.insert_one(doc)
        logger.info(
            "[AUTOPSY] Agent %s: failure_mode=%s (confidence=%.2f)",
            agent_id[:8], doc["failure_mode"], doc["confidence"],
        )
        return doc

    except Exception as e:
        logger.debug("[AUTOPSY] Analysis failed for agent %s: %s", agent_id[:8], e)
        return None


async def get_autopsy_hints(db, agent_id: str, limit: int = 2) -> list[str]:
    """
    Fetch the most recent autopsy suggestions for an agent.
    Returns a list of hint strings to inject into the next improvement prompt.
    """
    try:
        docs = await db.prompt_autopsies.find(
            {"agent_id": agent_id, "confidence": {"$gte": 0.5}},
        ).sort("timestamp", -1).limit(limit).to_list(limit)

        hints = []
        for doc in docs:
            suggestion = doc.get("next_prompt_suggestion", "")
            failure_mode = doc.get("failure_mode", "unknown")
            if suggestion:
                hints.append(f"[Avoid {failure_mode}]: {suggestion}")
        return hints

    except Exception as e:
        logger.debug("[AUTOPSY] Failed to fetch hints for agent %s: %s", agent_id[:8], e)
        return []


def _summarize_messages(messages: list) -> str:
    """Flatten prompt messages to a readable summary (capped at 800 chars)."""
    parts = []
    for m in messages:
        role = m.get("role", "?")
        content = m.get("content", "")[:300]
        parts.append(f"[{role}] {content}")
    return "\n".join(parts)[:800]
