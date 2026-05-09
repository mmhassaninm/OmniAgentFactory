"""
OmniBot — WebSocket Real-time Streaming

Provides live thought streaming for agents and factory-wide events.
Endpoints:
  /ws/thoughts/{agent_id}  — Stream thoughts for a specific agent
  /ws/factory              — Stream factory-wide events
"""

import json
import logging
from datetime import datetime
from typing import Dict, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from utils.thought_logger import set_broadcast_function

logger = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections for thought streaming."""

    def __init__(self):
        # agent_id → set of connected websockets
        self._agent_connections: Dict[str, Set[WebSocket]] = {}
        # Factory-wide connections
        self._factory_connections: Set[WebSocket] = set()

    async def connect_agent(self, agent_id: str, websocket: WebSocket):
        await websocket.accept()
        if agent_id not in self._agent_connections:
            self._agent_connections[agent_id] = set()
        self._agent_connections[agent_id].add(websocket)
        logger.info("WebSocket connected for agent %s (total: %d)",
                     agent_id, len(self._agent_connections[agent_id]))

    async def connect_factory(self, websocket: WebSocket):
        await websocket.accept()
        self._factory_connections.add(websocket)
        logger.info("WebSocket connected for factory (total: %d)",
                     len(self._factory_connections))

    def disconnect_agent(self, agent_id: str, websocket: WebSocket):
        if agent_id in self._agent_connections:
            self._agent_connections[agent_id].discard(websocket)
            if not self._agent_connections[agent_id]:
                del self._agent_connections[agent_id]

    def disconnect_factory(self, websocket: WebSocket):
        self._factory_connections.discard(websocket)

    async def broadcast_to_agent(self, agent_id: str, data: dict):
        """Send data to all connections watching a specific agent."""
        connections = self._agent_connections.get(agent_id, set())
        dead_connections = set()

        for ws in connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead_connections.add(ws)

        # Clean up dead connections
        for ws in dead_connections:
            self.disconnect_agent(agent_id, ws)

        # Also broadcast to factory watchers
        await self.broadcast_to_factory(data)

    async def broadcast_to_factory(self, data: dict):
        """Send data to all factory-wide connections."""
        dead_connections = set()

        for ws in self._factory_connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead_connections.add(ws)

        for ws in dead_connections:
            self.disconnect_factory(ws)

    @property
    def total_connections(self) -> int:
        agent_conns = sum(len(s) for s in self._agent_connections.values())
        return agent_conns + len(self._factory_connections)


# ── Singleton ───────────────────────────────────────────────────────────────

manager = ConnectionManager()


async def _broadcast_thought(agent_id: str, data: dict):
    """Bridge function registered with thought_logger."""
    await manager.broadcast_to_agent(agent_id, data)


# Register the broadcast function with the thought logger
set_broadcast_function(_broadcast_thought)


# ── WebSocket Endpoints ────────────────────────────────────────────────────

@router.websocket("/thoughts/{agent_id}")
async def websocket_agent_thoughts(websocket: WebSocket, agent_id: str):
    """Stream real-time thoughts for a specific agent."""
    await manager.connect_agent(agent_id, websocket)
    try:
        while True:
            # Keep connection alive — listen for pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong", "timestamp": datetime.now().isoformat()})
    except WebSocketDisconnect:
        manager.disconnect_agent(agent_id, websocket)
        logger.info("WebSocket disconnected for agent %s", agent_id)


@router.websocket("/factory")
async def websocket_factory(websocket: WebSocket):
    """Stream factory-wide events (all agents)."""
    await manager.connect_factory(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong", "timestamp": datetime.now().isoformat()})
    except WebSocketDisconnect:
        manager.disconnect_factory(websocket)
        logger.info("WebSocket disconnected for factory viewer")
