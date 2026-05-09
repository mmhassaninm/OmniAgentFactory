"""
Control the entire OmniBot factory from Telegram.
Send commands from anywhere, receive live updates.
"""
import asyncio
import httpx
from datetime import datetime


class TelegramCommander:
    def __init__(self, bot_token: str, chat_id: str):
        self.token = bot_token
        self.chat_id = chat_id
        self.api = f"https://api.telegram.org/bot{bot_token}"
        self.last_update_id = 0

    async def send(self, message: str):
        async with httpx.AsyncClient() as client:
            await client.post(f"{self.api}/sendMessage", json={
                "chat_id": self.chat_id,
                "text": message,
                "parse_mode": "Markdown"
            })

    async def send_factory_status(self, db):
        agents = await db.agents.find().to_list(100)
        evolving = [a for a in agents if a.get("status") == "evolving"]
        idle = [a for a in agents if a.get("status") == "idle"]

        status = f"""
🏭 *OmniBot Factory Status*
━━━━━━━━━━━━━━━━
⚡ Evolving: {len(evolving)} agents
💤 Idle: {len(idle)} agents
📊 Total: {len(agents)} agents

*Active Agents:*
"""
        for a in evolving[:5]:
            score = int(a.get("current_score", 0) * 100)
            status += f"• {a.get('name','unknown')} — v{a.get('version',0)} ({score}%)\n"

        await self.send(status)

    async def send_revenue_report(self, db):
        agents = await db.agents.find().to_list(100)
        total_agents = len(agents)
        top_agents = sorted(agents, key=lambda a: a.get("score", 0), reverse=True)[:5]

        report = f"""
📈 *Revenue Report*
━━━━━━━━━━━━━━
Total agents: {total_agents}
Top performers:
"""
        for a in top_agents:
            report += f"• {a.get('name','unknown')} — score {a.get('score',0):.2f}, v{a.get('version',0)}\n"
        await self.send(report)

    async def process_command(self, text: str, db) -> str:
        cmd = text.strip().lower()

        if cmd == "/status":
            await self.send_factory_status(db)
        elif cmd == "/evolveall":
            from core.database import get_db
            from core.evolve_engine import get_evolution_manager

            manager = get_evolution_manager()
            agents = await db.agents.find({"status": "idle"}).to_list(10)
            for a in agents:
                await db.agents.update_one(
                    {"id": a["id"]},
                    {"$set": {"status": "evolving"}},
                )
                await manager.start_evolution(a["id"])
            await self.send(f"✅ Started evolution for {len(agents)} agents")
        elif cmd == "/stopall":
            await db.agents.update_many({}, {"$set": {"status": "idle"}})
            await self.send("⏹️ All agents stopped")
        elif cmd.startswith("/create "):
            goal = text[8:].strip()
            name = goal[:30].strip() or "OmniBot Agent"
            from core.factory import get_agent_factory
            factory = get_agent_factory()
            await factory.create_agent(name=name, goal=goal)
            await self.send(f"🤖 Creating agent: {name[:50]}...")
        elif cmd == "/revenue":
            await self.send_revenue_report(db)
        elif cmd == "/help":
            await self.send("""
*OmniBot Commands:*
/status — Factory status
/evolveall — Start all idle agents  
/stopall — Stop all agents
/create [goal] — Create new agent
/revenue — Revenue report
/help — This message
""")
        return "ok"

    async def listen(self, db):
        """Continuously listen for Telegram commands."""
        while True:
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.get(
                        f"{self.api}/getUpdates",
                        params={"offset": self.last_update_id + 1, "timeout": 25}
                    )
                    updates = resp.json().get("result", [])

                    for update in updates:
                        self.last_update_id = update["update_id"]
                        msg = update.get("message", {})
                        text = msg.get("text", "")
                        if text:
                            await self.process_command(text, db)
            except Exception:
                await asyncio.sleep(5)
