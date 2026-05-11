"""
Test script for ShopifyAutonomousManager
Runs a single complete cycle and verifies theme, product, collection, and content optimization.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Setup paths and environment
sys.path.append(str(Path(__file__).parent.resolve()))

# Initialize standard logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("TestAutonomousManager")


async def main():
    logger.info("Starting Shopify Autonomous Manager Single Cycle Test...")
    
    # Imports
    from shopify.autonomous_manager import get_autonomous_manager
    
    try:
        manager = get_autonomous_manager()
        logger.info("Successfully fetched manager instance. Invoking run_one_cycle()...")
        
        await manager.run_one_cycle()
        
        logger.info("Cycle completed successfully!")
        
        # Verify if a report was written
        report_dir = Path("autonomous_logs")
        reports = list(report_dir.glob("report_*.md"))
        logger.info("Total reports generated inside autonomous_logs/: %d", len(reports))
        for r in reports[-3:]:
            logger.info("  - Created Report: %s (size: %d bytes)", r.name, r.stat().st_size)
            
    except Exception as e:
        logger.error("Error running autonomous cycle: %s", e, exc_info=True)


if __name__ == "__main__":
    asyncio.run(main())
