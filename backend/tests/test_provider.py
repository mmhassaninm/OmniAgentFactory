"""
Unit tests for the resilient free AI provider integration layer (G4FProvider).
Covers happy path, fallbacks, circuit breaking, caching, and throttling.
Determinedly uses mocking to run 100% reliably in CI/CD without network requests.
"""

import pytest
import time
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch

from ai_provider import (
    G4FProvider,
    AIResponse,
    ProviderUnavailableError,
    AIProviderError,
    ProviderConfig
)
from ai_provider.cache import ResponseCache, RequestThrottler


@pytest.fixture
def test_config():
    """Create a temporary test configuration."""
    config = ProviderConfig()
    config.settings["providers"] = ["Mock1", "Mock2", "Mock3"]
    config.settings["retry_count"] = 1
    config.settings["initial_backoff"] = 0.01
    config.settings["circuit_breaker"]["max_failures"] = 2
    config.settings["circuit_breaker"]["cool_down_seconds"] = 2
    config.settings["cache"]["enabled"] = True
    config.settings["cache"]["ttl"] = 1
    return config


# ── 1. Caching Tests ─────────────────────────────────────────────────────────

def test_cache_hit_miss_and_ttl():
    """Verify in-memory caching, cache hits, misses, and expiration."""
    cache = ResponseCache(ttl_seconds=1, max_size=5)
    messages = [{"role": "user", "content": "hi"}]
    model = "gpt-4o"

    # Initial miss
    assert cache.get(messages, model) is None

    # Cache response
    res = AIResponse(content="hello", model=model, provider="Mock", latency_ms=10, success=True)
    cache.set(messages, model, res)

    # Hit
    hit = cache.get(messages, model)
    assert hit is not None
    assert hit.content == "hello"

    # Expiration (sleep past TTL)
    time.sleep(1.1)
    assert cache.get(messages, model) is None


def test_cache_size_limit():
    """Verify cache evicts old records when maximum size is reached."""
    cache = ResponseCache(ttl_seconds=10, max_size=2)
    model = "gpt-4o"

    res = AIResponse(content="reply", model=model, provider="Mock", latency_ms=10, success=True)
    cache.set([{"role": "user", "content": "1"}], model, res)
    cache.set([{"role": "user", "content": "2"}], model, res)
    cache.set([{"role": "user", "content": "3"}], model, res) # Evicts "1"

    assert cache.get([{"role": "user", "content": "1"}], model) is None
    assert cache.get([{"role": "user", "content": "2"}], model) is not None
    assert cache.get([{"role": "user", "content": "3"}], model) is not None


# ── 2. Throttling Tests ──────────────────────────────────────────────────────

def test_sync_throttler():
    """Verify that sync RequestThrottler delays successive requests."""
    throttler = RequestThrottler(throttle_seconds=0.2)
    
    start = time.time()
    throttler.throttle() # First request -> no sleep
    throttler.throttle() # Second request -> sleeps up to 0.2s
    duration = time.time() - start
    assert duration >= 0.15


@pytest.mark.asyncio
async def test_async_throttler():
    """Verify that async RequestThrottler delays successive requests."""
    throttler = RequestThrottler(throttle_seconds=0.2)
    
    start = time.time()
    await throttler.throttle_async()
    await throttler.throttle_async()
    duration = time.time() - start
    assert duration >= 0.15


# ── 3. Fallback Rotation & Circuit Breaking Tests ────────────────────────────

@patch("ai_provider.g4f_provider.Client")
def test_provider_happy_path(mock_client_class, test_config):
    """Verify a successful call returns a correctly structured AIResponse."""
    mock_client = mock_client_class.return_value
    mock_client.chat.completions.create.return_value = "Synthetic Success Response"

    provider = G4FProvider()
    provider.config = test_config
    provider.cache = None # Disable cache for tests
    provider._initialize_provider_status()

    # Stub the g4f provider resolution
    provider._resolve_g4f_provider = MagicMock(return_value="resolved_stub")

    messages = [{"role": "user", "content": "hi"}]
    res = provider.chat(messages, model="gpt-4o")

    assert res.success is True
    assert res.content == "Synthetic Success Response"
    assert res.provider == "Mock1" # Checked the first active provider
    assert provider.providers_status["Mock1"]["consecutive_failures"] == 0


