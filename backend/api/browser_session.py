"""
OmniBot — Browser Session Telemetry

Provides real-time streaming of browser frames (screenshots) and logs over WebSockets.
"""

import logging
from typing import Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()


class BrowserSessionManager:
    """Manages active WebSocket connections for live browser telemetry."""

    def __init__(self):
        self._connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self._connections.add(websocket)
        logger.info("WebSocket connected for browser telemetry (total: %d)", len(self._connections))

    def disconnect(self, websocket: WebSocket):
        self._connections.discard(websocket)

    async def broadcast_frame(self, base64_image: str):
        """Send base64-encoded JPEG image frame to all connected clients."""
        if not self._connections:
            return
        dead_connections = set()
        for ws in self._connections:
            try:
                await ws.send_json({"type": "frame", "data": base64_image})
            except Exception:
                dead_connections.add(ws)
        for ws in dead_connections:
            self.disconnect(ws)

    async def broadcast_log(self, text: str):
        """Send live terminal log message to all connected clients."""
        if not self._connections:
            return
        dead_connections = set()
        for ws in self._connections:
            try:
                await ws.send_json({"type": "log", "data": text})
            except Exception:
                dead_connections.add(ws)
        for ws in dead_connections:
            self.disconnect(ws)


# Singleton manager
browser_session_mgr = BrowserSessionManager()


@router.websocket("/live")
async def websocket_browser_live(websocket: WebSocket):
    """WebSocket endpoint for browser video and log streaming."""
    await browser_session_mgr.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        browser_session_mgr.disconnect(websocket)
        logger.info("WebSocket disconnected for browser telemetry")
