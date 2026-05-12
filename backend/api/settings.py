"""
OmniBot — API Key Settings Routes

POST /api/factory/settings/keys   — Save API keys to MongoDB
GET  /api/factory/settings/keys   — Get configured keys (masked)
POST /api/factory/settings/keys/test — Test a specific key
"""

import logging
from datetime import datetime
from typing import Optional, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.config import hash_key

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Key definition: which keys we support ───────────────────────────────

KEY_DEFINITIONS = [
    {"env_name": "GROQ_KEY_1", "provider": "groq", "label": "Groq API Key #1"},
    {"env_name": "GROQ_KEY_2", "provider": "groq", "label": "Groq API Key #2"},
    {"env_name": "GROQ_KEY_3", "provider": "groq", "label": "Groq API Key #3"},
    {"env_name": "GROQ_KEY_4", "provider": "groq", "label": "Groq API Key #4"},
    {"env_name": "OPENROUTER_KEY_1", "provider": "openrouter", "label": "OpenRouter API Key #1"},
    {"env_name": "OPENROUTER_KEY_2", "provider": "openrouter", "label": "OpenRouter API Key #2"},
    {"env_name": "OPENROUTER_KEY_3", "provider": "openrouter", "label": "OpenRouter API Key #3"},
    {"env_name": "OPENROUTER_KEY_4", "provider": "openrouter", "label": "OpenRouter API Key #4"},
    {"env_name": "GEMINI_KEY_1", "provider": "gemini", "label": "Google Gemini Key #1"},
    {"env_name": "GEMINI_KEY_2", "provider": "gemini", "label": "Google Gemini Key #2"},
    {"env_name": "OPENAI_KEY_1", "provider": "openai", "label": "OpenAI Key #1"},
    {"env_name": "ANTHROPIC_KEY_1", "provider": "anthropic", "label": "Anthropic Key #1"},
    {"env_name": "OLLAMA_BASE_URL", "provider": "ollama", "label": "Ollama Base URL"},
    {"env_name": "GITHUB_TOKEN_1", "provider": "github", "label": "GitHub Token #1"},
    {"env_name": "GITHUB_TOKEN_2", "provider": "github", "label": "GitHub Token #2"},
    {"env_name": "HF_KEY_1", "provider": "huggingface", "label": "HuggingFace Key #1"},
    {"env_name": "HF_KEY_2", "provider": "huggingface", "label": "HuggingFace Key #2"},
    {"env_name": "GOOGLE_AI_STUDIO_KEY_1", "provider": "google_ai_studio", "label": "Google AI Studio Key #1"},
    {"env_name": "GOOGLE_AI_STUDIO_KEY_2", "provider": "google_ai_studio", "label": "Google AI Studio Key #2"},
    {"env_name": "NVIDIA_NIM_KEY_1", "provider": "nvidia_nim", "label": "NVIDIA NIM Key #1"},
    {"env_name": "CEREBRAS_KEY_1", "provider": "cerebras", "label": "Cerebras API Key #1"},
    {"env_name": "CLOUDFLARE_ACCOUNT_ID", "provider": "cloudflare", "label": "Cloudflare Account ID"},
    {"env_name": "CLOUDFLARE_KEY_1", "provider": "cloudflare", "label": "Cloudflare (Token|AccountID) #1"},
    {"env_name": "LLAMACLOUD_KEY_1", "provider": "llamacloud", "label": "LlamaCloud API Key #1"},
]


class SaveKeysRequest(BaseModel):
    keys: Dict[str, str]  # { "GROQ_KEY_1": "gsk_xxx", "OPENROUTER_KEY_1": "sk-or-xxx", ... }


class TestKeyRequest(BaseModel):
    provider: str
    api_key: str


class ValidateKeyRequest(BaseModel):
    api_key: Optional[str] = None


def _mask_key(key: str) -> str:
    """Mask a key for display: show first 6 and last 4 chars."""
    if not key or len(key) < 12:
        return "****" if key else ""
    return key[:6] + "•" * (len(key) - 10) + key[-4:]