@patch("ai_provider.g4f_provider.Client")
def test_provider_fallback_rotation(mock_client_class, test_config):
    """Verify the provider cascades and rotates on failures."""
    mock_client = mock_client_class.return_value
    
    # First provider fails, second succeeds
    def mock_create(model, messages, provider, **kwargs):
        if provider == "resolved_stub_Mock1":
            raise Exception("Mock1 Outage")
        return "Mock2 Success"

    mock_client.chat.completions.create.side_effect = mock_create

    provider = G4FProvider()
    provider.config = test_config
    provider.cache = None
    provider._initialize_provider_status()
    
    # Stub provider resolver
    provider._resolve_g4f_provider = lambda name: f"resolved_stub_{name}"

    messages = [{"role": "user", "content": "hi"}]
    res = provider.chat(messages, model="gpt-4o")

    assert res.success is True
    assert res.content == "Mock2 Success"
    assert res.provider == "Mock2"
    
    # Check that status reflects Mock1 failed, Mock2 succeeded
    assert provider.providers_status["Mock1"]["consecutive_failures"] == 1
    assert provider.providers_status["Mock2"]["consecutive_failures"] == 0


@patch("ai_provider.g4f_provider.Client")
def test_circuit_breaker_tripping_and_recovery(mock_client_class, test_config):
    """Verify circuit breaker marks provider DEGRADED and rotates past it."""
    mock_client = mock_client_class.return_value
    mock_client.chat.completions.create.side_effect = Exception("Mock Fail")

    provider = G4FProvider()
    provider.config = test_config
    provider.cache = None
    provider._initialize_provider_status()
    provider._resolve_g4f_provider = lambda name: f"resolved_stub_{name}"

    messages = [{"role": "user", "content": "hi"}]

    # Call 1: Mock1 and Mock2 fail once.
    with pytest.raises(ProviderUnavailableError):
        provider.chat(messages, model="gpt-4o")

    assert provider.providers_status["Mock1"]["consecutive_failures"] == 1
    assert provider.providers_status["Mock1"]["status"] == "ACTIVE"

    # Call 2: Tripping point. Consecutive failures hit cb_max_failures = 2.
    with pytest.raises(ProviderUnavailableError):
        provider.chat(messages, model="gpt-4o")

    assert provider.providers_status["Mock1"]["status"] == "DEGRADED"
    assert provider.providers_status["Mock2"]["status"] == "DEGRADED"

    # Mock success on Mock1 if tried
    mock_client.chat.completions.create.side_effect = None
    mock_client.chat.completions.create.return_value = "Mock1 Recovered!"

    # Since all providers are degraded, calling chat should raise ProviderUnavailableError immediately
    with pytest.raises(ProviderUnavailableError) as exc_info:
        provider.chat(messages, model="gpt-4o")
    assert "DEGRADED" in str(exc_info.value)

    # Sleep past cb_cool_down = 2s to allow recovery
    time.sleep(2.1)

    # Calling again should recover providers and succeed!
    res = provider.chat(messages, model="gpt-4o")
    assert res.success is True
    assert res.content == "Mock1 Recovered!"
    assert res.provider == "Mock1"
    assert provider.providers_status["Mock1"]["status"] == "ACTIVE"
    assert provider.providers_status["Mock1"]["consecutive_failures"] == 0


# ── 4. Asynchronous Fallback Tests ───────────────────────────────────────────

@pytest.mark.asyncio
@patch("ai_provider.g4f_provider.AsyncClient")
async def test_provider_async_happy_path(mock_async_client_class, test_config):
    """Verify asynchronous happy path works flawlessly."""
    mock_async_client = mock_async_client_class.return_value
    mock_async_client.chat.completions.create = AsyncMock(return_value="Async Success Response")

    provider = G4FProvider()
    provider.config = test_config
    provider.cache = None
    provider._initialize_provider_status()
    provider._resolve_g4f_provider = MagicMock(return_value="resolved_stub")

    messages = [{"role": "user", "content": "hi"}]
    res = await provider.chat_async(messages, model="gpt-4o")

    assert res.success is True
    assert res.content == "Async Success Response"
    assert res.provider == "Mock1"
