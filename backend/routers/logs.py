import os
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from services.log_manager import log_manager

router = APIRouter()

@router.get("/sessions", response_model=List[dict])
async def list_sessions(
    limit: int = Query(50, description="Max sessions to return"),
    agent: Optional[str] = Query(None, description="Filter by agent name"),
    status: Optional[str] = Query(None, description="Filter by session status"),
    start_date: Optional[str] = Query(None, description="Filter starting at ISO8601 date string"),
    end_date: Optional[str] = Query(None, description="Filter ending at ISO8601 date string")
):
    """List logging sessions from the master index with optional filters (agent, status, date range, limit)."""
    try:
        sessions = log_manager.list_sessions(limit=limit, agent=agent, status=status)
        
        # Apply optional date range filtering
        if start_date or end_date:
            filtered = []
            for s in sessions:
                started_at_str = s.get("started_at")
                if not started_at_str:
                    continue
                try:
                    started_at = datetime.fromisoformat(started_at_str)
                    
                    if start_date:
                        sd = datetime.fromisoformat(start_date)
                        if started_at < sd:
                            continue
                            
                    if end_date:
                        ed = datetime.fromisoformat(end_date)
                        if started_at > ed:
                            continue
                            
                    filtered.append(s)
                except ValueError:
                    # Ignore invalid timestamp formats during comparison
                    pass
            return filtered[:limit]
            
        return sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list sessions: {str(e)}")

@router.get("/sessions/{session_id}", response_model=dict)
async def get_session_detail(session_id: str):
    """Retrieve full details of a specific logging session."""
    try:
        return log_manager.get_session(session_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve session: {str(e)}")

@router.get("/sessions/{session_id}/events", response_model=List[dict])
async def get_session_events(
    session_id: str,
    level: Optional[str] = Query(None, description="Filter events by level (INFO, WARNING, ERROR, CRITICAL)")
):
    """Retrieve event logs only for a specific session, with optional level filter."""
    try:
        session = log_manager.get_session(session_id)
        events = session.get("events", [])
        
        if level:
            level_upper = level.upper()
            events = [e for e in events if e.get("level") == level_upper]
            
        return events
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve session events: {str(e)}")

@router.get("/index", response_model=dict)
async def get_index():
    """Returns the full master INDEX.json structure."""
    try:
        return log_manager._read_index()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read index: {str(e)}")

@router.get("/export/{session_id}")
async def export_session(session_id: str):
    """Download a session as a raw JSON file."""
    try:
        file_path = log_manager._get_session_path(session_id)
        filename = os.path.basename(file_path)
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type="application/json"
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export session: {str(e)}")
