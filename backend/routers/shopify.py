"""
Shopify Theme Factory — API Router
Provides endpoints to control the swarm and access generated themes.
"""

import base64
import json
import logging
import os
import zipfile
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core.database import get_db
from shopify.swarm_engine import get_swarm_engine
from shopify.models import get_all_themes, get_theme_versions, get_latest_market_research
from services.encryption import encrypt, decrypt

logger = logging.getLogger(__name__)
router = APIRouter()

OUTPUT_DIR = Path(__file__).parent.parent / "shopify" / "output" / "themes"


async def _get_shopify_creds_async() -> tuple:
    db = get_db()
    store_url = ""
    admin_token = ""
    api_version = "2025-01"  # Default API version

    if db is not None:
        try:
            s = await db.shopify_settings.find_one({"_id": "global"}) or {}
            store_url = s.get("store_url", "")
            admin_token_enc = s.get("admin_token", "")
            if admin_token_enc:
                admin_token = decrypt(admin_token_enc)
            api_version = s.get("api_version") or "2025-01"
        except Exception as e:
            logger.warning("Failed to load shopify credentials from DB: %s", e)

    # Fallback to env/config
    from core.config import get_settings
    cfg = get_settings()
    if not store_url:
        store_url = cfg.shopify_store_url or ""
    if not admin_token:
        admin_token = cfg.shopify_access_token or ""
    if not api_version or api_version == "2024-01":
        api_version = cfg.shopify_api_version or "2025-01"

    return store_url.strip(), admin_token.strip(), api_version.strip()


class ShopifySettingsBody(BaseModel):
    store_url: str = ""
    admin_token: str = ""
    unsplash_access_key: str = ""
    swarm_autostart: bool = False


# ── Swarm Control ────────────────────────────────────────────────────────────

@router.post("/start")
async def start_swarm():
    """Start the infinite Shopify theme generation loop."""
    engine = get_swarm_engine()
    if engine.running and not engine.paused:
        return {"status": "already_running", "message": "Swarm is already running"}
    db = get_db()
    engine.start(db)
    return {"status": "started", "message": "Shopify swarm engine started"}


@router.post("/pause")
async def pause_swarm():
    """Pause the swarm after the current agent completes."""
    engine = get_swarm_engine()
    engine.pause()
    return {"status": "paused"}


@router.post("/resume")
async def resume_swarm():
    """Resume a paused swarm."""
    engine = get_swarm_engine()
    engine.resume()
    return {"status": "resumed"}


@router.post("/stop")
async def stop_swarm():
    """Stop the swarm entirely."""
    engine = get_swarm_engine()
    engine.stop()
    return {"status": "stopped"}


@router.get("/status")
async def get_status():
    """Get current swarm status."""
    engine = get_swarm_engine()
    return engine.get_status()


# ── Themes ───────────────────────────────────────────────────────────────────

@router.get("/themes")
async def list_themes():
    """List all generated themes."""
    db = get_db()
    if db is None:
        return []
    return await get_all_themes(db)


@router.get("/themes/{theme_id}")
async def get_theme(theme_id: str):
    """Get a specific theme with its version history."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not connected")

    theme = await db.shopify_themes.find_one({"_id": theme_id})
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")

    theme["id"] = theme.pop("_id")
    for field in ("created_at", "updated_at"):
        if field in theme and hasattr(theme[field], "isoformat"):
            theme[field] = theme[field].isoformat()

    versions = await get_theme_versions(db, theme_id)
    theme["versions"] = versions
    return theme


@router.get("/themes/{theme_id}/download/{version}")
async def download_theme(theme_id: str, version: str):
    """Download a theme ZIP file."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not connected")

    version_doc = await db.shopify_versions.find_one({
        "theme_id": theme_id,
        "version": version,
    })
    if not version_doc:
        raise HTTPException(status_code=404, detail="Theme version not found")

    zip_path = Path(version_doc.get("zip_path", ""))
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="ZIP file not found on disk")

    theme_doc = await db.shopify_themes.find_one({"_id": theme_id})
    theme_name = theme_doc.get("name", "theme") if theme_doc else "theme"
    filename = f"{theme_name.lower().replace(' ', '-')}-{version}.zip"

    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=filename,
    )


# ── Market Research ──────────────────────────────────────────────────────────

@router.get("/market-report")
async def get_market_report():
    """Get the latest market research report."""
    db = get_db()
    if db is None:
        return {"message": "Database not connected"}
    report = await get_latest_market_research(db)
    if not report:
        return {"message": "No market research available yet. Start the swarm to generate."}
    return report


# ── Deploy ───────────────────────────────────────────────────────────────────

