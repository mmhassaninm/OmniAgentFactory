import logging
import uuid
import base64
import hashlib
import os
from datetime import datetime
from typing import Optional, List, Dict
import litellm
import httpx
import time as _time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from cryptography.fernet import Fernet

from models.settings import get_settings, update_settings, SettingsModel
from core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Pydantic Request/Response Models ──────────────────────────────────

class KeyItem(BaseModel):
    id: Optional[str] = None
    provider: str
    name: str
    model: str
    key_value: Optional[str] = ""
    profile: str

class ProfileItem(BaseModel):
    id: Optional[str] = None
    email: str
    color: str

# ── Existing endpoints for general settings ───────────────────────────

@router.get("")
@router.get("/")
async def fetch_settings():
    """Returns the current system settings."""
    return await get_settings()

@router.patch("")
@router.patch("/")
async def patch_settings(updates: dict):
    """Updates specific system settings."""
    try:
        updated = await update_settings(updates)
        return updated
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Encryption & Decryption Helpers ────────────────────────────────────

def get_fernet() -> Fernet:
    raw_key = os.getenv("OMNIBOT_ENCRYPTION_KEY", "omnibot_factory_super_secure_2026_encryption_key")
    key_bytes = raw_key.encode('utf-8')
    h = hashlib.sha256(key_bytes).digest()
    fernet_key = base64.urlsafe_b64encode(h)
    return Fernet(fernet_key)

def encrypt_key(raw_value: str) -> str:
    if not raw_value:
        return ""
    f = get_fernet()
    return f.encrypt(raw_value.encode('utf-8')).decode('utf-8')

def decrypt_key(encrypted_value: str) -> str:
    if not encrypted_value:
        return ""
    try:
        f = get_fernet()
        return f.decrypt(encrypted_value.encode('utf-8')).decode('utf-8')
    except Exception as e:
        logger.error(f"Failed to decrypt key: {e}")
        return ""

def mask_key(val: str) -> str:
    if not val:
        return ""
    val = val.strip()
    if len(val) <= 10:
        return "•" * len(val)
    return val[:6] + "••••••••" + val[-4:]

# ── Seeding Logic ──────────────────────────────────────────────────────

INITIAL_SEEDS = [
    # Profile 1
    {
        "provider": "cerebras",
        "name": "Default Key",
        "model": "AUTODETECT",
        "key_value": "csk_seed_mmh_1234567890",
        "profile": "mmhassaninm@gmail.com",
        "status": "online"
    },
    {
        "provider": "cloudflare",
        "name": "OAF02",
        "model": "AUTODETECT",
        "key_value": "token_seed_mmh|account_seed_mmh",
        "profile": "mmhassaninm@gmail.com",
        "status": "online"
    },
    {
        "provider": "llamacloud",
        "name": "OAF03",
        "model": "AUTODETECT",
        "key_value": "llamacloud_seed_mmh_12345",
        "profile": "mmhassaninm@gmail.com",
        "status": "online"
    },
    {
        "provider": "groq",
        "name": "OAF04",
        "model": "AUTODETECT",
        "key_value": "gsk_seed_mmh_1234567890",
        "profile": "mmhassaninm@gmail.com",
        "status": "online"
    },
    {
        "provider": "openrouter",
        "name": "OAF05",
        "model": "AUTODETECT",
        "key_value": "sk-or-v1-seed-mmh-12345",
        "profile": "mmhassaninm@gmail.com",
        "status": "online"
    },
    {
        "provider": "gemini",
        "name": "OAF06",
        "model": "AUTODETECT",
        "key_value": "AIzaSy_seed_mmh_12345678",
        "profile": "mmhassaninm@gmail.com",
        "status": "online"
    },
    # Profile 2
    {
        "provider": "cerebras",
        "name": "Default Key",
        "model": "AUTODETECT",
        "key_value": "csk_seed_mou_1234567890",
        "profile": "moustafa.mhassanien@gmail.com",
        "status": "unverified"
    },
    {
        "provider": "cloudflare",
        "name": "OAF07",
        "model": "AUTODETECT",
        "key_value": "token_seed_mou|account_seed_mou",
        "profile": "moustafa.mhassanien@gmail.com",
        "status": "unverified"
    },
    # Profile 3
    {
        "provider": "ollama",
        "name": "qwen2.5-coder:14b",
        "model": "localhost:11434",
        "key_value": "",
        "profile": "Local",
        "status": "local"
    },
    {
        "provider": "ollama",
        "name": "qwen3.6:35b-a3b",
        "model": "localhost:11434",
        "key_value": "",
        "profile": "Local",
        "status": "local"
    },
    {
        "provider": "ollama",
        "name": "qwen2.5-coder:7b",
        "model": "localhost:11434",
        "key_value": "",
        "profile": "Local",
        "status": "local"
    }
]

