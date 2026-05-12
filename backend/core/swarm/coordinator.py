"""
Swarm Coordinator — decomposes complex tasks, assigns sub-tasks to the best-suited
agents, collects results, and synthesizes the final output.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from core.database import get_db

logger = logging.getLogger(__name__)

# Agent roles and their specializations
SWARM_AGENTS: dict[str, dict[str, Any]] = {
    "orchestrator": {
        "role": "Task Orchestrator",
        "description": "Decomposes complex tasks and coordinates execution",
    },
    "coder": {
        "role": "Code Specialist",
        "description": "Writes, reviews, and debugs code",
    },
    "researcher": {
        "role": "Research Analyst",
        "description": "Gathers information and analyzes data",
    },
    "reviewer": {
        "role": "Code Reviewer",
        "description": "Reviews code for bugs, security issues, and best practices",
    },
    "analyst": {
        "role": "Data Analyst",
        "description": "Analyzes data, generates insights, builds reports",
    },
    "marketer": {
        "role": "Marketing Specialist",
        "description": "Generates content, social posts, email campaigns",
    },
}


class SwarmCoordinator:
    """
    Coordinates multi-agent swarm tasks through decomposition and synthesis.
    """

    async def submit_task(self, task: str, user_id: str = "system") -> dict[str, Any]:
        """
        Submit a complex task to the swarm coordinator.

        Steps:
        1. LLM decomposes into sub-tasks (max 5)
        2. Assign each sub-task to best-suited agent
        3. Collect all results
        4. LLM synthesizes final result

        Args:
            task: The complex task description
            user_id: User who submitted the task

        Returns:
            dict with task_id, sub_tasks, results, final_output, status
        """
        db = get_db()
        task_id = f"swarm_{datetime.now(timezone.utc).timestamp():.0f}"

        swarm_task = {
            "task_id": task_id,
            "task": task,
            "user_id": user_id,
            "status": "decomposing",
            "sub_tasks": [],
            "results": [],
            "final_output": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
        }
        await db.swarm_tasks.insert_one(swarm_task)

        # Decompose task into sub-tasks
        try:
            sub_tasks = await self._decompose_task(task)
            swarm_task["sub_tasks"] = sub_tasks
            swarm_task["status"] = "executing"
            await db.swarm_tasks.update_one(
                {"task_id": task_id},
                {"$set": {"sub_tasks": sub_tasks, "status": "executing"}},
            )
        except Exception as e:
            logger.warning("[SwarmCoordinator] Decomposition failed: %s", e)
            sub_tasks = [{"agent": "orchestrator", "description": task, "order": 1}]
            swarm_task["sub_tasks"] = sub_tasks

        # Execute sub-tasks (in order)
        results: list[dict[str, Any]] = []
        for sub in sub_tasks:
            try:
                result = await self._execute_sub_task(sub, task_id)
                results.append(result)
                swarm_task["results"] = results
                await db.swarm_tasks.update_one(
                    {"task_id": task_id},
                    {"$set": {"results": results}},
                )
            except Exception as e:
                logger.warning("[SwarmCoordinator] Sub-task execution failed: %s", e)
                results.append({
                    "agent": sub.get("agent", "unknown"),
                    "status": "error",
                    "output": str(e)[:300],
                })

        # Synthesize final result
        try:
            final_output = await self._synthesize_results(task, results)
            swarm_task["final_output"] = final_output
            swarm_task["status"] = "completed"
            swarm_task["completed_at"] = datetime.now(timezone.utc).isoformat()
        except Exception as e:
            logger.warning("[SwarmCoordinator] Synthesis failed: %s", e)
            swarm_task["final_output"] = "Synthesis failed"
            swarm_task["status"] = "completed_with_errors"
            swarm_task["completed_at"] = datetime.now(timezone.utc).isoformat()

        await db.swarm_tasks.update_one(
            {"task_id": task_id},
            {"$set": {
                "status": swarm_task["status"],
                "final_output": swarm_task["final_output"],
                "completed_at": swarm_task["completed_at"],
            }},
        )

        return {
            "task_id": task_id,
            "status": swarm_task["status"],
            "sub_tasks": sub_tasks,
            "results": results,
            "final_output": swarm_task["final_output"],
        }

    async def _decompose_task(self, task: str) -> list[dict[str, Any]]:
        """Use LLM to decompose a task into sub-tasks assigned to agents."""
        try:
            from core.model_router import get_model_router

            router = get_model_router()
            agent_list = "\n".join([f"- {k}: {v['description']}" for k, v in SWARM_AGENTS.items()])

            prompt = f"""Decompose the following task into at most 5 sub-tasks.
