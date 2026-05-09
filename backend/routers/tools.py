import json
from pathlib import Path
from fastapi import APIRouter
from tools.registry import get_tool_metadata, get_tool_definitions, TOOL_ICONS
from tools.executor import _LOG_FILE

router = APIRouter()


@router.get("")
@router.get("/")
async def list_tools():
    """Return all available tools with metadata."""
    return {"tools": get_tool_metadata()}


@router.get("/schemas")
async def tool_schemas():
    """Return full JSON Schema definitions for all tools."""
    return {"tools": get_tool_definitions()}


@router.get("/log")
async def tool_log(limit: int = 20):
    """Return the last N tool execution log entries."""
    if not _LOG_FILE.exists():
        return {"entries": []}
    lines = []
    try:
        with open(_LOG_FILE, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try:
                        lines.append(json.loads(line))
                    except Exception:
                        pass
    except Exception:
        pass
    return {"entries": list(reversed(lines[-limit:]))}


@router.get("/stats")
async def tool_stats():
    """Return aggregate tool usage stats for the Neuro stream."""
    if not _LOG_FILE.exists():
        return {"total_calls": 0, "by_tool": {}, "avg_ms": 0}
    entries = []
    try:
        with open(_LOG_FILE, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try:
                        entries.append(json.loads(line))
                    except Exception:
                        pass
    except Exception:
        pass
    by_tool: dict = {}
    total_ms = 0
    for e in entries:
        name = e.get("tool", "unknown")
        by_tool[name] = by_tool.get(name, 0) + 1
        total_ms += e.get("ms", 0)
    avg_ms = round(total_ms / len(entries)) if entries else 0
    return {"total_calls": len(entries), "by_tool": by_tool, "avg_ms": avg_ms}