DEFAULT_PROFILES = [
    {"id": "p1", "email": "mmhassaninm@gmail.com", "color": "#3b82f6"},
    {"id": "p2", "email": "moustafa.mhassanien@gmail.com", "color": "#10b981"},
    {"id": "p3", "email": "Local", "color": "#8b5cf6"}
]

async def seed_profiles_if_empty():
    db = get_db()
    count = await db.profiles.count_documents({})
    if count == 0:
        logger.info("Initializing profiles collection with default seeds")
        for p in DEFAULT_PROFILES:
            await db.profiles.insert_one({
                "id": p["id"],
                "email": p["email"],
                "color": p["color"],
                "updated_at": datetime.now()
            })

async def seed_keys_if_empty():
    db = get_db()
    
    # Drop legacy unique indexes from older schemas to avoid E11000 duplicate key error on null env_name
    try:
        await db.api_keys.drop_index("env_name_1")
        logger.info("Successfully dropped legacy unique index 'env_name_1' to avoid duplicate key conflicts")
    except Exception:
        pass

    count = await db.api_keys.count_documents({})
    if count == 0:
        logger.info("Initializing api_keys collection with default seeds")
        for seed in INITIAL_SEEDS:
            encrypted_val = encrypt_key(seed["key_value"])
            await db.api_keys.insert_one({
                "id": str(uuid.uuid4()),
                "provider": seed["provider"],
                "name": seed["name"],
                "model": seed["model"],
                "key_value": encrypted_val,
                "profile": seed["profile"],
                "status": seed["status"],
                "status_message": "Seeded key configuration",
                "updated_at": datetime.now()
            })

# ── Validation Engine ──────────────────────────────────────────────────

