"""
Shopify Theme Factory — API Router
Provides endpoints to control the swarm and access generated themes.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from core.database import get_db
from shopify.swarm_engine import get_swarm_engine
from shopify.models import get_all_themes, get_theme_versions, get_latest_market_research

logger = logging.getLogger(__name__)
router = APIRouter()


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
