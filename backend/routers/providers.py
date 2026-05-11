import asyncio
import re
import time
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.database import db
from models.settings import update_settings
from services.providers import provider_registry

logger = logging.getLogger(__name__)

router = APIRouter()


class SetActiveRequest(BaseModel):
    name: str


class AddCustomProviderRequest(BaseModel):
    display_name: str
    base_url: str
    api_key: Optional[str] = None


class PatchProviderConfigRequest(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    default_model: Optional[str] = None


# ── List all providers ────────────────────────────────────────────────────────

@router.get("")
@router.get("/")
async def list_providers():
    """Return all registered providers with live availability status."""
    providers = provider_registry.list_all()

    async def check(p_info):
        provider = provider_registry.get(p_info["name"])
        available = await provider.is_available() if provider else False
        return {**p_info, "available": available}

    results = await asyncio.gather(*[check(p) for p in providers])
    return {"providers": list(results), "active": provider_registry._active_name}


# ── All models from all providers (grouped) ───────────────────────────────────

@router.get("/all-models")
async def get_all_models():
    """
    Fetch models from every registered provider in parallel.
    Returns a grouped structure with 'auto' pinned first.
    """
    providers = provider_registry.list_all()

    async def fetch_for(p_info):
        name = p_info["name"]
        provider = provider_registry.get(name)
        if not provider:
            return None
        try:
            available = await provider.is_available()
            models = await provider.list_models() if available else []
        except Exception as e:
            logger.warning(f"Failed to fetch models for provider {name}: {e}")
            available, models = False, []
        return {
            "name": name,
            "display_name": p_info["display_name"],
            "available": available,
            "models": models,
        }

    groups = await asyncio.gather(*[fetch_for(p) for p in providers])
    return {
        "auto": {"id": "auto", "name": "AutoDetect"},
        "providers": [g for g in groups if g is not None],
    }


# ── Set active provider ───────────────────────────────────────────────────────

@router.post("/active")
async def set_active_provider(body: SetActiveRequest):
    """Switch the active provider and persist the choice to MongoDB."""
    try:
        provider_registry.set_active(body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await update_settings({"active_provider": body.name})
    return {"success": True, "active": body.name}


# ── Add custom provider ───────────────────────────────────────────────────────

@router.post("/custom")
async def add_custom_provider(body: AddCustomProviderRequest):
    """Register a new custom OpenAI-compatible provider and persist it."""
    slug = "custom_" + re.sub(r"[^a-z0-9]+", "_", body.display_name.lower()).strip("_")
    # Avoid slug collisions
    if provider_registry.get(slug):
        slug += f"_{int(time.monotonic() * 1000) % 10000}"

    provider_registry.register_custom(
        slug=slug,
        display_name=body.display_name,
        base_url=body.base_url,
        api_key=body.api_key,
    )

    await db.settings.update_one(
        {"_id": "system_settings"},
        {"$set": {f"custom_providers.{slug}": {
            "display_name": body.display_name,
            "base_url": body.base_url,
            "api_key": body.api_key,
            "enabled": True,
        }}},
        upsert=True,
    )
    return {"success": True, "slug": slug, "display_name": body.display_name}


# ── Delete custom provider ────────────────────────────────────────────────────

@router.delete("/custom/{slug}")
async def remove_custom_provider(slug: str):
    """Remove a custom provider from the registry and MongoDB."""
    removed = provider_registry.remove_custom(slug)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Custom provider '{slug}' not found.")

    await db.settings.update_one(
        {"_id": "system_settings"},
        {"$unset": {f"custom_providers.{slug}": ""}},
    )
    return {"success": True, "slug": slug}


# ── List models for a specific provider ──────────────────────────────────────

@router.get("/{provider_name}/models")
async def get_provider_models(provider_name: str):
    """Return available models for the given provider."""
    provider = provider_registry.get(provider_name)
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_name}' not found.")
    models = await provider.list_models()
    return {"provider": provider_name, "models": models}


# ── Live-reconfigure a provider ───────────────────────────────────────────────

@router.patch("/{provider_name}/config")
async def patch_provider_config(provider_name: str, body: PatchProviderConfigRequest):
    """Update API key / base URL for a provider without restarting."""
    config = {k: v for k, v in body.model_dump().items() if v is not None}
    if not config:
        raise HTTPException(status_code=400, detail="No config fields provided.")

    success = provider_registry.reconfigure_provider(provider_name, config)
    if not success:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_name}' not found.")

    mongo_patch = {f"provider_configs.{provider_name}.{k}": v for k, v in config.items()}
    await update_settings(mongo_patch)
    return {"success": True, "provider": provider_name}


# ── Test provider connectivity ────────────────────────────────────────────────

@router.post("/{provider_name}/test")
async def test_provider(provider_name: str):
    """Ping the provider and return latency in milliseconds."""
    provider = provider_registry.get(provider_name)
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_name}' not found.")

    start = time.monotonic()
    available = await provider.is_available()
    latency_ms = round((time.monotonic() - start) * 1000)

    return {
        "provider": provider_name,
        "available": available,
        "latency_ms": latency_ms,
        "message": "Connected ✓" if available else "Unreachable ✗",
    }