async def _validate_single_key(env_name: str, api_key: str) -> dict:
    """Validate a single API key by calling its provider."""
    defn = next((d for d in KEY_DEFINITIONS if d["env_name"] == env_name), None)
    if not defn:
        return {"status": "invalid", "message": f"Unknown key definition: {env_name}"}

    provider = defn["provider"]
    api_key = api_key.strip()
    if not api_key:
        return {"status": "unverified", "message": "Key is empty."}

    if provider == "ollama":
        import httpx
        import os
        url = api_key
        if "host.docker.internal" in url and not os.path.exists("/.dockerenv"):
            url = url.replace("host.docker.internal", "localhost")
        if not url.startswith(("http://", "https://")):
            url = f"http://{url}"
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(f"{url}/api/tags", timeout=5)
                if r.status_code == 200:
                    return {"status": "valid", "message": "✓ Ollama server reachable and working"}
                else:
                    return {"status": "invalid", "message": f"✗ Ollama returned status {r.status_code}"}
        except Exception as e:
            try:
                async with httpx.AsyncClient() as client:
                    r = await client.get(url, timeout=5)
                    return {"status": "valid", "message": "✓ Ollama base URL reachable"}
            except Exception as ex:
                return {"status": "invalid", "message": f"✗ Cannot reach Ollama: {str(ex)[:100]}"}

    # OpenRouter: bypass LiteLLM — call /api/v1/models directly via httpx
    if provider == "openrouter":
        import httpx
        import time as _time
        headers = {
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://omnibot.local",
            "X-Title": "OmniBot",
        }
        try:
            _start = _time.time()
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get("https://openrouter.ai/api/v1/auth/key", headers=headers)
            latency_ms = int((_time.time() - _start) * 1000)
            if resp.status_code == 200:
                return {"status": "valid", "message": f"✓ OpenRouter key verified ({latency_ms}ms)"}
            elif resp.status_code == 401:
                return {"status": "invalid", "message": "✗ Invalid API key — check your OpenRouter key"}
            else:
                return {"status": "invalid", "message": f"✗ OpenRouter returned HTTP {resp.status_code}"}
        except httpx.TimeoutException:
            return {"status": "invalid", "message": "✗ OpenRouter request timed out (8s)"}
        except Exception as e:
            return {"status": "invalid", "message": f"✗ Connection error: {str(e)[:100]}"}

    elif provider == "cerebras":
        import litellm
        try:
            response = await litellm.acompletion(
                model="cerebras/llama-3.3-70b",
                messages=[{"role": "user", "content": "Ping"}],
                api_key=api_key,
                max_tokens=1,
                timeout=8,
            )
            return {"status": "valid", "message": "✓ Cerebras key verified"}
        except Exception as e:
            return {"status": "invalid", "message": f"✗ Cerebras validation failed: {str(e)[:100]}"}

    elif provider == "cloudflare":
        if "|" not in api_key:
            return {"status": "invalid", "message": "✗ Format must be: API_TOKEN|ACCOUNT_ID"}
        token, account_id = api_key.split("|", 1)
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/meta/llama-3.1-8b-instruct",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"messages": [{"role": "user", "content": "hi"}], "max_tokens": 1},
                    timeout=10
                )
                if r.status_code == 200:
                    return {"status": "valid", "message": "✓ Cloudflare Workers AI verified"}
                elif r.status_code == 401:
                    return {"status": "invalid", "message": "✗ Invalid API token"}
                elif r.status_code == 403:
                    return {"status": "invalid", "message": "✗ Wrong Account ID or insufficient permissions"}
                else:
                    return {"status": "invalid", "message": f"✗ Cloudflare error: {r.status_code}"}
        except Exception as e:
            return {"status": "invalid", "message": f"✗ Cloudflare connection error: {str(e)[:100]}"}

    elif provider == "llamacloud":
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    "https://cloud.llamaindex.ai/api/v1/pipelines",
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=8
                )
                if r.status_code == 200:
                    return {"status": "valid", "message": "✓ LlamaCloud key verified"}
                elif r.status_code == 401:
                    return {"status": "invalid", "message": "✗ Invalid LlamaCloud API key"}
                else:
                    return {"status": "invalid", "message": f"✗ LlamaCloud error: {r.status_code}"}
        except Exception as e:
            return {"status": "invalid", "message": f"✗ LlamaCloud connection error: {str(e)[:100]}"}

    # For other cloud providers, use LiteLLM for lightweight checks
    import litellm
    test_models = {
        "groq": "groq/llama-3.1-8b-instant",
        "gemini": "gemini/gemini-2.0-flash",
        "openai": "openai/gpt-4o-mini",
        "anthropic": "anthropic/claude-3-5-haiku-20241022",
        "cerebras": "cerebras/llama-3.3-70b",
    }

    model = test_models.get(provider)
    if not model:
        return {"status": "valid", "message": "✓ Key saved (validation not supported for this provider)"}

    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": "Say hello in one word."}],
            api_key=api_key,
            max_tokens=1,
            timeout=8,
        )
        content = response.choices[0].message.content or ""
        return {"status": "valid", "message": "✓ Key verified and working"}
    except Exception as e:
        err_msg = str(e)
        if "AuthenticationError" in err_msg or "401" in err_msg or "Invalid API Key" in err_msg:
            err_msg = "Invalid API Key or unauthorized access"
        elif "RateLimitError" in err_msg or "429" in err_msg:
            return {"status": "valid", "message": "✓ Key verified (Rate limited but valid)"}
        return {"status": "invalid", "message": f"✗ Key rejected by provider: {err_msg[:120]}"}


