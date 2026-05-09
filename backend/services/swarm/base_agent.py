import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class BaseAgent:
    """
    A lightweight base agent for the Nexus Swarm.
    Uses the active provider from the registry instead of a hard-coded LM Studio URL.
    """

    def __init__(self, name: str, role: str, system_prompt: str, model: str = "local-model"):
        self.name = name
        self.role = role
        self.system_prompt = system_prompt
        self.model = model
        self.history: List[Dict[str, str]] = [{"role": "system", "content": self.system_prompt}]

    async def execute(self, task: str, context: Optional[str] = None) -> str:
        """Execute a task using the currently active LLM provider."""
        logger.info(f"[Swarm - {self.name}] Executing task...")

        prompt = task
        if context:
            prompt += f"\n\n[CONTEXT PROVIDED]:\n{context}"

        self.history.append({"role": "user", "content": prompt})

        # Import here to avoid circular dependency at module load time
        from services.providers import provider_registry

        provider = provider_registry.get_active()
        try:
            reply = await provider.chat_complete(
                messages=self.history,
                model=self.model,
                temperature=0.3,
                max_tokens=4096,
            )
            self.history.append({"role": "assistant", "content": reply})
            return reply
        except Exception as e:
            logger.error(f"[Swarm - {self.name}] Execution failed: {e}")
            return f"Error executing task: {e}"

    def clear_history(self) -> None:
        """Resets the agent's memory back to just the system prompt."""
        self.history = [{"role": "system", "content": self.system_prompt}]
