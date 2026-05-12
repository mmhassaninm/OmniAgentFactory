"""
AI Model Hub API — Complete AI Health & Usage Monitoring Endpoints
Provides real-time provider health, telemetry, quota alerts, and historical data.
Integrates with existing ModelHub and WebSocket systems.

Endpoints:
  GET  /api/ai-hub/providers          — List all providers with current status
  GET  /api/ai-hub/providers/{name}   — Single provider detail + full quota
  GET  /api/ai-hub/telemetry          — Last N calls (default 20), filterable
  GET  /api/ai-hub/summary            — Aggregated stats (total calls, tokens, cost)
  GET  /api/ai-hub/quota-alerts       — Active quota warnings
  POST /api/ai-hub/force-sync         — Trigger immediate health check
  GET  /api/ai-hub/history            — Historical usage charts data (last 7 days)
  WS   /ws/ai-hub/stream              — Real-time telemetry stream
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from services.ai_health_monitor import get_ai_health_monitor, PROVIDER_MANIFEST

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai-hub", tags=["AI Model Hub"])

# WebSocket connections for /ws/ai-hub/stream
_ws_connections = set()


@router.get("/providers")
async def list_providers():
    """List all providers with current health status."""
    monitor = get_ai_health_monitor()
    return {"providers": monitor.get_configured_providers()}


@router.get("/providers/{name}")
async def get_provider_detail(name: str):
    """Get single provider detail + full quota."""
    monitor = get_ai_health_monitor()
    providers = monitor.get_configured_providers()
    provider = next((p for p in providers if p["name"] == name), None)
    if not provider:
        # Return manifest info even if not configured
        manifest = PROVIDER_MANIFEST.get(name)
        if manifest:
            return {
                "name": name,
                "display_name": manifest["name"],
                "configured": False,
                "models": manifest["models"],
                "tool_calling": manifest["tool_calling"],
                "type": manifest["type"],
            }
        return {"error": f"Provider '{name}' not found"}, 404
    return provider


@router.get("/telemetry")
async def get_telemetry(limit: int = Query(20, ge=1, le=200), provider: Optional[str] = None):
    """Get recent telemetry entries."""
    monitor = get_ai_health_monitor()
    entries = await monitor.get_telemetry(limit=limit, provider=provider)
    return {"telemetry": entries, "count": len(entries)}


@router.get("/summary")
async def get_summary():
    """Get aggregated health summary stats."""
    monitor = get_ai_health_monitor()
    summary = await monitor.get_summary()
    return summary


@router.get("/quota-alerts")
async def get_quota_alerts():
    """Get active quota warnings."""
    monitor = get_ai_health_monitor()
    alerts = await monitor.get_quota_alerts()
    return {"alerts": alerts, "count": len(alerts)}


@router.post("/force-sync")
async def force_sync():
    """Trigger immediate health check of all providers."""
    monitor = get_ai_health_monitor()
    results = await monitor.scan_all_providers()
    return {
        "status": "completed",
        "providers_checked": len(results),
        "results": results,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/history")
async def get_history(days: int = Query(7, ge=1, le=30)):
    """Get historical usage data for charts (last N days)."""
    monitor = get_ai_health_monitor()
    history = await monitor.get_history(days=days)
    return {"history": history, "days": days}


@router.websocket("/stream")
async def websocket_ai_hub_stream(websocket: WebSocket):
    """Real-time telemetry stream via WebSocket."""
    await websocket.accept()
    _ws_connections.add(websocket)
    logger.info(f"[AIHub WS] Client connected ({len(_ws_connections)} total)")

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
            elif data == "sync":
                # Client requested a force sync
                monitor = get_ai_health_monitor()
                results = await monitor.scan_all_providers()
                await websocket.send_json({
                    "type": "sync_complete",
                    "results": results,
                })
    except WebSocketDisconnect:
        _ws_connections.discard(websocket)
        logger.info(f"[AIHub WS] Client disconnected ({len(_ws_connections)} remaining)")


async def broadcast_telemetry(entry: dict):
    """Broadcast a telemetry entry to all WebSocket clients."""
    dead = set()
    for ws in _ws_connections:
        try:
            await ws.send_json({
                "type": "telemetry",
                "entry": entry,
            })
        except Exception:
            dead.add(ws)
    for ws in dead:
        _ws_connections.discard(ws)