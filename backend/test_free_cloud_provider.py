"""
Tests for the FreeCloudProvider (Gemini, Groq, Mistral, SambaNova integration).
Tests provider initialization, provider selection, and fallback logic.

Run with: python backend/test_free_cloud_provider.py
"""

import os
import sys
import time
import unittest

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ai_provider.free_cloud_provider import (
    FreeCloudProvider,
    CLOUD_PROVIDERS,
    get_free_cloud_provider,
)
from ai_provider.dataclasses import AIResponse
from ai_provider.interface import AIProviderError, ProviderUnavailableError


class TestFreeCloudProviderInit(unittest.TestCase):
    """Test FreeCloudProvider initialization and configuration."""

    def setUp(self):
        for key in ["GEMINI_API_KEY", "GROQ_API_KEY", "MISTRAL_API_KEY", "SAMBANOVA_API_KEY"]:
            os.environ.pop(key, None)

    def test_init_without_keys(self):
        provider = FreeCloudProvider()
        available = provider.get_available_providers()
        self.assertGreater(len(available), 0)
        for p in available:
            self.assertFalse(p["configured"])
            self.assertEqual(p["status"], "UNCONFIGURED")

    def test_init_with_gemini_key(self):
        os.environ["GEMINI_API_KEY"] = "test-gemini-key-123"
        provider = FreeCloudProvider()
        available = provider.get_available_providers()
        gemini = next((p for p in available if p["name"] == "gemini"), None)
        self.assertIsNotNone(gemini)
        self.assertTrue(gemini["configured"])
        self.assertEqual(gemini["status"], "ACTIVE")

    def test_init_with_groq_key(self):
        os.environ["GROQ_API_KEY"] = "test-groq-key-456"
        provider = FreeCloudProvider()
        available = provider.get_available_providers()
        groq = next((p for p in available if p["name"] == "groq"), None)
        self.assertIsNotNone(groq)
        self.assertTrue(groq["configured"])
        self.assertEqual(groq["status"], "ACTIVE")

    def test_init_with_multiple_keys(self):
        os.environ["GEMINI_API_KEY"] = "g-test"
        os.environ["GROQ_API_KEY"] = "gr-test"
        os.environ["MISTRAL_API_KEY"] = "m-test"
        provider = FreeCloudProvider()
        available = provider.get_available_providers()
        configured = [p for p in available if p["configured"]]
        self.assertEqual(len(configured), 3)

    def test_provider_preference_order(self):
        os.environ["GEMINI_API_KEY"] = "g-test"
        os.environ["GROQ_API_KEY"] = "gr-test"
        provider = FreeCloudProvider()
        best = provider._get_best_provider()
        self.assertEqual(best, "gemini")

    def test_provider_preference_fallback(self):
        os.environ["GROQ_API_KEY"] = "gr-test"
        provider = FreeCloudProvider()
        best = provider._get_best_provider()
        self.assertEqual(best, "groq")

    def test_tool_calling_filter(self):
        os.environ["SAMBANOVA_API_KEY"] = "s-test"
        provider = FreeCloudProvider()
        best = provider._get_best_provider(require_tool_calling=True)
        self.assertIsNone(best)
        best = provider._get_best_provider(require_tool_calling=False)
        self.assertEqual(best, "sambanova")


class TestFreeCloudProviderHealth(unittest.TestCase):
    """Test provider health tracking and circuit breaker."""

    def setUp(self):
        os.environ["GEMINI_API_KEY"] = "g-test"
        os.environ["GROQ_API_KEY"] = "gr-test"

    def test_handle_success(self):
        provider = FreeCloudProvider()
        provider._handle_success("gemini")
        health = provider._provider_health["gemini"]
        self.assertEqual(health["consecutive_failures"], 0)
        self.assertEqual(health["status"], "ACTIVE")

    def test_handle_failure_threshold(self):
        provider = FreeCloudProvider()
        for i in range(3):
            provider._handle_failure("gemini", Exception(f"Error {i}"))
        health = provider._provider_health["gemini"]
        self.assertEqual(health["consecutive_failures"], 3)
        self.assertEqual(health["status"], "DEGRADED")
        self.assertGreater(health["degraded_until"], time.time())

    def test_handle_failure_below_threshold(self):
        provider = FreeCloudProvider()
        provider._handle_failure("gemini", Exception("Error 1"))
        health = provider._provider_health["gemini"]
        self.assertEqual(health["consecutive_failures"], 1)
        self.assertEqual(health["status"], "ACTIVE")

    def test_degraded_provider_excluded(self):
        provider = FreeCloudProvider()
        provider._provider_health["gemini"]["status"] = "DEGRADED"
        provider._provider_health["gemini"]["degraded_until"] = time.time() + 60
        healthy = provider._get_healthy_providers()
        self.assertNotIn("gemini", healthy)


