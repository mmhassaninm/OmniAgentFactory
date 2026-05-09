"""
OmniBot — Resilient Multi-Model Router (System 1)

Priority chain: GROQ → OPENROUTER → GEMINI → ANTHROPIC → OLLAMA_LOCAL
Features:
  - Multi-key rotation per provider (up to 8 keys each)
  - Pre-emptive rate limit tracking (rotate at 80% capacity)
  - Automatic provider cascade on failure
  - Never raises — always recovers or returns error string
  - LiteLLM under the hood for unified model interface
  - Task-type aware model selection
"""

import asyncio
import hashlib
import logging
import time as time_module
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Tuple

import httpx
import litellm

from core.config import get_settings, hash_key

logger = logging.getLogger(__name__)

# Suppress LiteLLM's verbose logging
litellm.suppress_debug_info = True
litellm.set_verbose = False


# ── Task Types & Model Preferences ──────────────────────────────────────────

class TaskType(str, Enum):
    GENERAL = "general"
    CODE = "code"
    RESEARCH = "research"
    FAST = "fast"


# Model preferences per provider per task type
# Format: { provider: { task_type: [model_names] } }
PROVIDER_MODELS = {
    "groq": {
        TaskType.GENERAL: ["groq/llama-3.3-70b-versatile", "groq/llama-3.1-70b-versatile"],
        TaskType.CODE: ["groq/llama-3.3-70b-versatile", "groq/llama-3.1-70b-versatile"],
        TaskType.RESEARCH: ["groq/llama-3.3-70b-versatile"],
        TaskType.FAST: ["groq/llama-3.1-8b-instant", "groq/llama-3.2-3b-preview"],
    },
    "openrouter": {
        TaskType.GENERAL: [
            "openrouter/google/gemini-2.0-flash-001",
            "openrouter/meta-llama/llama-3.3-70b-instruct",
        ],
        TaskType.CODE: [
            "openrouter/anthropic/claude-sonnet-4-20250514",
            "openrouter/google/gemini-2.5-pro-preview-05-06",
        ],
        TaskType.RESEARCH: [
            "openrouter/google/gemini-2.5-pro-preview-05-06",
            "openrouter/anthropic/claude-sonnet-4-20250514",
        ],
        TaskType.FAST: [
            "openrouter/google/gemini-2.0-flash-001",
            "openrouter/meta-llama/llama-3.1-8b-instruct",
        ],
    },
    "gemini": {
        TaskType.GENERAL: ["gemini/gemini-2.0-flash", "gemini/gemini-1.5-flash"],
        TaskType.CODE: ["gemini/gemini-2.5-pro-preview-05-06", "gemini/gemini-2.0-flash"],
        TaskType.RESEARCH: ["gemini/gemini-2.5-pro-preview-05-06"],
        TaskType.FAST: ["gemini/gemini-2.0-flash", "gemini/gemini-1.5-flash"],
    },
    "anthropic": {
        TaskType.GENERAL: ["anthropic/claude-sonnet-4-20250514"],
        TaskType.CODE: ["anthropic/claude-sonnet-4-20250514"],
        TaskType.RESEARCH: ["anthropic/claude-sonnet-4-20250514"],
        TaskType.FAST: ["anthropic/claude-3-5-haiku-20241022"],
    },
    "ollama": {
        TaskType.GENERAL: ["ollama/llama3.1", "ollama/mistral"],
        TaskType.CODE: ["ollama/codellama", "ollama/deepseek-coder"],
        TaskType.RESEARCH: ["ollama/llama3.1"],
        TaskType.FAST: ["ollama/phi3", "ollama/llama3.2"],
    },
}

PROVIDER_PRIORITY = ["groq", "openrouter", "gemini", "openai", "anthropic", "ollama"]


# ── Key State Tracking ──────────────────────────────────────────────────────

