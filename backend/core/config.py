"""
OmniBot — Configuration loader.
Reads all environment variables and provides a singleton Settings object.
"""

import os
import hashlib
from datetime import time
from functools import lru_cache
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv()


def _collect_keys(prefix: str, max_count: int = 8) -> List[str]:
    """Collect numbered keys like GROQ_KEY_1 .. GROQ_KEY_8, skipping blanks."""
    keys: List[str] = []
    for i in range(1, max_count + 1):
        val = os.getenv(f"{prefix}_{i}", "").strip()
        if val:
            keys.append(val)
    return keys


def _parse_time(value: str) -> time:
    """Parse HH:MM string into a datetime.time object."""
    parts = value.strip().split(":")
    return time(int(parts[0]), int(parts[1]))


def hash_key(api_key: str) -> str:
    """SHA-256 hash of an API key for safe storage."""
    return hashlib.sha256(api_key.encode()).hexdigest()


class Settings:
    """Singleton-style configuration loaded from environment."""

    def __init__(self):
        # ── Provider Keys ───────────────────────
        self.openrouter_keys: List[str] = _collect_keys("OPENROUTER_KEY")
        self.groq_keys: List[str] = _collect_keys("GROQ_KEY")
        self.gemini_keys: List[str] = _collect_keys("GEMINI_KEY", max_count=4)
        self.anthropic_key: Optional[str] = os.getenv("ANTHROPIC_KEY", "").strip() or None
        self.openai_key: Optional[str] = os.getenv("OPENAI_KEY", "").strip() or None
        # New free provider keys
        self.github_tokens: List[str] = _collect_keys("GITHUB_TOKEN")
        self.huggingface_keys: List[str] = _collect_keys("HF_KEY")
        self.google_ai_studio_keys: List[str] = _collect_keys("GOOGLE_AI_STUDIO_KEY")
        self.nvidia_nim_keys: List[str] = _collect_keys("NVIDIA_NIM_KEY")
        self.cerebras_keys: List[str] = _collect_keys("CEREBRAS_KEY")
        self.cloudflare_account_id: str = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
        self.cloudflare_keys: List[str] = _collect_keys("CLOUDFLARE_KEY")
        self.llamacloud_keys: List[str] = _collect_keys("LLAMACLOUD_KEY")

        # ── Local Models ────────────────────────
        self.ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        if "host.docker.internal" in self.ollama_base_url and not os.path.exists("/.dockerenv"):
            self.ollama_base_url = self.ollama_base_url.replace("host.docker.internal", "localhost")

        # ── Database ────────────────────────────
        self.mongodb_uri: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        self.mongodb_db: str = os.getenv("MONGODB_DB", "omnibot")
        self.chroma_host: str = os.getenv("CHROMA_HOST", "localhost")
        self.chroma_port: int = int(os.getenv("CHROMA_PORT", "8000"))

        # ── Night Mode ──────────────────────────
        self.night_mode_start: time = _parse_time(os.getenv("NIGHT_MODE_START", "00:00"))
        self.night_mode_end: time = _parse_time(os.getenv("NIGHT_MODE_END", "07:00"))

        # ── Concurrency ─────────────────────────
        self.max_concurrent_agents_day: int = int(os.getenv("MAX_CONCURRENT_AGENTS_DAY", "5"))
        self.max_concurrent_agents_night: int = int(os.getenv("MAX_CONCURRENT_AGENTS_NIGHT", "2"))

        # ── Evolution ───────────────────────────
        self.default_evolve_interval: int = int(os.getenv("DEFAULT_EVOLVE_INTERVAL_SECONDS", "120"))

        # ── Budget ──────────────────────────────
        self.max_tokens_per_key_per_day: int = int(os.getenv("MAX_TOKENS_PER_KEY_PER_DAY", "100000"))

        # ── Revenue Engine ───────────────────────
        self.paypal_me_link: str = os.getenv("PAYPAL_ME_LINK", "paypal.me/mmhassanin").strip()
        self.default_service_price: int = int(os.getenv("DEFAULT_SERVICE_PRICE", "25"))
        self.revenue_mode: bool = os.getenv("REVENUE_MODE", "false").lower() == "true"

        # ── Money Agent ──────────────────────────
        self.paypal_client_id: str = os.getenv("PAYPAL_CLIENT_ID", "").strip()
        self.paypal_client_secret: str = os.getenv("PAYPAL_CLIENT_SECRET", "").strip()
        self.paypal_email: str = os.getenv("PAYPAL_EMAIL", "").strip()
        self.paypal_sandbox: bool = os.getenv("PAYPAL_SANDBOX", "true").lower() != "false"
        self.gmail_address: str = os.getenv("GMAIL_ADDRESS", "").strip()
        self.gmail_app_password: str = os.getenv("GMAIL_APP_PASSWORD", "").strip()
        self.agent_mode: str = os.getenv("AGENT_MODE", "human_in_loop").strip()

        # ── Telegram Command Center ──────────────
        self.telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        self.telegram_chat_id: str = os.getenv("TELEGRAM_CHAT_ID", "").strip()

        # ── Infinite Dev Loop Orchestrator ──────
        self.enable_dev_loop: bool = os.getenv("ENABLE_DEV_LOOP", "true").lower() == "true"
        self.dev_loop_interval_minutes: int = int(os.getenv("DEV_LOOP_INTERVAL_MINUTES", "60"))

    @property
    def ENABLE_DEV_LOOP(self) -> bool:
        return self.enable_dev_loop

    @property
    def DEV_LOOP_INTERVAL_MINUTES(self) -> int:
        return self.dev_loop_interval_minutes

    def is_night_mode(self) -> bool:
        """Check if current local time falls within the night mode window."""
        from datetime import datetime
        now = datetime.now().time()
        start, end = self.night_mode_start, self.night_mode_end
        if start <= end:
            return start <= now <= end
        else:
            # Wraps midnight, e.g. 22:00 → 07:00
            return now >= start or now <= end

    def get_all_provider_configs(self) -> dict:
        """Return a summary of configured providers (no raw keys)."""
        return {
            "groq": {"key_count": len(self.groq_keys)},
            "openrouter": {"key_count": len(self.openrouter_keys)},
            "gemini": {"key_count": len(self.gemini_keys)},
            "anthropic": {"configured": self.anthropic_key is not None},
            "openai": {"configured": self.openai_key is not None},
            "ollama": {"base_url": self.ollama_base_url},
            "github": {"key_count": len(self.github_tokens)},
            "huggingface": {"key_count": len(self.huggingface_keys)},
            "google_ai_studio": {"key_count": len(self.google_ai_studio_keys)},
            "nvidia_nim": {"key_count": len(self.nvidia_nim_keys)},
            "cerebras": {"key_count": len(self.cerebras_keys)},
            "cloudflare": {"account_id_configured": bool(self.cloudflare_account_id), "key_count": len(self.cloudflare_keys)},
            "llamacloud": {"key_count": len(self.llamacloud_keys)},
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton Settings instance."""
    return Settings()
