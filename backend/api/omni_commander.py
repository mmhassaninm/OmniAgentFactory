"""
Omni Commander — API Router

FastAPI endpoints for initiating natural language execution plans,
submitting safety confirmations, handling file uploads, querying historical session lists,
and establishing real-time WebSocket progress channels.
"""

import base64
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.database import get_db
from core.omni_commander.orchestrator import get_commander_orchestrator, ws_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/commander", tags=["Omni Commander"])


class ConfirmationBody(BaseModel):
    session_id: str
    approve: bool


# ── 1. SSE CHAT PIPELINE ──────────────────────────────────────────────────

@router.post("/chat")
async def chat_endpoint(
    prompt: str = Form(...),
    session_id: str = Form(...),
    files: Optional[List[UploadFile]] = File(None)
):
    """
    Primary chat entrypoint.
    Interprets natural language and streams execution telemetry as Server-Sent Events.
    """
    orchestrator = get_commander_orchestrator()
    
    # Process uploaded files to inline base64 data payloads
    parsed_files = []
    if files:
        for f in files:
            content_bytes = await f.read()
            b64_content = base64.b64encode(content_bytes).decode("utf-8")
            parsed_files.append({
                "filename": f.filename,
                "content_type": f.content_type,
                "base64": b64_content,
                "size_bytes": len(content_bytes)
            })
            
    async def sse_generator():
        try:
            async for event in orchestrator.execute_prompt_stream(prompt, session_id, parsed_files):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            logger.exception("SSE pipeline uncaught exception")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")


# ── 2. SSE CONFIRM PIPELINE ───────────────────────────────────────────────

@router.post("/confirm")
async def confirm_endpoint(body: ConfirmationBody):
    """Resume execution pipeline after a confirmation approval or cancel."""
    orchestrator = get_commander_orchestrator()
    
    async def sse_generator():
        try:
            async for event in orchestrator.resume_step_execution(body.session_id, body.approve):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            logger.exception("SSE confirmation resume error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")


# ── 3. SESSION CRUD ────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions():
    """List historical commander sessions with recent activity summaries."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
        
    cursor = db.commander_sessions.find().sort("updated_at", -1)
    sessions = []
    
    async for doc in cursor:
        messages = doc.get("messages", [])
        last_message = messages[-1].get("content", "") if messages else "Empty session"
        
        sessions.append({
            "id": doc["_id"],
            "status": doc.get("status", "active"),
            "last_message": last_message[:60] + "..." if len(last_message) > 60 else last_message,
            "created_at": doc.get("created_at", datetime.utcnow()).isoformat() if hasattr(doc.get("created_at"), "isoformat") else str(doc.get("created_at")),
            "updated_at": doc.get("updated_at", datetime.utcnow()).isoformat() if hasattr(doc.get("updated_at"), "isoformat") else str(doc.get("updated_at")),
            "step_count": len(doc.get("active_plan", {}).get("steps", [])) if doc.get("active_plan") else 0
        })
        
    return sessions


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Retrieve full messages detail and plans of a single session."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
        
    doc = await db.commander_sessions.find_one({"_id": session_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # Standardize output
    doc["id"] = doc.pop("_id")
    for key in ("created_at", "updated_at"):
        if key in doc and hasattr(doc[key], "isoformat"):
            doc[key] = doc[key].isoformat()
            
    return doc


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete session history."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
        
    res = await db.commander_sessions.delete_one({"_id": session_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return {"ok": True}


# ── 4. WEB CONNECTION CHANNELS ─────────────────────────────────────────────

# Websocket endpoint must be mounted directly on app, but we can declare it here as a routing wrapper
# or use in FastAPI router. Note that prefix "/api/commander" makes WS mount on "/api/commander/ws/{session_id}".
# We can register the WS path explicitly on this router.
@router.websocket("/ws/{session_id}")
async def ws_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket route for real-time progress percentages and log tracking."""
    await ws_manager.connect(session_id, websocket)
    try:
        while True:
            # Sockets stay open to receive updates.
            # Client can also send cancel frames if required.
            data = await websocket.receive_text()
            logger.debug("Received frame from WS client %s: %s", session_id, data)
            
    except WebSocketDisconnect:
        ws_manager.disconnect(session_id, websocket)
    except Exception as e:
        logger.warning("WebSocket exception for %s: %s", session_id, e)
        ws_manager.disconnect(session_id, websocket)
