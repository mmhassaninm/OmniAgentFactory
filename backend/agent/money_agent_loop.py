"""
Money Agent — single focused income loop.
Strategy: Human-in-the-loop. Agent finds, drafts, prepares. Human approves & sends.
Primary strategy: AI Content Service (cold email to small businesses).
"""
import asyncio
import logging
import uuid
from datetime import datetime

import anthropic

from core.config import get_settings

logger = logging.getLogger(__name__)

# ── Strategy registry ────────────────────────────────────────────────────────

INCOME_STRATEGIES = {
    "strategy_1_content": {
        "name": "AI Content Service",
        "niche": "blog writing",
        "description": "Find businesses needing blog posts/social media content via cold email",
        "income_range": "$50-500/project",
        "ban_risk": "ZERO",
        "automation_level": 0.95,
    },
    "strategy_2_micro_tasks": {
        "name": "Micro Task Automation",
        "niche": "data labeling",
        "description": "Complete tasks on platforms like Amazon MTurk, Clickworker, Remotasks",
        "income_range": "$2-20/task",
        "ban_risk": "LOW",
        "automation_level": 0.80,
    },
    "strategy_3_digital_products": {
        "name": "Digital Product Sales",
        "niche": "AI prompts",
        "description": "Create and sell templates, prompts, guides on Gumroad/Etsy",
        "income_range": "$5-200/sale passive",
        "ban_risk": "ZERO",
        "automation_level": 0.90,
    },
}

# ── Pending approval store ───────────────────────────────────────────────────
# Shared with telegram_commander and money API
_pending: dict[str, dict] = {}


def get_pending() -> dict[str, dict]:
    return _pending


def get_pending_item(item_id: str) -> dict | None:
    return _pending.get(item_id)


def remove_pending(item_id: str) -> dict | None:
    return _pending.pop(item_id, None)


# ── Main agent class ─────────────────────────────────────────────────────────