Each sub-task should be assigned to the best-suited agent.

Available agents:
{agent_list}

Task: {task}

Respond with a JSON array:
[{{"agent": "agent_name", "description": "what to do", "order": 1}}, ...]"""

            response = await router.route_completion(prompt=prompt, model="openai/gpt-4o-mini")
            text = response.get("content", "") if isinstance(response, dict) else str(response)

            start = text.find("[")
            end = text.rfind("]") + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
        except Exception as e:
            logger.warning("[SwarmCoordinator] LLM decomposition failed: %s", e)

        # Fallback: single sub-task for the orchestrator
        return [{"agent": "orchestrator", "description": task, "order": 1}]

    async def _execute_sub_task(self, sub_task: dict[str, Any], task_id: str) -> dict[str, Any]:
        """Execute a single sub-task using the assigned agent."""
        agent_name = sub_task.get("agent", "orchestrator")
        description = sub_task.get("description", "")
        order = sub_task.get("order", 1)

        logger.info("[SwarmCoordinator] Executing sub-task %d: %s for %s", order, description[:50], agent_name)

        try:
            from agent.loop import run_agent_loop
            from core.model_router import get_model_router

            router = get_model_router()
            provider = router.get_fastest_provider()
            model = router.get_fastest_model()

            response_text = ""
            async for event in run_agent_loop(
                task=f"You are a {SWARM_AGENTS.get(agent_name, {}).get('role', 'general agent')}. {description}",
                tools=[],
                provider=provider,
                model=model or "openai/gpt-4o-mini",
                max_iterations=3,
            ):
                if "event: agent_finish" in event:
                    data_str = event.replace("event: agent_finish\ndata: ", "").strip()
                    try:
                        data = json.loads(data_str)
                        response_text = data.get("answer", "")
                    except json.JSONDecodeError:
                        response_text = data_str

            return {"agent": agent_name, "order": order, "status": "ok", "output": response_text}

        except Exception as e:
            logger.warning("[SwarmCoordinator] Sub-task error: %s", e)
            return {"agent": agent_name, "order": order, "status": "error", "output": str(e)[:300]}

    async def _synthesize_results(self, task: str, results: list[dict[str, Any]]) -> str:
        """Use LLM to synthesize all sub-task results into a final output."""
        try:
            from core.model_router import get_model_router

            router = get_model_router()
            results_str = "\n\n".join([
                f"Agent: {r['agent']}\nOutput: {r.get('output', 'N/A')}"
                for r in results
            ])

            prompt = f"""Synthesize the following results from multiple AI agents into a coherent final response.

Original task: {task}

Agent results:
{results_str}

Provide a comprehensive final response that integrates all findings."""

            response = await router.route_completion(prompt=prompt, model="openai/gpt-4o-mini")
            text = response.get("content", "") if isinstance(response, dict) else str(response)
            return text

        except Exception as e:
            logger.warning("[SwarmCoordinator] Synthesis error: %s", e)
            # Fallback: concatenate all results
            parts = [r.get("output", "") for r in results if r.get("output")]
            return "\n\n".join(parts) if parts else "No results to synthesize."

    async def get_task(self, task_id: str) -> dict[str, Any]:
        """Get the status and results of a swarm task."""
        db = get_db()
        task = await db.swarm_tasks.find_one({"task_id": task_id})
        if not task:
            return {"status": "not_found"}
        return {
            "task_id": task["task_id"],
            "task": task.get("task"),
            "status": task.get("status"),
            "sub_tasks": task.get("sub_tasks", []),
            "results": task.get("results", []),
            "final_output": task.get("final_output"),
            "created_at": task.get("created_at"),
            "completed_at": task.get("completed_at"),
        }

    async def get_history(self, limit: int = 50) -> list[dict[str, Any]]:
        """Get the last N completed swarm tasks."""
        db = get_db()
        tasks = await db.swarm_tasks.find().sort("created_at", -1).to_list(limit)
        result: list[dict[str, Any]] = []
        for t in tasks:
            result.append({
                "task_id": t.get("task_id"),
                "task": t.get("task"),
                "status": t.get("status"),
                "sub_task_count": len(t.get("sub_tasks", [])),
                "created_at": t.get("created_at"),
            })
        return result


# Singleton
_coordinator_instance: Optional[SwarmCoordinator] = None


def get_swarm_coordinator() -> SwarmCoordinator:
    """Get or create the singleton SwarmCoordinator."""
    global _coordinator_instance
    if _coordinator_instance is None:
        _coordinator_instance = SwarmCoordinator()
    return _coordinator_instance