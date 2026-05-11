"""
Lightweight MongoDB Migration Runner for OmniBot.
Tracks and applies versioned migration scripts stored in backend/migrations/.
"""
import os
import importlib.util
import logging
from pathlib import Path
from typing import List
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent


async def run_migrations(db: AsyncIOMotorDatabase) -> None:
    """Scan and run all pending migrations sequentially."""
    logger.info("[MigrationRunner] Initializing schema migration check...")
    
    # 1. Create migrations history collection if not exists
    history_col = db["migrations_history"]
    
    # 2. Get list of already applied migrations
    applied_cursor = history_col.find({}, {"version": 1})
    applied_versions = {doc["version"] async for doc in applied_cursor}
    
    # 3. Find and sort migration files (e.g. 001_xxx.py, 002_xxx.py)
    migration_files = sorted(
        [f for f in MIGRATIONS_DIR.glob("*.py") if f.name[0].isdigit() and "_" in f.name]
    )
    
    if not migration_files:
        logger.info("[MigrationRunner] No migration files found.")
        return

    logger.info(f"[MigrationRunner] Found {len(migration_files)} total migrations. checking pending...")
    
    # 4. Execute pending migrations sequentially
    applied_count = 0
    for filepath in migration_files:
        # Extract version string (e.g. "001")
        version = filepath.name.split("_")[0]
        
        if version in applied_versions:
            logger.debug(f"[MigrationRunner] Migration {filepath.name} already applied. Skipping.")
            continue
            
        logger.info(f"[MigrationRunner] Applying migration: {filepath.name}...")
        
        try:
            # Dynamically import the migration module
            spec = importlib.util.spec_from_file_location(filepath.stem, filepath)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            
            # Run the migration's 'upgrade' function
            if not hasattr(module, "upgrade"):
                raise AttributeError(f"Migration script {filepath.name} is missing 'upgrade' function.")
                
            await module.upgrade(db)
            
            # Record migration in history collection
            from datetime import datetime
            await history_col.insert_one({
                "version": version,
                "name": filepath.name,
                "applied_at": datetime.now(),
                "status": "success"
            })
            
            logger.info(f"[MigrationRunner] Successfully applied migration: {filepath.name}")
            applied_count += 1
            
        except Exception as exc:
            logger.error(f"[MigrationRunner] CRITICAL: Migration {filepath.name} failed: {exc}", exc_info=True)
            # Re-record failed migration attempt to help debugging
            from datetime import datetime
            await history_col.insert_one({
                "version": version,
                "name": filepath.name,
                "applied_at": datetime.now(),
                "status": "failed",
                "error": str(exc)
            })
            raise exc

    if applied_count > 0:
        logger.info(f"[MigrationRunner] Database schema is up to date. Applied {applied_count} migrations.")
    else:
        logger.info("[MigrationRunner] Database schema is already up to date. Zero pending migrations.")
