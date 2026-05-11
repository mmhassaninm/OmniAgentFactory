"""
Migration 001: Initial DB collections check.
Makes sure any custom index pattern or collection setup is completed.
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)


async def upgrade(db: AsyncIOMotorDatabase) -> None:
    """Setup initial custom settings or collection checks."""
    logger.info("[Migration 001] Setup initial migration configurations...")
    
    # Check if we have any default settings in settings collection
    settings_col = db["settings"]
    default_config = await settings_col.find_one({"id": "global"})
    
    if not default_config:
        logger.info("[Migration 001] Seeding default settings document...")
        await settings_col.insert_one({
            "id": "global",
            "active_provider": "lm_studio",
            "self_evolution_enabled": False,
            "provider_configs": {}
        })
    else:
        logger.info("[Migration 001] Default settings document already exists.")