@router.get("/keys")
async def get_keys():
    """Get all configured keys with masked values and status."""
    from core.database import get_db
    db = get_db()

    # Load keys from MongoDB
    stored = await db.api_keys.find_one({"_id": "provider_keys"})
    stored_keys = stored.get("keys", {}) if stored else {}
    stored_statuses = stored.get("statuses", {}) if stored else {}

    # Build response with definitions + stored status
    result = []
    for defn in KEY_DEFINITIONS:
        env_name = defn["env_name"]
        raw = stored_keys.get(env_name, "")
        
        status_info = stored_statuses.get(env_name, {}) if isinstance(stored_statuses, dict) else {}
        status = status_info.get("status", "unverified") if raw else "unverified"
        message = status_info.get("message", "") if raw else ""
        checked_at = status_info.get("checked_at", None) if raw else None

        result.append({
            "env_name": env_name,
            "provider": defn["provider"],
            "label": defn["label"],
            "is_set": bool(raw),
            "masked_value": _mask_key(raw) if raw else "",
            "key_hash": hash_key(raw) if raw else "",
            "status": status,
            "status_message": message,
            "checked_at": checked_at.isoformat() if checked_at else None,
        })

    return {"keys": result}


@router.post("/keys")
async def save_keys(req: SaveKeysRequest):
    """Save API keys to MongoDB. Only non-empty values are stored."""
    from core.database import get_db
    db = get_db()

    # Load existing keys so we can merge
    stored = await db.api_keys.find_one({"_id": "provider_keys"})
    existing_keys = stored.get("keys", {}) if stored else {}
    existing_statuses = stored.get("statuses", {}) if stored else {}

    # Merge: update existing with new values, skip empty strings (clear key)
    modified_keys = []
    for env_name, value in req.keys.items():
        value = value.strip()
        if value:
            if existing_keys.get(env_name) != value:
                existing_keys[env_name] = value
                modified_keys.append(env_name)
        elif env_name in existing_keys and value == "":
            del existing_keys[env_name]
            if env_name in existing_statuses:
                del existing_statuses[env_name]

    # Sync ANTHROPIC_KEY with ANTHROPIC_KEY_1 for backward compatibility
    if "ANTHROPIC_KEY_1" in req.keys:
        val = req.keys["ANTHROPIC_KEY_1"].strip()
        if val:
            if existing_keys.get("ANTHROPIC_KEY") != val:
                existing_keys["ANTHROPIC_KEY"] = val
                if "ANTHROPIC_KEY" not in modified_keys:
                    modified_keys.append("ANTHROPIC_KEY")
        elif "ANTHROPIC_KEY" in existing_keys:
            del existing_keys["ANTHROPIC_KEY"]
            if "ANTHROPIC_KEY" in existing_statuses:
                del existing_statuses["ANTHROPIC_KEY"]

    # Run auto-validation for any newly saved/modified keys
    for env_name in modified_keys:
        val = existing_keys[env_name]
        res = await _validate_single_key(env_name, val)
        existing_statuses[env_name] = {
            "status": res["status"],
            "message": res["message"],
            "checked_at": datetime.now()
        }

    # Save to MongoDB
    await db.api_keys.update_one(
        {"_id": "provider_keys"},
        {
            "$set": {
                "keys": existing_keys,
                "statuses": existing_statuses,
                "updated_at": datetime.now(),
            },
            "$setOnInsert": {"created_at": datetime.now()},
        },
        upsert=True,
    )

    # Reload the model router with new keys
    try:
        from core.model_router import get_model_router
        router_instance = get_model_router()
        await router_instance.reload_keys_from_db()
        logger.info("Model router reloaded with %d keys from MongoDB",
                     sum(len(v) for v in router_instance._keys.values()))
    except Exception as e:
        logger.warning("Model router reload failed: %s", e)

    logger.info("API keys saved to MongoDB (%d keys configured)",
                len([v for v in existing_keys.values() if v]))

    return {
        "status": "saved",
        "keys_configured": len([v for v in existing_keys.values() if v]),
    }


