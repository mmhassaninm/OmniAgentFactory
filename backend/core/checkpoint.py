"""
OmniBot — Checkpoint-Commit System (System 2)

Three-phase evolution cycle: DRAFT → TEST → COMMIT
With automatic rollback on crash and full version archaeology.
"""

import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

from core.database import get_db

logger = logging.getLogger(__name__)


# ── Snapshot Status ─────────────────────────────────────────────────────────

class SnapshotStatus:
    DRAFT = "draft"
    TESTING = "testing"
    COMMITTED = "committed"
    FAILED = "failed"
    PAUSED_SAFE = "paused_safe"
    PAUSED_UNSAFE = "paused_unsafe"


# ── Checkpoint Operations ───────────────────────────────────────────────────

async def checkpoint_draft(
    agent_id: str,
    agent_code: str,
    agent_config: dict,
    current_score: float = 0.0,
) -> str:
    """
    Phase 1: Save a DRAFT snapshot before evolution begins.
    Returns the snapshot_id.
    """
    db = get_db()
    version = await _get_next_version(agent_id)

    snapshot = {
        "agent_id": agent_id,
        "version": version,
        "status": SnapshotStatus.DRAFT,
        "agent_code": agent_code,
        "agent_config": agent_config,
        "performance_score": current_score,
        "timestamp": datetime.now(),
        "commit_message": f"Draft v{version} — evolution attempt",
    }

    result = await db.snapshots.insert_one(snapshot)
    logger.info("Checkpoint DRAFT: agent=%s v%d", agent_id, version)
    return str(result.inserted_id)


async def checkpoint_testing(agent_id: str) -> bool:
    """
    Phase 2: Update the latest draft to TESTING status.
    Returns True if successful.
    """
    db = get_db()

    latest_draft = await db.snapshots.find_one(
        {"agent_id": agent_id, "status": SnapshotStatus.DRAFT},
        sort=[("version", -1)],
    )

    if latest_draft:
        await db.snapshots.update_one(
            {"_id": latest_draft["_id"]},
            {"$set": {"status": SnapshotStatus.TESTING, "timestamp": datetime.now()}},
        )
        logger.info("Checkpoint TESTING: agent=%s v%d", agent_id, latest_draft["version"])
        return True

    logger.warning("Checkpoint TESTING failed: no draft found for agent=%s", agent_id)
    return False


async def checkpoint_commit(
    agent_id: str,
    new_code: str,
    new_score: float,
    commit_message: str = "",
) -> int:
    """
    Phase 3: COMMIT — only called if test passed.
    Updates the snapshot to committed status with new code and score.
    Returns the committed version number.
    """
    db = get_db()

    # Find the latest testing/draft snapshot
    snapshot = await db.snapshots.find_one(
        {
            "agent_id": agent_id,
            "status": {"$in": [SnapshotStatus.TESTING, SnapshotStatus.DRAFT]},
        },
        sort=[("version", -1)],
    )

    if not snapshot:
        # No in-progress snapshot — create a fresh commit
        version = await _get_next_version(agent_id)
        snapshot = {
            "agent_id": agent_id,
            "version": version,
            "status": SnapshotStatus.COMMITTED,
            "agent_code": new_code,
            "agent_config": {},
            "performance_score": new_score,
            "timestamp": datetime.now(),
            "commit_message": commit_message or f"Direct commit v{version}",
        }
        await db.snapshots.insert_one(snapshot)
        logger.info("Checkpoint COMMIT (fresh): agent=%s v%d score=%.2f", agent_id, version, new_score)
        return version

    version = snapshot["version"]
    await db.snapshots.update_one(
        {"_id": snapshot["_id"]},
        {
            "$set": {
                "status": SnapshotStatus.COMMITTED,
                "agent_code": new_code,
                "performance_score": new_score,
                "timestamp": datetime.now(),
                "commit_message": commit_message or f"Evolved to v{version} — score {new_score:.2f}",
            }
        },
    )

    # Update the agent's main record
    await db.agents.update_one(
        {"id": agent_id},
        {
            "$set": {
                "version": version,
                "score": new_score,
                "updated_at": datetime.now(),
            }
        },
    )

    logger.info("Checkpoint COMMIT: agent=%s v%d score=%.2f", agent_id, version, new_score)
    return version


