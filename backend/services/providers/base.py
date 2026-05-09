from abc import ABC, abstractmethod
from typing import AsyncGenerator, Any, Dict, List, Optional, Tuple


class BaseProvider(ABC):
    """Abstract interface every LLM provider must implement."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique snake_case identifier, e.g. 'lm_studio', 'openai'."""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable label shown in the UI."""
        ...

    @abstractmethod
    async def stream_chat(
        self,
        messages: List[Dict[str, Any]],
        model: str,
        temperature: float = 0.6,
        max_tokens: int = 2048,
        tools: Optional[List[Dict]] = None,
    ) -> AsyncGenerator[Tuple[str, Any], None]:
        """
        Stream a chat completion.

        Yields (event_type, data) tuples:
          ("content",   str)                         — text token chunk
          ("tool_call", dict)                        — partial/complete tool call
              dict keys: index(int), id(str), name(str), arguments(str)
          ("status",    str)                         — informational message
          ("error",     str)                         — fatal error; caller should abort
          ("done",      None)                        — stream finished
        """
        ...

    @abstractmethod
    async def list_models(self) -> List[Dict[str, str]]:
        """Return available models as [{"id": "...", "name": "..."}, ...]."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Return True if the provider is reachable and (if required) has an API key."""
        ...

    def configure(self, config: dict) -> None:
        """
        Apply provider-specific config (api_key, base_url, etc.).
        Called by the registry on startup and whenever settings change.
        """
        pass

    async def chat_complete(
        self,
        messages: List[Dict[str, Any]],
        model: str,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        """
        Non-streaming convenience wrapper — collects the full text reply.
        Used by swarm agents that don't need incremental streaming.
        """
        full_reply = ""
        async for event_type, data in self.stream_chat(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            if event_type == "content":
                full_reply += data
            elif event_type == "error":
                return f"[Provider Error]: {data}"
            elif event_type == "done":
                break
        return full_reply
