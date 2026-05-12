"""
Tests for the AI Health Monitor system.
Tests: provider manifest completeness, health ping logic, telemetry logging,
quota tracking, and provider resolution.

Run with: python backend/test_ai_health_monitor.py
"""

import os
import sys
import time
import json
import asyncio
import unittest
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.ai_health_monitor import (
    AIHealthMonitor,
    PROVIDER_MANIFEST,
    get_ai_health_monitor,
)

from services.llm_interceptor import (
    intercept_llm_call,
    get_total_calls,
    _estimate_tokens,
)


class TestProviderManifest(unittest.TestCase):
    """Test PROVIDER_MANIFEST completeness and correctness."""

    def test_required_keys_present(self):
        required = ["name", "models", "env_key", "base_url", "type", 
                     "tool_calling", "streaming", "default_model", "rpm_limit", "rpd_limit"]
        for name, info in PROVIDER_MANIFEST.items():
            for key in required:
                self.assertIn(key, info, f"Provider '{name}' missing key '{key}'")

    def test_gemini_tool_calling(self):
        self.assertTrue(PROVIDER_MANIFEST["gemini"]["tool_calling"])

    def test_groq_tool_calling(self):
        self.assertTrue(PROVIDER_MANIFEST["groq"]["tool_calling"])

    def test_mistral_tool_calling(self):
        self.assertTrue(PROVIDER_MANIFEST["mistral"]["tool_calling"])

    def test_openrouter_tool_calling(self):
        self.assertTrue(PROVIDER_MANIFEST["openrouter"]["tool_calling"])

    def test_g4f_no_tool_calling(self):
        self.assertFalse(PROVIDER_MANIFEST["g4f"]["tool_calling"])

    def test_sambanova_no_tool_calling(self):
        self.assertFalse(PROVIDER_MANIFEST["sambanova"]["tool_calling"])

    def test_all_providers_have_models(self):
        for name, info in PROVIDER_MANIFEST.items():
            self.assertGreater(len(info["models"]), 0, f"Provider '{name}' has no models")

    def test_expected_providers(self):
        expected = {"gemini", "groq", "openrouter", "mistral", "sambanova",
                     "cerebras", "cloudflare", "openai", "anthropic", "g4f", "llamacloud"}
        actual = set(PROVIDER_MANIFEST.keys())
        self.assertEqual(expected, actual)


class TestAIHealthMonitorInit(unittest.TestCase):
    """Test AIHealthMonitor initialization."""

    def setUp(self):
        for key in ["GEMINI_API_KEY", "GROQ_API_KEY", "MISTRAL_API_KEY", "SAMBANOVA_API_KEY"]:
            os.environ.pop(key, None)

    def test_init_no_keys(self):
        monitor = AIHealthMonitor()
        # Uptime may be 0 immediately after instantiation; check it's non-negative
        self.assertGreaterEqual(monitor.get_uptime_seconds(), 0)
        self.assertEqual(monitor._session_calls, 0)
        self.assertEqual(monitor._session_tokens, 0)
        self.assertEqual(monitor._session_cost, 0.0)

    def test_get_session_stats_empty(self):
        monitor = AIHealthMonitor()
        stats = monitor.get_session_stats()
        self.assertEqual(stats["total_calls_session"], 0)
        self.assertEqual(stats["total_tokens_session"], 0)
        self.assertEqual(stats["total_cost_session"], 0.0)

    def test_get_configured_providers_no_keys(self):
        monitor = AIHealthMonitor()
        providers = monitor.get_configured_providers()
        for p in providers:
            if p["name"] != "g4f":
                self.assertFalse(p["configured"])

    def test_get_configured_providers_with_gemini(self):
        os.environ["GEMINI_API_KEY"] = "test-key"
        monitor = AIHealthMonitor()
        providers = monitor.get_configured_providers()
        gemini = next(p for p in providers if p["name"] == "gemini")
        self.assertTrue(gemini["configured"])
        self.assertEqual(gemini["display_name"], "Google Gemini")
        self.assertTrue(gemini["tool_calling"])
        self.assertEqual(gemini["default_model"], "gemini-2.0-flash")


class TestResolveApiKey(unittest.TestCase):
    """Test API key resolution logic."""

    def setUp(self):
        for key in ["GEMINI_API_KEY", "GEMINI_KEY_1", "GOOGLE_AI_STUDIO_KEY_1"]:
            os.environ.pop(key, None)

    def test_primary_key(self):
        os.environ["GEMINI_API_KEY"] = "primary-key"
        monitor = AIHealthMonitor()
        key = monitor._resolve_api_key("gemini")
        self.assertEqual(key, "primary-key")

    def test_fallback_key(self):
        os.environ["GEMINI_KEY_1"] = "fallback-key"
        monitor = AIHealthMonitor()
        key = monitor._resolve_api_key("gemini")
        self.assertEqual(key, "fallback-key")

    def test_no_key(self):
        monitor = AIHealthMonitor()
        key = monitor._resolve_api_key("gemini")
        self.assertIsNone(key)

    def test_g4f_no_key(self):
        monitor = AIHealthMonitor()
        key = monitor._resolve_api_key("g4f")
        self.assertIsNone(key)

    def test_unknown_provider(self):
        monitor = AIHealthMonitor()
        key = monitor._resolve_api_key("nonexistent")
        self.assertIsNone(key)


