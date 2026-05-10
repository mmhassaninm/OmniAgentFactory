"""
Control the entire OmniBot factory — and the Money Agent — from Telegram.
Send commands from anywhere, receive live updates.

Factory commands (original):
  /status       — factory agent status
  /evolveall    — start all idle agents
  /stopall      — stop all agents
  /create <goal>— create new agent
  /revenue      — legacy revenue report
  /help         — full command list

Money Agent commands (new):
  /money_status   — earnings + pending pitches count
  /balance        — live PayPal balance
  /start_hunt     — trigger daily opportunity cycle
  /approve_<id>   — approve and send a pitch email
  /skip_<id>      — skip a pitch
  /earnings_today — today's income
  /earnings_week  — weekly income + conversion stats
"""
import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)


class TelegramCommander:
    def __init__(self, bot_token: str, chat_id: str):
        self.token = bot_token
        self.chat_id = chat_id
        self.api = f"https://api.telegram.org/bot{bot_token}"
        self.last_update_id = 0

    async def send(self, message: str):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(f"{self.api}/sendMessage", json={
                    "chat_id": self.chat_id,
                    "text": message,
                    "parse_mode": "Markdown",
                })
        except Exception as e:
            logger.warning("[Telegram] send failed: %s", e)

    # ── Factory status helpers ────────────────────────────────────────────────

    async def send_factory_status(self, db):
        agents = await db.agents.find().to_list(100)
        evolving = [a for a in agents if a.get("status") == "evolving"]
        idle = [a for a in agents if a.get("status") == "idle"]

        status = (
            f"🏭 *OmniBot Factory Status*\n"
            f"━━━━━━━━━━━━━━━━\n"
            f"⚡ Evolving: {len(evolving)} agents\n"
            f"💤 Idle: {len(idle)} agents\n"
            f"📊 Total: {len(agents)} agents\n\n"
            f"*Active Agents:*\n"
        )
        for a in evolving[:5]:
            score = int(a.get("current_score", 0) * 100)
            status += f"• {a.get('name', 'unknown')} — v{a.get('version', 0)} ({score}%)\n"

        await self.send(status)

    async def send_revenue_report(self, db):
        agents = await db.agents.find().to_list(100)
        total_agents = len(agents)
        top_agents = sorted(agents, key=lambda a: a.get("score", 0), reverse=True)[:5]

        report = (
            f"📈 *Revenue Report*\n"
            f"━━━━━━━━━━━━━━\n"
            f"Total agents: {total_agents}\n"
            f"Top performers:\n"
        )
        for a in top_agents:
            report += f"• {a.get('name', 'unknown')} — score {a.get('score', 0):.2f}, v{a.get('version', 0)}\n"
        await self.send(report)

    # ── Money Agent helpers ───────────────────────────────────────────────────

    async def _send_money_status(self):
        import core.money_roi_tracker as roi
        from agent.money_agent_loop import get_pending
        pending_count = len([v for v in get_pending().values() if v.get("status") == "PENDING_HUMAN"])
        msg = (
            f"💰 *Money Agent Status*\n"
            f"━━━━━━━━━━━━━━━━\n"
            f"Today: ${roi.today_earnings():.2f}\n"
            f"This week: ${roi.week_earnings():.2f}\n"
            f"This month: ${roi.month_earnings():.2f}\n\n"
            f"📬 Pitches sent (week): {roi.pitches_sent_this_week()}\n"
            f"🤝 Deals closed (week): {roi.deals_closed_this_week()}\n"
            f"📊 Conversion: {roi.conversion_rate():.1f}%\n\n"
            f"⏳ Awaiting your approval: {pending_count}\n"
            f"Use /start\\_hunt to find new opportunities."
        )
        await self.send(msg)

    async def _send_paypal_balance(self):
        from services.paypal_service import get_paypal_service
        paypal = get_paypal_service()
        data = await paypal.check_balance()
        if "error" in data:
            await self.send(f"❌ PayPal balance error: {data['error']}")
            return
        balances = data.get("balances", [])
        if not balances:
            await self.send("💳 PayPal balance: no data returned (check credentials)")
            return
        lines = "\n".join(
            f"• {b.get('currency', '?')}: {b.get('total_balance', {}).get('value', '0.00')}"
            for b in balances[:5]
        )
        await self.send(f"💳 *PayPal Balance*\n{lines}")

    async def _handle_approve(self, item_id: str):
        from agent.money_agent_loop import get_money_agent
        agent = get_money_agent()
        sent = await agent.handle_approved(item_id)
        if sent:
            await self.send(f"✅ Pitch `{item_id}` approved — email sent!")
        else:
            await self.send(f"⚠️ Pitch `{item_id}` approved but email failed — check logs.")

    async def _handle_skip(self, item_id: str):
        from tools.email_tool import skip_draft
        from agent.money_agent_loop import remove_pending
        remove_pending(item_id)
        skip_draft(item_id)
        await self.send(f"❌ Pitch `{item_id}` skipped.")

    async def _send_earnings_today(self):
        import core.money_roi_tracker as roi
        await self.send(f"📅 *Today's Earnings*\n${roi.today_earnings():.2f}")

    async def _send_earnings_week(self):
        import core.money_roi_tracker as roi
        report = roi.weekly_report()
        msg = (
            f"📊 *Weekly Report*\n"
            f"━━━━━━━━━━━━━━━━\n"
            f"Opportunities found: {report['opportunities_found']}\n"
            f"Pitches sent: {report['pitches_sent']}\n"
            f"Deals closed: {report['deals_closed']}\n"
            f"Total earned: ${report['total_earned']:.2f}\n"
            f"Conversion rate: {report['conversion_rate_pct']:.1f}%\n"
            f"Best strategy: {report['best_strategy']}"
        )
        await self.send(msg)

    async def _start_hunt(self):
        await self.send("🔍 Starting opportunity hunt... I'll notify you with pitches to review.")
        from agent.money_agent_loop import get_money_agent
        agent = get_money_agent()
        result = await agent.run_daily_cycle()
        if result.get("pitches_queued", 0) == 0:
            await self.send("🤷 Hunt complete — no new pitches found this time.")

    # ── Command dispatcher ────────────────────────────────────────────────────

    async def process_command(self, text: str, db) -> str:
        cmd = text.strip()
        cmd_lower = cmd.lower()

        # ── Factory commands ──────────────────────────────────────────────────
        if cmd_lower == "/status":
            await self.send_factory_status(db)

        elif cmd_lower == "/evolveall":
            from core.evolve_engine import get_evolution_manager
            manager = get_evolution_manager()
            agents = await db.agents.find({"status": "idle"}).to_list(10)
            for a in agents:
                await db.agents.update_one({"id": a["id"]}, {"$set": {"status": "evolving"}})
                await manager.start_evolution(a["id"])
            await self.send(f"✅ Started evolution for {len(agents)} agents")

        elif cmd_lower == "/stopall":
            await db.agents.update_many({}, {"$set": {"status": "idle"}})
            await self.send("⏹️ All agents stopped")

        elif cmd_lower.startswith("/create "):
            goal = text[8:].strip()
            name = goal[:30].strip() or "OmniBot Agent"
            from core.factory import get_agent_factory
            factory = get_agent_factory()
            await factory.create_agent(name=name, goal=goal)
            await self.send(f"🤖 Creating agent: {name[:50]}...")

        elif cmd_lower == "/revenue":
            await self.send_revenue_report(db)

        # ── Money Agent commands ──────────────────────────────────────────────
        elif cmd_lower == "/money_status":
            await self._send_money_status()

        elif cmd_lower == "/balance":
            await self._send_paypal_balance()

        elif cmd_lower == "/start_hunt":
            asyncio.create_task(self._start_hunt())

        elif cmd_lower == "/earnings_today":
            await self._send_earnings_today()

        elif cmd_lower == "/earnings_week":
            await self._send_earnings_week()

        elif cmd_lower.startswith("/approve_"):
            item_id = cmd[len("/approve_"):].strip()
            asyncio.create_task(self._handle_approve(item_id))

        elif cmd_lower.startswith("/skip_"):
            item_id = cmd[len("/skip_"):].strip()
            await self._handle_skip(item_id)

        elif cmd_lower == "/help":
            await self.send(
                "*OmniBot Commands:*\n"
                "/status — Factory status\n"
                "/evolveall — Start all idle agents\n"
                "/stopall — Stop all agents\n"
                "/create [goal] — Create new agent\n"
                "/revenue — Legacy revenue report\n\n"
                "*💰 Money Agent:*\n"
                "/money\\_status — Earnings + pending pitches\n"
                "/balance — PayPal balance\n"
                "/start\\_hunt — Find new clients\n"
                "/earnings\\_today — Today's income\n"
                "/earnings\\_week — Weekly report\n"
                "/approve\\_<id> — Send a pitch email\n"
                "/skip\\_<id> — Skip a pitch\n"
                "/help — This message"
            )

        return "ok"

    async def listen(self, db):
        """Continuously listen for Telegram commands via long-polling."""
        while True:
            try:
                async with httpx.AsyncClient(timeout=35) as client:
                    resp = await client.get(
                        f"{self.api}/getUpdates",
                        params={"offset": self.last_update_id + 1, "timeout": 25},
                    )
                    updates = resp.json().get("result", [])
                    for update in updates:
                        self.last_update_id = update["update_id"]
                        msg = update.get("message", {})
                        text = msg.get("text", "")
                        if text:
                            await self.process_command(text, db)
            except Exception as e:
                logger.debug("[Telegram] listen error: %s", e)
                await asyncio.sleep(5)
