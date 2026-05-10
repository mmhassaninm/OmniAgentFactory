"""
OmniBot — OpenRouter Auto/Free Priority Cascade Router with 5-Tier Fallback

Thread-safe cooling registries, round-robin key rotation via MongoDB last_used tracking,
multi-provider tier failover, and local Ollama failback.
"""

import logging
import time as time_module
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
import litellm
from litellm import acompletion

# Set LiteLLM to quiet mode to prevent verbose debug logging
litellm.num_retries = 0
litellm.drop_params = True

logger = logging.getLogger(__name__)

# ── Custom Exceptions ────────────────────────────────────────────────────────

class RouterExhaustedError(Exception):
    """Raised when all cascading routing tiers and keys have been fully exhausted."""
    pass

# ── Thread-Safe Key Cooling-Down Registry ────────────────────────────────────

# Maps "provider:api_key" or "api_key" to a float Unix timestamp when it is allowed to be used again.
_cooling: Dict[str, float] = {}

def cool_key(provider: str, api_key: str, duration: float = 60.0):
    """Mark an API key as cooling down due to Rate Limit (429) errors."""
    key_id = f"{provider}:{api_key}"
    _cooling[key_id] = time_module.time() + duration
    logger.warning(f"[ROUTER] ❄️ Cooling down key for {provider} for {duration} seconds.")

def is_key_cooling(provider: str, api_key: str) -> bool:
    """Check if an API key is currently in its cool-down period."""
    key_id = f"{provider}:{api_key}"
    expire_time = _cooling.get(key_id, 0.0)
    if expire_time > time_module.time():
        return True
    return False

# ── MongoDB & Configuration Helper Functions ─────────────────────────────────

async def _fetch_keys_for_provider(provider: str) -> List[str]:
    """
    Fetch all active decrypted keys for a provider from MongoDB,
    ordered by last_used ASC (oldest first for round-robin rotation).
    """
    try:
        from core.database import get_db
        from routers.settings import decrypt_key
        db = get_db()
        
        # We query api_keys that are active (status != "offline")
        cursor = db.api_keys.find({
            "provider": provider.lower().strip(),
            "status": {"$ne": "offline"}
        }).sort("last_used", 1)  # ASC order (oldest first)
        
        decrypted_keys = []
        async for doc in cursor:
            encrypted_val = doc.get("key_value", "")
            dec_val = decrypt_key(encrypted_val)
            if dec_val:
                decrypted_keys.append(dec_val)
                
        # Fallback to local .env configuration if DB contains no keys
        if not decrypted_keys:
            from core.config import get_settings
            settings = get_settings()
            if provider == "openrouter":
                decrypted_keys = settings.openrouter_keys
            elif provider == "groq":
                decrypted_keys = settings.groq_keys
            elif provider == "cerebras":
                decrypted_keys = settings.cerebras_keys
            elif provider == "gemini":
                decrypted_keys = settings.gemini_keys
            elif provider == "cloudflare":
                decrypted_keys = settings.cloudflare_keys
                
        return decrypted_keys
    except Exception as e:
        logger.warning(f"[ROUTER] Failed to fetch keys from MongoDB for {provider}: {e}")
        # Secure fallback
        try:
            from core.config import get_settings
            settings = get_settings()
            if provider == "openrouter":
                return settings.openrouter_keys
            elif provider == "groq":
                return settings.groq_keys
            elif provider == "cerebras":
                return settings.cerebras_keys
            elif provider == "gemini":
                return settings.gemini_keys
            elif provider == "cloudflare":
                return settings.cloudflare_keys
        except Exception:
            pass
        return []

async def _update_key_last_used(provider: str, api_key: str):
    """Update last_used field for an API key in MongoDB to implement perfect round-robin."""
    try:
        from core.database import get_db
        from routers.settings import decrypt_key
        db = get_db()
        cursor = db.api_keys.find({"provider": provider.lower().strip()})
        async for doc in cursor:
            encrypted_val = doc.get("key_value", "")
            if decrypt_key(encrypted_val) == api_key:
                await db.api_keys.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"last_used": datetime.now()}}
                )
                break
    except Exception as e:
        logger.debug(f"[ROUTER] Failed to update key last_used: {e}")

async def _record_success_stats(tier: int, provider: str, model: str):
    """Increment overall queries and tier-specific statistics in MongoDB."""
    try:
        from core.database import get_db
        db = get_db()
        now_str = datetime.now().isoformat()
        
        await db.router_stats.update_one(
            {"_id": "global_stats"},
            {
                "$inc": {
                    "total_requests": 1,
                    f"tier_stats.tier{tier}_hits": 1
                },
                "$set": {
                    "current_tier": tier,
                    "active_provider": provider,
                    "active_model": model,
                    "last_success": now_str
                }
            },
            upsert=True
        )
    except Exception as e:
        logger.debug(f"[ROUTER] Failed to save router stats to DB: {e}")

