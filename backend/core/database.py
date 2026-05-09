"""
OmniBot — MongoDB async connection layer.
Uses Motor (async pymongo) with automatic retry and collection setup.
"""

import logging
import asyncio
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from core.config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


async def connect_db(max_retries: int = 10, retry_delay: float = 10.0) -> AsyncIOMotorDatabase:
    """
    Connect to MongoDB with retry loop.
    Never raises — retries indefinitely until connected.
    """
    global _client, _db
    settings = get_settings()

    for attempt in range(1, max_retries + 1):
        try:
            _client = AsyncIOMotorClient(
                settings.mongodb_uri,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
            )
            # Force a connection test
            await _client.admin.command("ping")
            _db = _client[settings.mongodb_db]
            logger.info("MongoDB connected: %s/%s", settings.mongodb_uri, settings.mongodb_db)

            # Create indexes
            await _setup_indexes(_db)
            return _db

        except Exception as e:
            logger.warning(
                "MongoDB connection attempt %d/%d failed: %s — retrying in %.0fs",
                attempt, max_retries, e, retry_delay,
            )
            if attempt < max_retries:
                await asyncio.sleep(retry_delay)

    # If we exhaust retries, keep trying forever
    logger.error("MongoDB connection failed after %d retries — entering infinite retry", max_retries)
    while True:
        try:
            _client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
            await _client.admin.command("ping")
            _db = _client[settings.mongodb_db]
            logger.info("MongoDB connected after extended retry")
            await _setup_indexes(_db)
            return _db
        except Exception:
            await asyncio.sleep(retry_delay)


async def _setup_indexes(db: AsyncIOMotorDatabase):
    """Create indexes for all collections."""
    # agents: unique id
    await db.agents.create_index("id", unique=True)
    await db.agents.create_index("status")

    # snapshots: agent_id + version compound, latest lookup
    await db.snapshots.create_index([("agent_id", 1), ("version", -1)])
    await db.snapshots.create_index([("agent_id", 1), ("status", 1)])

    # thoughts: agent timeline
    await db.thoughts.create_index([("agent_id", 1), ("timestamp", -1)])

    # skills: unique name
    await db.skills.create_index("name", unique=True)

    # model_stats: provider + key hash
    await db.model_stats.create_index([("provider", 1), ("key_hash", 1)], unique=True)

    # economy: agent_id
    await db.economy.create_index("agent_id", unique=True)

    logger.info("MongoDB indexes created/verified for all 6 collections")


def get_db() -> AsyncIOMotorDatabase:
    """Return the current database connection. Must call connect_db() first."""
    if _db is None:
        raise RuntimeError("Database not initialized — call connect_db() during startup")
    return _db


async def check_db_health() -> bool:
    """Quick health check — returns True if MongoDB is reachable."""
    if _client is None:
        return False
    try:
        await _client.admin.command("ping")
        return True
    except Exception:
        return False


async def close_db():
    """Gracefully close the MongoDB connection."""
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB connection closed")