@router.post("/keys/test")
async def test_key(req: TestKeyRequest):
    """Test a specific API key by making a minimal call (legacy endpoint)."""
    import litellm

    # Map provider to a test model
    test_models = {
        "groq": "groq/llama-3.1-8b-instant",
        "openrouter": "openrouter/google/gemini-2.0-flash-001",
        "gemini": "gemini/gemini-2.0-flash",
        "anthropic": "anthropic/claude-3-5-haiku-20241022",
    }

    model = test_models.get(req.provider)
    if not model:
        return {"status": "skip", "message": f"No test model for provider: {req.provider}"}

    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": "Say hello in one word."}],
            api_key=req.api_key,
            timeout=15,
            max_tokens=10,
        )
        content = response.choices[0].message.content or ""
        return {"status": "ok", "message": f"Key works! Response: {content.strip()[:50]}"}
    except Exception as e:
        return {"status": "error", "message": str(e)[:200]}


@router.post("/keys/validate/{env_name}")
async def validate_key_endpoint(env_name: str, req: Optional[ValidateKeyRequest] = None):
    """Validate a specific API key (either passed in body or loaded from DB)."""
    from core.database import get_db
    db = get_db()

    # Load existing keys
    stored = await db.api_keys.find_one({"_id": "provider_keys"})
    existing_keys = stored.get("keys", {}) if stored else {}
    existing_statuses = stored.get("statuses", {}) if stored else {}

    # 1. Determine key value to test
    api_key = None
    is_raw_passed = False
    if req and req.api_key:
        api_key = req.api_key.strip()
        is_raw_passed = True
    else:
        api_key = existing_keys.get(env_name, "").strip()

    if not api_key:
        raise HTTPException(status_code=400, detail=f"Key {env_name} is not configured and no value was provided.")

    # 2. Run validation
    res = await _validate_single_key(env_name, api_key)

    # 3. If valid and raw key was passed, save the key to MongoDB
    # If it was an already stored key, save the status regardless of result
    if res["status"] == "valid" and is_raw_passed:
        existing_keys[env_name] = api_key
        # Sync ANTHROPIC_KEY
        if env_name == "ANTHROPIC_KEY_1":
            existing_keys["ANTHROPIC_KEY"] = api_key
        existing_statuses[env_name] = {
            "status": "valid",
            "message": res["message"],
            "checked_at": datetime.now()
        }
        await db.api_keys.update_one(
            {"_id": "provider_keys"},
            {
                "$set": {
                    "keys": existing_keys,
                    "statuses": existing_statuses,
                    "updated_at": datetime.now(),
                }
            },
            upsert=True
        )
        # Reload the model router with new keys
        try:
            from core.model_router import get_model_router
            router_instance = get_model_router()
            await router_instance.reload_keys_from_db()
        except Exception as e:
            logger.warning("Model router reload failed: %s", e)
            
    elif not is_raw_passed:
        # Validating stored key: update its status in DB
        existing_statuses[env_name] = {
            "status": res["status"],
            "message": res["message"],
            "checked_at": datetime.now()
        }
        await db.api_keys.update_one(
            {"_id": "provider_keys"},
            {
                "$set": {
                    "statuses": existing_statuses,
                    "updated_at": datetime.now(),
                }
            },
            upsert=True
        )

    return res


