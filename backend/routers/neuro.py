import asyncio
import json
from pathlib import Path
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from services.ai_service import sleep_wake_controller

router = APIRouter()

_TOOLS_LOG = Path(__file__).parent.parent / "logs" / "tools_log.jsonl"


def _get_tool_stats() -> dict:
    if not _TOOLS_LOG.exists():
        return {"total_calls": 0, "session_calls": 0}
    try:
        lines = _TOOLS_LOG.read_text(encoding="utf-8").strip().splitlines()
        return {"total_calls": len(lines), "session_calls": len(lines)}
    except Exception:
        return {"total_calls": 0, "session_calls": 0}


async def neuro_stream_generator(request: Request):
    """
    SSE Generator for the Cortex Neuro-Monitor HUD.
    Broadcasts state, CPU load, queue length, active tasks, and tool usage stats.
    """
    print("[Neuro Router] 🧠 Client connected to Neuro Stream.", flush=True)

    try:
        while True:
            if await request.is_disconnected():
                break

            data = await sleep_wake_controller.broadcast_status()
            data["tool_stats"] = _get_tool_stats()

            yield f"event: cortex:neuro_stream\ndata: {json.dumps(data)}\n\n"
            await asyncio.sleep(2)

    except asyncio.CancelledError:
        print("[Neuro Router] 🧠 Neuro Stream cancelled.", flush=True)


@router.get("/stream")
async def get_neuro_stream(request: Request):
    return StreamingResponse(
        neuro_stream_generator(request),
        media_type="text/event-stream"
    )
