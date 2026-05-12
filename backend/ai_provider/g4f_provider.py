"""
Robust G4FProvider implementing the AIProvider interface.
Includes sub-provider rotation, circuit breaking, exponential backoff, throttling, and caching.
"""

import time
import asyncio
import logging
from typing import List, Dict, Any, Generator, AsyncGenerator, Optional
import g4f
from g4f.client import Client, AsyncClient

from .interface import AIProvider, AIProviderError, ProviderUnavailableError, RateLimitError, TimeoutError
from .dataclasses import AIResponse
from .config import ProviderConfig
from .cache import ResponseCache, RequestThrottler

logger = logging.getLogger(__name__)


class G4FProvider(AIProvider):
    """
    Resilient GPT4Free (g4f) AI provider.
    Cascades through sub-providers, handles retries/backoffs, tracks health, and utilizes caching/throttling.
    """

    def __init__(self, config_path: Optional[str] = None):
        self.config = ProviderConfig(config_path)
        self.cache = ResponseCache(
            ttl_seconds=self.config.cache_ttl,
            max_size=self.config.cache_max_size
        ) if self.config.cache_enabled else None
        self.throttler = RequestThrottler(self.config.throttle_seconds)

        # Sync/Async clients
        self.client = Client()
        self.async_client = AsyncClient()

        # Circuit breaker and health status per sub-provider
        # Schema: { provider_name: { "consecutive_failures": int, "status": "ACTIVE" | "DEGRADED", "degraded_until": float } }
        self.providers_status: Dict[str, Dict[str, Any]] = {}
        self._initialize_provider_status()

    def _initialize_provider_status(self) -> None:
        """Initialize tracking state for all configured sub-providers."""
        for p_name in self.config.providers:
            self.providers_status[p_name] = {
                "consecutive_failures": 0,
                "status": "ACTIVE",
                "degraded_until": 0.0
            }

    def _resolve_g4f_provider(self, name: str) -> Optional[Any]:
        """Dynamically resolve a g4f Provider class by name string."""
        try:
            prov = getattr(g4f.Provider, name, None)
            if prov and prov.working:
                return prov
            return getattr(g4f.Provider, name, None)
        except Exception as e:
            logger.warning(f"Error resolving provider '{name}': {e}")
            return None

    def _get_healthy_providers(self) -> List[str]:
        """
        Get list of currently active and healthy sub-providers.
        Recovers degraded providers if their cool-down period has expired.
        """
        now = time.time()
        healthy = []

        # Ensure we have status tracking for all current providers
        for p_name in self.config.providers:
            if p_name not in self.providers_status:
                self.providers_status[p_name] = {
                    "consecutive_failures": 0,
                    "status": "ACTIVE",
                    "degraded_until": 0.0
                }

            status_info = self.providers_status[p_name]
            if status_info["status"] == "DEGRADED":
                if now >= status_info["degraded_until"]:
                    # Recovery!
                    logger.info(f"Sub-provider '{p_name}' has recovered from degradation.")
                    status_info["status"] = "ACTIVE"
                    status_info["consecutive_failures"] = 0
                    healthy.append(p_name)
            else:
                healthy.append(p_name)

        return healthy

    def _handle_failure(self, p_name: str, error: Exception) -> None:
        """Record provider failure and update circuit breaker state."""
        status_info = self.providers_status.get(p_name)
        if not status_info:
            return

        status_info["consecutive_failures"] += 1
        failures = status_info["consecutive_failures"]
        logger.warning(f"Sub-provider '{p_name}' failed (consecutive failures: {failures}). Error: {error}")

        if failures >= self.config.cb_max_failures:
            cool_down = self.config.cb_cool_down
            status_info["status"] = "DEGRADED"
            status_info["degraded_until"] = time.time() + cool_down
            logger.error(
                f"🚨 Sub-provider '{p_name}' tripped circuit breaker! "
                f"Marked as DEGRADED for {cool_down} seconds."
            )

    def _handle_success(self, p_name: str) -> None:
        """Reset failure tracking on successful provider call."""
        status_info = self.providers_status.get(p_name)
        if status_info:
            status_info["consecutive_failures"] = 0
            status_info["status"] = "ACTIVE"
            status_info["degraded_until"] = 0.0

    def get_providers_report(self) -> List[Dict[str, Any]]:
        """Return a live status report of all sub-providers."""
        report = []
        now = time.time()
        for p_name in self.config.providers:
            status_info = self.providers_status.get(
                p_name,
                {"consecutive_failures": 0, "status": "ACTIVE", "degraded_until": 0.0}
            )
            time_left = max(0, int(status_info["degraded_until"] - now)) if status_info["status"] == "DEGRADED" else 0
            
            # Resolve to check if locally available
            resolved = self._resolve_g4f_provider(p_name)

            report.append({
                "provider": p_name,
                "status": status_info["status"],
                "consecutive_failures": status_info["consecutive_failures"],
                "cool_down_remaining_seconds": time_left,
                "resolvable": resolved is not None,
                "is_working": resolved.working if hasattr(resolved, 'working') else True
            })
        return report

    def _get_mapped_model(self, model: str) -> str:
        """Map generic model name/alias to g4f compatible model name."""
        return self.config.models.get(model, model)

    def _is_invalid_response(self, text: str) -> bool:
        """Check if response is actually a signin wall, error page, or invalid."""
        t_low = text.lower()
        if "please log in" in t_low or "you.com/signin" in t_low or "please login" in t_low:
            return True
        if "<!doctype html>" in t_low or "<html" in t_low:
            return True
        return False

    # ── Synchronous Methods ──────────────────────────────────────────────────

    def chat(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> AIResponse:
        """
        Execute synchronous chat completion with rotation and backoff.
        """
        # 1. Check cache first
        if self.cache:
            cached = self.cache.get(messages, model)
            if cached:
                return cached

        # 2. Map model alias
        mapped_model = self._get_mapped_model(model)

        # 3. Get healthy providers
        healthy_providers = self._get_healthy_providers()
        if not healthy_providers:
            raise ProviderUnavailableError("All sub-providers are currently DEGRADED or exhausted.")

        last_error = None

        # 4. Try healthy providers sequentially
        for p_name in healthy_providers:
            # Check throttling
            self.throttler.throttle()

            g4f_prov = self._resolve_g4f_provider(p_name)
            if not g4f_prov:
                logger.debug(f"Skipping unresolvable sub-provider: {p_name}")
                continue

            # Implement exponential backoff for this provider if retrying
            backoff = self.config.initial_backoff
            retries = 0
            max_retries = min(2, self.config.retry_count) # Local provider retry cap to fail over faster

            while retries <= max_retries:
                start_time = time.time()
                try:
                    logger.info(f"Trying sub-provider '{p_name}' for model '{mapped_model}' (retry {retries})")
                    
                    # Make call
                    response_content = self.client.chat.completions.create(
                        model=mapped_model,
                        messages=messages,
                        provider=g4f_prov,
                        **kwargs
                    )

                    # Validate response
                    if not response_content:
                        raise AIProviderError("Empty response content returned.")

                    # Format response content
                    if hasattr(response_content, "choices"):
                        content_str = response_content.choices[0].message.content
                    else:
                        content_str = str(response_content)

                    if not content_str.strip():
                        raise AIProviderError("Blank text response from provider.")

                    if self._is_invalid_response(content_str):
                        raise AIProviderError("Detected sign-in wall or login page in response.")

                    latency_ms = int((time.time() - start_time) * 1000)
                    self._handle_success(p_name)

                    normalized_response = AIResponse(
                        content=content_str,
                        model=model,
                        provider=p_name,
                        latency_ms=latency_ms,
                        success=True
                    )

                    # Store in cache
                    if self.cache:
                        self.cache.set(messages, model, normalized_response)

                    return normalized_response

                except Exception as e:
                    last_error = e
                    logger.warning(f"Provider '{p_name}' call failed: {e}")
                    
                    # Sleep on backoff
                    if retries < max_retries:
                        time.sleep(backoff)
                        backoff = min(backoff * 2, self.config.max_backoff)
                    
                    retries += 1

            # If we reached here, the current provider failed all retries
            self._handle_failure(p_name, last_error or AIProviderError("Provider failed all retries"))

        # If all healthy providers failed
        raise ProviderUnavailableError(f"All free providers failed. Last error: {last_error}")

    def stream(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> Generator[str, None, None]:
        """
        Execute synchronous streaming completion with immediate fallback.
        """
        mapped_model = self._get_mapped_model(model)
        healthy_providers = self._get_healthy_providers()

        if not healthy_providers:
            raise ProviderUnavailableError("All sub-providers are currently DEGRADED or exhausted.")

        last_error = None
        for p_name in healthy_providers:
            self.throttler.throttle()
            g4f_prov = self._resolve_g4f_provider(p_name)
            if not g4f_prov:
                continue

            try:
                logger.info(f"Streaming via sub-provider '{p_name}' for model '{mapped_model}'")
                response = self.client.chat.completions.create(
                    model=mapped_model,
                    messages=messages,
                    provider=g4f_prov,
                    stream=True,
                    **kwargs
                )

                chunk_delivered = False
                for chunk in response:
                    # g4f returns either a Chunk object or string depending on version
                    if hasattr(chunk, "choices"):
                        delta = chunk.choices[0].delta.content
                    else:
                        delta = str(chunk)

                    if delta:
                        chunk_delivered = True
                        yield delta

                if chunk_delivered:
                    self._handle_success(p_name)
                    return  # Success, terminate generator
                else:
                    raise AIProviderError("Stream produced zero content chunks.")

            except Exception as e:
                last_error = e
                logger.warning(f"Streaming via '{p_name}' failed: {e}")
                self._handle_failure(p_name, e)

        raise ProviderUnavailableError(f"All streaming providers failed. Last error: {last_error}")

    # ── Asynchronous Methods ─────────────────────────────────────────────────

    async def chat_async(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> AIResponse:
        """
        Execute asynchronous chat completion with rotation and backoff.
        """
        # 1. Check cache first
        if self.cache:
            cached = self.cache.get(messages, model)
            if cached:
                return cached

        # 2. Map model alias
        mapped_model = self._get_mapped_model(model)

        # 3. Get healthy providers
        healthy_providers = self._get_healthy_providers()
        if not healthy_providers:
            raise ProviderUnavailableError("All sub-providers are currently DEGRADED or exhausted.")

        last_error = None

        # 4. Try healthy providers sequentially
        for p_name in healthy_providers:
            # Check throttling
            await self.throttler.throttle_async()

            g4f_prov = self._resolve_g4f_provider(p_name)
            if not g4f_prov:
                logger.debug(f"Skipping unresolvable sub-provider: {p_name}")
                continue

            # Implement exponential backoff
            backoff = self.config.initial_backoff
            retries = 0
            max_retries = min(2, self.config.retry_count)

            while retries <= max_retries:
                start_time = time.time()
                try:
                    logger.info(f"Trying sub-provider '{p_name}' for model '{mapped_model}' asynchronously (retry {retries})")
                    
                    # Make async call
                    response_content = await self.async_client.chat.completions.create(
                        model=mapped_model,
                        messages=messages,
                        provider=g4f_prov,
                        **kwargs
                    )

                    # Validate response
                    if not response_content:
                        raise AIProviderError("Empty response content returned.")

                    # Format response content
                    if hasattr(response_content, "choices"):
                        content_str = response_content.choices[0].message.content
                    else:
                        content_str = str(response_content)

                    if not content_str.strip():
                        raise AIProviderError("Blank text response from provider.")

                    if self._is_invalid_response(content_str):
                        raise AIProviderError("Detected sign-in wall or login page in response.")

                    latency_ms = int((time.time() - start_time) * 1000)
                    self._handle_success(p_name)

                    normalized_response = AIResponse(
                        content=content_str,
                        model=model,
                        provider=p_name,
                        latency_ms=latency_ms,
                        success=True
                    )

                    # Store in cache
                    if self.cache:
                        self.cache.set(messages, model, normalized_response)

                    return normalized_response

                except Exception as e:
                    last_error = e
                    logger.warning(f"Provider '{p_name}' async call failed: {e}")
                    
                    # Sleep on backoff
                    if retries < max_retries:
                        await asyncio.sleep(backoff)
                        backoff = min(backoff * 2, self.config.max_backoff)
                    
                    retries += 1

            # If we reached here, the current provider failed all retries
            self._handle_failure(p_name, last_error or AIProviderError("Provider failed all retries"))

        # If all healthy providers failed
        raise ProviderUnavailableError(f"All free providers failed. Last error: {last_error}")

    async def stream_async(self, messages: List[Dict[str, str]], model: str, **kwargs: Any) -> AsyncGenerator[str, None]:
        """
        Execute asynchronous streaming completion with immediate fallback.
        """
        mapped_model = self._get_mapped_model(model)
        healthy_providers = self._get_healthy_providers()

        if not healthy_providers:
            raise ProviderUnavailableError("All sub-providers are currently DEGRADED or exhausted.")

        last_error = None
        for p_name in healthy_providers:
            await self.throttler.throttle_async()
            g4f_prov = self._resolve_g4f_provider(p_name)
            if not g4f_prov:
                continue

            try:
                logger.info(f"Async streaming via sub-provider '{p_name}' for model '{mapped_model}'")
                response = self.async_client.chat.completions.create(
                    model=mapped_model,
                    messages=messages,
                    provider=g4f_prov,
                    stream=True,
                    **kwargs
                )

                chunk_delivered = False
                async for chunk in response:
                    if hasattr(chunk, "choices"):
                        delta = chunk.choices[0].delta.content
                    else:
                        delta = str(chunk)

                    if delta:
                        chunk_delivered = True
                        yield delta

                if chunk_delivered:
                    self._handle_success(p_name)
                    return  # Success, terminate generator
                else:
                    raise AIProviderError("Async stream produced zero content chunks.")

            except Exception as e:
                last_error = e
                logger.warning(f"Async streaming via '{p_name}' failed: {e}")
                self._handle_failure(p_name, e)

        raise ProviderUnavailableError(f"All async streaming providers failed. Last error: {last_error}")