@router.get("/provider-health")
async def get_provider_health():
    """Get status/latency health metrics for all API providers."""
    from core.model_router import get_model_router
    try:
        router_instance = get_model_router()
        health_status = router_instance.get_health_status()
        # Transform health status into response format
        health_list = []
        for provider, status_info in health_status.items():
            health_list.append({
                "provider": provider,
                "status": status_info.get("status", "unconfigured"),
                "latency_ms": 0,
                "keys_active": status_info.get("available_keys", 0),
                "keys_exhausted": 0,
                "last_checked": datetime.now().isoformat()
            })
        return health_list
    except Exception as e:
        logger.error("Failed to get provider health: %s", e)
        # Return empty health list on error (don't crash Settings page)
        return []


@router.post("/reload-router")
async def reload_router_endpoint():
    """Manually trigger reloading API keys from MongoDB into ModelRouter."""
    from core.model_router import get_model_router
    try:
        router_instance = get_model_router()
        await router_instance.reload_keys_from_db()
        
        # Calculate active provider keys
        keys_loaded = sum(len(v) for v in router_instance._keys.values())
        providers_active = sum(1 for v in router_instance._keys.values() if len(v) > 0)
        
        return {
            "status": "reloaded",
            "providers_active": providers_active,
            "keys_loaded": keys_loaded
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reload model router: {str(e)}")


# ── Factory Constitution Endpoints ──────────────────────────────────────────

class ConstitutionRule(BaseModel):
    id: str
    title: str
    rule: str
    immutable: Optional[bool] = False

class SaveConstitutionRequest(BaseModel):
    rules: List[ConstitutionRule]

@router.get("/constitution")
async def get_constitution():
    """Retrieve all factory constitution rules. Initializes default rules if empty."""
    from core.database import get_db
    db = get_db()
    
    # Check if we have any rules stored
    cursor = db.constitution.find({})
    rules = await cursor.to_list(length=100)
    
    if not rules:
        # Initialize default rules including the immutable security directive
        default_rules = [
            {
                "id": "sandbox_rule",
                "title": "Secure Container Isolation",
                "rule": "This agent MUST execute strictly within an isolated Docker container sandbox. Windows absolute paths (C:\\...) are strictly forbidden. Accessing host OS filesystem outside designated sandbox is prohibited.",
                "immutable": True
            },
            {
                "id": "rate_limit_rule",
                "title": "Rate Limit Respect",
                "rule": "Agents must strictly monitor token budgets and rate limit headers. In case of 429 warnings, gracefully delay calls and cascade to backup model keys.",
                "immutable": False
            },
            {
                "id": "robust_error_rule",
                "title": "Fail-Safe Execution",
                "rule": "All code blocks must wrap file read/write or network calls in try-except blocks to ensure robust, non-crashing execution under unexpected conditions.",
                "immutable": False
            }
        ]
        for rule in default_rules:
            rule["created_at"] = datetime.now()
            await db.constitution.update_one({"id": rule["id"]}, {"$set": rule}, upsert=True)
        
        cursor = db.constitution.find({})
        rules = await cursor.to_list(length=100)
        
    # Remove MongoDB internal ObjectId for JSON serialization
    for r in rules:
        r.pop("_id", None)
        if "created_at" in r and r["created_at"]:
            r["created_at"] = r["created_at"].isoformat()
            
    return {"rules": rules}


@router.post("/constitution")
async def save_constitution(req: SaveConstitutionRequest):
    """Save/update factory constitution rules. Enforces immutability of the sandbox rule."""
    from core.database import get_db
    db = get_db()
    
    # Load existing rules to ensure we don't bypass immutability
    cursor = db.constitution.find({})
    existing = await cursor.to_list(length=100)
    existing_map = {r["id"]: r for r in existing}
    
    submitted_ids = {r.id for r in req.rules}
    
    # 1. Enforce that all existing immutable rules must remain present and unchanged
    for r_id, ext_rule in existing_map.items():
        if ext_rule.get("immutable"):
            if r_id not in submitted_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Rule '{ext_rule['title']}' is immutable and cannot be deleted."
                )
                
    # 2. Process updates and new rules
    for r in req.rules:
        # Trim whitespace
        r_id = r.id.strip()
        title = r.title.strip()
        rule_text = r.rule.strip()
        
        if not r_id or not title or not rule_text:
            raise HTTPException(status_code=400, detail="Rule fields cannot be blank.")
            
        # Check if we are trying to modify an existing immutable rule's body
        if r_id in existing_map and existing_map[r_id].get("immutable"):
            # Ensure title and body are preserved or reset to original
            title = existing_map[r_id]["title"]
            rule_text = existing_map[r_id]["rule"]
            immutable_flag = True
        else:
            immutable_flag = r.immutable
            
        rule_doc = {
            "id": r_id,
            "title": title,
            "rule": rule_text,
            "immutable": immutable_flag,
            "updated_at": datetime.now()
        }
        
        await db.constitution.update_one(
            {"id": r_id},
            {"$set": rule_doc, "$setOnInsert": {"created_at": datetime.now()}},
            upsert=True
        )
        
    # 3. Clean up deleted rules (that are not immutable)
    for r_id, ext_rule in existing_map.items():
        if r_id not in submitted_ids and not ext_rule.get("immutable"):
            await db.constitution.delete_one({"id": r_id})
            
    return {"status": "saved", "count": len(req.rules)}


