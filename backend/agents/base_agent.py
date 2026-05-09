"""
OmniBot — Base Agent Class (System 6 foundation)

All agents inherit from BaseAgent.  Provides standard interface for:
  - Configuration and serialization
  - Execution (run)
  - Testing (test with test cases)
  - Prompt construction
"""

import uuid
import logging
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class AgentStatus(str, Enum):
    IDLE = "idle"
    EVOLVING = "evolving"
    PAUSED = "paused"
    STOPPED = "stopped"
    TESTING = "testing"
    ERROR = "error"


class BaseAgent:
    """
    Base class for all OmniBot agents.
    Agents are created by the AgentFactory and evolved by the EvolutionEngine.
    """

    def __init__(
        self,
        name: str,
        goal: str,
        agent_id: Optional[str] = None,
        version: int = 0,
        status: AgentStatus = AgentStatus.IDLE,
        current_score: float = 0.0,
        config: Optional[dict] = None,
        evolve_interval_seconds: int = 120,
        agent_code: str = "",
        test_cases: Optional[List[dict]] = None,
        created_at: Optional[datetime] = None,
    ):
        self.agent_id = agent_id or str(uuid.uuid4())
        self.name = name
        self.goal = goal
        self.version = version
        self.status = status
        self.current_score = current_score
        self.config = config or {}
        self.evolve_interval_seconds = evolve_interval_seconds
        self.agent_code = agent_code
        self.test_cases = test_cases or []
        self.created_at = created_at or datetime.utcnow()
        self.updated_at = datetime.utcnow()

        # Runtime state (not persisted)
        self._current_thought: Optional[str] = None
        self._loop_position: Optional[str] = None

    # ── Core Interface ──────────────────────────────────────────────────────

    async def run(self, input_data: Any = None) -> dict:
        """
        Execute the agent's current logic.
        Override in subclasses or dynamically execute agent_code.
        """
        try:
            if self.agent_code:
                # Execute agent code in a sandboxed namespace
                namespace: Dict[str, Any] = {"input_data": input_data, "result": None}
                exec(self.agent_code, namespace)

                # Call the 'execute' function if defined
                if "execute" in namespace and callable(namespace["execute"]):
                    import asyncio
                    if asyncio.iscoroutinefunction(namespace["execute"]):
                        result = await namespace["execute"](input_data)
                    else:
                        result = namespace["execute"](input_data)
                    return {"success": True, "output": result}

                return {"success": True, "output": namespace.get("result")}
            else:
                return {"success": False, "output": "No agent code defined"}
        except Exception as e:
            logger.error("Agent %s run failed: %s", self.agent_id, e)
            return {"success": False, "error": str(e)}

    async def test(self, test_cases: Optional[List[dict]] = None) -> float:
        """
        Run test cases against the agent and return a score between 0.0 and 1.0.
        Each test case: { "input": ..., "expected": ..., "weight": 1.0 }
        """
        cases = test_cases or self.test_cases
        if not cases:
            return 0.5  # No tests = neutral score

        total_weight = 0.0
        weighted_score = 0.0

        for case in cases:
            weight = case.get("weight", 1.0)
            total_weight += weight

            try:
                result = await self.run(case.get("input"))
                if result.get("success"):
                    expected = case.get("expected")
                    actual = result.get("output")

                    if expected is None:
                        # No expected value — just check it ran successfully
                        weighted_score += weight * 0.7
                    elif actual == expected:
                        weighted_score += weight * 1.0
                    elif str(actual) == str(expected):
                        weighted_score += weight * 0.9
                    else:
                        # Partial credit for running without error
                        weighted_score += weight * 0.3
                else:
                    # Ran but failed
                    weighted_score += weight * 0.1
            except Exception:
                # Crashed entirely
                pass

        return weighted_score / total_weight if total_weight > 0 else 0.0

    def get_system_prompt(self) -> str:
        """Build the agent's system prompt from goal and config."""
        parts = [
            f"You are an AI agent named '{self.name}'.",
            f"Your goal: {self.goal}",
            "",
            "Guidelines:",
            "- Focus exclusively on your stated goal",
            "- Be precise and thorough in your work",
            "- Report any issues or limitations you encounter",
            "- Optimize for quality and reliability",
        ]

        if self.config.get("additional_instructions"):
            parts.append(f"\nAdditional instructions: {self.config['additional_instructions']}")

        if self.config.get("tools"):
            tools_str = ", ".join(self.config["tools"])
            parts.append(f"\nAvailable tools: {tools_str}")

        if self.config.get("constraints"):
            parts.append(f"\nConstraints: {self.config['constraints']}")

        return "\n".join(parts)

    # ── Serialization ───────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        """Serialize agent state for MongoDB storage."""
        return {
            "id": self.agent_id,
            "name": self.name,
            "goal": self.goal,
            "version": self.version,
            "status": self.status.value if isinstance(self.status, AgentStatus) else self.status,
            "score": self.current_score,
            "config": self.config,
            "agent_code": self.agent_code,
            "test_cases": self.test_cases,
            "evolve_interval_seconds": self.evolve_interval_seconds,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "BaseAgent":
        """Deserialize agent from MongoDB document."""
        status = data.get("status", "idle")
        try:
            status = AgentStatus(status)
        except ValueError:
            status = AgentStatus.IDLE

        return cls(
            agent_id=data.get("id"),
            name=data.get("name", "Unnamed Agent"),
            goal=data.get("goal", "No goal defined"),
            version=data.get("version", 0),
            status=status,
            current_score=data.get("score", 0.0),
            config=data.get("config", {}),
            evolve_interval_seconds=data.get("evolve_interval_seconds", 120),
            agent_code=data.get("agent_code", ""),
            test_cases=data.get("test_cases", []),
            created_at=data.get("created_at"),
        )

    # ── Pause/Resume State ──────────────────────────────────────────────────

    def serialize_state(self) -> dict:
        """Serialize complete runtime state for PAUSE."""
        return {
            **self.to_dict(),
            "_current_thought": self._current_thought,
            "_loop_position": self._loop_position,
        }

    def restore_state(self, state: dict):
        """Restore runtime state from PAUSE."""
        self._current_thought = state.get("_current_thought")
        self._loop_position = state.get("_loop_position")

    def __repr__(self) -> str:
        return (
            f"<Agent '{self.name}' id={self.agent_id[:8]}... "
            f"v{self.version} score={self.current_score:.2f} "
            f"status={self.status}>"
        )
