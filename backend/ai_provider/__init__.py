"""
AI Provider Module.
Exposes a unified interface for free, keyless AI model access via g4f or compatible proxies.
"""

from .interface import (
    AIProvider,
    AIProviderError,
    ConfigurationError,
    ProviderUnavailableError,
    RateLimitError,
    TimeoutError
)
from .dataclasses import AIResponse
from .config import ProviderConfig
from .g4f_provider import G4FProvider

__all__ = [
    "AIProvider",
    "G4FProvider",
    "AIResponse",
    "AIProviderError",
    "ConfigurationError",
    "ProviderUnavailableError",
    "RateLimitError",
    "TimeoutError",
    "ProviderConfig"
]