# ── General Settings (PayPal, Service Pricing) ───────────────────────────

class SaveGeneralSettingsRequest(BaseModel):
    paypal_me_link: str
    default_service_price: int


@router.get("/general")
async def get_general_settings():
    """Retrieve general settings (PayPal Link, default service price)."""
    from core.database import get_db
    from core.config import get_settings
    db = get_db()
    s = get_settings()
    stored = await db.settings.find_one({"_id": "general_settings"}) if db is not None else None
    
    paypal_me_link = stored.get("paypal_me_link", s.paypal_me_link) if stored else s.paypal_me_link
    default_service_price = stored.get("default_service_price", s.default_service_price) if stored else s.default_service_price
    
    return {
        "paypal_me_link": paypal_me_link,
        "default_service_price": default_service_price
    }


@router.post("/general")
async def save_general_settings(req: SaveGeneralSettingsRequest):
    """Save general settings to MongoDB and update the runtime config singleton."""
    from core.database import get_db
    from core.config import get_settings
    db = get_db()
    if db is not None:
        await db.settings.update_one(
            {"_id": "general_settings"},
            {"$set": {
                "paypal_me_link": req.paypal_me_link.strip(),
                "default_service_price": req.default_service_price
            }},
            upsert=True
        )
        
        # Sync with the process-wide settings singleton
        s = get_settings()
        s.paypal_me_link = req.paypal_me_link.strip()
        s.default_service_price = req.default_service_price
        logger.info("General settings updated and saved to DB (PayPal: %s, Price: $%d)", s.paypal_me_link, s.default_service_price)
        
    return {"status": "saved"}


# ── Self Evolution Settings ──────────────────────────────────────────────

class SelfEvolutionSettingsRequest(BaseModel):
    self_evolution_enabled: bool
    evolution_interval_minutes: float
    evolution_max_patches_per_cycle: int
    evolution_max_tokens: int
    evolution_rollback_on_failure: bool
    idea_engine_enabled: bool
    idea_engine_rate_per_hour: float
    idea_engine_max_daily_executions: int
    idea_engine_scopes: List[str]
    idea_engine_min_score: float