async def _validate_key_direct(provider: str, key_value: str, model: str = "AUTODETECT") -> dict:
    """Validate an individual API key by making a lightweight test call."""
    provider = provider.lower().strip()
    key_value = key_value.strip()
    
    if provider == "ollama":
        # For Ollama, the model/base_url is stored in the model field, or we default to http://localhost:11434
        url = model.strip() if model else "http://localhost:11434"
        if not url.startswith(("http://", "https://")):
            url = f"http://{url}"
        _start = _time.time()
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(f"{url}/api/tags", timeout=5)
                latency = int((_time.time() - _start) * 1000)
                if r.status_code == 200:
                    return {"valid": True, "latency_ms": latency, "message": "✓ Ollama server reachable and working"}
                else:
                    return {"valid": False, "latency_ms": latency, "message": f"✗ Ollama returned status {r.status_code}"}
        except Exception as e:
            try:
                _start = _time.time()
                async with httpx.AsyncClient() as client:
                    r = await client.get(url, timeout=5)
                    latency = int((_time.time() - _start) * 1000)
                    return {"valid": True, "latency_ms": latency, "message": "✓ Ollama base URL reachable"}
            except Exception as ex:
                return {"valid": False, "latency_ms": 5, "message": f"✗ Cannot reach Ollama: {str(ex)[:80]}"}

    if not key_value:
        return {"valid": False, "latency_ms": 0, "message": "Key is empty"}

    # OpenRouter
    if provider == "openrouter":
        headers = {
            "Authorization": f"Bearer {key_value}",
            "HTTP-Referer": "https://omnibot.local",
            "X-Title": "OmniBot",
        }
        _start = _time.time()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get("https://openrouter.ai/api/v1/auth/key", headers=headers)
            latency = int((_time.time() - _start) * 1000)
            if resp.status_code == 200:
                return {"valid": True, "latency_ms": latency, "message": "✓ OpenRouter key verified"}
            elif resp.status_code == 401:
                return {"valid": False, "latency_ms": latency, "message": "✗ Invalid API key"}
            else:
                return {"valid": False, "latency_ms": latency, "message": f"✗ Status {resp.status_code}"}
        except Exception as e:
            return {"valid": False, "latency_ms": 0, "message": f"✗ Error: {str(e)[:50]}"}
            
    # Cloudflare
    elif provider == "cloudflare":
        if "|" not in key_value:
            return {"valid": False, "latency_ms": 0, "message": "Cloudflare requires: API_TOKEN|ACCOUNT_ID format. Example: cfat_xxx|d75899bff..."}
        token, account_id = [x.strip() for x in key_value.split("|", 1)]
        _start = _time.time()
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/meta/llama-3.1-8b-instruct",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"prompt": "hi"},
                    timeout=8
                )
                latency = int((_time.time() - _start) * 1000)
                if r.status_code == 200:
                    return {"valid": True, "latency_ms": latency, "message": "✓ Cloudflare Workers AI verified"}
                else:
                    return {"valid": False, "latency_ms": latency, "message": f"✗ Cloudflare returned {r.status_code}"}
        except Exception as e:
            return {"valid": False, "latency_ms": 0, "message": f"✗ Error: {str(e)[:50]}"}

    # LlamaCloud
    elif provider == "llamacloud":
        _start = _time.time()
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    "https://api.cloud.llamaindex.ai/api/v1/files?limit=1",
                    headers={"Authorization": f"Bearer {key_value}"},
                    timeout=8
                )
                latency = int((_time.time() - _start) * 1000)
                if r.status_code == 200:
                    return {"valid": True, "latency_ms": latency, "message": "✓ LlamaParse connected"}
                elif r.status_code == 401:
                    return {"valid": False, "latency_ms": latency, "message": "✗ Invalid API key"}
                else:
                    return {"valid": False, "latency_ms": latency, "message": f"✗ LlamaCloud returned {r.status_code}: {r.text[:50]}"}
        except Exception as e:
            return {"valid": False, "latency_ms": 0, "message": f"✗ Error: {str(e)[:50]}"}

    # Cerebras
    elif provider == "cerebras":
        _start = _time.time()
        models_to_try = ["llama3.1-8b", "llama-3.3-70b-versatile", "llama3.1-70b"]
        last_err = None
        for m in models_to_try:
            try:
                response = await litellm.acompletion(
                    model=f"cerebras/{m}",
                    messages=[{"role": "user", "content": "Ping"}],
                    api_key=key_value,
                    max_tokens=1,
                    timeout=8,
                    api_base="https://api.cerebras.ai/v1"
                )
                latency = int((_time.time() - _start) * 1000)
                return {"valid": True, "latency_ms": latency, "message": f"✓ Cerebras verified with {m}"}
            except Exception as e:
                last_err = e
                continue
        latency = int((_time.time() - _start) * 1000)
        err_str = str(last_err) if last_err else "All models failed"
        if "AuthenticationError" in err_str or "401" in err_str or "Invalid API Key" in err_str:
            err_str = "Invalid API Key"
        return {"valid": False, "latency_ms": latency, "message": f"✗ Cerebras rejected: {err_str[:80]}"}

    # Standard litellm providers
    test_models = {
        "groq": "groq/llama-3.1-8b-instant",
        "gemini": "gemini/gemini-2.0-flash",
        "openai": "openai/gpt-4o-mini",
        "anthropic": "anthropic/claude-3-5-haiku-20241022",
        "cerebras": "cerebras/llama-3.3-70b-versatile",
    }
    
    model_name = test_models.get(provider)
    if not model_name:
        return {"valid": True, "latency_ms": 100, "message": "✓ Key saved (No validator)"}
        
    _start = _time.time()
    try:
        response = await litellm.acompletion(
            model=model_name,
            messages=[{"role": "user", "content": "Ping"}],
            api_key=key_value,
            max_tokens=1,
            timeout=8,
        )
        latency = int((_time.time() - _start) * 1000)
        return {"valid": True, "latency_ms": latency, "message": "✓ Key verified and working"}
    except Exception as e:
        latency = int((_time.time() - _start) * 1000)
        err_str = str(e)
        if "AuthenticationError" in err_str or "401" in err_str or "Invalid API Key" in err_str:
            err_str = "Invalid API Key"
        elif "RateLimitError" in err_str or "429" in err_str:
            return {"valid": True, "latency_ms": latency, "message": "✓ Key verified (Rate limited but valid)"}
        return {"valid": False, "latency_ms": latency, "message": f"✗ Key rejected: {err_str[:80]}"}

# ── Key Vault Endpoint Routes ──────────────────────────────────────────

