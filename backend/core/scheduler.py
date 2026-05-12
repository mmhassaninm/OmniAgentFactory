"""
OmniBot — Smart Night Mode Scheduler (Phase 6 Upgrade)

APScheduler-based background job manager.
Night Mode: active between NIGHT_MODE_START and NIGHT_MODE_END

Smart Night Mode behaviors:
  1. Deep Reflection Mode — 2 weakest agents get a 3x-longer "fundamental rethink" cycle
  2. Memory Consolidation — scan day's thoughts, extract patterns, prune stale memories
  3. Genealogy Pruning — archive agents that haven't improved in 20 cycles & score < 0.1
  4. Factory Health Report — at 06:00, generate a morning briefing and store in MongoDB
"""

import logging
from datetime import datetime, time as dt_time
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from core.config import get_settings
from core.model_router import get_model_router

logger = logging.getLogger(__name__)


class NightModeScheduler:
    """
    Manages the night/day mode transitions and background jobs.
    Checks mode every 60 seconds and adjusts behavior accordingly.
    """

    def __init__(self):
        self._scheduler = AsyncIOScheduler()
        self._current_mode: str = "day"  # "day" or "night"
        self._started = False
        self._deep_reflection_done_tonight: bool = False
        self._memory_consolidation_done_tonight: bool = False

    def start(self):
        """Start the scheduler with all background jobs."""
        if self._started:
            return

        # Check mode every 60 seconds
        self._scheduler.add_job(
            self._check_mode_transition,
            IntervalTrigger(seconds=60),
            id="mode_checker",
            replace_existing=True,
        )

        # Save model stats every 5 minutes
        self._scheduler.add_job(
            self._save_model_stats,
            IntervalTrigger(minutes=5),
            id="stats_saver",
            replace_existing=True,
        )

        # Check provider health every 5 minutes
        self._scheduler.add_job(
            self._check_provider_health_job,
            IntervalTrigger(minutes=5),
            id="provider_health_checker",
            replace_existing=True,
        )

        # Morning briefing at 06:00
        self._scheduler.add_job(
            self._generate_morning_report,
            CronTrigger(hour=6, minute=0),
            id="morning_report",
            replace_existing=True,
        )

        # AI Scout — Weekly free provider research (Monday 09:00)
        self._scheduler.add_job(
            self._ai_scout_job,
            CronTrigger(day_of_week="mon", hour=9, minute=0),
            id="ai_scout",
            replace_existing=True,
        )

        # AI Health Monitor — Quick ping every 5 minutes
        self._scheduler.add_job(
            self._ai_health_ping_job,
            IntervalTrigger(minutes=5),
            id="ai_health_ping",
            replace_existing=True,
        )

        # AI Health Report — Hourly full report
        self._scheduler.add_job(
            self._ai_health_report_job,
            CronTrigger(minute=0),  # Every hour at minute 0
            id="ai_health_report",
            replace_existing=True,
        )

        # AI Health Quota — Full quota refresh every 1 hour
        self._scheduler.add_job(
            self._ai_quota_refresh_job,
            CronTrigger(minute=5),  # Every hour at minute 5 (staggered from report)
            id="ai_quota_refresh",
            replace_existing=True,
        )

        # AI Health Daily Report — At midnight
        self._scheduler.add_job(
            self._ai_daily_report_job,
            CronTrigger(hour=0, minute=0),
            id="ai_daily_report",
            replace_existing=True,
        )

        # Log Sessions Archiver — At 01:00 AM daily
        self._scheduler.add_job(
            self._auto_archive_logging_sessions,
            CronTrigger(hour=1, minute=0),
            id="log_sessions_archiver",
            replace_existing=True,
        )

        self._scheduler.start()
        self._started = True

        settings = get_settings()
        self._current_mode = "night" if settings.is_night_mode() else "day"
        logger.info("NightModeScheduler started — current mode: %s", self._current_mode)

    async def _check_mode_transition(self):
        """Check if we need to transition between day and night mode."""
        settings = get_settings()
        new_mode = "night" if settings.is_night_mode() else "day"

        if new_mode != self._current_mode:
            old_mode = self._current_mode
            self._current_mode = new_mode
            logger.info("Mode transition: %s → %s", old_mode, new_mode)

            if new_mode == "night":
                await self._enter_night_mode()
            else:
                await self._enter_day_mode()

    async def _enter_night_mode(self):
        """
        Transition to night mode.
        Triggers all smart night mode behaviors in sequence.
        """
        from core.evolve_engine import get_evolution_manager, StopMode

        manager = get_evolution_manager()
        settings = get_settings()

        logger.info(
            "[NIGHT] Entering smart night mode — max agents: %d",
            settings.max_concurrent_agents_night,
        )

        # Reset nightly flags
        self._deep_reflection_done_tonight = False
        self._memory_consolidation_done_tonight = False

        # Soft-stop excess agents
        excess = manager.active_count - settings.max_concurrent_agents_night
        if excess > 0:
            logger.info("[NIGHT] Soft-stopping %d excess agents", excess)
            running_ids = [aid for aid, task in manager._tasks.items() if not task.done()]
            for agent_id in running_ids[-excess:]:
                await manager.stop_evolution(agent_id, StopMode.SOFT_STOP)

        # Trigger smart night tasks
        import asyncio
        asyncio.create_task(self._run_smart_night_tasks())

    async def _run_smart_night_tasks(self):
        """Execute all smart night mode tasks: deep reflection, memory consolidation, pruning."""
        import asyncio
        await asyncio.sleep(30)  # Brief wait for transitions to settle

        # 1. Deep Reflection Mode
        if not self._deep_reflection_done_tonight:
            await self._deep_reflection_mode()
            self._deep_reflection_done_tonight = True

        # 2. Memory Consolidation
        if not self._memory_consolidation_done_tonight:
            await self._memory_consolidation()
            self._memory_consolidation_done_tonight = True

        # 3. Genealogy Pruning
        await self._genealogy_pruning()

    async def _deep_reflection_mode(self):
        """
        Deep Reflection: pick the 2 weakest agents and run a fundamentally different
        'rethink from scratch' evolution cycle rather than incremental improvement.
        """
        try:
            from core.database import get_db
            from core.model_router import call_model
            from utils.thought_logger import log_thought

            db = get_db()

            # Find 2 lowest-scoring active agents
            weak_agents = await db.agents.find(
                {"status": {"$in": ["evolving", "paused", "stopped", "idle"]}, "score": {"$lt": 0.5}},
            ).sort("score", 1).limit(2).to_list(2)

            if not weak_agents:
                logger.info("[NIGHT] Deep Reflection: no weak agents to reflect on")
                return

            for agent_doc in weak_agents:
                agent_id = agent_doc.get("id", "")
                agent_name = agent_doc.get("name", "?")
                agent_goal = agent_doc.get("goal", "?")
                current_code = agent_doc.get("agent_code", "")
                current_score = agent_doc.get("score", 0.0)

                await log_thought(
                    agent_id,
                    f"[NIGHT] 🌙 Deep Reflection Mode: fundamentally rethinking approach (score was {current_score:.2f})",
                    phase="general",
                )

                # Generate a fundamentally different approach
                messages = [
                    {
                        "role": "system",
                        "content": (
                            "You are an expert AI system architect doing a deep-night reflection. "
                            "Forget incremental improvement. Fundamentally redesign this agent from scratch. "
                            "Return ONLY Python code — no explanations, no markdown fences. "
                            "Define an async function called 'execute(input_data)' that returns the agent's result."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Agent Goal: {agent_goal}\n"
                            f"Current Score: {current_score:.2f} (stuck — needs fundamental rethink)\n"
                            f"Current Code:\n{current_code[:600]}\n\n"
                            f"The current approach is not working. Invent a completely different architecture. "
                            f"What would a world-class engineer do differently? Think deeply, then write the code."
                        ),
                    },
                ]

                new_code_raw = await call_model(messages, task_type="research", agent_id=agent_id)

                # Clean code
                new_code = new_code_raw.strip()
                if new_code.startswith("```python"):
                    new_code = new_code[len("```python"):].strip()
                elif new_code.startswith("```"):
                    new_code = new_code[3:].strip()
                if new_code.endswith("```"):
                    new_code = new_code[:-3].strip()

                # Store as a "dream state" (don't commit automatically — let next day's evolution test it)
                await db.agent_dream_states.insert_one({
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "code": new_code,
                    "generated_at": datetime.now(),
                    "source": "deep_reflection",
                    "used": False,
                })

                await log_thought(
                    agent_id,
                    f"[NIGHT] 🌙 Deep Reflection complete — new architectural approach stored as dream state",
                    phase="general",
                )
                logger.info("[NIGHT] Deep reflection completed for agent %s", agent_id[:8])

        except Exception as e:
            logger.warning("[NIGHT] Deep Reflection Mode failed: %s", e)

    async def _memory_consolidation(self):
        """
        Scan thought logs from the past day, extract working patterns,
        update collective memory, and prune stale entries.
        """
        try:
            from core.database import get_db
            from core.model_router import call_model
            from datetime import timedelta

            db = get_db()
            yesterday = datetime.now() - timedelta(hours=24)

            # Gather recent thoughts tagged as commits (successes)
            success_thoughts = await db.thoughts.find(
                {"phase": "commit", "timestamp": {"$gte": yesterday}},
            ).sort("timestamp", -1).limit(50).to_list(50)

            fail_thoughts = await db.thoughts.find(
                {"phase": "rollback", "timestamp": {"$gte": yesterday}},
            ).sort("timestamp", -1).limit(50).to_list(50)

            if not success_thoughts and not fail_thoughts:
                logger.info("[NIGHT] Memory Consolidation: no recent thoughts to consolidate")
                return

            success_summaries = "\n".join(
                f"- {t.get('content', '')[:120]}" for t in success_thoughts[:10]
            )
            fail_summaries = "\n".join(
                f"- {t.get('content', '')[:120]}" for t in fail_thoughts[:10]
            )

            # Ask LLM to extract consolidated patterns
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are analyzing AI agent evolution logs to extract reusable patterns. "
                        "Output valid JSON only — no markdown fences."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Past 24 hours of evolution activity:\n\n"
                        f"Successful commits:\n{success_summaries}\n\n"
                        f"Failed rollbacks:\n{fail_summaries}\n\n"
                        f"Extract 3 key insights. Output JSON:\n"
                        f"{{\"insights\": [\"insight1\", \"insight2\", \"insight3\"], "
                        f"\"meta_lesson\": \"one sentence about what overall direction worked best today\"}}"
                    ),
                },
            ]

            import json
            raw = await call_model(messages, task_type="fast")
            data = json.loads(raw.strip())

            # Store consolidated insights in collective_memory
            for insight in data.get("insights", []):
                if insight and len(insight) > 20:
                    await db.collective_memory.insert_one({
                        "agent_id": "factory_night_consolidation",
                        "discovery": f"[CONSOLIDATED] {insight}",
                        "context": "general",
                        "score_delta": 0.1,
                        "timestamp": datetime.now(),
                        "times_helped": 0,
                        "tag": "consolidated",
                    })

            # Prune stale collective memory entries (times_helped < 2, older than 7 days)
            prune_cutoff = datetime.now() - timedelta(days=7)
            prune_result = await db.collective_memory.delete_many({
                "times_helped": {"$lt": 2},
                "timestamp": {"$lt": prune_cutoff},
                "tag": {"$nin": ["failure_lesson", "consolidated"]},  # never prune these
            })

            logger.info(
                "[NIGHT] Memory Consolidation: stored %d insights, pruned %d stale entries",
                len(data.get("insights", [])), prune_result.deleted_count,
            )

        except Exception as e:
            logger.warning("[NIGHT] Memory Consolidation failed: %s", e)

    async def _genealogy_pruning(self):
        """
        Archive agents that haven't improved in 20 cycles and have score < 0.1.
        Frees evolution slots for more productive agents.
        """
        try:
            from core.database import get_db
            from utils.thought_logger import log_thought

            db = get_db()

            # Find candidates: version >= 20, score < 0.1, not already ghost/extinct
            candidates = await db.agents.find(
                {
                    "version": {"$gte": 20},
                    "score": {"$lt": 0.1},
                    "status": {"$nin": ["ghost", "extinct", "archived"]},
                },
            ).to_list(20)

            archived_count = 0
            for agent in candidates:
                agent_id = agent.get("id", "")
                # Check if it has improved at all in last 10 snapshots
                recent_snaps = await db.snapshots.find(
                    {"agent_id": agent_id},
                ).sort("committed_at", -1).limit(10).to_list(10)

                if len(recent_snaps) >= 10:
                    scores = [s.get("performance_score", 0.0) for s in recent_snaps]
                    improvement = max(scores) - min(scores)
                    if improvement < 0.01:  # flat for 10 snapshots
                        await db.agents.update_one(
                            {"id": agent_id},
                            {"$set": {"status": "archived", "archived_at": datetime.now()}},
                        )
                        await log_thought(
                            agent_id,
                            f"[NIGHT] 🗂️ Archived during genealogy pruning (v{agent.get('version')} cycles, score {agent.get('score', 0):.3f})",
                            phase="general",
                        )
                        archived_count += 1

            if archived_count > 0:
                logger.info("[NIGHT] Genealogy Pruning: archived %d stagnant agents", archived_count)

        except Exception as e:
            logger.warning("[NIGHT] Genealogy Pruning failed: %s", e)

    async def _generate_morning_report(self):
        """
        Generate and store a morning factory health briefing at 06:00.
        Includes agent progress, factory trajectory, and recommendations.
        """
        try:
            from core.database import get_db
            from core.model_router import call_model
            from core.factory_mirror import get_factory_mirror

            db = get_db()
            mirror = get_factory_mirror()

            # Force fresh insights for morning report
            await db.factory_mirror_cache.delete_one({"_id": "mirror_snapshot"})
            insights = await mirror.get_mirror(db)

            # Gather quick stats
            total_agents = await db.agents.count_documents({})
            evolving = await db.agents.count_documents({"status": "evolving"})
            ghosts = await db.agents.count_documents({"status": "ghost"})
            best_agent = await db.agents.find_one({}, sort=[("score", -1)])

            # Ask LLM for a human-readable summary
            messages = [
                {
                    "role": "system",
                    "content": "You generate concise morning briefings for an AI agent factory manager. Be direct and actionable.",
                },
                {
                    "role": "user",
                    "content": (
                        f"Morning Report for OmniBot Agent Factory — {datetime.now().strftime('%Y-%m-%d')}\n\n"
                        f"Factory Stats: {total_agents} total agents, {evolving} evolving, {ghosts} ghost agents\n"
                        f"Best Performer: {best_agent.get('name', '?') if best_agent else 'none'} (score={best_agent.get('score', 0):.2f if best_agent else 0})\n\n"
                        f"Self-Awareness Insights:\n"
                        + "\n".join(
                            f"- {v['answer']}"
                            for v in insights.values()
                            if isinstance(v, dict) and v.get("answer")
                        )
                        + "\n\nWrite a 3-bullet morning briefing for the factory operator. "
                        "What happened overnight? What needs attention today? What's looking good?"
                    ),
                },
            ]

            briefing = await call_model(messages, task_type="fast")

            report = {
                "generated_at": datetime.now(),
                "date": datetime.now().strftime("%Y-%m-%d"),
                "briefing": briefing,
                "stats": {
                    "total_agents": total_agents,
                    "evolving": evolving,
                    "ghosts": ghosts,
                    "best_agent": best_agent.get("name", "?") if best_agent else None,
                    "best_score": best_agent.get("score", 0) if best_agent else 0,
                },
                "insights": {k: v.get("answer", "") for k, v in insights.items() if isinstance(v, dict)},
            }

            await db.morning_reports.insert_one(report)
            logger.info("[NIGHT] Morning report generated for %s", report["date"])

        except Exception as e:
            logger.warning("[NIGHT] Morning report generation failed: %s", e)

    async def _enter_day_mode(self):
        """Transition to day mode — restore normal operation."""
        logger.info("☀️ Entering day mode — normal operation resumed")

    async def _save_model_stats(self):
        """Persist model stats to MongoDB periodically."""
        try:
            router = get_model_router()
            await router.save_stats_to_db()
        except Exception as e:
            logger.debug("Failed to save model stats: %s", e)

    async def _check_provider_health_job(self):
        """Check provider health and save to DB periodically."""
        try:
            router = get_model_router()
            await router.check_provider_health()
        except Exception as e:
            logger.debug("Failed to run provider health checker job: %s", e)

    async def _ai_scout_job(self):
        """Weekly AI Scout job — checks for new free AI providers with tool calling support."""
        import os
        from datetime import datetime

        try:
            logger.info("[AI SCOUT] Running weekly free provider research scan...")

            # Use the project's own search engine to discover new free AI providers
            from skills.web_search.run import search_web

            queries = [
                "free AI API tool calling function calling 2026",
                "free cloud AI API no credit card tool calling",
                "new free AI model API function calling 2026",
                "Gemini Groq Mistral free API update",
            ]

            findings = []
            for query in queries:
                try:
                    result = search_web(query, max_results=3)
                    findings.append(result)
                except Exception as qe:
                    logger.warning(f"[AI SCOUT] Query '{query[:30]}' failed: {qe}")

            # Check if Free_AI.md exists and append Update Log entry
            free_ai_path = os.path.join(os.path.dirname(__file__), "..", "..", "Free_AI.md")
            free_ai_path = os.path.abspath(free_ai_path)

            today_str = datetime.now().strftime("%Y-%m-%d")
            update_line = f"| {today_str} | Weekly automated scan — found {len(findings)} provider updates |\n"

            if os.path.exists(free_ai_path):
                with open(free_ai_path, "r", encoding="utf-8") as f:
                    content = f.read()

                # Append to Update Log if not already updated today
                if today_str not in content:
                    with open(free_ai_path, "a", encoding="utf-8") as f:
                        f.write(update_line)
                    logger.info(f"[AI SCOUT] Appended update to Free_AI.md: {today_str}")
                else:
                    logger.info("[AI SCOUT] Free_AI.md already updated today")

            # Log to autonomous_logs
            log_dir = os.path.join(os.path.dirname(__file__), "..", "autonomous_logs")
            log_dir = os.path.abspath(log_dir)
            os.makedirs(log_dir, exist_ok=True)

            log_file = os.path.join(log_dir, f"ai_scout_{today_str}.json")
            import json
            with open(log_file, "w", encoding="utf-8") as f:
                json.dump({
                    "date": today_str,
                    "queries": queries,
                    "findings_count": len(findings),
                    "findings": findings,
                    "status": "completed",
                }, f, indent=2, ensure_ascii=False)

            logger.info(f"[AI SCOUT] Scan complete. Log saved to {log_file}")

        except Exception as e:
            logger.error(f"[AI SCOUT] Job failed: {e}")

    async def _ai_health_ping_job(self):
        """Quick ping health check for all active providers (every 5 min)."""
        try:
            from services.ai_health_monitor import get_ai_health_monitor
            from api.websocket import manager as ws_manager

            monitor = get_ai_health_monitor()
            monitor.set_ws_manager(ws_manager)

            from core.database import get_db
            try:
                monitor.set_db(get_db())
            except Exception:
                pass

            logger.debug("[AIHealth] Running 5-min ping...")
            await monitor.scan_all_providers()
        except Exception as e:
            logger.warning(f"[AIHealth] Ping job failed: {e}")

    async def _ai_health_report_job(self):
        """Hourly full health report — updates AI_CONNECTIVITY_REPORT.md."""
        try:
            from services.ai_health_monitor import get_ai_health_monitor
            from api.websocket import manager as ws_manager

            monitor = get_ai_health_monitor()
            monitor.set_ws_manager(ws_manager)

            from core.database import get_db
            try:
                monitor.set_db(get_db())
            except Exception:
                pass

            # Run health scan
            results = await monitor.scan_all_providers()
            summary = await monitor.get_summary()
            configured = monitor.get_configured_providers()

            # Generate report content
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            healthy = sum(1 for r in results if r["status"] == "healthy")
            degraded = sum(1 for r in results if r["status"] in ("degraded", "quota_exceeded"))
            down = sum(1 for r in results if r["status"] == "down")

            # Read existing AI_CONNECTIVITY_REPORT.md or build fresh
            import os
            report_path = os.path.join(os.path.dirname(__file__), "..", "..", "AI_CONNECTIVITY_REPORT.md")
            report_path = os.path.abspath(report_path)

            lines = []
            lines.append("# 🤖 AI Connectivity & Health Report")
            lines.append("> Auto-updated every hour by OmniAgentFactory Health Monitor")
            lines.append("> Last Updated: " + now_str)
            lines.append("")
            lines.append("## Provider Status Summary")
            lines.append("| Provider | Status | Latency | Tool Calling | Last Check |")
            lines.append("|----------|--------|---------|--------------|------------|")

            for p in configured:
                status_emoji = "🟢 OK" if p["status"] == "healthy" else \
                               "🟡 DEGRADED" if p["status"] in ("degraded",) else \
                               "🔴 DOWN" if p["status"] == "down" else \
                               "🟠 QUOTA" if p["status"] == "quota_exceeded" else \
                               "⚫ UNCONFIGURED"
                latency = f"{p['latency_ms']}ms" if p["latency_ms"] else "N/A"
                tool_call = "✅" if p["tool_calling"] else "❌"
                last_check = p["last_checked"][:19] if p["last_checked"] else "Never"
                lines.append(f"| {p['display_name']} | {status_emoji} | {latency} | {tool_call} | {last_check} |")

            lines.append("")
            lines.append("## Today's Usage")
            lines.append(f"- Total LLM Calls: {summary['total_calls_session']}")
            lines.append(f"- Total Tokens: {summary['total_tokens_session']}")
            lines.append(f"- Total Cost: ${summary['total_cost_session']:.4f} (all free providers)")
            lines.append(f"- Most Used Provider: {summary['most_used_producer']}")
            lines.append("")
            lines.append("## Quota Alerts")
            alerts = await monitor.get_quota_alerts()
            if alerts:
                for a in alerts:
                    lines.append(f"- ⚠️ {a['display_name']}: {a['status']} — {a.get('error', '')}")
            else:
                lines.append("- ✅ No active quota warnings")
            lines.append("")
            lines.append("## Provider Details")
            for p in configured:
                lines.append(f"### {p['display_name']}")
                lines.append(f"- Status: {p['status']}")
                lines.append(f"- Model: {p['default_model']}")
                lines.append(f"- Latency: {p['latency_ms']}ms")
                lines.append(f"- Calls this session: {p['calls_session']}")
                lines.append(f"- Tokens: {p['tokens_in_session']}in / {p['tokens_out_session']}out")
                lines.append(f"- Cost: ${p['cost_session']:.4f}")
                lines.append(f"- Used in: {', '.join(p['used_in'])}")
                lines.append("")

            content = "\n".join(lines)

            # Write report
            os.makedirs(os.path.dirname(report_path), exist_ok=True)
            with open(report_path, "w", encoding="utf-8") as f:
                f.write(content)

            logger.info(f"[AIHealth] Hourly report written to {report_path}")

        except Exception as e:
            logger.warning(f"[AIHealth] Report job failed: {e}")

    async def _ai_quota_refresh_job(self):
        """Full quota refresh for all providers (every hour)."""
        try:
            from services.ai_health_monitor import get_ai_health_monitor

            monitor = get_ai_health_monitor()
            from core.database import get_db
            try:
                monitor.set_db(get_db())
            except Exception:
                pass

            logger.debug("[AIHealth] Running hourly quota refresh...")
            await monitor.scan_all_providers()
            logger.info("[AIHealth] Quota refresh complete")
        except Exception as e:
            logger.warning(f"[AIHealth] Quota refresh failed: {e}")

    async def _ai_daily_report_job(self):
        """Generate daily usage report at midnight."""
        try:
            from services.ai_health_monitor import get_ai_health_monitor

            monitor = get_ai_health_monitor()
            summary = await monitor.get_summary()

            # Save daily report to autonomous_logs
            import json, os
            log_dir = os.path.join(os.path.dirname(__file__), "..", "autonomous_logs")
            log_dir = os.path.abspath(log_dir)
            os.makedirs(log_dir, exist_ok=True)

            today_str = datetime.now().strftime("%Y-%m-%d")
            report = {
                "date": today_str,
                "report_type": "ai_health_daily",
                "summary": summary,
                "providers": monitor.get_configured_providers(),
                "generated_at": datetime.now().isoformat(),
            }

            report_file = os.path.join(log_dir, f"ai_health_{today_str}.json")
            with open(report_file, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2, ensure_ascii=False)

            logger.info(f"[AIHealth] Daily report saved: {report_file}")
        except Exception as e:
            logger.warning(f"[AIHealth] Daily report failed: {e}")

    def is_night_mode(self) -> bool:
        """Check current mode."""
        return self._current_mode == "night"

    def get_status(self) -> dict:
        """Return scheduler status."""
        settings = get_settings()
        return {
            "current_mode": self._current_mode,
            "is_night": self.is_night_mode(),
            "night_window": {
                "start": settings.night_mode_start.isoformat(),
                "end": settings.night_mode_end.isoformat(),
            },
            "scheduler_running": self._started,
            "current_time": datetime.now().isoformat(),
            "deep_reflection_done_tonight": self._deep_reflection_done_tonight,
            "memory_consolidation_done_tonight": self._memory_consolidation_done_tonight,
        }

    async def _auto_archive_logging_sessions(self):
        """Archiving logging sessions task (triggered daily at 01:00 AM)."""
        logger.info("[NIGHT] Running daily logging sessions archiving task...")
        try:
            import asyncio
            from services.log_manager import log_manager
            count = await asyncio.to_thread(log_manager.archive_old_sessions, 30)
            logger.info("[NIGHT] Logging sessions archiving task finished. Archived %d sessions.", count)
        except Exception as e:
            logger.error("[NIGHT] Logging sessions archiving job failed: %s", e)

    def stop(self):
        """Stop the scheduler."""
        if self._started:
            self._scheduler.shutdown(wait=False)
            self._started = False
            logger.info("NightModeScheduler stopped")


# ── Singleton ───────────────────────────────────────────────────────────────

_scheduler: Optional[NightModeScheduler] = None


def get_night_scheduler() -> NightModeScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = NightModeScheduler()
    return _scheduler
