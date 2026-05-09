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
        self.created_at = created_at or datetime.now()
        self.updated_at = datetime.now()

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
                
                try:
                    from tools.tools.web_search import web_search as ws_fn
                    import asyncio
                    class web_search_tool:
                        @staticmethod
                        async def run(query: str, max_results: int = 5) -> str:
                            return await asyncio.to_thread(ws_fn, query, max_results)
                    namespace["web_search"] = web_search_tool.run
                except Exception as e:
                    logger.warning("Failed to inject web_search: %s", e)


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

    async def test(self, test_cases: Optional[List[dict]] = None, old_code: Optional[str] = None) -> float:
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
                # 1. Run new code
                import time
                start_time = time.monotonic()
                result = await self.run(case.get("input"))
                elapsed = time.monotonic() - start_time

                # 2. Run old code if provided for comparative improvement metrics
                old_result = None
                if old_code:
                    try:
                        old_agent = BaseAgent(
                            name=self.name,
                            goal=self.goal,
                            agent_code=old_code,
                            test_cases=test_cases,
                        )
                        old_result = await old_agent.run(case.get("input"))
                    except Exception:
                        pass

                # 3. Grade output quality
                case_score = 0.1 # base floor for running/attempting

                if result.get("success"):
                    actual = result.get("output")
                    expected = case.get("expected")

                    # Check for exact/string matching first if expected is defined
                    has_exact_match = False
                    if expected is not None:
                        if actual == expected:
                            case_score = 1.0
                            has_exact_match = True
                        elif str(actual) == str(expected):
                            case_score = 0.9
                            has_exact_match = True

                    if not has_exact_match:
                        # Heuristic grading: partial credit starts at 0.3
                        case_score = 0.3

                        if actual:
                            actual_str = str(actual)
                            # Length / detail bonus
                            length = len(actual_str)
                            if length > 500:
                                case_score += 0.2
                            elif length > 150:
                                case_score += 0.1

                            # Structure bonus (Lists, headings, bold, tables, JSON)
                            has_structure = False
                            if any(marker in actual_str for marker in ["- ", "* ", "\n1.", "\n-"]):
                                case_score += 0.1
                                has_structure = True
                            if "**" in actual_str or "###" in actual_str:
                                case_score += 0.05
                                has_structure = True
                            if "|" in actual_str and "---" in actual_str:
                                case_score += 0.1
                                has_structure = True
                            if actual_str.strip().startswith("{") and actual_str.strip().endswith("}"):
                                case_score += 0.1
                                has_structure = True

                            # Real web data / search details bonus
                            if any(k in actual_str.lower() for k in ["http", "www.", "source:", "search results", "citation", "finding"]):
                                case_score += 0.15

                            # Compare with old output if available
                            if old_result and old_result.get("success"):
                                old_actual = old_result.get("output")
                                if old_actual:
                                    old_str = str(old_actual)
                                    # If new output is longer/more detailed than old
                                    if len(actual_str) > len(old_str) * 1.5:
                                        case_score += 0.1
                                    # If new output has structure but old did not
                                    new_has_struct = has_structure
                                    old_has_struct = any(marker in old_str for marker in ["- ", "* ", "\n1.", "###"])
                                    if new_has_struct and not old_has_struct:
                                        case_score += 0.1
                                    # If new has web references but old did not
                                    new_has_web = any(k in actual_str.lower() for k in ["http", "www.", "source:", "search results"])
                                    old_has_web = any(k in old_str.lower() for k in ["http", "www.", "source:", "search results"])
                                    if new_has_web and not old_has_web:
                                        case_score += 0.1

                            # If old code failed entirely but new code works
                            if old_result and not old_result.get("success"):
                                case_score += 0.2

                        # Execution speed bonus
                        if elapsed < 0.2:
                            case_score += 0.05

                    # Clamp score to [0.0, 1.0]
                    case_score = min(max(case_score, 0.1), 1.0)
                else:
                    # New code crashed/failed
                    case_score = 0.0

                weighted_score += weight * case_score
            except Exception as e:
                logger.error("Error testing case: %s", e)
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
            "learned_rules": getattr(self, "learned_rules", []),
            "user_feedback_log": getattr(self, "user_feedback_log", []),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "BaseAgent":
        """Deserialize agent from MongoDB document."""
        status = data.get("status", "idle")
        try:
            status = AgentStatus(status)
        except ValueError:
            status = AgentStatus.IDLE

        agent = cls(
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
        agent.learned_rules = data.get("learned_rules", [])
        agent.user_feedback_log = data.get("user_feedback_log", [])
        return agent

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
