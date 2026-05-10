"""
Shopify Theme Factory — Swarm Engine
Orchestrates the 7-agent production and improvement cycles.
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Optional

from core.model_router import call_model
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
        "shopify_builder",
        "qa_reviewer",
        "version_manager",
    ]

    IMPROVEMENT_CYCLE = [
        "market_researcher",
        "version_manager",
        "ux_designer",
        "liquid_developer",
        "shopify_builder",
        "qa_reviewer",
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
        if name == "shopify_builder":
            return "shopify_builder"
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

        last_exc: Optional[Exception] = None
        for attempt in range(1, 4):  # 3 attempts
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
                else:
                    result = await agent.run(context)

                context.update(name, result)
                await self._broadcast(name, "done", result.get("summary", "Completed"))
                return result

            except Exception as e:
                last_exc = e
                if attempt < 3:
                    delay = 2 ** attempt  # 2s then 4s
                    logger.warning("[%s] Attempt %d/3 failed: %s — retrying in %ds", name, attempt, e, delay)
                    await self._broadcast(
                        name, "retrying",
                        f"Attempt {attempt}/3 failed: {type(e).__name__}: {e} — retrying in {delay}s",
                    )
                    await asyncio.sleep(delay)

        # All 3 attempts exhausted — skip agent, cycle continues
        logger.error("[%s] Failed after 3 attempts: %s", name, last_exc, exc_info=True)
        await self._broadcast(
            name, "error",
            f"SKIPPED after 3 retries — {type(last_exc).__name__}: {last_exc}",
        )
        return {"status": "error", "summary": str(last_exc)}

    async def _load_evolution_lessons(self, db) -> str:
        """
        Fetch 5 most recent documents from db.shopify_lessons
        Deduplicate all lessons_extracted lists (max 10 unique lessons)
        Increment times_applied on fetched docs
        Return formatted string block or "" on any error
        """
        try:
            if db is None:
                return ""
            lesson_docs = await db.shopify_lessons.find(
                {}, sort=[("created_at", -1)], limit=5
            ).to_list(length=5)
            if not lesson_docs:
                return ""

            all_lessons: list[str] = []
            for doc in lesson_docs:
                all_lessons.extend([str(x).strip() for x in doc.get("lessons_extracted", []) if str(x).strip()])

            seen: set[str] = set()
            unique_lessons: list[str] = []
            for lesson in all_lessons:
                key = lesson.lower()
                if key not in seen:
                    seen.add(key)
                    unique_lessons.append(lesson)
                if len(unique_lessons) >= 10:
                    break

            if not unique_lessons:
                return ""

            ids = [doc.get("_id") for doc in lesson_docs if doc.get("_id") is not None]
            if ids:
                await db.shopify_lessons.update_many(
                    {"_id": {"$in": ids}},
                    {"$inc": {"times_applied": 1}},
                )

            return (
                "\n\n━━━ EVOLUTION MEMORY — MANDATORY RULES FROM PAST CYCLES ━━━\n"
                "These rules were learned from real failures. NEVER violate them:\n"
                + "\n".join(f"• {lesson}" for lesson in unique_lessons)
                + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            )
        except Exception as e:
            logger.error("Failed to load evolution lessons: %s", e)
            return ""

    async def _save_cycle_lessons(self, context: SharedContext, theme_doc: dict, db) -> None:
        """
        Only run if context.qa_errors or context.build_warnings are non-empty
        Call call_model() with prompt asking for 2-4 ALWAYS/NEVER rules
        extracted from the errors
        Parse lines starting with ALWAYS or NEVER
        Insert document into db.shopify_lessons
        If collection has more than 50 docs, delete the oldest one
        Wrap everything in try/except — never crash the loop
        """
        try:
            if db is None:
                return
            qa_errors = list(getattr(context, "qa_errors", []) or [])
            build_warnings = list(getattr(context, "build_warnings", []) or [])
            if not qa_errors and not build_warnings:
                return
            source_errors = qa_errors + build_warnings

            prompt = (
                f"Theme: {theme_doc.get('name', 'Unknown')} | Niche: {theme_doc.get('niche', '')}\n\n"
                "Given these build/QA issues, extract 2-4 hard prevention rules.\n"
                "Each line MUST start with ALWAYS or NEVER.\n\n"
                "Issues:\n"
                + "\n".join(f"- {e}" for e in source_errors[:20])
                + "\n\nReturn ONLY the rules, one per line."
            )

            lessons_text = await call_model(
                messages=[{"role": "user", "content": prompt}],
                task_type="general",
                max_tokens=400,
                temperature=0.3,
            )
            lessons = [
                line.strip()
                for line in (lessons_text or "").splitlines()
                if line.strip().startswith(("ALWAYS", "NEVER"))
            ]
            if not lessons:
                return

            await db.shopify_lessons.insert_one({
                "theme_name": theme_doc.get("name", "Unknown"),
                "niche": theme_doc.get("niche", ""),
                "lessons_extracted": lessons,
                "source_errors": source_errors,
                "times_applied": 0,
                "created_at": datetime.utcnow(),
            })
            await self._broadcast("swarm", "info",
                f"📚 {len(lessons)} lessons extracted from this cycle → added to evolution memory")

            count = await db.shopify_lessons.count_documents({})
            if count > 50:
                oldest = await db.shopify_lessons.find_one(
                    {}, sort=[("created_at", 1)]
                )
                if oldest:
                    await db.shopify_lessons.delete_one({"_id": oldest["_id"]})
        except Exception as e:
            logger.error("Failed to save cycle lessons: %s", e)

    async def _calculate_theme_score(self, context: SharedContext) -> float:
        """
        Score the generated theme from 0.0 to 100.0 based on:
        - qa_score from context.qa_report (40 points max)
        - number of section files in liquid_code (30 points max — 1pt per section, max 30)
        - build_warnings count: -3 per warning (max -15)
        - qa_errors count: -5 per error (max -20)
        Returns float between 0.0 and 100.0.
        Wrap in try/except, return 0.0 on error.
        """
        try:
            qa_score_raw = 0.0
            if getattr(context, "qa_report", None):
                qa_score_raw = float(context.qa_report.get("score", 0.0))
            if qa_score_raw <= 1.0:
                qa_score_raw *= 100.0
            qa_points = min(40.0, max(0.0, qa_score_raw) * 0.4)

            liquid_code = getattr(context, "liquid_code", {}) or {}
            section_count = sum(
                1 for path in liquid_code.keys()
                if isinstance(path, str) and path.startswith("sections/")
            )
            section_points = float(min(30, section_count))

            build_warnings_count = len(getattr(context, "build_warnings", []) or [])
            qa_errors_count = len(getattr(context, "qa_errors", []) or [])
            warnings_penalty = min(15.0, float(build_warnings_count * 3))
            errors_penalty = min(20.0, float(qa_errors_count * 5))

            score = qa_points + section_points - warnings_penalty - errors_penalty
            return max(0.0, min(100.0, float(score)))
        except Exception as e:
            logger.error("Failed to calculate theme score: %s", e)
            return 0.0

    async def _save_theme_score(self, context: SharedContext, db) -> None:
        """
        Save/update theme score in db.shopify_theme_scores collection:
        {
            "theme_name": context.theme_name,
            "niche": context.niche,
            "version": context.version,
            "score": float,
            "section_count": int,
            "qa_errors_count": int,
            "build_warnings_count": int,
            "created_at": datetime.utcnow()
        }
        Wrap in try/except — never crash.
        """
        try:
            if db is None or not getattr(context, "theme_name", ""):
                return
            liquid_code = getattr(context, "liquid_code", {}) or {}
            section_count = sum(
                1 for path in liquid_code.keys()
                if isinstance(path, str) and path.startswith("sections/")
            )
            qa_errors_count = len(getattr(context, "qa_errors", []) or [])
            build_warnings_count = len(getattr(context, "build_warnings", []) or [])
            score = await self._calculate_theme_score(context)

            await db.shopify_theme_scores.update_one(
                {
                    "theme_name": context.theme_name,
                    "niche": context.niche,
                    "version": context.version,
                },
                {
                    "$set": {
                        "score": float(score),
                        "section_count": int(section_count),
                        "qa_errors_count": int(qa_errors_count),
                        "build_warnings_count": int(build_warnings_count),
                        "created_at": datetime.utcnow(),
                    }
                },
                upsert=True,
            )
        except Exception as e:
            logger.error("Failed to save theme score: %s", e)

    async def _load_intelligence(self, db) -> str:
        """
        Returns a formatted intelligence block combining:

        PART 1 — Best Themes (top 3 highest-score themes from db.shopify_theme_scores)
        PART 2 — Niche Intelligence (niches with avg score > 70 and section guidance)

        Return combined formatted string or "" on any error.
        Wrap everything in try/except.
        """
        try:
            if db is None:
                return ""

            lines: list[str] = []

            top_themes = await db.shopify_theme_scores.find(
                {}, sort=[("score", -1)], limit=3
            ).to_list(length=3)
            if top_themes:
                lines.append("TOP PERFORMING THEMES (learn from these):")
                for theme in top_themes:
                    lines.append(
                        f" - {theme.get('theme_name', 'Unknown')} "
                        f"(niche: {theme.get('niche', 'unknown')}, "
                        f"score: {float(theme.get('score', 0)):.1f}, "
                        f"sections: {int(theme.get('section_count', 0))}) — study this structure"
                    )

            pipeline = [
                {
                    "$group": {
                        "_id": "$niche",
                        "avg_score": {"$avg": "$score"},
                        "avg_sections": {"$avg": "$section_count"},
                    }
                },
                {"$match": {"avg_score": {"$gt": 70}}},
                {"$sort": {"avg_score": -1}},
            ]
            niche_rows = await db.shopify_theme_scores.aggregate(pipeline).to_list(length=20)
            if niche_rows:
                if lines:
                    lines.append("")
                lines.append("NICHE INTELLIGENCE:")
                for row in niche_rows:
                    lines.append(
                        f" - niche {row.get('_id', 'unknown')}: "
                        f"avg score {float(row.get('avg_score', 0)):.1f} — "
                        f"recommended section count: {int(round(float(row.get('avg_sections', 0))))}"
                    )

            if not lines:
                return ""

            return "\n\n━━━ PHASE 2 INTELLIGENCE ━━━\n" + "\n".join(lines) + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        except Exception as e:
            logger.error("Failed to load intelligence: %s", e)
            return ""

    async def run_production_cycle(self, db=None):
        context = SharedContext()
        context.theme_id = str(uuid.uuid4())
        context.version = "v1.0.0"

        logger.info("=== PRODUCTION CYCLE %d STARTED ===", self.cycle_count + 1)
        await self._broadcast("swarm", "cycle_start", f"Production cycle #{self.cycle_count + 1} started")

        # Load evolution lessons AND phase 2 intelligence
        lessons_block = ""
        intelligence_block = ""
        if db is not None:
            lessons_block = await self._load_evolution_lessons(db)
            intelligence_block = await self._load_intelligence(db)

        context.evolution_lessons = lessons_block
        if intelligence_block:
            context.evolution_lessons += intelligence_block

        if lessons_block:
            await self._broadcast("swarm", "info",
                f"🧠 Evolution memory loaded: {len(lessons_block.splitlines())} active rules")
        if intelligence_block:
            await self._broadcast("swarm", "info",
                "📊 Phase 2 intelligence loaded: best themes + niche data")

        for agent_name in self.PRODUCTION_CYCLE:
            if not self.running:
                break
            while self.paused and self.running:
                await asyncio.sleep(2)

            if agent_name == "ux_designer":
                # Parallel Stage: UXDesigner + ContentWriter
                await self._broadcast("swarm", "info",
                    "⚡ Parallel Stage: launching UXDesigner + ContentWriter simultaneously")

                import copy
                ux_context = copy.deepcopy(context)
                content_context = copy.deepcopy(context)

                ux_task = asyncio.create_task(
                    self._run_agent("ux_designer", ux_context)
                )
                content_task = asyncio.create_task(
                    self._run_agent("content_writer", content_context)
                )

                results = await asyncio.gather(ux_task, content_task, return_exceptions=True)

                # Handle results individually — one failure must not kill the other
                ux_result, content_result = results
                if isinstance(ux_result, Exception):
                    await self._broadcast("ux_designer", "error",
                        f"UXDesigner failed in parallel stage: {ux_result}")
                else:
                    context.update("ux_designer", ux_result)
                if isinstance(content_result, Exception):
                    await self._broadcast("content_writer", "error",
                        f"ContentWriter failed in parallel stage: {content_result}")
                else:
                    context.update("content_writer", content_result)

                # After gather, merge both results back into context before Stage 4
                # Already done via context.update above

                await self._broadcast("swarm", "info", "✅ Parallel Stage complete")
                continue  # Skip the normal _run_agent call

            await self._run_agent(agent_name, context)

        if context.zip_path and db is not None:
            qa_score = 0.0
            if context.qa_report:
                qa_score = float(context.qa_report.get("score", 0))
            await save_theme(db, context, context.zip_path, qa_score)
            if context.market_report:
                await save_market_research(db, context.market_report)

        # Extract and save lessons from this cycle's errors
        if db is not None and context.theme_name:
            theme_doc = {"name": context.theme_name, "niche": context.niche}
            await self._save_cycle_lessons(context, theme_doc, db)
            # Phase 2: calculate and save theme score
            score = await self._calculate_theme_score(context)
            await self._save_theme_score(context, db)
            await self._broadcast("swarm", "info",
                f"📈 Theme score: {score:.1f}/100 saved to intelligence database")

        self.cycle_count += 1
        self.theme_count += 1
        self.current_theme_name = context.theme_name
        logger.info("=== PRODUCTION CYCLE COMPLETE: %s ===", context.theme_name)
        await self._broadcast("swarm", "cycle_done", f"Theme '{context.theme_name}' complete!")

    async def run_improvement_cycle(self, db=None):
        """Improve the most recent theme with a new version."""
        if db is None:
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

        while self.running:
            if self.paused:
                await asyncio.sleep(2)
                continue

            try:
                # Every 3rd cycle: improve an existing theme
                if self.cycle_count > 0 and self.cycle_count % 3 == 0 and self.theme_count > 0:
                    await self.run_improvement_cycle(db)
                else:
                    await self.run_production_cycle(db)
            except asyncio.CancelledError:
                logger.info("Swarm Engine loop cancelled")
                break
            except Exception as e:
                logger.error("Swarm cycle crashed: %s", e, exc_info=True)
                await self._broadcast(
                    "swarm", "error",
                    f"Cycle crashed ({type(e).__name__}: {e}) — recovering in 15s",
                )
                await asyncio.sleep(15)
                continue  # restart the while loop — never stop

            if self.running:
                await asyncio.sleep(60)

        self.running = False
        logger.info("Swarm Engine stopped")

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
