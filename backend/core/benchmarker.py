"""
OmniBot — Automated Agent Performance Benchmarker (Phase 6 Upgrade)

Captures current metrics (success rate, latency, quality, error rate) for an agent,
compares snapshots before/after, and aggregates scores to verify if an evolution cycle
produced a functional improvement.
"""

import logging
import re
import json
from datetime import datetime
from typing import Dict, Any, Optional
from core.database import get_db
from core.model_router import call_model

logger = logging.getLogger(__name__)


async def snapshot_agent_metrics(agent_id: str) -> Dict[str, Any]:
    """
    Captures current performance metrics for an agent:
    - success_rate (float 0.0 - 1.0)
    - avg_latency_ms (float)
    - output_quality_score (float 1.0 - 10.0)
    - error_rate (float 0.0 - 1.0)
    """
    db = get_db()
    if db is None:
        return {
            "success_rate": 0.0,
            "avg_latency_ms": 0.0,
            "output_quality_score": 5.0,
            "error_rate": 0.0,
        }

    try:
        # Calculate success_rate and error_rate from thoughts
        commits = await db.thoughts.count_documents({"agent_id": agent_id, "phase": "commit"})
        rollbacks = await db.thoughts.count_documents({"agent_id": agent_id, "phase": "rollback"})
        errors = await db.thoughts.count_documents({"agent_id": agent_id, "phase": "error"})

        total_cycles = commits + rollbacks
        success_rate = (commits / total_cycles) if total_cycles > 0 else 0.5

        total_thoughts = await db.thoughts.count_documents({"agent_id": agent_id})
        error_rate = (errors / total_thoughts) if total_thoughts > 0 else 0.0

        # Calculate average latency from agent conversations
        latency_sum = 0
        latency_count = 0
        async for conv in db.agent_conversations.find({"agent_id": agent_id, "role": "assistant"}):
            exec_time = conv.get("execution_time_ms")
            if exec_time is not None:
                latency_sum += exec_time
                latency_count += 1

        avg_latency_ms = (latency_sum / latency_count) if latency_count > 0 else 500.0

        # Output quality score: ask LLM to rate the latest assistant response or code on 1-10
        output_quality_score = 5.0
        last_conv = await db.agent_conversations.find_one(
            {"agent_id": agent_id, "role": "assistant"},
            sort=[("timestamp", -1)],
        )

        agent_doc = await db.agents.find_one({"id": agent_id})
        goal = agent_doc.get("goal", "No goal specified") if agent_doc else "No goal specified"

        content_to_grade = ""
        if last_conv and last_conv.get("content"):
            content_to_grade = last_conv.get("content")
        else:
            if agent_doc and agent_doc.get("agent_code"):
                content_to_grade = agent_doc.get("agent_code")

        if content_to_grade:
            try:
                grading_prompt = [
                    {
                        "role": "system",
                        "content": (
                            "You are an objective quality assurance grading engine. "
                            "Evaluate the provided agent response or code based on its alignment "
                            "with the specified agent goal. Return a rating from 1 to 10. "
                            "Output ONLY a single integer from 1 to 10, with no formatting or explanation."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Agent Goal: {goal}\n\n"
                            f"Agent Output/Code to Evaluate:\n{content_to_grade[:2000]}\n\n"
                            f"Grade (1-10):"
                        ),
                    },
                ]
                raw_grade = await call_model(grading_prompt, task_type="fast", agent_id=agent_id)
                match = re.search(r"\b([1-9]|10)\b", raw_grade)
                if match:
                    output_quality_score = float(match.group(1))
                else:
                    output_quality_score = 5.0
            except Exception as grading_err:
                logger.warning(
                    "[BENCHMARKER] Grading call failed for agent %s: %s",
                    agent_id[:8],
                    grading_err,
                )
                output_quality_score = 5.0

        return {
            "success_rate": round(success_rate, 4),
            "avg_latency_ms": round(avg_latency_ms, 2),
            "output_quality_score": round(output_quality_score, 2),
            "error_rate": round(error_rate, 4),
        }
    except Exception as e:
        logger.error("[BENCHMARKER] Failed to capture metrics for agent %s: %s", agent_id[:8], e)
        return {
            "success_rate": 0.5,
            "avg_latency_ms": 500.0,
            "output_quality_score": 5.0,
            "error_rate": 0.0,
        }


def compare_snapshots(before: dict, after: dict) -> dict:
    """
    Returns a delta dict showing improvement or regression for each metric.
    """
    return {
        "success_rate_delta": after.get("success_rate", 0.0) - before.get("success_rate", 0.0),
        "avg_latency_ms_delta": before.get("avg_latency_ms", 0.0) - after.get("avg_latency_ms", 0.0),  # positive = lower latency
        "output_quality_score_delta": after.get("output_quality_score", 0.0) - before.get("output_quality_score", 0.0),
        "error_rate_delta": before.get("error_rate", 0.0) - after.get("error_rate", 0.0),  # positive = fewer errors
    }


def score_improvement(delta: dict) -> float:
    """
    Returns a single float score: positive = improvement, negative = regression.
    Formula: success_rate_delta * 40 + output_quality_score_delta * 10 + (avg_latency_ms_delta / 100) + error_rate_delta * 20
    """
    score = (
        delta.get("success_rate_delta", 0.0) * 40.0
        + delta.get("output_quality_score_delta", 0.0) * 10.0
        + (delta.get("avg_latency_ms_delta", 0.0) / 100.0)
        + delta.get("error_rate_delta", 0.0) * 20.0
    )
    return round(score, 4)


async def store_benchmark(agent_id: str, cycle_id: str, phase: str, snapshot: dict) -> bool:
    """
    Persists benchmark to db: collection agent_benchmarks
    """
    db = get_db()
    if db is None:
        return False
    try:
        await db.agent_benchmarks.insert_one({
            "agent_id": agent_id,
            "cycle_id": cycle_id,
            "phase": phase,  # "before" or "after"
            "snapshot": snapshot,
            "created_at": datetime.now(),
        })
        return True
    except Exception as e:
        logger.error("[BENCHMARKER] Failed to store benchmark: %s", e)
        return False
