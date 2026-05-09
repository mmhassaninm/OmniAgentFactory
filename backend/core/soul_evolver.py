"""
SoulEvolver: Dynamically evolves agent personas (system prompts) based on historical signals.
Runs once every 10 dev loop cycles to perform second-order persona prompt tuning.
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from core.database import get_db
from core.model_router import call_model
from core.signal_harvester import SignalHarvester

logger = logging.getLogger(__name__)

TASKS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "eval", "standard_tasks.json")


class SoulEvolver:
    """
    Evolves the system instructions of an agent by gathering historical signals,
    identifying recurring success/failure metrics, generating an optimized SOUL prompt,
    and verifying improvement against the standard evaluation task suite.
    """

    async def run(self, agent_id: str) -> bool:
        """Executes a complete SOUL evolution run for the targeted agent."""
        db = get_db()
        agent_doc = await db.agents.find_one({"id": agent_id})
        if not agent_doc:
            logger.warning("[SoulEvolver] Target agent %s not found.", agent_id)
            return False

        logger.info("[SoulEvolver] Beginning SOUL Evolution for agent: %s (%s)", agent_doc.get("name"), agent_id)

        # 1. Fetch historical signals (last 100)
        signals = await db.agent_signals.find({"agent_id": agent_id}).sort("created_at", -1).limit(100).to_list(100)
        if not signals:
            logger.info("[SoulEvolver] Insufficient execution signals to guide evolution for agent: %s", agent_id)
            return False

        # 2. Extract failure and success patterns
        failures = [s for s in signals if s.get("value", 1.0) < 0.4]
        successes = [s for s in signals if s.get("value", 0.0) >= 0.8]

        failure_desc = [f"- {f.get('tool_name') or 'thought'}: {f.get('raw_evidence')[:100]}" for f in failures[:5]]
        success_desc = [f"- {s.get('tool_name') or 'thought'}: {s.get('raw_evidence')[:100]}" for s in successes[:5]]

        failures_text = "\n".join(failure_desc) if failure_desc else "- None observed."
        successes_text = "\n".join(success_desc) if success_desc else "- Standard functional completions."

        # 3. Retrieve current SOUL text
        config = agent_doc.get("config", {})
        current_soul = config.get("system_prompt") or agent_doc.get("goal")

        # 4. Prompt LLM to rewrite SOUL prompt to reinforce success and fix failures
        prompt = (
            f"You are an Elite SOUL Prompt Engineer. Optimize the core instructions for agent '{agent_doc.get('name')}'.\n\n"
            f"Current Prompt Guidelines:\n{current_soul}\n\n"
            f"Observed Success Patterns:\n{successes_text}\n\n"
            f"Observed Failure Patterns:\n{failures_text}\n\n"
            "Rewrite the system prompt (SOUL) to reinforce the success patterns and correct the failure patterns.\n"
            "Instruct the agent explicitly on how to bypass these errors and optimize tool usage.\n"
            "Keep the entire prompt brief and actionable (under 500 words).\n"
            "Output ONLY the optimized prompt text. Do not include markdown headers, quotes, or surrounding backticks."
        )

        try:
            new_soul = await call_model(
                messages=[{"role": "user", "content": prompt}],
                task_type="research",
                agent_id=agent_id
            )
            new_soul = new_soul.strip()
            if new_soul.startswith("```"):
                new_soul = new_soul.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            # 5. Evaluate current vs new SOUL against standard benchmark suite
            old_score = await self.evaluate_soul_performance(current_soul, agent_id)
            new_score = await self.evaluate_soul_performance(new_soul, agent_id)

            logger.info("[SoulEvolver] Evaluation Results -> Pre-evolution Score: %.2f | Post-evolution Score: %.2f", old_score, new_score)

            # 6. Commit only if performance increases by at least 5%
            improvement_threshold = old_score * 1.05 if old_score > 0 else 0.05
            if new_score >= improvement_threshold:
                # Update agent configuration
                config["system_prompt"] = new_soul
                config["additional_instructions"] = f"SOUL Evolved instructions on {datetime.now().strftime('%Y-%m-%d')}"
                
                # Fetch next version integer
                version_history = await db.soul_versions.find({"agent_id": agent_id}).sort("version", -1).limit(1).to_list(1)
                next_version = (version_history[0].get("version", 0) + 1) if version_history else 1

                # Save record to soul_versions collection
                await db.soul_versions.insert_one({
                    "agent_id": agent_id,
                    "version": next_version,
                    "soul_text": new_soul,
                    "score": new_score,
                    "replaced_at": datetime.now(timezone.utc),
                    "failure_patterns_fixed": [f.get('tool_name') for f in failures[:3]],
                    "success_patterns_reinforced": [s.get('tool_name') for s in successes[:3]]
                })

                # Update the active agent doc
                await db.agents.update_one(
                    {"id": agent_id},
                    {"$set": {"config": config, "updated_at": datetime.now(timezone.utc)}}
                )

                logger.info("[SoulEvolver] 🎉 SOUL evolution committed! Promoted agent to SOUL prompt version v%d.", next_version)
                return True
            else:
                logger.info("[SoulEvolver] Discarded evolved SOUL. Insufficient performance improvement.")
                return False

        except Exception as e:
            logger.error("[SoulEvolver] Failed to evolve SOUL for agent %s: %s", agent_id, e, exc_info=True)
            return False

    async def evaluate_soul_performance(self, soul_text: str, agent_id: str) -> float:
        """
        Runs the standard task suite against a simulated/sandboxed execution of the agent,
        obtaining signals from SignalHarvester to generate an objective performance metric.
        """
        if not os.path.exists(TASKS_PATH):
            logger.warning("[SoulEvolver] Standard tasks suite not found. Falling back to default benchmark score.")
            return 0.5

        try:
            with open(TASKS_PATH, "r", encoding="utf-8") as f:
                tasks = json.load(f)
        except Exception as e:
            logger.error("[SoulEvolver] Failed to read standard_tasks.json: %s", e)
            return 0.5

        scores = []
        harvester = SignalHarvester()

        # We evaluate the first 5 standard tasks to conserve token budgets and maximize execution speed
        for task in tasks[:5]:
            try:
                # Perform a single completion call utilizing the evolved system instructions
                messages = [
                    {"role": "system", "content": f"{soul_text}\n\nIdentify and return optimal tool path for task: {task['name']}"},
                    {"role": "user", "content": task["description"]}
                ]
                
                result = await call_model(messages, task_type="general", agent_id=agent_id)
                
                # Check outcome using pure Python parser
                tool_signal = harvester.harvest_from_tool_result(task["expected_tool"], result, duration_ms=250)
                scores.append(tool_signal.get("value", 0.0))
            except Exception as task_err:
                logger.warning("[SoulEvolver] Standard task %s failed execution: %s", task["task_id"], task_err)
                scores.append(0.0)

        return sum(scores) / len(scores) if scores else 0.0