class MoneyAgentLoop:
    def __init__(self, strategy_key: str = "strategy_1_content"):
        self.strategy = INCOME_STRATEGIES[strategy_key]
        self.strategy_key = strategy_key
        self._settings = get_settings()
        self._anthropic: anthropic.AsyncAnthropic | None = None
        self._notifier = None   # lazy-loaded TelegramCommander
        self._running = False

    def _get_anthropic(self) -> anthropic.AsyncAnthropic:
        if self._anthropic is None:
            api_key = self._settings.anthropic_key
            if not api_key:
                raise RuntimeError("ANTHROPIC_KEY not configured — cannot generate pitches")
            self._anthropic = anthropic.AsyncAnthropic(api_key=api_key)
        return self._anthropic

    async def _get_notifier(self):
        if self._notifier is None and self._settings.telegram_bot_token and self._settings.telegram_chat_id:
            from services.telegram_commander import TelegramCommander
            self._notifier = TelegramCommander(
                self._settings.telegram_bot_token,
                self._settings.telegram_chat_id,
            )
        return self._notifier

    # ── Daily cycle ──────────────────────────────────────────────────────────

    async def run_daily_cycle(self) -> dict:
        """Entry point: find opportunities, draft pitches, notify human."""
        if self._running:
            return {"status": "already_running"}
        self._running = True
        logger.info("[MoneyAgent] Daily cycle started — strategy: %s", self.strategy["name"])

        try:
            opportunities = await self.find_opportunities()
            if not opportunities:
                logger.info("[MoneyAgent] No opportunities found this cycle")
                return {"status": "no_opportunities", "found": 0}

            prepared = []
            for opp in opportunities[:5]:  # cap at 5 per cycle to avoid spam
                try:
                    item = await self._prepare_pitch(opp)
                    prepared.append(item)
                    import core.money_roi_tracker as roi
                    await roi.log_opportunity(opp)
                except Exception as e:
                    logger.warning("[MoneyAgent] Failed to prepare pitch for %s: %s", opp.get("title"), e)

            await self._notify_human_for_review(prepared)
            logger.info("[MoneyAgent] Daily cycle complete — %d pitches queued for approval", len(prepared))
            return {"status": "ok", "opportunities_found": len(opportunities), "pitches_queued": len(prepared)}
        except Exception as e:
            logger.error("[MoneyAgent] Daily cycle failed: %s", e)
            return {"status": "error", "error": str(e)}
        finally:
            self._running = False

    # ── Opportunity finder ───────────────────────────────────────────────────

    async def find_opportunities(self) -> list[dict]:
        """Use browser or search tool to find potential clients."""
        niche = self.strategy["niche"]
        results: list[dict] = []

        # Try browser tool first (real browser search)
        try:
            from tools.browser_tool import get_browser_tool
            browser = await get_browser_tool()
            raw = await browser.search_for_clients(niche, limit=8)
            for r in raw:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": r.get("snippet", ""),
                    "niche": niche,
                    "estimated_value": 150.0,
                    "source": "browser",
                })
        except Exception as e:
            logger.warning("[MoneyAgent] Browser search failed, falling back to search_engine: %s", e)

        # Fallback: DuckDuckGo via search_engine service
        if not results:
            try:
                from services.search_engine import SearchEngine
                engine = SearchEngine()
                queries = [
                    f"small business hire freelance {niche} writer",
                    f"need {niche} content creator remote",
                ]
                for q in queries:
                    hits = await asyncio.to_thread(engine.search, q)
                    for h in (hits or [])[:4]:
                        results.append({
                            "title": h.get("title", ""),
                            "url": h.get("url", ""),
                            "snippet": h.get("body", ""),
                            "niche": niche,
                            "estimated_value": 150.0,
                            "source": "search_engine",
                        })
            except Exception as e:
                logger.warning("[MoneyAgent] Search engine fallback failed: %s", e)

        return results

    # ── Pitch writer ─────────────────────────────────────────────────────────

    async def _prepare_pitch(self, opportunity: dict) -> dict:
        """Generate a personalized cold email pitch using Claude."""
        item_id = str(uuid.uuid4())[:8]
        client = self._get_anthropic()

        paypal_link = self._settings.paypal_me_link or "paypal.me/mmhassanin"
        niche = self.strategy["niche"]

        prompt = f"""You are a freelance {niche} professional writing a short cold email pitch.

Business/contact info:
- Name/Title: {opportunity.get('title', 'the business owner')}
- URL: {opportunity.get('url', '')}
- Context: {opportunity.get('snippet', '')[:300]}

Write a concise, human-sounding cold email (max 120 words) that:
1. Opens with a specific observation about their business (not generic)
2. Offers a concrete deliverable (e.g. "3 SEO blog posts per month")
3. States your rate range (${self.strategy['income_range']})
4. Ends with a simple call to action (reply to discuss)
5. Does NOT sound salesy or spammy

Output only the email body, no subject line, no placeholder brackets."""

        msg = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        pitch_body = msg.content[0].text.strip()

        subject = f"Quick question about your {niche} content"
        item = {
            "id": item_id,
            "opportunity": opportunity,
            "pitch_subject": subject,
            "pitch_body": pitch_body,
            "estimated_value": opportunity.get("estimated_value", 150.0),
            "strategy": self.strategy_key,
            "created_at": datetime.now().isoformat(),
            "status": "PENDING_HUMAN",
        }
        _pending[item_id] = item
        return item

    # ── Human notification ───────────────────────────────────────────────────

    async def _notify_human_for_review(self, items: list[dict]) -> None:
        notifier = await self._get_notifier()
        if notifier is None:
            logger.info("[MoneyAgent] Telegram not configured — pitches queued in dashboard only")
            return

        for item in items:
            opp = item["opportunity"]
            msg = (
                f"🤖 *MONEY AGENT — New Pitch Ready*\n"
                f"━━━━━━━━━━━━━━━━━━━━━━\n"
                f"📋 *Target:* {opp.get('title', 'Unknown')[:60]}\n"
                f"🌐 *URL:* {opp.get('url', 'N/A')[:80]}\n"
                f"💰 *Est. Value:* ${item['estimated_value']:.0f}\n\n"
                f"*Subject:* {item['pitch_subject']}\n\n"
                f"*Email draft:*\n{item['pitch_body'][:600]}\n\n"
                f"Reply:\n"
                f"✅ `/approve_{item['id']}` — send this pitch\n"
                f"❌ `/skip_{item['id']}` — skip\n"
            )
            try:
                await notifier.send(msg)
            except Exception as e:
                logger.warning("[MoneyAgent] Telegram notify failed for %s: %s", item["id"], e)

    # ── Approval handler ─────────────────────────────────────────────────────

    async def handle_approved(self, item_id: str) -> bool:
        """
        Called when human approves a pitch (via Telegram or dashboard).
        Stages the email for sending and logs the pitch as sent.
        """
        item = _pending.get(item_id)
        if not item:
            logger.warning("[MoneyAgent] Approved item %s not found in pending", item_id)
            return False

        # Find or guess client email
        client_email = item["opportunity"].get("contact_email")
        if not client_email:
            try:
                from tools.browser_tool import get_browser_tool
                browser = await get_browser_tool()
                client_email = await browser.find_contact_email(item["opportunity"].get("url", ""))
            except Exception:
                pass

        if not client_email:
            logger.warning("[MoneyAgent] No contact email found for item %s", item_id)
            # Still draft it so the human can fill in the address
            client_email = "UNKNOWN — please fill in"

        from tools.email_tool import draft_email, send_approved_email
        await draft_email(
            to=client_email,
            subject=item["pitch_subject"],
            body=item["pitch_body"],
            pitch_id=item_id,
        )
        sent = await send_approved_email(item_id)

        import core.money_roi_tracker as roi
        await roi.log_pitch_sent(item_id, item["estimated_value"], item["strategy"])

        _pending[item_id]["status"] = "APPROVED_SENT" if sent else "APPROVED_EMAIL_FAILED"
        logger.info("[MoneyAgent] Item %s approved — email sent: %s", item_id, sent)
        return sent

    async def create_invoice_for_deal(self, client_email: str, amount: float, description: str) -> dict:
        """Create a PayPal invoice for a completed deal."""
        from services.paypal_service import get_paypal_service
        paypal = get_paypal_service()
        result = await paypal.create_invoice(client_email, amount, description)

        import core.money_roi_tracker as roi
        await roi.log_deal_closed(amount, self.strategy_key, client_email)
        return result


# ── Singleton ────────────────────────────────────────────────────────────────
_money_agent: MoneyAgentLoop | None = None


def get_money_agent() -> MoneyAgentLoop:
    global _money_agent
    if _money_agent is None:
        _money_agent = MoneyAgentLoop()
    return _money_agent