@router.post("/keys")
async def save_key(req: KeyItem):
    """Save or update an API key in the Key Vault, encrypted with Fernet."""
    db = get_db()
    
    # Run seeding first to make sure there are initial keys
    await seed_keys_if_empty()
    
    key_val = req.key_value.strip() if req.key_value else ""
    existing_doc = None
    
    if req.id:
        existing_doc = await db.api_keys.find_one({"id": req.id})
    else:
        # Match by profile + provider + name
        existing_doc = await db.api_keys.find_one({
            "profile": req.profile.strip(),
            "provider": req.provider.strip(),
            "name": req.name.strip()
        })
        
    doc_id = existing_doc["id"] if existing_doc else (req.id or str(uuid.uuid4()))
    
    if existing_doc and (not key_val or "•" in key_val or "*" in key_val):
        if req.provider.strip().lower() == "cloudflare" and "|" in key_val:
            # Special case for Cloudflare: split and merge
            new_token, new_account = key_val.split("|", 1)
            old_decrypted = decrypt_key(existing_doc.get("key_value", ""))
            if "|" in old_decrypted:
                old_token, old_account = old_decrypted.split("|", 1)
            else:
                old_token, old_account = old_decrypted, ""
                
            final_token = old_token if ("•" in new_token or "*" in new_token or not new_token.strip()) else new_token
            final_account = old_account if ("•" in new_account or "*" in new_account or not new_account.strip()) else new_account
            
            encrypted_value = encrypt_key(f"{final_token.strip()}|{final_account.strip()}")
        else:
            # Keep old encrypted value if key value is blank or masked entirely
            encrypted_value = existing_doc.get("key_value", "")
    else:
        encrypted_value = encrypt_key(key_val)
        
    doc = {
        "id": doc_id,
        "provider": req.provider.strip(),
        "name": req.name.strip(),
        "model": req.model.strip(),
        "key_value": encrypted_value,
        "profile": req.profile.strip(),
        "status": existing_doc.get("status", "unverified") if existing_doc else "unverified",
        "status_message": existing_doc.get("status_message", "Saved API key details") if existing_doc else "Added new API key",
        "updated_at": datetime.now()
    }
    
    await db.api_keys.update_one(
        {"id": doc_id},
        {"$set": doc},
        upsert=True
    )
    
    # Also reload model router
    try:
        from core.model_router import get_model_router
        router_instance = get_model_router()
        await router_instance.reload_keys_from_db()
    except Exception as e:
        logger.warning("Failed to reload model router keys: %s", e)
        
    # Get raw decrypted key value for returning masked value
    dec_val = decrypt_key(encrypted_value)
    
    return {
        "status": "saved",
        "key": {
            "id": doc_id,
            "provider": req.provider,
            "name": req.name,
            "model": req.model,
            "key_value": mask_key(dec_val),
            "profile": req.profile,
            "status": doc["status"],
            "status_message": doc["status_message"]
        }
    }

@router.get("/keys")
async def get_keys(profile: Optional[str] = None):
    """Get all configured keys with masked values and status, filtered by profile."""
    db = get_db()
    await seed_keys_if_empty()
    
    query = {}
    if profile:
        # Match either exact name or email address
        # mmhassaninm -> mmhassaninm@gmail.com
        # moustafa.mhassanien -> moustafa.mhassanien@gmail.com
        p_strip = profile.strip()
        if p_strip == "mmhassaninm":
            query["profile"] = "mmhassaninm@gmail.com"
        elif p_strip == "moustafa.mhassanien":
            query["profile"] = "moustafa.mhassanien@gmail.com"
        else:
            query["profile"] = p_strip
            
    cursor = db.api_keys.find(query)
    results = []
    async for doc in cursor:
        encrypted_val = doc.get("key_value", "")
        raw_val = decrypt_key(encrypted_val)
        masked_val = mask_key(raw_val)
        
        results.append({
            "id": doc.get("id"),
            "provider": doc.get("provider"),
            "name": doc.get("name"),
            "model": doc.get("model"),
            "key_value": masked_val,
            "profile": doc.get("profile"),
            "status": doc.get("status", "unverified"),
            "status_message": doc.get("status_message", ""),
            "updated_at": doc.get("updated_at").isoformat() if doc.get("updated_at") else None
        })
    return results

@router.get("/keys/{id}/reveal")
async def reveal_key(id: str):
    """Retrieve the decrypted key value for copy and temporary display actions."""
    db = get_db()
    doc = await db.api_keys.find_one({"id": id})
    if not doc:
        raise HTTPException(status_code=404, detail="Key not found")
        
    encrypted_val = doc.get("key_value", "")
    raw_val = decrypt_key(encrypted_val)
    return {"key_value": raw_val}

