"""
Shopify Theme Factory — Swarm Engine
Orchestrates the 7-agent production and improvement cycles.
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Optional

from shopify.models import SharedContext, save_theme, save_market_research

logger = logging.getLogger(__name__)

_engine_instance: Optional["ShopifySwarmEngine"] = None


def get_swarm_engine() -> "ShopifySwarmEngine":
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = ShopifySwarmEngine()
    return _engine_instance


class ShopifySwarmEngine:

    PRODUCTION_CYCLE = [
        "market_researcher",
        "creative_director",
        "ux_designer",
        "liquid_developer",
        "content_writer",
        "qa_reviewer",
        "shopify_builder",
        "version_manager",
    ]

    IMPROVEMENT_CYCLE = [
        "market_researcher",
        "version_manager",
        "ux_designer",
        "liquid_developer",
        "qa_reviewer",
        "shopify_builder",
        "version_manager",
    ]

    def __init__(self):
        self.running = False
        self.paused = False
        self.cycle_count = 0
        self.theme_count = 0
        self.current_agent: str = ""
        self.current_theme_name: str = ""
        self._task: Optional[asyncio.Task] = None
        self._broadcast_fn = None

        # Lazy-loaded agents
        self._agents: dict = {}

    def set_broadcast(self, fn):
        """Register the WebSocket broadcast function."""
        self._broadcast_fn = fn

    async def _broadcast(self, agent: str, status: str, message: str):
        if self._broadcast_fn:
            try:
                await self._broadcast_fn({
                    "type": "agent_update",
                    "agent": agent,
                    "status": status,
                    "message": message,
                    "cycle": self.cycle_count,
                    "theme_count": self.theme_count,
                    "current_theme": self.current_theme_name,
                    "timestamp": datetime.utcnow().isoformat(),
                })
            except Exception as e:
                logger.warning("Broadcast failed: %s", e)

    def _get_agent(self, name: str):
        if name not in self._agents:
            if name == "market_researcher":
                from shopify.agents.market_researcher import MarketResearcher
                self._agents[name] = MarketResearcher()
            elif name == "creative_director":
                from shopify.agents.creative_director import CreativeDirector
                self._agents[name] = CreativeDirector()
            elif name == "ux_designer":
                from shopify.agents.ux_designer import UXDesigner
                self._agents[name] = UXDesigner()
            elif name == "liquid_developer":
                from shopify.agents.liquid_developer import LiquidDeveloper
                self._agents[name] = LiquidDeveloper()
            elif name == "content_writer":
                from shopify.agents.content_writer import ContentWriter
                self._agents[name] = ContentWriter()
            elif name == "qa_reviewer":
                from shopify.agents.qa_reviewer import QAReviewer
                self._agents[name] = QAReviewer()
            elif name == "version_manager":
                from shopify.agents.version_manager import VersionManager
                self._agents[name] = VersionManager()
        return self._agents.get(name)

    async def _run_agent(self, name: str, context: SharedContext) -> dict:
        agent = self._get_agent(name)
        if not agent:
            logger.error("Unknown agent: %s", name)
            return {"status": "error", "summary": f"Unknown agent: {name}"}

        self.current_agent = name
        await self._broadcast(name, "running", f"Starting {name.replace('_', ' ').title()}...")

        try:
            if name == "shopify_builder":
                from shopify.tools.shopify_builder import ShopifyBuilder
                builder = ShopifyBuilder()
                package = await builder.build_theme(context)
                result = {
                    "status": "done",
                    "summary": f"Theme packaged: {package.zip_path}",
                    "zip_path": package.zip_path,
                    "qa_score": package.qa_score,
                }
            elif name == "version_manager":
                result = await agent.run(context)
            else:
                result = await agent.run(context)

            context.update(name, result)
            await self._broadcast(name, "done", result.get("summary", "Completed"))
            return result
        except Exception as e:
            logger.error("[%s] Error: %s", name, e)
            await self._broadcast(name, "error", f"Error: {e}")
            return {"status": "error", "summary": str(e)}

    async def run_production_cycle(self, db=None):
        context = SharedContext()
        context.theme_id = str(uuid.uuid4())
        context.version = "v1.0.0"

        logger.info("=== PRODUCTION CYCLE %d STARTED ===", self.cycle_count + 1)
        await self._broadcast("swarm", "cycle_start", f"Production cycle #{self.cycle_count + 1} started")

        for agent_name in self.PRODUCTION_CYCLE:
            if not self.running:
                break
            while self.paused and self.running:
                await asyncio.sleep(2)

            await self._run_agent(agent_name, context)

        if context.zip_path and db is not None:
            qa_score = 0.0
            if context.qa_report:
                qa_score = float(context.qa_report.get("score", 0))
            await save_theme(db, context, context.zip_path, qa_score)
            if context.market_report:
                await save_market_research(db, context.market_report)

        self.cycle_count += 1
        self.theme_count += 1
        self.current_theme_name = context.theme_name
        logger.info("=== PRODUCTION CYCLE COMPLETE: %s ===", context.theme_name)
        await self._broadcast("swarm", "cycle_done", f"Theme '{context.theme_name}' complete!")

    async def run_improvement_cycle(self, db=None):
        """Improve the most recent theme with a new version."""
        if not db:
            return
        try:
            # Load most recently created theme
            theme = await db.shopify_themes.find_one({}, sort=[("updated_at", -1)])
            if not theme:
                logger.info("No themes to improve yet")
                return

            context = SharedContext()
            context.theme_id = theme["_id"]
            context.theme_name = theme.get("name", "Unknown")
            context.niche = theme.get("niche", "")
            context.sell_price = float(theme.get("sell_price", 99))
            context.creative_brief = theme.get("creative_brief")
            # Load latest version
            latest_ver = await db.shopify_versions.find_one(
                {"theme_id": context.theme_id},
                sort=[("created_at", -1)],
            )
            context.version = latest_ver.get("version", "v1.0.0") if latest_ver else "v1.0.0"

            logger.info("=== IMPROVEMENT CYCLE: %s (%s) ===", context.theme_name, context.version)
            await self._broadcast("swarm", "improvement_start", f"Improving '{context.theme_name}'...")

            improvements = ["new section added", "performance improvement", "accessibility fixes"]

            for agent_name in self.IMPROVEMENT_CYCLE:
                if not self.running:
                    break
                while self.paused and self.running:
                    await asyncio.sleep(2)

                if agent_name == "version_manager":
                    agent = self._get_agent("version_manager")
                    result = await agent.run(context, changes=improvements)
                    context.update("version_manager", result)
                    if result.get("version"):
                        context.version = result["version"]
                    await self._broadcast("version_manager", "done", result.get("summary", ""))
                else:
                    await self._run_agent(agent_name, context)

            if context.zip_path and db is not None:
                qa_score = float(context.qa_report.get("score", 0)) if context.qa_report else 0.0
                await save_theme(db, context, context.zip_path, qa_score)

            logger.info("=== IMPROVEMENT COMPLETE: %s %s ===", context.theme_name, context.version)
            await self._broadcast("swarm", "improvement_done", f"'{context.theme_name}' improved to {context.version}!")
        except Exception as e:
            logger.error("Improvement cycle error: %s", e)

    async def run_infinite_loop(self, db=None):
        self.running = True
        logger.info("Shopify Swarm Engine — infinite loop started")

        try:
            while self.running:
                if self.paused:
                    await asyncio.sleep(2)
                    continue

                # Every 3rd cycle: improve an existing theme
                if self.cycle_count > 0 and self.cycle_count % 3 == 0 and self.theme_count > 0:
                    await self.run_improvement_cycle(db)
                else:
                    await self.run_production_cycle(db)

                # Brief pause between cycles
                if self.running:
                    await asyncio.sleep(60)
        except asyncio.CancelledError:
            logger.info("Swarm Engine loop cancelled")
        except Exception as e:
            logger.error("Swarm Engine fatal error: %s", e)
        finally:
            self.running = False

    def start(self, db=None):
        if self._task and not self._task.done():
            logger.warning("Swarm engine already running")
            return
        self.running = True
        self.paused = False
        self._task = asyncio.create_task(self.run_infinite_loop(db))
        logger.info("Shopify Swarm Engine started")

    def pause(self):
        self.paused = True
        logger.info("Shopify Swarm Engine paused")

    def resume(self):
        self.paused = False
        logger.info("Shopify Swarm Engine resumed")

    def stop(self):
        self.running = False
        if self._task and not self._task.done():
            self._task.cancel()
        logger.info("Shopify Swarm Engine stopped")

    def get_status(self) -> dict:
        return {
            "running": self.running,
            "paused": self.paused,
            "cycle_count": self.cycle_count,
            "theme_count": self.theme_count,
            "current_agent": self.current_agent,
            "current_theme": self.current_theme_name,
        }