class TestCloudProviderRegistry(unittest.TestCase):
    """Test the CLOUD_PROVIDERS registry data."""

    def test_all_providers_have_required_keys(self):
        required_keys = ["name", "env_key", "base_url", "models", "tool_calling", "streaming", "default_model"]
        for name, info in CLOUD_PROVIDERS.items():
            for key in required_keys:
                self.assertIn(key, info, f"Provider '{name}' missing key '{key}'")

    def test_gemini_tool_calling(self):
        self.assertTrue(CLOUD_PROVIDERS["gemini"]["tool_calling"])

    def test_groq_tool_calling(self):
        self.assertTrue(CLOUD_PROVIDERS["groq"]["tool_calling"])

    def test_mistral_tool_calling(self):
        self.assertTrue(CLOUD_PROVIDERS["mistral"]["tool_calling"])

    def test_all_providers_streaming(self):
        for name, info in CLOUD_PROVIDERS.items():
            self.assertTrue(info["streaming"], f"Provider '{name}' missing streaming")

    def test_env_key_format(self):
        for name, info in CLOUD_PROVIDERS.items():
            self.assertTrue(
                info["env_key"].endswith("_API_KEY"),
                f"Provider '{name}' env_key '{info['env_key']}' should end with _API_KEY",
            )


class TestSingleton(unittest.TestCase):
    """Test the singleton pattern."""

    def test_singleton_returns_same_instance(self):
        p1 = get_free_cloud_provider()
        p2 = get_free_cloud_provider()
        self.assertIs(p1, p2)


class TestNormalizeResponse(unittest.TestCase):
    """Test response normalization."""

    def setUp(self):
        os.environ["GEMINI_API_KEY"] = "g-test"

    def test_normalize_valid_response(self):
        provider = FreeCloudProvider()
        data = {
            "choices": [
                {
                    "message": {"content": "Hello, world!", "role": "assistant"},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        }
        response = provider._normalize_response(data, "gemini-2.0-flash", "gemini", 150)
        self.assertIsInstance(response, AIResponse)
        self.assertEqual(response.content, "Hello, world!")
        self.assertEqual(response.model, "gemini-2.0-flash")
        self.assertEqual(response.provider, "freecloud-gemini")
        self.assertTrue(response.success)
        self.assertEqual(response.latency_ms, 150)
        self.assertEqual(response.metadata["finish_reason"], "stop")

    def test_normalize_empty_content(self):
        provider = FreeCloudProvider()
        data = {"choices": [{"message": {"content": None}, "finish_reason": "stop"}]}
        response = provider._normalize_response(data, "gemini-2.0-flash", "gemini", 100)
        self.assertEqual(response.content, "")

    def test_normalize_no_choices(self):
        provider = FreeCloudProvider()
        data = {"choices": []}
        with self.assertRaises(AIProviderError):
            provider._normalize_response(data, "gemini-2.0-flash", "gemini", 100)

    def test_normalize_missing_choices_key(self):
        provider = FreeCloudProvider()
        data = {"foo": "bar"}
        with self.assertRaises(AIProviderError):
            provider._normalize_response(data, "gemini-2.0-flash", "gemini", 100)


class TestProviderRegistryCompleteness(unittest.TestCase):

    def test_provider_registry_completeness(self):
        expected = {"gemini", "groq", "mistral", "sambanova"}
        actual = set(CLOUD_PROVIDERS.keys())
        self.assertEqual(expected, actual)


if __name__ == "__main__":
    unittest.main()