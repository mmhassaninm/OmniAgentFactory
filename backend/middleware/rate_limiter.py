"""
Rate limiting middleware for FastAPI.
Protects public endpoints from abuse using token bucket algorithm.
"""

import time
import logging
from typing import Dict, Tuple
from functools import lru_cache
from collections import defaultdict

logger = logging.getLogger(__name__)


class RateLimiter:
    """Token bucket rate limiter per client IP."""

    def __init__(self, requests_per_minute: int = 60):
        """
        Args:
            requests_per_minute: Max requests per minute per IP
        """
        self.requests_per_minute = requests_per_minute
        self.window_seconds = 60
        self.buckets: Dict[str, Tuple[float, int]] = defaultdict(
            lambda: (time.time(), requests_per_minute)
        )

    def is_allowed(self, client_ip: str) -> bool:
        """
        Check if a request from client_ip is allowed.

        Returns:
            True if request is allowed, False if rate limited
        """
        now = time.time()
        last_update, tokens = self.buckets[client_ip]
        elapsed = now - last_update

        # Refill tokens based on elapsed time
        refill_rate = self.requests_per_minute / self.window_seconds
        tokens = min(self.requests_per_minute, tokens + refill_rate * elapsed)

        if tokens >= 1:
            # Consume one token
            self.buckets[client_ip] = (now, tokens - 1)
            return True
        else:
            # No tokens available
            self.buckets[client_ip] = (now, tokens)
            return False

    def get_remaining(self, client_ip: str) -> int:
        """Get remaining requests for client IP (approximate)."""
        _, tokens = self.buckets[client_ip]
        return max(0, int(tokens))


# Global rate limiters for different endpoint tiers
_chat_limiter = RateLimiter(requests_per_minute=30)  # Chat is expensive
_models_limiter = RateLimiter(requests_per_minute=60)  # Standard
_files_limiter = RateLimiter(requests_per_minute=120)  # File ops are cheap
_channels_limiter = RateLimiter(requests_per_minute=60)  # Channel webhooks
_browser_limiter = RateLimiter(requests_per_minute=10)  # Browser is resource-heavy
_skills_limiter = RateLimiter(requests_per_minute=30)  # Skill execution
_default_limiter = RateLimiter(requests_per_minute=60)  # Everything else


def get_client_ip(request) -> str:
    """Extract client IP from request, handling proxies."""
    # Check X-Forwarded-For header (behind proxy)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    # Fallback to direct client IP
    return request.client.host if request.client else "unknown"


def check_rate_limit(client_ip: str, endpoint_type: str = "default") -> bool:
    """
    Check if client is rate limited.

    Args:
        client_ip: Client IP address
        endpoint_type: "chat", "models", "files", or "default"

    Returns:
        True if allowed, False if rate limited
    """
    if endpoint_type == "chat":
        return _chat_limiter.is_allowed(client_ip)
    elif endpoint_type == "models":
        return _models_limiter.is_allowed(client_ip)
    elif endpoint_type == "files":
        return _files_limiter.is_allowed(client_ip)
    else:
        return _default_limiter.is_allowed(client_ip)


def get_rate_limit_info(client_ip: str, endpoint_type: str = "default") -> Dict:
    """Get rate limit status for client."""
    if endpoint_type == "chat":
        limiter = _chat_limiter
    elif endpoint_type == "models":
        limiter = _models_limiter
    elif endpoint_type == "files":
        limiter = _files_limiter
    else:
        limiter = _default_limiter

    return {
        "requests_per_minute": limiter.requests_per_minute,
        "remaining": limiter.get_remaining(client_ip),
        "limit_type": endpoint_type,
    }