@router.post("/deploy/{theme_id}/{version}")
async def deploy_theme(theme_id: str, version: str):
    """Upload a theme ZIP to a configured Shopify store via Admin API."""
    store_url, admin_token, api_version = await _get_shopify_creds_async()
    if not store_url or not admin_token:
        raise HTTPException(
            status_code=400,
            detail="Shopify credentials not configured — go to Settings → Shopify tab",
        )

    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not connected")

    version_doc = await db.shopify_versions.find_one({"theme_id": theme_id, "version": version})
    if not version_doc:
        raise HTTPException(status_code=404, detail="Theme version not found")

    zip_path = Path(version_doc.get("zip_path", ""))
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="ZIP file not found on disk")

    theme_doc = await db.shopify_themes.find_one({"_id": theme_id})
    theme_name = theme_doc.get("name", "OmniBot Theme") if theme_doc else "OmniBot Theme"

    # Normalise store URL (strip https:// if present so we can build URLs consistently)
    clean_url = store_url.removeprefix("https://").removeprefix("http://").rstrip("/")
    base = f"https://{clean_url}/admin/api/{api_version}"
    headers = {"X-Shopify-Access-Token": admin_token, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=120) as client:
        # 1. Create unpublished theme slot
        r = await client.post(
            f"{base}/themes.json",
            headers=headers,
            json={"theme": {"name": f"{theme_name} {version}", "role": "unpublished"}},
        )
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Shopify theme create failed: {r.text[:300]}")
        shopify_theme_id = r.json()["theme"]["id"]

        # 2. Upload each asset from the ZIP
        with zipfile.ZipFile(zip_path) as zf:
            entries = [n for n in zf.namelist() if not n.endswith("/")]
            for name in entries:
                # Strip leading folder component: theme-v1.0.0/sections/foo.liquid → sections/foo.liquid
                parts = name.split("/", 1)
                asset_key = parts[1] if len(parts) > 1 else parts[0]
                raw = zf.read(name)
                try:
                    payload = {"asset": {"key": asset_key, "value": raw.decode("utf-8")}}
                except UnicodeDecodeError:
                    payload = {"asset": {"key": asset_key, "attachment": base64.b64encode(raw).decode()}}
                await client.put(
                    f"{base}/themes/{shopify_theme_id}/assets.json",
                    headers=headers,
                    json=payload,
                )

    return {
        "ok": True,
        "shopify_theme_id": shopify_theme_id,
        "preview_url": f"https://{clean_url}/?preview_theme_id={shopify_theme_id}",
        "editor_url":  f"https://{clean_url}/admin/themes/{shopify_theme_id}/editor",
    }


# ── Shopify Settings ─────────────────────────────────────────────────────────

@router.get("/settings")
async def get_shopify_settings():
    """Load Shopify settings from MongoDB."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not connected")

    s = await db.shopify_settings.find_one({"_id": "global"}) or {}

    from core.config import get_settings
    cfg = get_settings()

    store_url = s.get("store_url") or cfg.shopify_store_url or ""
    admin_token_enc = s.get("admin_token")
    if admin_token_enc:
        admin_token = decrypt(admin_token_enc)
    else:
        admin_token = cfg.shopify_access_token or ""

    unsplash_key_enc = s.get("unsplash_access_key")
    if unsplash_key_enc:
        unsplash_key = decrypt(unsplash_key_enc)
    else:
        unsplash_key = os.getenv("UNSPLASH_ACCESS_KEY", "").strip()

    swarm_autostart = s.get("swarm_autostart")
    if swarm_autostart is None:
        swarm_autostart = os.getenv("SHOPIFY_SWARM_AUTOSTART", "false").lower() == "true"

    return {
        "store_url":           store_url,
        "admin_token":         "***" if admin_token else "",
        "unsplash_access_key": "***" if unsplash_key else "",
        "swarm_autostart":     swarm_autostart,
        "output_folder":       str(OUTPUT_DIR),
    }


@router.post("/settings")
async def save_shopify_settings(body: ShopifySettingsBody):
    """Persist Shopify settings to MongoDB with AES-256 (AESGCM) encryption."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not connected")

    existing = await db.shopify_settings.find_one({"_id": "global"}) or {}

    # Only update and encrypt keys if they are set to non-masked values
    admin_token = existing.get("admin_token", "")
    if body.admin_token and body.admin_token != "***":
        admin_token = encrypt(body.admin_token)

    unsplash_access_key = existing.get("unsplash_access_key", "")
    if body.unsplash_access_key and body.unsplash_access_key != "***":
        unsplash_access_key = encrypt(body.unsplash_access_key)

    store_url = body.store_url if body.store_url else existing.get("store_url", "")

    await db.shopify_settings.update_one(
        {"_id": "global"},
        {
            "$set": {
                "store_url": store_url,
                "admin_token": admin_token,
                "unsplash_access_key": unsplash_access_key,
                "swarm_autostart": body.swarm_autostart,
                "api_version": "2025-01"
            }
        },
        upsert=True
    )
    return {"ok": True}


@router.post("/settings/test")
async def test_shopify_connection():
    """Validate the configured Shopify Admin API connection using GET /admin/api/2025-01/shop.json"""
    store_url, admin_token, api_version = await _get_shopify_creds_async()
    if not store_url or not admin_token:
        return {"ok": False, "error": "Store URL or Admin Token not configured"}

    clean_url = store_url.removeprefix("https://").removeprefix("http://").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"https://{clean_url}/admin/api/{api_version}/shop.json",
                headers={
                    "X-Shopify-Access-Token": admin_token,
                    "Content-Type": "application/json"
                },
            )
        if r.status_code == 200:
            return {"ok": True, "shop_name": r.json()["shop"]["name"]}
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
