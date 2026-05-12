"""
Self-Evolution Scheduler

Schedules evolution_loop.run_one_cycle() to run periodically.
Controlled via environment variables:
- SELF_EVOLUTION_ENABLED=true/false (default: true)
- EVOLUTION_INTERVAL_HOURS=N (default: 6)
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

class EvolutionScheduler:
    def __init__(self, model_router=None, root_path: str = "."):
        self.model_router = model_router
        self.root_path = root_path
        self._task: Optional[asyncio.Task] = None
        self._running = False

        # Load config from environment
        self.enabled = os.getenv("SELF_EVOLUTION_ENABLED", "true").lower() == "true"
        try:
            self.interval_hours = float(os.getenv("EVOLUTION_INTERVAL_HOURS", "6"))
        except ValueError:
            self.interval_hours = 6

        logger.info(
            "Evolution Scheduler configured: enabled=%s, interval=%d hours",
            self.enabled, int(self.interval_hours)
        )

    def start(self) -> bool:
        """Start the scheduler."""
        if not self.enabled:
            logger.info("ℹ️ Self-Evolution disabled (set SELF_EVOLUTION_ENABLED=true to enable)")
            return False

        if self._running:
            logger.warning("Scheduler already running")
            return False

        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("✓ Evolution Scheduler started (interval: %d hours)", int(self.interval_hours))
        return True

    def stop(self) -> bool:
        """Stop the scheduler."""
        if not self._running:
            logger.warning("Scheduler not running")
            return False

        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None

        logger.info("✓ Evolution Scheduler stopped")
        return True

    async def _loop(self):
        """Main scheduler loop."""
        try:
            # 5-second warm-up sleep on start to let backend systems initialize fully
            await asyncio.sleep(5)

            # Optional run-on-startup config
            run_on_start = os.getenv("EVOLUTION_RUN_ON_STARTUP", "true").lower() == "true"
            if run_on_start and self._running:
                logger.info("🔄 Starting initial startup evolution cycle...")
                try:
                    await self._run_cycle()
                except Exception as e:
                    logger.error("Initial startup cycle failed: %s", e)

            while self._running:
                try:
                    # Calculate wait time in seconds
                    wait_seconds = int(self.interval_hours * 3600)

                    logger.info(
                        "Next evolution cycle scheduled in %d hours (%s)",
                        int(self.interval_hours),
                        (datetime.now() + timedelta(seconds=wait_seconds)).isoformat()
                    )

                    # Wait for interval
                    await asyncio.sleep(wait_seconds)

                    if not self._running:
                        break

                    # Run one cycle
                    logger.info("🔄 Starting scheduled evolution cycle")
                    await self._run_cycle()

                except asyncio.CancelledError:
                    logger.info("Evolution scheduler cancelled")
                    break
                except Exception as e:
                    logger.error("Scheduler error: %s", e)
                    # Continue running despite errors
                    await asyncio.sleep(60)  # Wait 1 minute before retry

        except Exception as e:
            logger.error("Scheduler crashed: %s", e)
            self._running = False

    async def _run_cycle(self):
        """Run one evolution cycle."""
        try:
            from .evolution_loop import get_evolution_loop

            if not self.model_router:
                logger.error("Model router not configured for evolution cycle")
                return

            loop = get_evolution_loop(self.model_router, self.root_path)
            result = await loop.run_one_cycle()

            if result.get("verified"):
                logger.info("✅ Evolution cycle succeeded: %s", result.get("item_implemented"))
            else:
                logger.warning("⚠️ Evolution cycle failed: %s", result.get("error"))

        except Exception as e:
            logger.error("Failed to run evolution cycle: %s", e)


# Singleton instance
_scheduler = None

def get_evolution_scheduler(model_router=None, root_path: str = ".") -> EvolutionScheduler:
    """Get or create scheduler singleton."""
    global _scheduler
    if _scheduler is None:
        _scheduler = EvolutionScheduler(model_router, root_path)
    return _scheduler

def start_evolution_scheduler(model_router=None, root_path: str = ".") -> bool:
    """Convenience function to start the scheduler."""
    scheduler = get_evolution_scheduler(model_router, root_path)
    return scheduler.start()

def stop_evolution_scheduler() -> bool:
    """Convenience function to stop the scheduler."""
    scheduler = get_evolution_scheduler()
    return scheduler.stop()
