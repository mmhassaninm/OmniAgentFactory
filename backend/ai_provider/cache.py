"""
Caching and throttling utilities for optimizing requests and avoiding rate limiting.
"""

import time
import asyncio
import logging
import json
import hashlib
from typing import Dict, Tuple, Optional, List, Any
from .dataclasses import AIResponse

logger = logging.getLogger(__name__)


class ResponseCache:
    """
    A simple in-memory TTL-based cache for identical prompts.
    """

    def __init__(self, ttl_seconds: int = 300, max_size: int = 1000):
        self.ttl = ttl_seconds
        self.max_size = max_size
        self._cache: Dict[str, Tuple[AIResponse, float]] = {}

    def _generate_key(self, messages: List[Dict[str, str]], model: str) -> str:
        """Create a deterministic hash key from messages and model."""
        try:
            # Sort keys to ensure deterministic representation
            serialized_messages = json.dumps(messages, sort_keys=True)
            raw_key = f"{model}:{serialized_messages}"
            return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
        except Exception:
            # Fallback to string representation
            raw_key = f"{model}:{str(messages)}"
            return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    def get(self, messages: List[Dict[str, str]], model: str) -> Optional[AIResponse]:
        """Get an item from cache if it exists and is not expired."""
        key = self._generate_key(messages, model)
        entry = self._cache.get(key)
        if not entry:
            return None

        response, timestamp = entry
        now = time.time()
        if now - timestamp > self.ttl:
            # Expired, remove from cache
            del self._cache[key]
            logger.debug(f"Cache expired for key {key}")
            return None

        logger.debug(f"Cache hit for model {model}")
        return response

    def set(self, messages: List[Dict[str, str]], model: str, response: AIResponse) -> None:
        """Add an item to the cache, with size enforcement."""
        if not response or not response.success:
            return  # Do not cache failed responses

        key = self._generate_key(messages, model)
        now = time.time()

        # Enforce max size (FIFO-like eviction of expired entries first, then any)
        if len(self._cache) >= self.max_size:
            self._cleanup_expired()
            # If still too large, evict one arbitrarily
            if len(self._cache) >= self.max_size:
                arbitrary_key = next(iter(self._cache))
                del self._cache[arbitrary_key]

        self._cache[key] = (response, now)
        logger.debug(f"Cached response for model {model}, key: {key}")

    def _cleanup_expired(self) -> None:
        """Helper to purge all expired entries from cache."""
        now = time.time()
        expired_keys = [k for k, v in self._cache.items() if now - v[1] > self.ttl]
        for k in expired_keys:
            del self._cache[k]

    def clear(self) -> None:
        """Clear the cache entirely."""
        self._cache.clear()


class RequestThrottler:
    """
    Basic request throttling to pace outgoing requests to providers.
    Supports both sync and async sleeping.
    """

    def __init__(self, throttle_seconds: float = 0.5):
        self.throttle_seconds = throttle_seconds
        self.last_request_time: float = 0.0

    def throttle(self) -> None:
        """Synchronously pause execution if request interval is too short."""
        if self.throttle_seconds <= 0:
            return

        now = time.time()
        elapsed = now - self.last_request_time
        remaining = self.throttle_seconds - elapsed
        if remaining > 0:
            logger.debug(f"Throttling (sync): sleeping for {remaining:.3f}s")
            time.sleep(remaining)
        self.last_request_time = time.time()

    async def throttle_async(self) -> None:
        """Asynchronously pause execution if request interval is too short."""
        if self.throttle_seconds <= 0:
            return

        now = time.time()
        elapsed = now - self.last_request_time
        remaining = self.throttle_seconds - elapsed
        if remaining > 0:
            logger.debug(f"Throttling (async): sleeping for {remaining:.3f}s")
            await asyncio.sleep(remaining)
        self.last_request_time = time.time()
