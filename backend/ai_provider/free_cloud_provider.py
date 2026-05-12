"""
FreeCloudProvider — AI provider for free cloud-based APIs (Gemini, Groq, Mistral, etc.)
Implements the AIProvider interface using OpenAI-compatible HTTP endpoints.
No local models required — strictly cloud APIs only.

Supported providers:
- Google Gemini API (via OpenAI-compatible endpoint)
- Groq Cloud (OpenAI-compatible)
- Mistral AI (OpenAI-compatible)
- SambaNova Cloud (OpenAI-compatible)
"""

import os
import time
import asyncio
import json
import logging
from typing import List, Dict, Any, Generator, AsyncGenerator, Optional, Union

import httpx

from .interface import AIProvider, AIProviderError, ProviderUnavailableError, RateLimitError, TimeoutError
from .dataclasses import AIResponse
from .config import ProviderConfig
from .cache import ResponseCache, RequestThrottler

logger = logging.getLogger(__name__)

# ── Provider Registry ──────────────────────────────────────────────────────

CLOUD_PROVIDERS = {
    "gemini": {
        "name": "Google Gemini",
        "env_key": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "models": ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
        "free_tier": "60 RPM, 1000 req/day, 1M context",
        "tool_calling": True,
        "streaming": True,
        "default_model": "gemini-2.0-flash",
    },
    "groq": {
        "name": "Groq Cloud",
        "env_key": "GROQ_API_KEY",
        "base_url": "https://api.groq.com/openai/v1",
        "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
        "free_tier": "30 RPM, 14400 req/day",
        "tool_calling": True,
        "streaming": True,
        "default_model": "llama-3.3-70b-versatile",
    },
    "mistral": {
        "name": "Mistral AI",
        "env_key": "MISTRAL_API_KEY",
        "base_url": "https://api.mistral.ai/v1",
        "models": ["mistral-small-latest", "open-mistral-nemo", "mistral-tiny"],
        "free_tier": "50 RPM, 1M tokens free",
        "tool_calling": True,
        "streaming": True,
        "default_model": "mistral-small-latest",
    },
    "sambanova": {
        "name": "SambaNova Cloud",
        "env_key": "SAMBANOVA_API_KEY",
        "base_url": "https://api.sambanova.ai/v1",
        "models": ["Meta-Llama-3.1-8B-Instruct", "Meta-Llama-3.1-70B-Instruct"],
        "free_tier": "25 RPM, 50000 req/day",
        "tool_calling": False,
        "streaming": True,
        "default_model": "Meta-Llama-3.1-8B-Instruct",
    },
}