@router.get("/self-evolution")
async def get_self_evolution_settings():
    """Retrieve self-evolution configurations."""
    from core.database import get_db
    import os
    db = get_db()

    stored = await db.settings.find_one({"_id": "self_evolution_settings"}) if db is not None else None

    # Merge values with OS environment fallback values
    return {
        "self_evolution_enabled": stored.get("self_evolution_enabled", os.getenv("SELF_EVOLUTION_ENABLED", "true").lower() == "true") if stored else (os.getenv("SELF_EVOLUTION_ENABLED", "true").lower() == "true"),
        "evolution_interval_minutes": stored.get("evolution_interval_minutes", float(os.getenv("EVOLUTION_INTERVAL_MINUTES", "30"))) if stored else float(os.getenv("EVOLUTION_INTERVAL_MINUTES", "30")),
        "evolution_max_patches_per_cycle": stored.get("evolution_max_patches_per_cycle", int(os.getenv("EVOLUTION_MAX_PATCHES_PER_CYCLE", "5"))) if stored else int(os.getenv("EVOLUTION_MAX_PATCHES_PER_CYCLE", "5")),
        "evolution_max_tokens": stored.get("evolution_max_tokens", int(os.getenv("EVOLUTION_MAX_TOKENS", "30000"))) if stored else int(os.getenv("EVOLUTION_MAX_TOKENS", "30000")),
        "evolution_rollback_on_failure": stored.get("evolution_rollback_on_failure", os.getenv("EVOLUTION_ROLLBACK_ON_FAILURE", "true").lower() == "true") if stored else (os.getenv("EVOLUTION_ROLLBACK_ON_FAILURE", "true").lower() == "true"),
        "idea_engine_enabled": stored.get("idea_engine_enabled", os.getenv("IDEA_ENGINE_ENABLED", "true").lower() == "true") if stored else (os.getenv("IDEA_ENGINE_ENABLED", "true").lower() == "true"),
        "idea_engine_rate_per_hour": stored.get("idea_engine_rate_per_hour", float(os.getenv("IDEA_ENGINE_RATE_PER_HOUR", "100"))) if stored else float(os.getenv("IDEA_ENGINE_RATE_PER_HOUR", "100")),
        "idea_engine_max_daily_executions": stored.get("idea_engine_max_daily_executions", int(os.getenv("IDEA_ENGINE_MAX_DAILY_EXECUTIONS", "2400"))) if stored else int(os.getenv("IDEA_ENGINE_MAX_DAILY_EXECUTIONS", "2400")),
        "idea_engine_scopes": stored.get("idea_engine_scopes", os.getenv("IDEA_ENGINE_TARGET_SCOPES", "everything").lower().split(",")) if stored else os.getenv("IDEA_ENGINE_TARGET_SCOPES", "everything").lower().split(","),
        "idea_engine_min_score": stored.get("idea_engine_min_score", float(os.getenv("IDEA_ENGINE_MIN_SCORE", "5.0"))) if stored else float(os.getenv("IDEA_ENGINE_MIN_SCORE", "5.0")),
    }


@router.post("/self-evolution")
async def save_self_evolution_settings(req: SelfEvolutionSettingsRequest):
    """Save self-evolution settings, propagate to environment, and hot-reload components."""
    from core.database import get_db
    import os
    db = get_db()

    doc = {
        "self_evolution_enabled": req.self_evolution_enabled,
        "evolution_interval_minutes": req.evolution_interval_minutes,
        "evolution_max_patches_per_cycle": req.evolution_max_patches_per_cycle,
        "evolution_max_tokens": req.evolution_max_tokens,
        "evolution_rollback_on_failure": req.evolution_rollback_on_failure,
        "idea_engine_enabled": req.idea_engine_enabled,
        "idea_engine_rate_per_hour": req.idea_engine_rate_per_hour,
        "idea_engine_max_daily_executions": req.idea_engine_max_daily_executions,
        "idea_engine_scopes": req.idea_engine_scopes,
        "idea_engine_min_score": req.idea_engine_min_score,
        "updated_at": datetime.now()
    }

    if db is not None:
        await db.settings.update_one(
            {"_id": "self_evolution_settings"},
            {"$set": doc},
            upsert=True
        )

    # Dynamically apply variables to environment process space
    os.environ["SELF_EVOLUTION_ENABLED"] = str(req.self_evolution_enabled).lower()
    os.environ["EVOLUTION_INTERVAL_MINUTES"] = str(req.evolution_interval_minutes)
    os.environ["EVOLUTION_MAX_PATCHES_PER_CYCLE"] = str(req.evolution_max_patches_per_cycle)
    os.environ["EVOLUTION_MAX_TOKENS"] = str(req.evolution_max_tokens)
    os.environ["EVOLUTION_ROLLBACK_ON_FAILURE"] = str(req.evolution_rollback_on_failure).lower()
    os.environ["IDEA_ENGINE_ENABLED"] = str(req.idea_engine_enabled).lower()
    os.environ["IDEA_ENGINE_RATE_PER_HOUR"] = str(req.idea_engine_rate_per_hour)
    os.environ["IDEA_ENGINE_MAX_DAILY_EXECUTIONS"] = str(req.idea_engine_max_daily_executions)
    os.environ["IDEA_ENGINE_TARGET_SCOPES"] = ",".join(req.idea_engine_scopes)
    os.environ["IDEA_ENGINE_MIN_SCORE"] = str(req.idea_engine_min_score)

    # Reload Scheduler and Idea Engine dynamically
    try:
        from core.self_evolution.scheduler import get_evolution_scheduler
        sch = get_evolution_scheduler()
        sch.reload_config(enabled=req.self_evolution_enabled, interval_minutes=req.evolution_interval_minutes)
    except Exception as e:
        logger.warning("Failed to hot-reload EvolutionScheduler: %s", e)

    try:
        from core.self_evolution.idea_engine import get_idea_engine
        ie = get_idea_engine()
        ie.reload_config(
            enabled=req.idea_engine_enabled,
            rate_per_hour=req.idea_engine_rate_per_hour,
            max_daily_executions=req.idea_engine_max_daily_executions,
            target_scopes=req.idea_engine_scopes,
            min_score=req.idea_engine_min_score
        )
    except Exception as e:
        logger.warning("Failed to hot-reload IdeaEngine: %s", e)

    logger.info("Self-Evolution configurations saved and hot-reloaded.")
    return {"status": "saved"}