@router.post("/keys/{id}/validate")
async def validate_key(id: str):
    """Validate a specific key by id, check its health and update its status."""
    db = get_db()
    doc = await db.api_keys.find_one({"id": id})
    if not doc:
        raise HTTPException(status_code=404, detail="Key not found")
        
    provider = doc.get("provider", "")
    encrypted_val = doc.get("key_value", "")
    model = doc.get("model", "")
    
    raw_val = decrypt_key(encrypted_val)
    
    res = await _validate_key_direct(provider, raw_val, model)
    
    new_status = "online" if res["valid"] else "offline"
    if provider == "ollama":
        new_status = "local"
    elif not raw_val and provider != "ollama":
        new_status = "unverified"
        
    await db.api_keys.update_one(
        {"id": id},
        {"$set": {
            "status": new_status,
            "status_message": res.get("message", ""),
            "updated_at": datetime.now()
        }}
    )
    
    return {
        "valid": res["valid"],
        "latency_ms": res["latency_ms"],
        "status": new_status,
        "message": res.get("message", "")
    }

@router.delete("/keys/{id}")
async def delete_key(id: str):
    """Delete a key from the Key Vault."""
    db = get_db()
    res = await db.api_keys.delete_one({"id": id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Key not found")
        
    return {"status": "deleted", "id": id}

@router.get("/keys/active")
async def get_active_key(provider: str):
    """Get the best available active decrypted key for a given provider (for internal router use)."""
    db = get_db()
    
    cursor = db.api_keys.find({"provider": provider.lower().strip()})
    docs = []
    async for d in cursor:
        docs.append(d)
        
    if not docs:
        raise HTTPException(status_code=404, detail=f"No keys found for provider {provider}")
        
    # Sort docs by status priority: online first, then local, then unverified, then offline
    status_priority = {"online": 0, "local": 1, "unverified": 2, "offline": 3}
    docs.sort(key=lambda x: status_priority.get(x.get("status", "unverified"), 99))
    
    best_doc = docs[0]
    encrypted_val = best_doc.get("key_value", "")
    raw_val = decrypt_key(encrypted_val)
    
    return {
        "id": best_doc.get("id"),
        "provider": best_doc.get("provider"),
        "name": best_doc.get("name"),
        "model": best_doc.get("model"),
        "key_value": raw_val,
        "masked_value": mask_key(raw_val),
        "status": best_doc.get("status", "unverified")
    }

# ── Profile Management Endpoints ─────────────────────────────────────

@router.get("/profiles")
async def get_profiles():
    """Get all settings profiles, seed if empty."""
    db = get_db()
    await seed_profiles_if_empty()
    cursor = db.profiles.find({})
    profiles = []
    async for doc in cursor:
        profiles.append({
            "id": doc.get("id"),
            "email": doc.get("email"),
            "color": doc.get("color", "blue")
        })
    return profiles

@router.post("/profiles")
async def create_profile(profile: ProfileItem):
    """Create a new profile."""
    db = get_db()
    if not profile.email or not profile.color:
        raise HTTPException(status_code=400, detail="Email and color are required")
        
    p_id = str(uuid.uuid4())
    doc = {
        "id": p_id,
        "email": profile.email.strip(),
        "color": profile.color.strip(),
        "updated_at": datetime.now()
    }
    res = await db.profiles.insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    return {"status": "created", "profile": doc}

@router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str):
    """Delete profile and cascade delete all its associated keys."""
    db = get_db()
    
    # 1. Fetch the profile to get its email
    profile = await db.profiles.find_one({"id": profile_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    email = profile.get("email")
    
    # 2. Delete the profile itself
    await db.profiles.delete_one({"id": profile_id})
    
    # 3. Cascade-delete keys matching the profile name or email
    res = await db.api_keys.delete_many({"profile": email})
    
    # Also handle shorthand mappings:
    if email == "mmhassaninm@gmail.com":
        await db.api_keys.delete_many({"profile": "mmhassaninm"})
    elif email == "moustafa.mhassanien@gmail.com":
        await db.api_keys.delete_many({"profile": "moustafa.mhassanien"})
    elif email == "Local":
        await db.api_keys.delete_many({"profile": "Local"})
    elif email == "Local Runtime":
        await db.api_keys.delete_many({"profile": "Local"})
        
    return {
        "status": "deleted",
        "profile_id": profile_id,
        "deleted_keys_count": res.deleted_count
    }

