"""
OmniAgentFactory — Task Queue Archival System

Daily job: move tasks older than 30 days from task_history to JSON archive files.
Archives stored in: backend/autonomous_logs/task_archive_YYYY-MM.json
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path

from core.database import get_db
from core.task_queue_engine import COLLECTION_HISTORY

logger = logging.getLogger(__name__)

# Archive directory
ARCHIVE_DIR = Path("backend/autonomous_logs")
ARCHIVE_RETENTION_DAYS = 30


async def archive_old_tasks(dry_run: bool = False) -> dict:
    """
    Move tasks older than ARCHIVE_RETENTION_DAYS from task_history to JSON archive.
    Returns stats dict.
    """
    db = get_db()
    cutoff = datetime.utcnow() - timedelta(days=ARCHIVE_RETENTION_DAYS)
    archive_month = cutoff.strftime("%Y-%m")
    archive_path = ARCHIVE_DIR / f"task_archive_{archive_month}.json"

    # Find old completed/failed/cancelled tasks
    old_tasks = await db[COLLECTION_HISTORY].find({
        "completed_at": {"$lt": cutoff},
    }).to_list(10000)

    if not old_tasks:
        logger.info("No tasks older than %d days to archive", ARCHIVE_RETENTION_DAYS)
        return {"archived": 0, "archive_file": str(archive_path)}

    # Convert ObjectId to string for serialization
    for t in old_tasks:
        if "_id" in t:
            t["_id"] = str(t["_id"])

    if dry_run:
        logger.info("[DRY RUN] Would archive %d tasks to %s", len(old_tasks), archive_path)
        return {"archived": 0, "would_archive": len(old_tasks), "archive_file": str(archive_path)}

    # Load existing archive or create new
    existing = []
    if archive_path.exists():
        try:
            with open(archive_path, "r", encoding="utf-8") as f:
                existing = json.load(f)
                if not isinstance(existing, list):
                    existing = [existing]
        except (json.JSONDecodeError, Exception) as e:
            logger.warning("Corrupt archive file %s: %s — overwriting", archive_path, e)
            existing = []

    # Append old tasks
    existing.extend(old_tasks)

    # Write archive
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    with open(archive_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2, default=str)

    # Delete archived tasks from MongoDB
    delete_result = await db[COLLECTION_HISTORY].delete_many({
        "completed_at": {"$lt": cutoff},
    })

    logger.info("Archived %d tasks to %s (deleted %d from MongoDB)",
                 len(old_tasks), archive_path, delete_result.deleted_count)

    return {
        "archived": len(old_tasks),
        "deleted_from_db": delete_result.deleted_count,
        "archive_file": str(archive_path),
        "total_in_archive": len(existing),
    }


async def get_archive_files() -> list:
    """Get list of available archive files."""
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    for f in sorted(ARCHIVE_DIR.glob("task_archive_*.json")):
        try:
            size = f.stat().st_size
            files.append({
                "filename": f.name,
                "path": str(f),
                "size_bytes": size,
                "size_mb": round(size / (1024 * 1024), 2),
            })
        except Exception as e:
            logger.debug("Error reading archive file %s: %s", f, e)
    return files


async def load_archive(month: str) -> list:
    """
    Load archived tasks for a specific month.
    month format: YYYY-MM (e.g. "2026-04")
    """
    archive_path = ARCHIVE_DIR / f"task_archive_{month}.json"
    if not archive_path.exists():
        logger.warning("Archive file not found: %s", archive_path)
        return []
    try:
        with open(archive_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else [data]
    except (json.JSONDecodeError, Exception) as e:
        logger.error("Failed to load archive %s: %s", archive_path, e)
        return []


async def run_daily_archive():
    """Run the daily archive job (call from scheduler)."""
    logger.info("Running daily task archive job...")
    result = await archive_old_tasks()
    logger.info("Daily archive complete: %s", result)
    return result