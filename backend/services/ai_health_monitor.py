"""
AI Model Health & Usage Monitor
Periodic scanner that checks all configured AI providers,
tests connectivity, tracks usage/quota, and logs telemetry.
Integrates with the existing ModelHub, WebSocket system, and MongoDB.

Supports all discovered providers:
- Google Gemini (via free_cloud_provider or LiteLLM)
- Groq Cloud (via free_cloud_provider or LiteLLM)
- OpenRouter (via LiteLLM)
- Mistral AI (via free_cloud_provider)
- SambaNova Cloud (via free_cloud_provider)
- Cerebras (via LiteLLM)
- Cloudflare Workers AI (via LiteLLM)
- OpenAI (configured, paid)
- Anthropic (configured, paid)
- g4f providers (Bing, DeepInfra, You, ChatgptNext, Liaobots, FlowGpt)
"""

import os
import time
import json
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Tuple

import httpx

logger = logging.getLogger(__name__)

# ── Provider Registry ──────────────────────────────────────────────────────
# Complete manifest of all AI providers found in the codebase

PROVIDER_MANIFEST = {
    "gemini": {
        "name": "Google Gemini",
        "models": ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
        "env_key": "GEMINI_API_KEY",
        "fallback_env_keys": ["GEMINI_KEY_1", "GEMINI_KEY_2", "GOOGLE_AI_STUDIO_KEY_1"],
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "type": "free",
        "tool_calling": True,
        "streaming": True,
        "default_model": "gemini-2.0-flash",
        "context_window": 1048576,
        "rpm_limit": 60,
        "rpd_limit": 1000,
        "used_in": ["free_cloud_provider.py", "model_router.py (Tier 4)", "CortexAI chat"],
    },
    "groq": {
        "name": "Groq Cloud",
        "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
        "env_key": "GROQ_API_KEY",
        "fallback_env_keys": ["GROQ_KEY_1", "GROQ_KEY_2", "GROQ_KEY_3", "GROQ_KEY_4"],
        "base_url": "https://api.groq.com/openai/v1",
        "type": "free",
        "tool_calling": True,
        "streaming": True,
        "default_model": "llama-3.3-70b-versatile",
        "context_window": 32768,
        "rpm_limit": 30,
        "rpd_limit": 14400,
        "used_in": ["free_cloud_provider.py", "model_router.py (Tier 4)", "CortexAI chat"],
    },
    "openrouter": {
        "name": "OpenRouter",
        "models": ["openrouter/auto", "openrouter/auto:free", "meta-llama/llama-3.1-8b-instruct:free"],
        "env_key": "OPENROUTER_API_KEY",
        "fallback_env_keys": ["OPENROUTER_KEY_1", "OPENROUTER_KEY_2", "OPENROUTER_KEY_3"],
        "base_url": "https://openrouter.ai/api/v1",
        "type": "free",
        "tool_calling": True,
        "streaming": True,
        "default_model": "openrouter/auto",
        "context_window": 128000,
        "rpm_limit": 20,
        "rpd_limit": 500,
        "used_in": ["model_router.py (Tier 1-3)", "route_completion()"],
    },
    "mistral": {
        "name": "Mistral AI",
        "models": ["mistral-small-latest", "open-mistral-nemo", "mistral-tiny"],
        "env_key": "MISTRAL_API_KEY",
        "fallback_env_keys": [],
        "base_url": "https://api.mistral.ai/v1",
        "type": "free",
        "tool_calling": True,
        "streaming": True,
        "default_model": "mistral-small-latest",
        "context_window": 32768,
        "rpm_limit": 50,
        "rpd_limit": 1000,
        "used_in": ["free_cloud_provider.py"],
    },
    "sambanova": {
        "name": "SambaNova Cloud",
        "models": ["Meta-Llama-3.1-8B-Instruct", "Meta-Llama-3.1-70B-Instruct"],
        "env_key": "SAMBANOVA_API_KEY",
        "fallback_env_keys": [],
        "base_url": "https://api.sambanova.ai/v1",
        "type": "free",
        "tool_calling": False,
        "streaming": True,
        "default_model": "Meta-Llama-3.1-8B-Instruct",
        "context_window": 8192,
        "rpm_limit": 25,
        "rpd_limit": 50000,
        "used_in": ["free_cloud_provider.py"],
    },
    "cerebras": {
        "name": "Cerebras",
        "models": ["cerebras/llama3.1-8b", "cerebras/llama-3.3-70b-versatile"],
        "env_key": "CEREBRAS_API_KEY",
        "fallback_env_keys": ["CEREBRAS_KEY_1", "CEREBRAS_KEY_2"],
        "base_url": "https://api.cerebras.ai/v1",
        "type": "free",
        "tool_calling": True,
        "streaming": True,
        "default_model": "cerebras/llama3.1-8b",
        "context_window": 8192,
        "rpm_limit": 100,
        "rpd_limit": 900,
        "used_in": ["model_router.py (Tier 4)"],
    },
    "cloudflare": {
        "name": "Cloudflare Workers AI",
        "models": ["@cf/meta/llama-3.1-8b-instruct"],
        "env_key": "CLOUDFLARE_API_KEY",
        "fallback_env_keys": ["CLOUDFLARE_KEY_1", "CLOUDFLARE_KEY_2"],
        "base_url": "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1",
        "type": "free",
        "tool_calling": True,
        "streaming": True,
        "default_model": "@cf/meta/llama-3.1-8b-instruct",
        "context_window": 8192,
        "rpm_limit": 100,
        "rpd_limit": 10000,
        "used_in": ["model_router.py (Tier 4)"],
    },
    "openai": {
        "name": "OpenAI",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
        "env_key": "OPENAI_API_KEY",
        "fallback_env_keys": ["OPENAI_KEY_1"],
        "base_url": "https://api.openai.com/v1",
        "type": "paid",
        "tool_calling": True,
        "streaming": True,
        "default_model": "gpt-4o-mini",
        "context_window": 128000,
        "rpm_limit": 500,
        "rpd_limit": 10000,
        "used_in": ["CortexAI chat", "settings.py"],
    },
    "anthropic": {
        "name": "Anthropic",
        "models": ["claude-3-haiku", "claude-3-opus", "claude-3-sonnet"],
        "env_key": "ANTHROPIC_API_KEY",
        "fallback_env_keys": ["ANTHROPIC_KEY_1", "ANTHROPIC_KEY"],
        "base_url": "https://api.anthropic.com/v1",
        "type": "paid",
        "tool_calling": True,
        "streaming": True,
        "default_model": "claude-3-haiku",
        "context_window": 200000,
        "rpm_limit": 50,
        "rpd_limit": 1000,
        "used_in": ["anthropic_provider.py", "settings.py", "CortexAI chat"],
    },
    "g4f": {
        "name": "GPT4Free (g4f)",
        "models": ["gpt-4", "gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
        "env_key": None,
        "fallback_env_keys": [],
        "base_url": None,
        "type": "free",
        "tool_calling": False,
        "streaming": True,
        "default_model": "gpt-4o-mini",
        "context_window": 8192,
        "rpm_limit": 10,
        "rpd_limit": 100,
        "used_in": ["g4f_provider.py", "model_router.py (Tier 4.5)"],
    },
    "llamacloud": {
        "name": "LlamaCloud",
        "models": ["llama-3.3-70b"],
        "env_key": "LLAMACLOUD_API_KEY",
        "fallback_env_keys": ["LLAMACLOUD_KEY_1", "LLAMACLOUD_KEY_2"],
        "base_url": "https://cloud.llamaindex.ai",
        "type": "free",
        "tool_calling": True,
        "streaming": True,
        "default_model": "llama-3.3-70b",
        "context_window": 128000,
        "rpm_limit": 30,
        "rpd_limit": 500,
        "used_in": ["ModelHub dashboard", ".env.example"],
    },
}

# ── Health Monitor ─────────────────────────────────────────────────────────

class AIHealthMonitor:
    """
    Scans all configured AI providers, tests connectivity, tracks usage/quota,
    and logs telemetry. Stores data in MongoDB `ai_provider_health` collection.
    """

    def __init__(self):
        self._start_time = datetime.now(timezone.utc)
        self._session_calls: int = 0
        self._session_tokens: int = 0
        self._session_cost: float = 0.0
        self._provider_health: Dict[str, Dict[str, Any]] = {}
        self._last_ping: Dict[str, float] = {}
        self._consecutive_failures: Dict[str, int] = {}
        self._db = None
        self._ws_manager = None

    def set_db(self, db):
        """Set MongoDB connection."""
        self._db = db

    def set_ws_manager(self, ws_manager):
        """Set WebSocket manager for real-time alerts."""
        self._ws_manager = ws_manager

    def get_uptime_seconds(self) -> int:
        """Get monitor uptime in seconds."""
        return int((datetime.now(timezone.utc) - self._start_time).total_seconds())

    def get_session_stats(self) -> Dict[str, Any]:
        """Get session-level aggregated stats."""
        return {
            "uptime_seconds": self.get_uptime_seconds(),
            "total_calls_session": self._session_calls,
            "total_tokens_session": self._session_tokens,
            "total_cost_session": round(self._session_cost, 6),
            "provider_count": len(self._provider_health),
        }

    def _resolve_api_key(self, provider_name: str) -> Optional[str]:
        """Resolve API key from env vars, trying fallback keys."""
        info = PROVIDER_MANIFEST.get(provider_name)
        if not info:
            return None

        # Try primary env key
        if info["env_key"]:
            val = os.environ.get(info["env_key"], "").strip()
            if val:
                return val

        # Try fallback env keys
        for fallback in info.get("fallback_env_keys", []):
            val = os.environ.get(fallback, "").strip()
            if val:
                return val

        return None

    def get_configured_providers(self) -> List[Dict[str, Any]]:
        """Return list of providers that have API keys configured."""
        configured = []
        for name, info in PROVIDER_MANIFEST.items():
            api_key = self._resolve_api_key(name)
            health = self._provider_health.get(name, {})
            configured.append({
                "name": name,
                "display_name": info["name"],
                "configured": api_key is not None,
                "type": info["type"],
                "tool_calling": info["tool_calling"],
                "default_model": info["default_model"],
                "models": info["models"],
                "rpm_limit": info["rpm_limit"],
                "rpd_limit": info["rpd_limit"],
                "context_window": info["context_window"],
                "status": health.get("status", "unconfigured"),
                "latency_ms": health.get("latency_ms", 0),
                "calls_session": health.get("calls", 0),
                "errors_session": health.get("errors", 0),
                "tokens_in_session": health.get("tokens_in", 0),
                "tokens_out_session": health.get("tokens_out", 0),
                "cost_session": round(health.get("cost", 0.0), 6),
                "last_checked": health.get("last_checked"),
                "last_error": health.get("last_error"),
                "quota": health.get("quota", {}),
                "used_in": info["used_in"],
            })
        return configured

    async def ping_provider(self, provider_name: str) -> Dict[str, Any]:
        """
        Ping a single provider with a minimal test prompt to check health.
        Returns health status dict.
        """
        info = PROVIDER_MANIFEST.get(provider_name)
        if not info:
            return {"status": "error", "error": "Unknown provider"}

        api_key = self._resolve_api_key(provider_name)
        if not api_key:
            return {"status": "unconfigured", "error": "No API key configured"}

        start_time = time.monotonic()
        try:
            if provider_name == "g4f":
                # g4f doesn't need an API key — check via g4f_provider
                return await self._ping_g4f()

            # Generic OpenAI-compatible ping
            payload = {
                "model": info["default_model"],
                "messages": [{"role": "user", "content": "Reply with: ok"}],
                "max_tokens": 5,
            }

            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }

            base_url = info["base_url"]
            if "{account_id}" in (base_url or ""):
                # Cloudflare-style URL with account ID
                account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
                base_url = base_url.replace("{account_id}", account_id)

            url = f"{base_url.rstrip('/')}/chat/completions" if base_url else None
            if not url:
                return {"status": "unconfigured", "error": "No base URL"}

            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                latency_ms = int((time.monotonic() - start_time) * 1000)

                if response.status_code == 200:
                    data = response.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    is_valid = "ok" in (content or "").lower()

                    result = {
                        "status": "healthy" if is_valid else "degraded",
                        "latency_ms": latency_ms,
                        "model": info["default_model"],
                        "provider": provider_name,
                        "error": None if is_valid else f"Unexpected response: {content[:50]}",
                        "quota": {},
                    }

                    # Attempt to extract quota from OpenRouter response
                    if provider_name == "openrouter":
                        usage = response.headers.get("X-Usage", "")
                        if usage:
                            try:
                                result["quota"] = json.loads(usage)
                            except json.JSONDecodeError:
                                pass

                    return result

                elif response.status_code == 429:
                    return {
                        "status": "quota_exceeded",
                        "latency_ms": latency_ms,
                        "error": f"Rate limited (429): {response.text[:100]}",
                        "quota": {"rate_limited": True},
                    }

                elif response.status_code in (401, 403):
                    return {
                        "status": "auth_error",
                        "latency_ms": latency_ms,
                        "error": f"Auth error ({response.status_code})",
                    }

                else:
                    return {
                        "status": "degraded",
                        "latency_ms": latency_ms,
                        "error": f"HTTP {response.status_code}: {response.text[:100]}",
                    }

        except httpx.TimeoutException:
            return {
                "status": "degraded",
                "latency_ms": 15000,
                "error": "Request timed out after 15s",
            }
        except httpx.ConnectError as e:
            return {
                "status": "down",
                "latency_ms": 0,
                "error": f"Connection failed: {e}",
            }
        except Exception as e:
            return {
                "status": "degraded",
                "latency_ms": int((time.monotonic() - start_time) * 1000),
                "error": str(e)[:200],
            }

    async def _ping_g4f(self) -> Dict[str, Any]:
        """Ping the g4f provider (keyless)."""
        try:
            start_time = time.monotonic()
            from ai_provider.g4f_provider import G4FProvider
            provider = G4FProvider()
            response = provider.chat(
                [{"role": "user", "content": "Reply with: ok"}],
                model="gpt-4o-mini",
                max_tokens=5,
            )
            latency_ms = int((time.monotonic() - start_time) * 1000)
            is_valid = "ok" in (response.content or "").lower() and response.success

            return {
                "status": "healthy" if is_valid else "degraded",
                "latency_ms": latency_ms,
                "model": "gpt-4o-mini",
                "provider": "g4f",
                "error": None if is_valid else f"Unexpected: {response.content[:50]}",
                "quota": {},
            }
        except Exception as e:
            return {
                "status": "degraded",
                "latency_ms": int((time.monotonic() - start_time) * 1000),
                "error": str(e)[:200],
                "quota": {},
            }

    async def scan_all_providers(self) -> List[Dict[str, Any]]:
        """Ping all configured providers and update health status."""
        results = []
        for name in PROVIDER_MANIFEST:
            api_key = self._resolve_api_key(name)
            if not api_key and name != "g4f":
                continue  # Skip unconfigured providers (except g4f which is keyless)

            logger.debug(f"[AIHealth] Pinging {name}...")
            result = await self.ping_provider(name)

            # Update health tracking
            health = self._provider_health.setdefault(name, {})
            health["status"] = result["status"]
            health["latency_ms"] = result.get("latency_ms", 0)
            health["last_checked"] = datetime.now(timezone.utc).isoformat()

            if result.get("error"):
                health["last_error"] = result["error"]
                self._consecutive_failures[name] = self._consecutive_failures.get(name, 0) + 1
            else:
                self._consecutive_failures[name] = 0

            # Update quota if available
            if result.get("quota"):
                health["quota"] = result["quota"]

            results.append({
                "name": name,
                "display_name": PROVIDER_MANIFEST[name]["name"],
                **result,
            })

            # Save to MongoDB
            if self._db is not None:
                try:
                    await self._db.ai_provider_health.update_one(
                        {"provider": name},
                        {"$set": {
                            "provider": name,
                            "display_name": PROVIDER_MANIFEST[name]["name"],
                            "checked_at": datetime.now(timezone.utc).isoformat(),
                            "status": result["status"],
                            "latency_ms": result.get("latency_ms", 0),
                            "model": PROVIDER_MANIFEST[name]["default_model"],
                            "tool_calling_enabled": PROVIDER_MANIFEST[name]["tool_calling"],
                            "models": PROVIDER_MANIFEST[name]["models"],
                            "error": result.get("error"),
                            "quota": result.get("quota", {}),
                        }},
                        upsert=True,
                    )
                except Exception as e:
                    logger.warning(f"[AIHealth] Failed to save to MongoDB: {e}")

            # Emit alert via WebSocket if needed
            if result["status"] in ("quota_exceeded", "down", "auth_error"):
                await self._emit_alert(name, result)

        return results

    async def _emit_alert(self, provider_name: str, result: Dict[str, Any]):
        """Emit a WebSocket alert for provider issues."""
        if not self._ws_manager:
            return

        try:
            failures = self._consecutive_failures.get(provider_name, 0)
            level = "WARNING" if result["status"] == "quota_exceeded" else \
                    "CRITICAL" if failures >= 3 else "INFO"

            await self._ws_manager.broadcast_to_factory({
                "type": "ai_alert",
                "provider": provider_name,
                "status": result["status"],
                "level": level,
                "latency_ms": result.get("latency_ms", 0),
                "error": result.get("error"),
                "consecutive_failures": failures,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

            logger.warning(f"[AIHealth] Alert [{level}] {provider_name}: {result.get('error')}")
        except Exception as e:
            logger.warning(f"[AIHealth] Failed to emit alert: {e}")

    def log_call(
        self,
        provider: str,
        model: str,
        tokens_in: int,
        tokens_out: int,
        cost: float = 0.0,
        latency_ms: int = 0,
        error: Optional[str] = None,
        agent_id: Optional[str] = None,
        task_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Log a single AI call to the telemetry system.
        Updates session stats and per-provider stats.
        """
        self._session_calls += 1
        self._session_tokens += tokens_in + tokens_out
        self._session_cost += cost

        # Update per-provider stats
        health = self._provider_health.setdefault(provider, {})
        health["calls"] = health.get("calls", 0) + 1
        health["tokens_in"] = health.get("tokens_in", 0) + tokens_in
        health["tokens_out"] = health.get("tokens_out", 0) + tokens_out
        health["cost"] = health.get("cost", 0.0) + cost
        if error:
            health["errors"] = health.get("errors", 0) + 1
        health["last_used_at"] = datetime.now(timezone.utc).isoformat()

        # Return telemetry entry for storage
        entry = {
            "id": f"call_{int(time.time() * 1000)}_{self._session_calls}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "provider": provider,
            "model": model,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": round(cost, 6),
            "latency_ms": latency_ms,
            "error": error,
            "agent_id": agent_id,
            "task_type": task_type,
            "status": "ok" if not error else "error",
        }
        return entry

    async def store_telemetry(self, entry: Dict[str, Any]):
        """Store telemetry entry in MongoDB (capped at 10,000 docs)."""
        if self._db is None:
            return

        try:
            collection = self._db.ai_telemetry
            await collection.insert_one(entry)

            # Enforce cap: keep only last 10,000 entries
            count = await collection.count_documents({})
            if count > 10000:
                oldest = await collection.find().sort("timestamp", 1).limit(count - 10000).to_list(None)
                if oldest:
                    oldest_id = oldest[-1]["_id"]
                    await collection.delete_many({"_id": {"$lt": oldest_id}})
        except Exception as e:
            logger.warning(f"[AIHealth] Failed to store telemetry: {e}")

    async def get_telemetry(self, limit: int = 20, provider: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get recent telemetry entries."""
        if self._db is None:
            return []

        try:
            query = {}
            if provider:
                query["provider"] = provider

            cursor = self._db.ai_telemetry.find(query).sort("timestamp", -1).limit(limit)
            results = await cursor.to_list(length=limit)
            # Convert ObjectId to string
            for r in results:
                r["_id"] = str(r["_id"])
            return results
        except Exception as e:
            logger.warning(f"[AIHealth] Failed to get telemetry: {e}")
            return []

    async def get_quota_alerts(self) -> List[Dict[str, Any]]:
        """Get active quota warnings."""
        if self._db is None:
            return []

        try:
            alerts = []
            cursor = self._db.ai_provider_health.find({
                "status": {"$in": ["quota_exceeded", "down", "auth_error"]}
            })
            async for doc in cursor:
                alerts.append({
                    "provider": doc.get("provider"),
                    "display_name": doc.get("display_name"),
                    "status": doc.get("status"),
                    "error": doc.get("error"),
                    "checked_at": doc.get("checked_at"),
                    "latency_ms": doc.get("latency_ms"),
                })
            return alerts
        except Exception as e:
            logger.warning(f"[AIHealth] Failed to get alerts: {e}")
            return []

    async def get_summary(self) -> Dict[str, Any]:
        """Get aggregated health summary."""
        configured = self.get_configured_providers()
        healthy_count = sum(1 for p in configured if p["status"] == "healthy")
        degraded_count = sum(1 for p in configured if p["status"] in ("degraded", "quota_exceeded"))
        down_count = sum(1 for p in configured if p["status"] == "down")
        unconfigured_count = sum(1 for p in configured if not p["configured"])

        return {
            **self.get_session_stats(),
            "providers_total": len(configured),
            "providers_healthy": healthy_count,
            "providers_degraded": degraded_count,
            "providers_down": down_count,
            "providers_unconfigured": unconfigured_count,
            "most_used_provider": max(
                configured,
                key=lambda p: p.get("calls_session", 0),
                default={}
            ).get("name", "N/A"),
        }

    async def get_history(self, days: int = 7) -> List[Dict[str, Any]]:
        """Get historical usage data for charts."""
        if self._db is None:
            return []

        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
            pipeline = [
                {"$match": {"timestamp": {"$gte": cutoff.isoformat()}}},
                {"$group": {
                    "_id": {
                        "date": {"$substr": ["$timestamp", 0, 10]},
                        "provider": "$provider",
                    },
                    "calls": {"$sum": 1},
                    "tokens_in": {"$sum": "$tokens_in"},
                    "tokens_out": {"$sum": "$tokens_out"},
                    "cost": {"$sum": "$cost_usd"},
                    "avg_latency": {"$avg": "$latency_ms"},
                }},
                {"$sort": {"_id.date": 1}},
            ]
            cursor = self._db.ai_telemetry.aggregate(pipeline)
            results = []
            async for doc in cursor:
                results.append({
                    "date": doc["_id"]["date"],
                    "provider": doc["_id"]["provider"],
                    "calls": doc["calls"],
                    "tokens_total": doc["tokens_in"] + doc["tokens_out"],
                    "cost": round(doc["cost"], 6),
                    "avg_latency_ms": round(doc["avg_latency"], 1),
                })
            return results
        except Exception as e:
            logger.warning(f"[AIHealth] Failed to get history: {e}")
            return []


# ── Singleton ──────────────────────────────────────────────────────────────

_instance: Optional[AIHealthMonitor] = None


def get_ai_health_monitor() -> AIHealthMonitor:
    """Get or create the singleton AIHealthMonitor."""
    global _instance
    if _instance is None:
        _instance = AIHealthMonitor()
    return _instance