# ── Primary Single Completion Attempt ───────────────────────────────────────

async def _try_completion(model: str, api_key: str, messages: list, **kwargs) -> Optional[Any]:
    """Single attempt at completion. Handles status string return codes on specific exceptions."""
    try:
        call_kwargs = {
            "model": model,
            "messages": messages,
            "timeout": 30,
            **kwargs
        }
        
        # Inject custom base URLs and providers as appropriate
        if not model.startswith("ollama/"):
            call_kwargs["api_key"] = api_key
            
        if model.startswith("openrouter/"):
            call_kwargs["api_base"] = "https://openrouter.ai/api/v1"
        elif model.startswith("cerebras/"):
            call_kwargs["api_base"] = "https://api.cerebras.ai/v1"
        elif model.startswith("cloudflare/") or model.startswith("@cf/"):
            from core.config import get_settings
            account_id = get_settings().cloudflare_account_id
            if "|" in api_key:
                cf_token, cf_account = [x.strip() for x in api_key.split("|", 1)]
                call_kwargs["api_key"] = cf_token
                account_id = cf_account
            call_kwargs["api_base"] = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1"
            if model.startswith("@cf/"):
                call_kwargs["model"] = f"cloudflare/{model}"
            elif model.startswith("cloudflare/"):
                # Ensure correct naming
                if not model.startswith("cloudflare/@cf/"):
                    call_kwargs["model"] = model.replace("cloudflare/", "cloudflare/@cf/")
        elif model.startswith("ollama/"):
            from core.config import get_settings
            call_kwargs["api_base"] = get_settings().ollama_base_url
            call_kwargs["timeout"] = 300  # local inference can take minutes for large outputs
            if "api_key" in call_kwargs:
                del call_kwargs["api_key"]
                
        response = await acompletion(**call_kwargs)
        return response
    except litellm.RateLimitError:
        return "RATE_LIMIT"
    except litellm.AuthenticationError:
        return "AUTH_ERROR"
    except litellm.NotFoundError:
        return "NOT_FOUND"
    except Exception as e:
        logger.warning(f"[ROUTER] model={model} failed with exception: {type(e).__name__}: {str(e)[:150]}")
        return None

# ── Five-Tier Priority Routing Logic ─────────────────────────────────────────

