import json
import logging
import re

from core.model_router import call_model
from core.swarm.coder import Coder
from core.swarm.researcher import Researcher
from core.swarm.reviewer import Reviewer
from utils.thought_logger import log_thought

logger = logging.getLogger(__name__)


def parse_json(response: str) -> list[dict]:
    """Parse a JSON array output from the LLM, stripping fences if needed."""
    if not response:
        return []

    text = response.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE).strip()
        if text.endswith("```"):
            text = text[:-3].strip()

    # Try an array first
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return [data]
    except json.JSONDecodeError:
        pass

    # Try to extract a JSON array substring
    match = re.search(r"(\[\s*\{.*\}\s*\])", text, re.S)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    logger.warning("SWARM: Failed to parse JSON from response; falling back to single researcher task")
    return [
        {"task": "Research the goal and propose specific next steps.", "specialist": "researcher", "priority": 1}
    ]


class Orchestrator:
    """
    Breaks any agent goal into sub-tasks.
    Assigns each sub-task to the right specialist.
    Combines results into final output.
    """

    async def plan(self, goal: str, context: dict) -> list[dict]:
        prompt = f"""
        Goal: {goal}
        
        Break this into 3-5 specific sub-tasks.
        For each sub-task specify:
        - task: what exactly to do
        - specialist: researcher | coder | reviewer
        - priority: 1-5
        
        Return JSON array only.
        """
        response = await call_model(prompt, task_type="general")
        return parse_json(response)

    async def run_swarm(self, goal: str, agent_id: str, db) -> str:
        plan = await self.plan(goal, {})
        results = []
        for task in sorted(plan, key=lambda x: x.get("priority", 3)):
            specialist = task.get("specialist", "researcher")
            description = task.get("task", "No task provided.")
            if specialist == "researcher":
                result = await Researcher().execute(description)
            elif specialist == "coder":
                result = await Coder().execute(description)
            elif specialist == "reviewer":
                result = await Reviewer().execute(description, results)
            else:
                result = await Researcher().execute(description)

            results.append({"task": description, "result": result})
            await log_thought(agent_id, f"[SWARM-{specialist.upper()}] {description[:60]}...")

        return self.combine_results(goal, results)

    def combine_results(self, goal: str, results: list[dict]) -> str:
        # Prefer the last code result from a coder task, if available.
        code_outputs = [item["result"] for item in results if "coder" in item.get("task", "").lower() or "code" in item.get("task", "").lower()]
        if code_outputs:
            return code_outputs[-1]

        # Otherwise return the last result, including review commentary.
        output_lines = [f"Swarm results for goal: {goal}"]
        for item in results:
            output_lines.append(f"\nTask: {item['task']}")
            output_lines.append(f"Result:\n{item['result']}")
        return "\n".join(output_lines)

    async def execute_task(self, task_description: str, max_iterations: int = 3) -> dict:
        """
        Main entry point for UI and optimization loop.
        Wraps run_swarm to provide backward compatibility with services.swarm.
        """
        logger.info(f"[Swarm Orchestrator] Executing task: {task_description[:50]}...")
        # Use a dummy agent_id and pass None for db since the logging handles missing db.
        final_str = await self.run_swarm(task_description, "SWARM_STANDALONE", None)
        
        return {
            "task": task_description,
            "status": "success",
            "iterations_used": 1,
            "final_code": final_str,
            "research_context": "Swarm dynamically planned and executed tasks.",
            "reviewer_feedback": "N/A"
        }

swarm_orchestrator = Orchestrator()