async def checkpoint_rollback(agent_id: str) -> Optional[dict]:
    """
    Rollback to the last COMMITTED snapshot.
    Marks any draft/testing snapshots as FAILED.
    Returns the last committed snapshot or None.
    """
    db = get_db()

    # Mark all non-committed snapshots as failed
    await db.snapshots.update_many(
        {
            "agent_id": agent_id,
            "status": {"$in": [SnapshotStatus.DRAFT, SnapshotStatus.TESTING]},
        },
        {"$set": {"status": SnapshotStatus.FAILED, "timestamp": datetime.now()}},
    )

    # Get last committed version
    last_commit = await db.snapshots.find_one(
        {"agent_id": agent_id, "status": SnapshotStatus.COMMITTED},
        sort=[("version", -1)],
    )

    if last_commit:
        # Restore the agent to last committed state
        await db.agents.update_one(
            {"id": agent_id},
            {
                "$set": {
                    "version": last_commit["version"],
                    "score": last_commit["performance_score"],
                    "status": "idle",
                    "updated_at": datetime.now(),
                }
            },
        )
        logger.info(
            "Checkpoint ROLLBACK: agent=%s → v%d (score %.2f)",
            agent_id, last_commit["version"], last_commit["performance_score"],
        )
        return last_commit

    logger.warning("Checkpoint ROLLBACK: no committed version found for agent=%s", agent_id)
    return None


# ── Crash Recovery ──────────────────────────────────────────────────────────

async def recover_agent(agent_id: str) -> Optional[dict]:
    """
    Called on startup: if an agent has draft/testing snapshots,
    it means the process was killed mid-cycle. Rollback to last commit.
    """
    db = get_db()

    # Check for incomplete snapshots
    incomplete = await db.snapshots.find_one(
        {
            "agent_id": agent_id,
            "status": {"$in": [SnapshotStatus.DRAFT, SnapshotStatus.TESTING]},
        }
    )

    if incomplete:
        logger.warning(
            "Crash recovery: agent=%s has incomplete snapshot (status=%s v%d) — rolling back",
            agent_id, incomplete["status"], incomplete["version"],
        )
        return await checkpoint_rollback(agent_id)

    return None


async def recover_all_agents():
    """Recover all agents on startup."""
    db = get_db()
    agents = await db.agents.find({}).to_list(length=1000)
    recovered = 0
    for agent in agents:
        result = await recover_agent(agent["id"])
        if result:
            recovered += 1
    if recovered:
        logger.info("Crash recovery completed: %d agents rolled back", recovered)
    else:
        logger.info("Crash recovery: all agents clean, no rollbacks needed")


# ── Version History (Archaeology Archive) ───────────────────────────────────

async def get_latest_commit(agent_id: str) -> Optional[dict]:
    """Return the last committed snapshot for an agent."""
    db = get_db()
    snapshot = await db.snapshots.find_one(
        {"agent_id": agent_id, "status": SnapshotStatus.COMMITTED},
        sort=[("version", -1)],
    )
    if snapshot:
        snapshot["_id"] = str(snapshot["_id"])
    return snapshot


async def get_version_history(agent_id: str, limit: int = 10) -> List[dict]:
    """Return the last N committed versions for archaeology."""
    db = get_db()
    cursor = db.snapshots.find(
        {"agent_id": agent_id, "status": SnapshotStatus.COMMITTED},
        sort=[("version", -1)],
    ).limit(limit)

    versions = []
    async for snapshot in cursor:
        snapshot["_id"] = str(snapshot["_id"])
        versions.append(snapshot)
    return versions


async def get_all_snapshots(agent_id: str, limit: int = 50) -> List[dict]:
    """Return all snapshots (including failed) for debugging."""
    db = get_db()
    cursor = db.snapshots.find(
        {"agent_id": agent_id},
        sort=[("version", -1)],
    ).limit(limit)

    snapshots = []
    async for s in cursor:
        s["_id"] = str(s["_id"])
        snapshots.append(s)
    return snapshots


# ── Internal Helpers ────────────────────────────────────────────────────────

async def _get_next_version(agent_id: str) -> int:
    """Get the next version number for an agent."""
    db = get_db()
    latest = await db.snapshots.find_one(
        {"agent_id": agent_id},
        sort=[("version", -1)],
    )
    return (latest["version"] + 1) if latest else 1