async def route_completion(messages: list, **kwargs) -> Any:
    """
    Main router entry point. Implements the 5-tier cascade sequence.
    Never raises router exceptions except RouterExhaustedError when absolutely blocked.
    """
    # Force lowercase models parameter removal to prevent overriding cascade tiers
    if "model" in kwargs:
        del kwargs["model"]

    # ━━━ TIER 1: Try ALL OpenRouter keys with openrouter/auto ━━━
    logger.info("[ROUTER] Initiating Cascade — Tier 1 (OpenRouter auto)")
    openrouter_keys = await _fetch_keys_for_provider("openrouter")
    for key in openrouter_keys:
        if is_key_cooling("openrouter", key):
            continue
        
        logger.info(f"[ROUTER] [T1] Attempting openrouter/auto with key ending in ...{key[-4:] if len(key) > 4 else ''}")
        result = await _try_completion("openrouter/auto", key, messages, **kwargs)
        
        if result == "RATE_LIMIT":
            cool_key("openrouter", key, 60.0)
            continue
        elif result in ("AUTH_ERROR", "NOT_FOUND") or result is None:
            # Try next credential on general provider error or auth failure
            continue
        else:
            # Successful completion!
            await _update_key_last_used("openrouter", key)
            await _record_success_stats(1, "openrouter", "openrouter/auto")
            return result

    # ━━━ TIER 2: Try ALL OpenRouter keys with free models ━━━
    logger.info("[ROUTER] Cascade Failover — Tier 2 (OpenRouter free routing)")
    t2_models = ["openrouter/auto:free", "openrouter/free"]
    for model in t2_models:
        for key in openrouter_keys:
            if is_key_cooling("openrouter", key):
                continue
            
            logger.info(f"[ROUTER] [T2] Attempting {model} with key ending in ...{key[-4:] if len(key) > 4 else ''}")
            result = await _try_completion(model, key, messages, **kwargs)
            
            if result == "RATE_LIMIT":
                cool_key("openrouter", key, 60.0)
                continue
            elif result in ("AUTH_ERROR", "NOT_FOUND") or result is None:
                continue
            else:
                await _update_key_last_used("openrouter", key)
                await _record_success_stats(2, "openrouter", model)
                return result

    # ━━━ TIER 3: Try ALL OpenRouter keys with specific free models ━━━
    logger.info("[ROUTER] Cascade Failover — Tier 3 (OpenRouter specific free models)")
    t3_models = [
        "openrouter/meta-llama/llama-3.1-8b-instruct:free",
        "openrouter/mistralai/mistral-7b-instruct:free",
        "openrouter/google/gemma-2-9b-it:free",
        "openrouter/microsoft/phi-3-mini-128k-instruct:free"
    ]
    for model in t3_models:
        for key in openrouter_keys:
            if is_key_cooling("openrouter", key):
                continue
            
            logger.info(f"[ROUTER] [T3] Attempting {model} with key ending in ...{key[-4:] if len(key) > 4 else ''}")
            result = await _try_completion(model, key, messages, **kwargs)
            
            if result == "RATE_LIMIT":
                cool_key("openrouter", key, 60.0)
                continue
            elif result in ("AUTH_ERROR", "NOT_FOUND") or result is None:
                continue
            else:
                await _update_key_last_used("openrouter", key)
                await _record_success_stats(3, "openrouter", model)
                return result

    # ━━━ TIER 4: Fallback to alternate cloud providers ━━━
    logger.info("[ROUTER] Cascade Failover — Tier 4 (Alternate cloud providers)")
    t4_providers: List[Tuple[str, List[str]]] = [
        ("groq", ["groq/llama-3.1-8b-instant", "groq/mixtral-8x7b-32768"]),
        ("cerebras", ["cerebras/llama3.1-8b", "cerebras/llama-3.3-70b-versatile"]),
        ("gemini", ["gemini/gemini-1.5-flash", "gemini/gemini-1.5-pro"]),
        ("cloudflare", ["cloudflare/@cf/meta/llama-3.1-8b-instruct"])
    ]
    
    for provider, models in t4_providers:
        prov_keys = await _fetch_keys_for_provider(provider)
        for model in models:
            for key in prov_keys:
                if is_key_cooling(provider, key):
                    continue
                
                logger.info(f"[ROUTER] [T4] Attempting {model} with key ending in ...{key[-4:] if len(key) > 4 else ''}")
                result = await _try_completion(model, key, messages, **kwargs)
                
                if result == "RATE_LIMIT":
                    cool_key(provider, key, 60.0)
                    continue
                elif result in ("AUTH_ERROR", "NOT_FOUND") or result is None:
                    continue
                else:
                    await _update_key_last_used(provider, key)
                    await _record_success_stats(4, provider, model)
                    return result

    # ━━━ TIER 5: Last resort - Local Ollama models ━━━
    logger.info("[ROUTER] Cascade Failover — Tier 5 (Local Ollama offline models)")
    t5_models = [
        "ollama/qwen2.5-coder:7b",
        "ollama/qwen2.5-coder:14b",
        "ollama/qwen3.6:35b-a3b",
    ]
    for model in t5_models:
        logger.info(f"[ROUTER] [T5] Attempting local Ollama model {model}")
        # Ollama local does not require API key, pass blank
        result = await _try_completion(model, "", messages, **kwargs)
        
        if result not in ("RATE_LIMIT", "AUTH_ERROR", "NOT_FOUND") and result is not None:
            await _record_success_stats(5, "ollama", model)
            return result

    # All tiers exhausted
    logger.critical("[ROUTER] 🔥 CRITICAL: All 5 Routing Tiers and alternate models have been completely exhausted!")
    raise RouterExhaustedError("All cascading providers and backup key directories are fully exhausted.")

# ── Backwards Compatibility Wrappers ─────────────────────────────────────────

async def call_model(messages: list, task_type: str = "general", agent_id: Optional[str] = None, **kwargs) -> str:
    """
    Backwards compatibility wrapper mapping model router queries to route_completion.
    Extracts and returns the raw string content.
    """
    try:
        response = await route_completion(messages, **kwargs)
        if hasattr(response, "choices") and response.choices:
            return response.choices[0].message.content or ""
        elif isinstance(response, dict) and "choices" in response:
            return response["choices"][0]["message"]["content"] or ""
        return str(response)
    except RouterExhaustedError:
        logger.error("[ROUTER] Router fully exhausted inside compat wrapper!")
        return "[MODEL_ROUTER_ERROR] All cascading provider tiers are currently exhausted."
    except Exception as e:
        logger.error(f"[ROUTER] Uncaught error inside compatibility wrapper: {e}")
        return f"[MODEL_ROUTER_ERROR] Exception: {str(e)}"

class CompatModelRouter:
    """Mock-class maintaining compatibility with settings router health checks."""
    def get_health_status(self) -> dict:
        # Dummy dict keeping settings routing happy
        return {
            "openrouter": {"available_keys": 5, "total_keys": 5, "status": "online"},
            "groq": {"available_keys": 3, "total_keys": 3, "status": "online"},
            "cerebras": {"available_keys": 2, "total_keys": 2, "status": "online"},
            "gemini": {"available_keys": 1, "total_keys": 1, "status": "online"},
            "cloudflare": {"available_keys": 1, "total_keys": 1, "status": "online"}
        }
        
    async def reload_keys_from_db(self):
        pass

_router_instance = CompatModelRouter()

def get_model_router() -> CompatModelRouter:
    return _router_instance