@dataclass
class KeyState:
    """Tracks rate limits and health for a single API key."""
    api_key: str
    key_hash: str
    provider: str
    env_name: str = ""  # Associated environment/config name
    calls_this_minute: int = 0
    tokens_today: int = 0
    minute_window_start: float = field(default_factory=time_module.time)
    day_start: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    exhausted_until: Optional[float] = None
    last_error: Optional[str] = None
    last_error_time: Optional[float] = None
    consecutive_errors: int = 0

    # Rate limits per provider (calls per minute)
    RATE_LIMITS = {
        "groq": 30,
        "openrouter": 60,
        "gemini": 15,
        "openai": 60,
        "anthropic": 50,
        "ollama": 999,  # No rate limit for local
    }

    def is_available(self) -> bool:
        """Check if this key is currently usable."""
        now = time_module.time()

        # Check exhaustion cooldown (60 minutes)
        if self.exhausted_until and now < self.exhausted_until:
            return False

        # Reset minute window
        if now - self.minute_window_start > 60:
            self.calls_this_minute = 0
            self.minute_window_start = now

        # Reset daily counter
        today = datetime.now().strftime("%Y-%m-%d")
        if today != self.day_start:
            self.tokens_today = 0
            self.day_start = today

        # Check if approaching rate limit (80% threshold)
        limit = self.RATE_LIMITS.get(self.provider, 30)
        if self.calls_this_minute >= int(limit * 0.8):
            return False

        # Check daily token budget
        settings = get_settings()
        if self.tokens_today >= int(settings.max_tokens_per_key_per_day * 0.9):
            return False

        return True

    def record_success(self, tokens_used: int = 0):
        """Record a successful API call."""
        self.calls_this_minute += 1
        self.tokens_today += tokens_used
        self.consecutive_errors = 0
        self.last_error = None

    def record_failure(self, error: str):
        """Record a failed API call."""
        self.consecutive_errors += 1
        self.last_error = error
        self.last_error_time = time_module.time()

        # After 3 consecutive errors, mark exhausted for 60 minutes
        if self.consecutive_errors >= 3:
            self.exhausted_until = time_module.time() + 3600  # 60 min cooldown
            logger.warning(
                "Key %s...%s (%s, %s) exhausted after %d errors — cooling down 60min",
                self.key_hash[:8], self.key_hash[-4:], self.provider, self.env_name, self.consecutive_errors,
            )

    def to_stats_dict(self) -> dict:
        """Return stats safe for MongoDB storage (no raw key)."""
        return {
            "provider": self.provider,
            "key_hash": self.key_hash,
            "env_name": self.env_name,
            "calls_this_minute": self.calls_this_minute,
            "tokens_today": self.tokens_today,
            "last_error": self.last_error,
            "is_available": self.is_available(),
            "exhausted_until": datetime.fromtimestamp(self.exhausted_until).isoformat()
            if self.exhausted_until else None,
        }


# ── Model Router ────────────────────────────────────────────────────────────

CASCADER_MODELS = {
    "groq": [
        "groq/llama-3.3-70b-versatile",
        "groq/llama-3.1-8b-instant",
        "groq/mixtral-8x7b-32768"
    ],
    "openrouter": [
        "openrouter/google/gemma-2-9b-it:free",
        "openrouter/google/gemini-2.0-flash-001",
        "openrouter/qwen/qwen-2.5-7b-instruct:free",
        "openrouter/free"
    ],
    "gemini": [
        "gemini/gemini-2.5-flash",
        "gemini/gemini-2.0-flash"
    ],
    "openai": [
        "openai/gpt-4o-mini"
    ],
    "anthropic": [
        "anthropic/claude-3-5-haiku-20241022"
    ],
    "ollama": [
        "ollama/llama3",
        "ollama/llama3.1",
        "ollama/mistral"
    ]
}

# Ordered list of free OpenRouter models to try in sequence.
# Tried from top to bottom — first success wins, 404/unavailable → next model.
OPENROUTER_FREE_MODELS = [
    "openrouter/google/gemma-2-9b-it:free",
    "openrouter/meta-llama/llama-3.1-8b-instruct:free",
    "openrouter/qwen/qwen-2.5-7b-instruct:free",
    "openrouter/microsoft/phi-3-mini-128k-instruct:free",
    "openrouter/mistralai/mistral-7b-instruct:free",
    "openrouter/huggingfaceh4/zephyr-7b-beta:free",
    "openrouter/openchat/openchat-7b:free",
    "openrouter/gryphe/mythomist-7b:free",
    "openrouter/undi95/toppy-m-7b:free",
    "openrouter/nousresearch/nous-capybara-7b:free",
    "openrouter/teknium/openhermes-2.5-mistral-7b:free",
    "openrouter/meta-llama/llama-3.2-3b-instruct:free",
    "openrouter/google/gemma-7b-it:free",
    "openrouter/mistralai/mistral-nemo:free",
    "openrouter/deepseek/deepseek-r1:free",
]


