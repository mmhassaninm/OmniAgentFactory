"""
AI Provider Module.
Exposes a unified interface for free, keyless AI model access via g4f or compatible proxies.
Also provides FreeCloudProvider for cloud-based free API access (Gemini, Groq, Mistral, etc.).
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
from .free_cloud_provider import FreeCloudProvider, get_free_cloud_provider, CLOUD_PROVIDERS

__all__ = [
    "AIProvider",
    "G4FProvider",
    "FreeCloudProvider",
    "get_free_cloud_provider",
    "CLOUD_PROVIDERS",
    "AIResponse",
    "AIProviderError",
    "ConfigurationError",
    "ProviderUnavailableError",
    "RateLimitError",
    "TimeoutError",
    "ProviderConfig"
]