@router.get("/self-evolution/status")
async def get_self_evolution_status():
    """Expose telemetry, locks, active states, and recent reports."""
    from core.self_evolution.state_manager import get_state_manager
    from pathlib import Path
    import os
    import json

    sm = get_state_manager()
    state = sm.load_state()

    # Check lock file
    lock_file_path = Path("autonomous_logs/evolution_cycle.lock")
    is_running = False
    lock_pid = None
    if lock_file_path.exists():
        try:
            content = lock_file_path.read_text().strip()
            if content:
                lock_pid = int(content)
                try:
                    os.kill(lock_pid, 0)
                    is_running = True
                except OSError:
                    is_running = False
        except Exception:
            is_running = False

    # Calculate countdown
    last_run_str = state.get("last_run")
    countdown_seconds = 0
    try:
        interval_minutes = float(os.getenv("EVOLUTION_INTERVAL_MINUTES", "30"))
    except Exception:
        interval_minutes = 30.0

    if last_run_str:
        try:
            last_run_dt = datetime.fromisoformat(last_run_str)
            elapsed = (datetime.now() - last_run_dt).total_seconds()
            countdown_seconds = max(0.0, (interval_minutes * 60) - elapsed)
        except Exception:
            countdown_seconds = 0.0

    # Load recent 5 cycle reports
    last_5_reports = []
    try:
        reports_dir = Path("autonomous_logs/cycle_reports")
        if reports_dir.exists():
            files = sorted(reports_dir.glob("cycle_*.json"), reverse=True)[:5]
            for file in files:
                try:
                    last_5_reports.append(json.loads(file.read_text(encoding="utf-8")))
                except Exception:
                    pass
    except Exception as e:
        logger.warning("Failed to load cycle reports: %s", e)

    # Get last cycle result
    last_result = "never_run"
    if last_5_reports:
        latest = last_5_reports[0]
        if latest.get("verified"):
            last_result = "success"
        elif latest.get("rolled_back"):
            last_result = "rolled_back"
        else:
            last_result = "failed"

    # Determine general running status of the scheduler
    from core.self_evolution.scheduler import get_evolution_scheduler
    sch = get_evolution_scheduler()
    scheduler_state = "Disabled"
    if sch.enabled:
        scheduler_state = "Running" if is_running else "Idle"

    return {
        "scheduler_state": scheduler_state,
        "last_run": last_run_str,
        "last_result": last_result,
        "total_improvements": state.get("total_improvements", 0),
        "total_errors": state.get("total_errors", 0),
        "next_run_countdown": int(countdown_seconds),
        "is_running": is_running,
        "lock_pid": lock_pid,
        "last_5_cycles": last_5_reports
    }