class FreeCloudProvider(AIProvider):
    """
    Resilient free cloud AI provider supporting multiple backends.
    Uses OpenAI-compatible HTTP API format for all providers.
    Falls back between Gemini → Groq → Mistral → SambaNova automatically.
    """

    def __init__(self, config_path: Optional[str] = None):
        self.config = ProviderConfig(config_path)
        self.cache = ResponseCache(
            ttl_seconds=self.config.cache_ttl,
            max_size=self.config.cache_max_size
        ) if self.config.cache_enabled else None
        self.throttler = RequestThrottler(self.config.throttle_seconds)

        # Provider health tracking
        self._provider_health: Dict[str, Dict[str, Any]] = {}
        self._active_provider: Optional[str] = None
        self._last_provider_switch: float = 0.0
        self._provider_cooldown: float = 30.0  # seconds before retrying a failed provider

        # Initialize health for all providers with API keys
        self._init_providers()

    def _init_providers(self):
        """Initialize health tracking for providers that have API keys configured."""
        for name, info in CLOUD_PROVIDERS.items():
            api_key = os.environ.get(info["env_key"], "")
            if api_key:
                self._provider_health[name] = {
                    "api_key": api_key,
                    "base_url": info["base_url"],
                    "consecutive_failures": 0,
                    "status": "ACTIVE",
                    "degraded_until": 0.0,
                    "last_used": 0.0,
                }
                logger.info(f"[FreeCloud] Provider '{name}' initialized (key present)")

        # Default to Gemini if available, then Groq, then first available
        for name in ["gemini", "groq", "mistral", "sambanova"]:
            if name in self._provider_health:
                self._active_provider = name
                break

        if not self._provider_health:
            logger.warning("[FreeCloud] No cloud API keys configured. Set GEMINI_API_KEY, GROQ_API_KEY, etc.")
        else:
            logger.info(f"[FreeCloud] Active: {list(self._provider_health.keys())}")

    def get_available_providers(self) -> List[Dict[str, Any]]:
        """Return list of configured providers and their health status."""
        result = []
        for name, info in CLOUD_PROVIDERS.items():
            health = self._provider_health.get(name, {})
            result.append({
                "name": name,
                "display_name": info["name"],
                "configured": name in self._provider_health,
                "status": health.get("status", "UNCONFIGURED"),
                "consecutive_failures": health.get("consecutive_failures", 0),
                "tool_calling": info["tool_calling"],
                "default_model": info["default_model"],
                "free_tier": info["free_tier"],
            })
        return result

    def _get_healthy_providers(self) -> List[str]:
        """Return list of currently healthy (active, not degraded) provider names."""
        now = time.time()
        healthy = []
        for name, health in self._provider_health.items():
            if health["status"] == "DEGRADED":
                if now >= health["degraded_until"]:
                    health["status"] = "ACTIVE"
                    health["consecutive_failures"] = 0
                    logger.info(f"[FreeCloud] Provider '{name}' recovered from degradation")
                    healthy.append(name)
            else:
                healthy.append(name)
        return healthy

    def _get_best_provider(self, require_tool_calling: bool = False) -> Optional[str]:
        """
        Get the best healthy provider, optionally requiring tool calling support.
        Preference order: Gemini → Groq → Mistral → SambaNova
        """
        healthy = self._get_healthy_providers()

        # Try providers in preference order
        preference = ["gemini", "groq", "mistral", "sambanova"]
        for name in preference:
            if name in healthy:
                info = CLOUD_PROVIDERS.get(name, {})
                if require_tool_calling and not info.get("tool_calling", False):
                    continue
                return name

        # Fallback to any healthy provider
        for name in healthy:
            info = CLOUD_PROVIDERS.get(name, {})
            if require_tool_calling and not info.get("tool_calling", False):
                continue
            return name

        return None

    def _handle_failure(self, provider_name: str, error: Exception):
        """Record provider failure and mark as degraded if threshold exceeded."""
        health = self._provider_health.get(provider_name)
        if not health:
            return

        health["consecutive_failures"] += 1
        failures = health["consecutive_failures"]
        logger.warning(f"[FreeCloud] '{provider_name}' failed ({failures}x): {error}")

        if failures >= 3:
            cool_down = 120  # 2 minutes
            health["status"] = "DEGRADED"
            health["degraded_until"] = time.time() + cool_down
            logger.warning(f"[FreeCloud] '{provider_name}' marked DEGRADED for {cool_down}s")

    def _handle_success(self, provider_name: str):
        """Reset failure tracking on successful call."""
        health = self._provider_health.get(provider_name)
        if health:
            health["consecutive_failures"] = 0
            health["status"] = "ACTIVE"
            health["degraded_until"] = 0.0
            health["last_used"] = time.time()

    async def _make_request(
        self,
        provider_name: str,
        endpoint: str,
        payload: dict,
        stream: bool = False,
        timeout: float = 30.0,
    ) -> Union[dict, httpx.Response]:
        """
        Make an HTTP request to a cloud provider's OpenAI-compatible API.

        Args:
            provider_name: Key in CLOUD_PROVIDERS dict
            endpoint: API endpoint path (e.g., '/chat/completions')
            payload: JSON body
            stream: Whether to stream the response
            timeout: Request timeout in seconds

        Returns:
            Parsed JSON dict or raw Response for streaming
        """
        health = self._provider_health.get(provider_name)
        if not health:
            raise ProviderUnavailableError(f"Provider '{provider_name}' not configured")

        api_key = health["api_key"]
        base_url = health["base_url"]
        url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                if stream:
                    response = await client.post(url, headers=headers, json=payload, timeout=timeout)
                    response.raise_for_status()
                    return response
                else:
                    response = await client.post(url, headers=headers, json=payload, timeout=timeout)
                    response.raise_for_status()
                    return response.json()

            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                body = e.response.text[:500]
                if status == 429:
                    raise RateLimitError(f"Rate limited by {provider_name}: {body}")
                elif status in (401, 403):
                    raise AIProviderError(f"Auth error from {provider_name}: {body}")
                else:
                    raise AIProviderError(f"HTTP {status} from {provider_name}: {body}")

            except httpx.TimeoutException:
                raise TimeoutError(f"Timeout contacting {provider_name}")

            except httpx.ConnectError as e:
                raise ProviderUnavailableError(f"Cannot connect to {provider_name}: {e}")

    # ── Helper to normalize OpenAI response ─────────────────────────────────

    def _normalize_response(self, data: dict, model: str, provider_name: str, latency_ms: int) -> AIResponse:
        """Convert OpenAI-compatible response dict to AIResponse."""
        try:
            choices = data.get("choices", [])
            if not choices:
                raise AIProviderError("No choices in response")

            content = choices[0].get("message", {}).get("content", "")
            if content is None:
                content = ""

            return AIResponse(
                content=str(content),
                model=model,
                provider=f"freecloud-{provider_name}",
                latency_ms=latency_ms,
                success=True,
                metadata={
                    "finish_reason": choices[0].get("finish_reason", ""),
                    "usage": data.get("usage", {}),
                    "provider": provider_name,
                },
            )
        except (KeyError, IndexError, TypeError) as e:
            raise AIProviderError(f"Failed to parse {provider_name} response: {e}")

    def _extract_tool_calls(self, data: dict) -> list:
        """Extract tool calls from OpenAI-compatible response."""
        choices = data.get("choices", [])
        if not choices:
            return []
        message = choices[0].get("message", {})
        return message.get("tool_calls", [])

    # ── Synchronous Methods ─────────────────────────────────────────────────

    def chat(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> AIResponse:
        """
        Execute synchronous chat completion using the best available cloud provider.
        """
        # Check cache
        if self.cache:
            cached = self.cache.get(messages, model)
            if cached:
                return cached

        # Rate limit throttle
        self.throttler.throttle()

        provider_name = self._get_best_provider(require_tool_calling=True)
        if not provider_name:
            provider_name = self._get_best_provider(require_tool_calling=False)
        if not provider_name:
            raise ProviderUnavailableError("No configured cloud providers available")

        payload = {
            "model": model,
            "messages": messages,
            **kwargs,
        }

        start_time = time.time()
        try:
            # Use asyncio to run the async request synchronously
            loop = asyncio.new_event_loop()
            try:
                data = loop.run_until_complete(
                    self._make_request(provider_name, "chat/completions", payload)
                )
            finally:
                loop.close()

            latency_ms = int((time.time() - start_time) * 1000)
            self._handle_success(provider_name)

            response = self._normalize_response(data, model, provider_name, latency_ms)

            if self.cache:
                self.cache.set(messages, model, response)

            return response

        except (RateLimitError, TimeoutError, ProviderUnavailableError) as e:
            self._handle_failure(provider_name, e)
            # Try next provider
            for fallback_name in self._provider_health:
                if fallback_name != provider_name and self._provider_health[fallback_name]["status"] == "ACTIVE":
                    try:
                        loop = asyncio.new_event_loop()
                        try:
                            data = loop.run_until_complete(
                                self._make_request(fallback_name, "chat/completions", payload)
                            )
                        finally:
                            loop.close()

                        latency_ms = int((time.time() - start_time) * 1000)
                        self._handle_success(fallback_name)
                        response = self._normalize_response(data, model, fallback_name, latency_ms)
                        if self.cache:
                            self.cache.set(messages, model, response)
                        return response
                    except Exception as fallback_e:
                        self._handle_failure(fallback_name, fallback_e)
                        continue

            raise ProviderUnavailableError(f"All cloud providers failed. Last error: {e}")

    def stream(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> Generator[str, None, None]:
        """
        Execute synchronous streaming completion.
        """
        provider_name = self._get_best_provider()
        if not provider_name:
            raise ProviderUnavailableError("No configured cloud providers available")

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            **kwargs,
        }

        self.throttler.throttle()
        try:
            loop = asyncio.new_event_loop()
            try:
                response = loop.run_until_complete(
                    self._make_request(provider_name, "chat/completions", payload, stream=True)
                )
            finally:
                loop.close()

            for line in response.iter_lines():
                if line:
                    line_str = line.decode("utf-8", errors="replace").strip()
                    if line_str.startswith("data: "):
                        data_str = line_str[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue

            self._handle_success(provider_name)

        except Exception as e:
            self._handle_failure(provider_name, e)
            raise ProviderUnavailableError(f"Stream failed via {provider_name}: {e}")

    # ── Asynchronous Methods ─────────────────────────────────────────────────

    async def chat_async(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> AIResponse:
        """
        Execute asynchronous chat completion using the best available cloud provider.
        """
        # Check cache
        if self.cache:
            cached = self.cache.get(messages, model)
            if cached:
                return cached

        # Rate limit throttle
        await self.throttler.throttle_async()

        provider_name = self._get_best_provider(require_tool_calling=True)
        if not provider_name:
            provider_name = self._get_best_provider(require_tool_calling=False)
        if not provider_name:
            raise ProviderUnavailableError("No configured cloud providers available")

        payload = {
            "model": model,
            "messages": messages,
            **kwargs,
        }

        start_time = time.time()
        try:
            data = await self._make_request(provider_name, "chat/completions", payload)
            latency_ms = int((time.time() - start_time) * 1000)
            self._handle_success(provider_name)

            response = self._normalize_response(data, model, provider_name, latency_ms)

            if self.cache:
                self.cache.set(messages, model, response)

            return response

        except (RateLimitError, TimeoutError, ProviderUnavailableError) as e:
            self._handle_failure(provider_name, e)

            # Fallback to next healthy provider
            for fallback_name in self._provider_health:
                if fallback_name != provider_name:
                    fb_health = self._provider_health[fallback_name]
                    if fb_health["status"] == "ACTIVE":
                        try:
                            data = await self._make_request(fallback_name, "chat/completions", payload)
                            latency_ms = int((time.time() - start_time) * 1000)
                            self._handle_success(fallback_name)
                            response = self._normalize_response(data, model, fallback_name, latency_ms)
                            if self.cache:
                                self.cache.set(messages, model, response)
                            return response
                        except Exception as fb_e:
                            self._handle_failure(fallback_name, fb_e)
                            continue

            raise ProviderUnavailableError(f"All cloud providers failed. Last error: {e}")

    async def stream_async(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> AsyncGenerator[str, None]:
        """
        Execute asynchronous streaming completion.
        """
        provider_name = self._get_best_provider()
        if not provider_name:
            raise ProviderUnavailableError("No configured cloud providers available")

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            **kwargs,
        }

        await self.throttler.throttle_async()
        try:
            response = await self._make_request(provider_name, "chat/completions", payload, stream=True)

            async for line in response.aiter_lines():
                if line:
                    line_str = line.strip()
                    if line_str.startswith("data: "):
                        data_str = line_str[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue

            self._handle_success(provider_name)

        except Exception as e:
            self._handle_failure(provider_name, e)
            # Try fallback
            for fallback_name in self._provider_health:
                if fallback_name != provider_name:
                    fb_health = self._provider_health[fallback_name]
                    if fb_health["status"] == "ACTIVE":
                        try:
                            fb_payload = {**payload, "model": CLOUD_PROVIDERS[fallback_name]["default_model"]}
                            fb_response = await self._make_request(
                                fallback_name, "chat/completions", fb_payload, stream=True
                            )
                            async for line in fb_response.aiter_lines():
                                if line:
                                    line_str = line.strip()
                                    if line_str.startswith("data: "):
                                        data_str = line_str[6:]
                                        if data_str == "[DONE]":
                                            break
                                        try:
                                            chunk = json.loads(data_str)
                                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                                            content = delta.get("content", "")
                                            if content:
                                                yield content
                                        except json.JSONDecodeError:
                                            continue
                            self._handle_success(fallback_name)
                            return
                        except Exception as fb_e:
                            self._handle_failure(fallback_name, fb_e)
                            continue

            raise ProviderUnavailableError(f"All streaming providers failed.")


# ── Singleton ──────────────────────────────────────────────────────────────

_cloud_provider_instance: Optional[FreeCloudProvider] = None


def get_free_cloud_provider() -> FreeCloudProvider:
    """Get or create the singleton FreeCloudProvider."""
    global _cloud_provider_instance
    if _cloud_provider_instance is None:
        _cloud_provider_instance = FreeCloudProvider()
    return _cloud_provider_instance