class TestLogCall(unittest.TestCase):
    """Test telemetry logging."""

    def setUp(self):
        os.environ["GEMINI_API_KEY"] = "test-key"

    def test_log_successful_call(self):
        monitor = AIHealthMonitor()
        entry = monitor.log_call(
            provider="gemini",
            model="gemini-2.0-flash",
            tokens_in=50,
            tokens_out=20,
            latency_ms=345,
            agent_id="test-agent",
            task_type="general",
        )
        self.assertEqual(entry["provider"], "gemini")
        self.assertEqual(entry["model"], "gemini-2.0-flash")
        self.assertEqual(entry["tokens_in"], 50)
        self.assertEqual(entry["tokens_out"], 20)
        self.assertEqual(entry["latency_ms"], 345)
        self.assertEqual(entry["agent_id"], "test-agent")
        self.assertEqual(entry["status"], "ok")
        self.assertIsNone(entry["error"])
        self.assertIn("id", entry)
        self.assertIn("timestamp", entry)

    def test_log_call_with_error(self):
        monitor = AIHealthMonitor()
        entry = monitor.log_call(
            provider="groq",
            model="llama-3.3-70b",
            tokens_in=10,
            tokens_out=0,
            latency_ms=5000,
            error="Rate limit exceeded",
        )
        self.assertEqual(entry["status"], "error")
        self.assertEqual(entry["error"], "Rate limit exceeded")

    def test_log_call_increments_count(self):
        monitor = AIHealthMonitor()
        self.assertEqual(monitor._session_calls, 0)
        monitor.log_call("gemini", "gemini-flash", 10, 5)
        self.assertEqual(monitor._session_calls, 1)
        monitor.log_call("groq", "llama-3.3-70b", 20, 10, latency_ms=200)
        self.assertEqual(monitor._session_calls, 2)

    def test_log_call_tracks_cost(self):
        monitor = AIHealthMonitor()
        monitor.log_call("gemini", "flash", 100, 50, cost=0.0015)
        self.assertAlmostEqual(monitor._session_cost, 0.0015)
        monitor.log_call("groq", "llama", 200, 100, cost=0.0020)
        self.assertAlmostEqual(monitor._session_cost, 0.0035)

    def test_get_summary(self):
        monitor = AIHealthMonitor()
        monitor.log_call("gemini", "flash", 100, 50)
        monitor.log_call("groq", "llama", 200, 100)
        summary = monitor.get_session_stats()
        self.assertEqual(summary["total_calls_session"], 2)
        self.assertEqual(summary["total_tokens_session"], 450)


class TestInterceptor(unittest.TestCase):
    """Test LLM interceptor."""

    def test_estimate_tokens(self):
        self.assertEqual(_estimate_tokens("hello"), 1)
        self.assertEqual(_estimate_tokens("a" * 100), 25)
        self.assertEqual(_estimate_tokens("text with 20 chars"), 4)

    def test_get_total_calls(self):
        # Just test the function exists and returns a number
        count = get_total_calls()
        self.assertIsInstance(count, int)


class TestPingProvider(unittest.TestCase):
    """Test provider ping logic."""

    def setUp(self):
        os.environ["GEMINI_API_KEY"] = "test-key"

    def test_unknown_provider_returns_error(self):
        async def _test():
            monitor = AIHealthMonitor()
            result = await monitor.ping_provider("nonexistent")
            return result
        result = asyncio.run(_test())
        self.assertEqual(result["status"], "error")


class TestSingleton(unittest.TestCase):
    """Test singleton pattern."""

    def test_singleton_returns_same_instance(self):
        m1 = get_ai_health_monitor()
        m2 = get_ai_health_monitor()
        self.assertIs(m1, m2)


class TestProviderManifestTypes(unittest.TestCase):
    """Test provider type classification."""

    def test_free_providers(self):
        free_providers = ["gemini", "groq", "openrouter", "mistral", "sambanova",
                           "cerebras", "cloudflare", "g4f", "llamacloud"]
        for name in free_providers:
            self.assertEqual(PROVIDER_MANIFEST[name]["type"], "free",
                             f"Provider '{name}' should be free")

    def test_paid_providers(self):
        self.assertEqual(PROVIDER_MANIFEST["openai"]["type"], "paid")
        self.assertEqual(PROVIDER_MANIFEST["anthropic"]["type"], "paid")


class TestProviderDetails(unittest.TestCase):
    """Test specific provider details."""

    def test_gemini_context_window(self):
        self.assertEqual(PROVIDER_MANIFEST["gemini"]["context_window"], 1048576)

    def test_groq_models(self):
        models = PROVIDER_MANIFEST["groq"]["models"]
        self.assertIn("llama-3.3-70b-versatile", models)

    def test_openrouter_models(self):
        models = PROVIDER_MANIFEST["openrouter"]["models"]
        self.assertIn("openrouter/auto", models)

    def test_used_in_references(self):
        for name, info in PROVIDER_MANIFEST.items():
            self.assertGreater(len(info["used_in"]), 0,
                               f"Provider '{name}' has no usage references")


if __name__ == "__main__":
    unittest.main()