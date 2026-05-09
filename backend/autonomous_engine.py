import asyncio
import logging
import json
from datetime import datetime
from typing import Optional, List
from core.database import get_db
from core.model_router import call_model
from core.factory import get_agent_factory
from core.evolve_engine import get_evolution_manager

logger = logging.getLogger(__name__)

class AutonomousEngine:
    def __init__(self):
        self.is_running = False
        self.goal = ""
        self.interval_minutes = 5
        self.last_thought = "Autonomous Mode is currently idle."
        self.agents_created = []
        self._task: Optional[asyncio.Task] = None

    def start(self, goal: str, interval_minutes: int):
        self.goal = goal
        self.interval_minutes = interval_minutes
        if not self.is_running:
            self.is_running = True
            self._task = asyncio.create_task(self._loop())
            logger.info("[AUTONOMOUS] Engine started with goal: '%s' and interval: %d min", goal, interval_minutes)

    def stop(self):
        if self.is_running:
            self.is_running = False
            if self._task:
                self._task.cancel()
                self._task = None
            logger.info("[AUTONOMOUS] Engine stopped")

    async def _loop(self):
        # Wait 3 seconds on startup/activation to prevent locking uvicorn init
        await asyncio.sleep(3)
        while self.is_running:
            try:
                await self._think_and_act()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("[AUTONOMOUS] Error in thinking cycle: %s", e)
            
            # Sleep for N minutes
            for _ in range(self.interval_minutes * 60):
                if not self.is_running:
                    break
                await asyncio.sleep(1)

    async def _think_and_act(self):
        db = get_db()
        factory = get_agent_factory()
        
        # 1. Gather all current agents in the factory
        try:
            agents = await factory.list_agents()
            agent_summaries = []
            for a in agents:
                agent_summaries.append({
                    "id": a.get("id"),
                    "name": a.get("name"),
                    "goal": a.get("goal"),
                    "version": a.get("version", 0),
                    "score": a.get("current_score", 0),
                    "status": a.get("status", "idle")
                })
        except Exception as e:
            logger.error("[AUTONOMOUS] Failed to query existing agents: %s", e)
            return

        # 2. Build the LLM prompt
        prompt = f"""You are the central command brain of the OmniBot Autonomous Agent Factory.
Your core mission is to create and evolve specialized AI agents to achieve this overarching goal:
"{self.goal}"

Current active agents in the factory:
{json.dumps(agent_summaries, indent=2)}

Your task is to analyze the factory's current state and decide what action to take next.
You can take one of the following actions:
1. "CREATE": Create a new specialized agent to fill a capability gap.
2. "EVOLVE": Evolve an existing agent to improve its capability and score.
3. "IDLE": Wait and monitor performance if current agents are sufficient.

You must respond with a JSON object in the following format:
{{
  "thought": "Your detailed reasoning here about gaps in capability, agent performance, and what to do next to achieve the core goal.",
  "action": "CREATE" | "EVOLVE" | "IDLE",
  "agent_name": "Name of agent to create (only if CREATE)",
  "agent_goal": "Clear detailed objective for the new agent (only if CREATE)",
  "agent_template": "general" | "code" | "research" | "revenue" (only if CREATE),
  "agent_id": "ID of the agent to evolve (only if EVOLVE)"
}}

Provide ONLY the raw JSON block. No markdown fencing, no explanation outside the JSON."""

        messages = [
            {"role": "system", "content": "You are the OmniBot Central Autonomous command. Return JSON ONLY."},
            {"role": "user", "content": prompt}
        ]
        
        self.last_thought = "Central brain is scanning active agents and analyzing gaps..."
        
        try:
            raw_response = await call_model(messages, task_type="research")
            
            # Parse response and strip any JSON markdown blocks if the model wrapped it
            clean_res = raw_response.strip()
            if clean_res.startswith("```json"):
                clean_res = clean_res[7:]
            if clean_res.endswith("```"):
                clean_res = clean_res[:-3]
            clean_res = clean_res.strip()
            
            decision = json.loads(clean_res)
        except Exception as e:
            logger.warning("[AUTONOMOUS] LLM thinking call failed: %s. Response content: %s", e, raw_response if 'raw_response' in locals() else '')
            self.last_thought = f"Thinking iteration failed: {str(e)}"
            return

        thought = decision.get("thought", "Monitoring current agent scores...")
        action = decision.get("action", "IDLE").upper()
        self.last_thought = thought

        executed_actions = []
        
        # 3. Handle actions
        if action == "CREATE":
            name = decision.get("agent_name")
            goal = decision.get("agent_goal")
            template = decision.get("agent_template", "general")
            if name and goal:
                try:
                    new_agent = await factory.create_agent(name=name, goal=goal, template=template)
                    self.agents_created.append(new_agent.id)
                    executed_actions.append({
                        "type": "create",
                        "agent_id": new_agent.id,
                        "name": name,
                        "goal": goal
                    })
                    # Start evolving the created agent
                    manager = get_evolution_manager()
                    await manager.start_evolution(new_agent.id)
                    logger.info("[AUTONOMOUS] Created and launched evolution for agent '%s' (%s)", name, new_agent.id)
                except Exception as ex:
                    logger.error("[AUTONOMOUS] Failed to create or evolve agent '%s': %s", name, ex)
                    executed_actions.append({"type": "error", "message": f"Create failed: {str(ex)}"})
        
        elif action == "EVOLVE":
            agent_id = decision.get("agent_id")
            if agent_id:
                try:
                    agent = await factory.get_agent(agent_id)
                    if agent:
                        manager = get_evolution_manager()
                        await manager.start_evolution(agent_id)
                        executed_actions.append({
                            "type": "evolve",
                            "agent_id": agent_id,
                            "name": agent.get("name")
                        })
                        logger.info("[AUTONOMOUS] Triggered evolutionary pass for agent '%s' (%s)", agent.get("name"), agent_id)
                except Exception as ex:
                    logger.error("[AUTONOMOUS] Failed to evolve agent %s: %s", agent_id, ex)
                    executed_actions.append({"type": "error", "message": f"Evolve failed: {str(ex)}"})

        else:
            executed_actions.append({"type": "idle", "message": "All specialized agents operating within target criteria."})
            logger.info("[AUTONOMOUS] Decisions logged: IDLE. Reasoning: %s", thought)

        # 4. Save decision log to MongoDB autonomous_log
        log_entry = {
            "timestamp": datetime.now(),
            "thought": thought,
            "action": action,
            "executed_actions": executed_actions,
            "goal": self.goal
        }
        try:
            await db.autonomous_log.insert_one(log_entry)
        except Exception as e:
            logger.error("[AUTONOMOUS] Failed to write thinking log to database: %s", e)

    def to_dict(self) -> dict:
        return {
            "running": self.is_running,
            "goal": self.goal,
            "interval_minutes": self.interval_minutes,
            "last_thought": self.last_thought,
            "agents_created": self.agents_created
        }

_engine = AutonomousEngine()

def get_autonomous_engine() -> AutonomousEngine:
    return _engine
