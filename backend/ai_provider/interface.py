"""
Abstract base interface and exceptions for the AIProvider layer.
All custom and g4f-based AI providers must implement this interface.
"""

from abc import ABC, abstractmethod
from typing import Generator, AsyncGenerator, List, Dict, Any, Optional
from .dataclasses import AIResponse


class AIProviderError(Exception):
    """Base exception for all AI provider-related errors."""
    pass


class ConfigurationError(AIProviderError):
    """Exception raised when provider configuration is invalid or missing."""
    pass


class ProviderUnavailableError(AIProviderError):
    """Exception raised when all fallback providers are exhausted and unreachable."""
    pass


class RateLimitError(AIProviderError):
    """Exception raised when provider triggers a rate limit."""
    pass


class TimeoutError(AIProviderError):
    """Exception raised when a provider call times out."""
    pass


class AIProvider(ABC):
    """
    Unified abstract interface for AI providers.
    Supports both sync and async execution paths for full and streaming completions.
    """

    @abstractmethod
    def chat(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> AIResponse:
        """
        Execute a synchronous chat completion.

        Args:
            messages: A list of message dictionaries (e.g., [{"role": "user", "content": "hi"}])
            model: Name of the model to use
            **kwargs: Extra parameters (temperature, max_tokens, etc.)

        Returns:
            AIResponse: Standardized response dataclass
        """
        pass

    @abstractmethod
    async def chat_async(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> AIResponse:
        """
        Execute an asynchronous chat completion.

        Args:
            messages: A list of message dictionaries
            model: Name of the model to use
            **kwargs: Extra parameters

        Returns:
            AIResponse: Standardized response dataclass
        """
        pass

    @abstractmethod
    def stream(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> Generator[str, None, None]:
        """
        Execute a synchronous streaming chat completion.

        Args:
            messages: A list of message dictionaries
            model: Name of the model to use
            **kwargs: Extra parameters

        Yields:
            str: Token chunks as they arrive from the provider
        """
        pass

    @abstractmethod
    async def stream_async(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> AsyncGenerator[str, None]:
        """
        Execute an asynchronous streaming chat completion.

        Args:
            messages: A list of message dictionaries
            model: Name of the model to use
            **kwargs: Extra parameters

        Yields:
            str: Token chunks as they arrive from the provider
        """
        pass