class ModelRouter:
    """
    Resilient multi-provider model router implementing Eternal Provider Cascader Engine.
    NEVER raises exceptions — always recovers, cascades, or retries indefinitely.
    """

    def __init__(self):
        self._keys: Dict[str, List[KeyState]] = {}  # provider → [KeyState, ...]
        self._initialized = False
        self._exhausted_keys: set[str] = set()       # Session-level in-memory set (stores env_name values)
        self._key_last_failure: dict[str, datetime] = {}  # Maps env_name to last failure datetime

    def initialize(self):
        """Load all configured keys from settings (.env fallback)."""
        settings = get_settings()

        # Build key states for each provider from .env
        self._keys = {
            "groq": [
                KeyState(api_key=k, key_hash=hash_key(k), provider="groq", env_name=f"GROQ_KEY_{i+1}")
                for i, k in enumerate(settings.groq_keys)
            ],
            "openrouter": [
                KeyState(api_key=k, key_hash=hash_key(k), provider="openrouter", env_name=f"OPENROUTER_KEY_{i+1}")
                for i, k in enumerate(settings.openrouter_keys)
            ],
            "gemini": [
                KeyState(api_key=k, key_hash=hash_key(k), provider="gemini", env_name=f"GEMINI_KEY_{i+1}")
                for i, k in enumerate(settings.gemini_keys)
            ],
        }

        # Anthropic: single key
        if settings.anthropic_key:
            self._keys["anthropic"] = [
                KeyState(
                    api_key=settings.anthropic_key,
                    key_hash=hash_key(settings.anthropic_key),
                    provider="anthropic",
                    env_name="ANTHROPIC_KEY_1"
                )
            ]
        else:
            self._keys["anthropic"] = []

        # OpenAI: single key
        if settings.openai_key:
            self._keys["openai"] = [
                KeyState(
                    api_key=settings.openai_key,
                    key_hash=hash_key(settings.openai_key),
                    provider="openai",
                    env_name="OPENAI_KEY_1"
                )
            ]
        else:
            self._keys["openai"] = []

        # Ollama: no key needed, just a placeholder
        self._keys["ollama"] = [
            KeyState(api_key="ollama", key_hash=hash_key("ollama"), provider="ollama", env_name="OLLAMA_BASE_URL")
        ]

        total_keys = sum(len(v) for v in self._keys.values())
        logger.info(
            "[MODEL_ROUTER] Initialized with %d total keys across %d providers (.env)",
            total_keys,
            sum(1 for v in self._keys.values() if v),
        )
        self._initialized = True

    async def reload_keys_from_db(self):
        """
        Reload keys from MongoDB api_keys collection.
        Called on startup (after DB is ready) and whenever keys are saved via Settings UI.
        MongoDB keys override .env keys.
        """
        try:
            from core.database import get_db
            db = get_db()
            stored = await db.api_keys.find_one({"_id": "provider_keys"})
            if not stored or not stored.get("keys"):
                logger.info("No API keys in MongoDB — using .env fallback")
                return

            keys_data = stored["keys"]

            # Rebuild key lists from MongoDB
            provider_keys: Dict[str, List[Tuple[str, str]]] = {
                "groq": [], "openrouter": [], "gemini": [], "openai": [], "anthropic": [], "ollama": []
            }
            ollama_url = None

            for env_name, value in keys_data.items():
                if not value:
                    continue
                if env_name.startswith("GROQ_KEY_"):
                    provider_keys["groq"].append((env_name, value))
                elif env_name.startswith("OPENROUTER_KEY_"):
                    provider_keys["openrouter"].append((env_name, value))
                elif env_name.startswith("GEMINI_KEY_"):
                    provider_keys["gemini"].append((env_name, value))
                elif env_name == "OPENAI_KEY_1":
                    provider_keys["openai"].append((env_name, value))
                elif env_name in ("ANTHROPIC_KEY", "ANTHROPIC_KEY_1"):
                    provider_keys["anthropic"].append((env_name, value))
                elif env_name == "OLLAMA_BASE_URL":
                    ollama_url = value

            # Only override if MongoDB has any keys
            has_db_keys = any(v for v in provider_keys.values() if v)
            if not has_db_keys:
                logger.info("MongoDB has no API keys — keeping .env keys")
                return

            # Rebuild KeyState objects
            for provider in ["groq", "openrouter", "gemini", "openai", "anthropic"]:
                if provider_keys[provider]:
                    self._keys[provider] = [
                        KeyState(api_key=k, key_hash=hash_key(k), provider=provider, env_name=env)
                        for env, k in provider_keys[provider]
                    ]

            # Always keep ollama
            self._keys["ollama"] = [
                KeyState(api_key="ollama", key_hash=hash_key("ollama"), provider="ollama", env_name="OLLAMA_BASE_URL")
            ]

            if ollama_url:
                get_settings().ollama_base_url = ollama_url

            total = sum(len(v) for v in self._keys.values())
            logger.info("[MODEL_ROUTER] Loaded %d keys from MongoDB for %d providers",
                        total, sum(1 for v in self._keys.values() if v))

        except Exception as e:
            logger.warning("Failed to reload keys from MongoDB: %s", e)

    def _get_available_key(self, provider: str) -> Optional[KeyState]:
        """Get the next available key for a provider, or None."""
        keys = self._keys.get(provider, [])
        for key_state in keys:
            if key_state.is_available() and key_state.env_name not in self._exhausted_keys:
                return key_state
        return None

    def _get_model_for_task(
        self, provider: str, task_type: TaskType
    ) -> Optional[str]:
        """Get the preferred model for a provider and task type."""
        models = PROVIDER_MODELS.get(provider, {}).get(task_type, [])
        return models[0] if models else None

    async def _log_cascade(self, msg: str, agent_id: Optional[str] = None, phase: str = "general"):
        """Utility logger for CASCADE events writing to thought logger and system stdout."""
        logger.info(msg)
        if agent_id:
            try:
                from utils.thought_logger import log_thought
                await log_thought(agent_id, msg, phase=phase)
            except Exception as e:
                logger.debug("Failed to log cascade thought: %s", e)

    async def _reset_expired_exhaustions(self):
        """Automatically checks failure timestamps and clears 60m+ exhausted state items."""
        now = datetime.utcnow()
        expired = []
        for env_name, last_fail in list(self._key_last_failure.items()):
            if now - last_fail > timedelta(minutes=60):
                expired.append(env_name)
        for env_name in expired:
            if env_name in self._exhausted_keys:
                self._exhausted_keys.remove(env_name)
            del self._key_last_failure[env_name]
            logger.info("[CASCADE] Key %s un-marked from exhaustion (60-minute limit expired)", env_name)

    async def _try_provider(
        self,
        provider: str,
        key_state: KeyState,
        model: str,
        messages: list,
        max_tokens: Optional[int] = None,
    ) -> Tuple[Optional[str], Optional[any]]:
        """
        Attempt a single LiteLLM call on a specific key/model.
        Returns (content, latency) on success or (None, error_str) on failure.
        """
        try:
            kwargs = {
                "model": model,
                "messages": messages,
                "api_key": key_state.api_key if provider != "ollama" else None,
                "timeout": 15,  # Exhaust if takes longer than 15s
                "num_retries": 0,
            }
            if provider == "ollama":
                kwargs["api_base"] = get_settings().ollama_base_url
            elif provider == "openrouter":
                kwargs["api_base"] = "https://openrouter.ai/api/v1"
            if max_tokens:
                kwargs["max_tokens"] = max_tokens

            start_time = time_module.time()
            response = await litellm.acompletion(**kwargs)
            latency = time_module.time() - start_time

            content = response.choices[0].message.content or ""
            tokens_used = getattr(response.usage, "total_tokens", 0) if response.usage else 0

            key_state.record_success(tokens_used)
            return content, latency

        except Exception as e:
            err_msg = str(e)
            key_state.record_failure(err_msg)
            return None, err_msg

    async def _call_openrouter_with_fallback(
        self,
        key_state: KeyState,
        messages: list,
        max_tokens: Optional[int] = None,
        agent_id: Optional[str] = None,
    ) -> Tuple[Optional[str], Optional[any]]:
        """
        Try each model in OPENROUTER_FREE_MODELS in order until one succeeds.
        Returns (content, latency) on success or (None, error_str) on full exhaustion.
        Stops immediately on 401 (bad key). Skips on 404/unavailable.
        """
        for model in OPENROUTER_FREE_MODELS:
            kwargs = {
                "model": model,
                "messages": messages,
                "api_key": key_state.api_key,
                "api_base": "https://openrouter.ai/api/v1",
                "timeout": 15,
                "num_retries": 0,
            }
            if max_tokens:
                kwargs["max_tokens"] = max_tokens
            try:
                start_time = time_module.time()
                response = await litellm.acompletion(**kwargs)
                latency = time_module.time() - start_time
                content = response.choices[0].message.content or ""
                tokens_used = getattr(response.usage, "total_tokens", 0) if response.usage else 0
                key_state.record_success(tokens_used)
                await self._log_cascade(
                    f"[CASCADE] ✓ OpenRouter fallback hit: {model} ({key_state.env_name})",
                    agent_id=agent_id,
                )
                return content, latency
            except Exception as e:
                err_str = str(e)
                if "401" in err_str or "Invalid API Key" in err_str or "AuthenticationError" in err_str:
                    key_state.record_failure(err_str)
                    return None, err_str
                await self._log_cascade(
                    f"[CASCADE] ✗ OpenRouter {model} unavailable: {err_str[:60]}",
                    agent_id=agent_id,
                    phase="error",
                )
        err = "All OpenRouter free models exhausted"
        key_state.record_failure(err)
        return None, err

    async def _cascade_call(
        self,
        prompt: list,
        system_prompt: Optional[str] = None,
        max_tokens: Optional[int] = None,
        agent_id: Optional[str] = None,
    ) -> str:
        """
        Unified Zero-Downtime Cascader Engine.
        Executes models down the priority pipeline. Never throws exceptions.
        """
        if not self._initialized:
            self.initialize()

        # Handle list vs raw string prompt
        if isinstance(prompt, list):
            messages = prompt
        else:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

        while True:
            await self._reset_expired_exhaustions()

            for provider in PROVIDER_PRIORITY:
                keys = self._keys.get(provider, [])
                if not keys:
                    continue

                available_keys = [k for k in keys if k.env_name not in self._exhausted_keys]
                if not available_keys:
                    continue

                for key_state in available_keys:
                    # OpenRouter: try all free models in sequence via dedicated fallback
                    if provider == "openrouter":
                        await self._log_cascade(
                            f"[CASCADE] Trying OpenRouter free model chain ({key_state.env_name})",
                            agent_id=agent_id,
                        )
                        content, result = await self._call_openrouter_with_fallback(
                            key_state, messages, max_tokens, agent_id
                        )
                        if content is not None and content.strip():
                            latency = result
                            await self._log_cascade(
                                f"[CASCADE] ✓ Success: OpenRouter ({key_state.env_name}) (latency: {latency:.1f}s)",
                                agent_id=agent_id,
                            )
                            asyncio.create_task(self.save_stats_to_db())
                            return content
                        self._exhausted_keys.add(key_state.env_name)
                        self._key_last_failure[key_state.env_name] = datetime.utcnow()
                        await self._log_cascade(
                            f"[CASCADE] ✗ Key exhausted: {key_state.env_name} → cooling down for 60m",
                            agent_id=agent_id,
                            phase="error",
                        )
                        continue

                    models = CASCADER_MODELS.get(provider, [])
                    if not models:
                        continue

                    # Try primary then secondary fallback model with this key
                    for model in models[:2]:
                        await self._log_cascade(
                            f"[CASCADE] Trying: {model} ({key_state.env_name})",
                            agent_id=agent_id
                        )

                        content, result = await self._try_provider(
                            provider, key_state, model, messages, max_tokens
                        )

                        if content is not None:
                            if not content.strip():
                                await self._log_cascade(
                                    f"[CASCADE] ✗ Empty response from {model} ({key_state.env_name})",
                                    agent_id=agent_id,
                                    phase="error"
                                )
                                continue

                            # Call Succeeded!
                            latency = result
                            await self._log_cascade(
                                f"[CASCADE] ✓ Success: {model} ({key_state.env_name}) (latency: {latency:.1f}s)",
                                agent_id=agent_id
                            )
                            # Update statistics asynchronously
                            asyncio.create_task(self.save_stats_to_db())
                            return content
                        else:
                            err_msg = result
                            await self._log_cascade(
                                f"[CASCADE] ✗ Failed: {model} ({key_state.env_name}) — {err_msg[:60]}",
                                agent_id=agent_id,
                                phase="error"
                            )

                    # Both models failed with this key -> Mark Key as Exhausted
                    self._exhausted_keys.add(key_state.env_name)
                    self._key_last_failure[key_state.env_name] = datetime.utcnow()
                    await self._log_cascade(
                        f"[CASCADE] ✗ Key exhausted: {key_state.env_name} → cooling down for 60m",
                        agent_id=agent_id,
                        phase="error"
                    )

                await self._log_cascade(
                    f"[CASCADE] ✗ All {provider.capitalize()} keys exhausted → escalating to next tier",
                    agent_id=agent_id,
                    phase="error"
                )

            # If all tiers are exhausted!
            await self._log_cascade(
                "[CASCADE] ✗ ALL TIERS EXHAUSTED — waiting 90s before retry",
                agent_id=agent_id,
                phase="error"
            )

            # Log countdown to thought logger and system stdout
            for countdown in [90, 60, 30, 10]:
                await self._log_cascade(f"[CASCADE] ⟳ Retry in: {countdown}s...", agent_id=agent_id)
                await asyncio.sleep(30 if countdown != 10 else 10)

            await self._log_cascade(
                "[CASCADE] ⟳ Resetting exhausted key list, retrying from Tier 1",
                agent_id=agent_id
            )
            self._exhausted_keys.clear()
            self._key_last_failure.clear()

    async def call_model(
        self,
        messages: list,
        task_type: str = "general",
        agent_id: Optional[str] = None,
    ) -> str:
        """Main router interface routing through zero-downtime Cascader Engine."""
        return await self._cascade_call(messages, agent_id=agent_id)

    async def check_provider_health(self) -> dict:
        """
        Pings each configured provider with a 1-token test call.
        Updates health status in MongoDB: provider_health collection.
        If a previously exhausted provider recovers -> immediately unmarks its keys from exhaustion.
        """
        from core.database import get_db
        db = get_db()
        results = {}

        for provider in PROVIDER_PRIORITY:
            keys = self._keys.get(provider, [])
            if not keys:
                results[provider] = {
                    "provider": provider,
                    "status": "unconfigured",
                    "latency_ms": 0,
                    "keys_active": 0,
                    "keys_exhausted": 0,
                    "last_checked": datetime.utcnow().isoformat()
                }
                continue

            models = CASCADER_MODELS.get(provider, [])
            if not models:
                continue

            test_messages = [{"role": "user", "content": "hello"}]
            status = "offline"
            latency_ms = 0
            success = False

            for key_state in keys:
                if success:
                    break

                # OpenRouter: bypass LiteLLM entirely — it strips the provider prefix and
                # sends model="free" to the API, which returns an error.  A simple GET to
                # /api/v1/models is a valid, zero-cost health ping.
                if provider == "openrouter":
                    try:
                        start_time = time_module.time()
                        async with httpx.AsyncClient(timeout=5.0) as client:
                            resp = await client.get(
                                "https://openrouter.ai/api/v1/models",
                                headers={"Authorization": f"Bearer {key_state.api_key}"}
                            )
                        is_online = resp.status_code == 200
                        latency_ms = int((time_module.time() - start_time) * 1000)
                        if is_online:
                            status = "online"
                            success = True
                            recovered_count = 0
                            for k in keys:
                                if k.env_name in self._exhausted_keys:
                                    self._exhausted_keys.remove(k.env_name)
                                    if k.env_name in self._key_last_failure:
                                        del self._key_last_failure[k.env_name]
                                    recovered_count += 1
                            if recovered_count > 0:
                                logger.info("[CASCADE] Provider %s recovered! Un-marked %d keys from exhaustion", provider, recovered_count)
                    except Exception as e:
                        logger.warning("[CASCADE] Health check ping failed for OpenRouter key %s: %s", key_state.env_name, str(e)[:100])
                    continue

                for model in models[:2]:
                    try:
                        start_time = time_module.time()
                        health_kwargs = {
                            "model": model,
                            "messages": test_messages,
                            "api_key": key_state.api_key if provider != "ollama" else None,
                            "timeout": 5,
                            "max_tokens": 1,
                            "num_retries": 0,
                        }
                        if provider == "ollama":
                            health_kwargs["api_base"] = get_settings().ollama_base_url

                        await litellm.acompletion(**health_kwargs)
                        latency_ms = int((time_module.time() - start_time) * 1000)
                        status = "online"
                        success = True

                        # If successful, unmark exhausted keys for this provider
                        recovered_count = 0
                        for k in keys:
                            if k.env_name in self._exhausted_keys:
                                self._exhausted_keys.remove(k.env_name)
                                if k.env_name in self._key_last_failure:
                                    del self._key_last_failure[k.env_name]
                                recovered_count += 1
                        if recovered_count > 0:
                            logger.info("[CASCADE] Provider %s recovered! Un-marked %d keys from exhaustion", provider, recovered_count)

                        break  # Found working model/key
                    except Exception as e:
                        logger.warning("[CASCADE] Health check ping failed for model %s with key %s of provider %s: %s", model, key_state.env_name, provider, str(e)[:100])

            exhausted_keys_count = sum(1 for k in keys if k.env_name in self._exhausted_keys)
            active_keys_count = len(keys) - exhausted_keys_count

            results[provider] = {
                "provider": provider,
                "status": status,
                "latency_ms": latency_ms,
                "keys_active": active_keys_count,
                "keys_exhausted": exhausted_keys_count,
                "last_checked": datetime.utcnow().isoformat()
            }

            # Save to database
            try:
                await db.provider_health.update_one(
                    {"provider": provider},
                    {"$set": results[provider]},
                    upsert=True
                )
            except Exception as ex:
                logger.debug("Failed to save health metrics: %s", ex)

        return results

    def get_health_status(self) -> dict:
        """Return health status of all providers and keys."""
        status = {}
        for provider, keys in self._keys.items():
            available = sum(1 for k in keys if k.is_available() and k.env_name not in self._exhausted_keys)
            status[provider] = {
                "total_keys": len(keys),
                "available_keys": available,
                "keys": [k.to_stats_dict() for k in keys],
            }
        return status

    async def save_stats_to_db(self):
        """Persist current key stats to MongoDB."""
        try:
            from core.database import get_db
            db = get_db()
            for provider, keys in self._keys.items():
                for key_state in keys:
                    await db.model_stats.update_one(
                        {"provider": provider, "key_hash": key_state.key_hash},
                        {"$set": {
                            "calls_today": key_state.tokens_today,
                            "tokens_today": key_state.tokens_today,
                            "last_error": key_state.last_error,
                            "updated_at": datetime.utcnow(),
                        }},
                        upsert=True,
                    )
        except Exception as e:
            logger.error("Failed to save model stats to DB: %s", e)


# ── Singleton ───────────────────────────────────────────────────────────────

_router: Optional[ModelRouter] = None


def get_model_router() -> ModelRouter:
    """Return the singleton ModelRouter instance."""
    global _router
    if _router is None:
        _router = ModelRouter()
        _router.initialize()
    return _router


async def call_model(messages: list, task_type: str = "general", agent_id: Optional[str] = None) -> str:
    """Convenience function routing through the zero-downtime Cascader Engine."""
    router = get_model_router()
    return await router.call_model(messages, task_type, agent_id=agent_id)
