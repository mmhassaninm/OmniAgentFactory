"""
Agent Run Logger — Direction 8 of Phase 5 (Wildcard Feature).

Persists every agent run to MongoDB as a structured "replay document".
Each SSE event is stored as a timestamped step, so the entire run can be
replayed step-by-step from the frontend at any speed.

This feature does not exist in OpenHands, AutoGen, CrewAI, or any other
open-source agent framework today (as of 2026-05).

Schema (agent_runs collection):
{
  "_id": ObjectId,
  "run_id": str,          # UUID
  "task": str,
  "persona": str,
  "tools": [str],
  "provider": str,
  "model": str,
  "started_at": ISO str,
  "finished_at": ISO str | null,
  "status": "running" | "success" | "failed",
  "steps": [
    {
      "seq": int,
      "event": str,        # SSE event name
      "data": dict,
      "ts": ISO str,
      "delta_ms": int      # ms since previous step
    }
  ],
  "summary": str | null,  # final answer (populated on agent_finish)
  "iterations": int,
}
"""
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AgentRunLogger:
    """
    Captures every SSE event during an agent run and persists to MongoDB.
    Usage:
        run_log = AgentRunLogger(task, persona, tools, provider, model)
        await run_log.start()
        ...
        run_log.record(event_name, data_dict)
        ...
        await run_log.finish(success=True, summary="...")
    """

    def __init__(self, task: str, persona: str, tools: list[str], provider: str, model: str):
        self.run_id = str(uuid.uuid4())
        self.task = task
        self.persona = persona
        self.tools = tools
        self.provider = provider
        self.model = model
        self._steps: list[dict] = []
        self._seq = 0
        self._t0 = time.monotonic()
        self._prev_ts = self._t0
        self._doc_id: Optional[str] = None

    async def start(self) -> str:
        """Insert the initial run document and return the run_id."""
        try:
            from models.database import db
            doc = {
                "run_id": self.run_id,
                "task": self.task,
                "persona": self.persona,
                "tools": self.tools,
                "provider": self.provider,
                "model": self.model,
                "started_at": _now(),
                "finished_at": None,
                "status": "running",
                "steps": [],
                "summary": None,
                "iterations": 0,
            }
            result = await db.agent_runs.insert_one(doc)
            self._doc_id = str(result.inserted_id)
        except Exception as exc:
            logger.warning("[run_logger] start failed: %s", exc)
        return self.run_id

    def record(self, event: str, data: dict) -> None:
        """Capture a step. Non-blocking — appends in memory, flushed to DB on finish."""
        now = time.monotonic()
        delta_ms = int((now - self._prev_ts) * 1000)
        self._prev_ts = now
        self._seq += 1
        self._steps.append({
            "seq": self._seq,
            "event": event,
            "data": data,
            "ts": _now(),
            "delta_ms": delta_ms,
        })

    async def finish(self, success: bool = True, summary: Optional[str] = None, iterations: int = 0) -> None:
        """Persist all recorded steps to MongoDB."""
        try:
            from models.database import db
            from bson import ObjectId
            if not self._doc_id:
                return
            await db.agent_runs.update_one(
                {"_id": ObjectId(self._doc_id)},
                {"$set": {
                    "finished_at": _now(),
                    "status": "success" if success else "failed",
                    "steps": self._steps,
                    "summary": summary,
                    "iterations": iterations,
                }},
            )
            logger.info("[run_logger] Run %s persisted (%d steps)", self.run_id, len(self._steps))
        except Exception as exc:
            logger.warning("[run_logger] finish failed: %s", exc)


# ── REST helpers ──────────────────────────────────────────────────────────────

async def list_runs(limit: int = 30) -> list[dict]:
    """Return recent run metadata (no steps — steps are large)."""
    try:
        from models.database import db
        docs = await db.agent_runs.find(
            {}, {"steps": 0}
        ).sort("started_at", -1).limit(limit).to_list(length=limit)
        for d in docs:
            d["_id"] = str(d["_id"])
        return docs
    except Exception as exc:
        logger.warning("[run_logger] list_runs failed: %s", exc)
        return []


async def get_run(run_id: str) -> Optional[dict]:
    """Return a full run document including all steps."""
    try:
        from models.database import db
        doc = await db.agent_runs.find_one({"run_id": run_id})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc
    except Exception as exc:
        logger.warning("[run_logger] get_run failed: %s", exc)
        return None


async def delete_run(run_id: str) -> bool:
    try:
        from models.database import db
        result = await db.agent_runs.delete_one({"run_id": run_id})
        return result.deleted_count > 0
    except Exception:
        return False
