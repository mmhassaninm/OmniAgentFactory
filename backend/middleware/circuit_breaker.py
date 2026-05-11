"""
Circuit breaker pattern for external API calls.
Prevents cascading failures when external services are down.
"""

import time
import asyncio
import logging
from enum import Enum
from typing import Callable, Any, Dict
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    """Circuit breaker states."""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreaker:
    """
    Circuit breaker to protect external API calls.

    States:
    - CLOSED: Normal, requests pass through
    - OPEN: Fails detected, fast-fail all requests
    - HALF_OPEN: Testing if service recovered, allow limited requests
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        success_threshold: int = 2,
        timeout_seconds: float = 60.0,
    ):
        """
        Args:
            name: Service name (e.g., "openai", "paypal")
            failure_threshold: Failures before opening circuit
            success_threshold: Successes in half-open before closing
            timeout_seconds: Time before trying recovery (half-open)
        """
        self.name = name
        self.failure_threshold = failure_threshold
        self.success_threshold = success_threshold
        self.timeout_seconds = timeout_seconds

        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: float | None = None
        self.opened_at: float | None = None

    async def call(
        self,
        func: Callable,
        *args,
        **kwargs,
    ) -> Any:
        """
        Execute function with circuit breaker protection.

        Args:
            func: Async function to call
            *args, **kwargs: Arguments for func

        Returns:
            Result from func if successful
            Raises CircuitBreakerOpen if circuit is open
        """
        if self.state == CircuitState.OPEN:
            # Check if timeout expired (try recovery)
            if time.time() - self.opened_at >= self.timeout_seconds:
                self.state = CircuitState.HALF_OPEN
                self.success_count = 0
                logger.info(f"Circuit breaker '{self.name}' transitioning to HALF_OPEN")
            else:
                raise CircuitBreakerOpen(
                    f"Service '{self.name}' is temporarily unavailable (circuit open)"
                )

        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure(e)
            raise

    def _on_success(self):
        """Handle successful call."""
        self.failure_count = 0

        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.success_threshold:
                # Service recovered
                self.state = CircuitState.CLOSED
                logger.info(f"Circuit breaker '{self.name}' transitioning to CLOSED")

    def _on_failure(self, error: Exception):
        """Handle failed call."""
        self.failure_count += 1
        self.last_failure_time = time.time()

        if self.state == CircuitState.HALF_OPEN:
            # Failed during recovery — open circuit again
            self.state = CircuitState.OPEN
            self.opened_at = time.time()
            logger.warning(
                f"Circuit breaker '{self.name}' failed during recovery, reopening: {error}"
            )
        elif self.failure_count >= self.failure_threshold:
            # Too many failures — open circuit
            self.state = CircuitState.OPEN
            self.opened_at = time.time()
            logger.warning(
                f"Circuit breaker '{self.name}' opened after {self.failure_count} failures: {error}"
            )

    def get_status(self) -> Dict[str, Any]:
        """Get circuit breaker status."""
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "opened_at": (
                datetime.fromtimestamp(self.opened_at).isoformat()
                if self.opened_at
                else None
            ),
            "last_failure_time": (
                datetime.fromtimestamp(self.last_failure_time).isoformat()
                if self.last_failure_time
                else None
            ),
        }


class CircuitBreakerOpen(Exception):
    """Raised when circuit breaker is open (service unavailable)."""

    pass


# Global circuit breakers for major external services
_breakers: Dict[str, CircuitBreaker] = {}


def get_breaker(service_name: str) -> CircuitBreaker:
    """Get or create circuit breaker for service."""
    if service_name not in _breakers:
        _breakers[service_name] = CircuitBreaker(
            name=service_name,
            failure_threshold=5,
            success_threshold=2,
            timeout_seconds=60.0,
        )
    return _breakers[service_name]


def get_all_breakers() -> Dict[str, Dict[str, Any]]:
    """Get status of all circuit breakers."""
    return {name: breaker.get_status() for name, breaker in _breakers.items()}


async def call_with_breaker(
    service_name: str,
    func: Callable,
    *args,
    **kwargs,
) -> Any:
    """
    Call function with circuit breaker protection.

    Usage:
        result = await call_with_breaker("openai", openai_api_call, prompt="...")
    """
    breaker = get_breaker(service_name)
    return await breaker.call(func, *args, **kwargs)
