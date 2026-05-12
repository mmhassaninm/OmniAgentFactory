"""
Money Agent — single focused income loop.
Strategy: Human-in-the-loop. Agent finds, drafts, prepares. Human approves & sends.
Primary strategy: AI Content Service (cold email to small businesses).
Uses LiteLLM cascader for pitch generation — no single-provider dependency.
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime

from core.config import get_settings
from core.model_router import call_model

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
        "keywords": ["small business hire freelance blog writer", "need content creator remote"],
        "price": 150.0
    },
    "strategy_2_micro_tasks": {
        "name": "Micro Task Automation",
        "niche": "data labeling",
        "description": "Complete tasks on platforms like Amazon MTurk, Clickworker, Remotasks",
        "income_range": "$2-20/task",
        "ban_risk": "LOW",
        "automation_level": 0.80,
        "keywords": ["micro task automation gig", "data entry labeling task remote"],
        "price": 10.0
    },
    "strategy_3_digital_products": {
        "name": "Digital Product Sales",
        "niche": "AI prompts",
        "description": "Create and sell templates, prompts, guides on Gumroad/Etsy",
        "income_range": "$5-200/sale passive",
        "ban_risk": "ZERO",
        "automation_level": 0.90,
        "keywords": ["selling AI prompts bundle", "gumroad digital products template"],
        "price": 25.0
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
        self.strategy_key = strategy_key
        self.strategy = INCOME_STRATEGIES[strategy_key]
        self._settings = get_settings()
        self._notifier = None   # lazy-loaded TelegramCommander
        self._running = False

    async def load_strategy_settings(self) -> dict:
        """Load money agent settings and active strategy from DB."""
        try:
            from core.database import get_db
            db = get_db()
            if db is not None:
                doc = await db.settings.find_one({"_id": "money_settings"})
                if doc:
                    self.strategy_key = doc.get("active_strategy", "strategy_1_content")
                    # Dynamically merge DB settings back into INCOME_STRATEGIES
                    db_configs = doc.get("strategies_config", {})
                    for skey, sconf in db_configs.items():
                        if skey in INCOME_STRATEGIES:
                            INCOME_STRATEGIES[skey].update(sconf)
                    
                    self.strategy = INCOME_STRATEGIES[self.strategy_key]
                    logger.debug("[MoneyAgent] Loaded settings from DB. Active strategy: %s", self.strategy_key)
                    return doc
        except Exception as e:
            logger.warning("[MoneyAgent] Failed to load strategy settings from DB, using fallback: %s", e)
        
        # Fallback
        self.strategy = INCOME_STRATEGIES[self.strategy_key]
        return {}

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
        
        # Hydrate active strategy settings from DB first
        await self.load_strategy_settings()
        logger.info("[MoneyAgent] Daily cycle started — strategy: %s", self.strategy["name"])

        try:
            # ── AI Decision Point 1: Evaluate current strategy ───────────────
            strategy_decision = await self._ai_evaluate_strategy()
            if strategy_decision.get("switch_to"):
                new_key = strategy_decision["switch_to"]
                if new_key in INCOME_STRATEGIES:
                    logger.info("[MoneyAgent] AI recommends switching strategy from %s to %s", self.strategy_key, new_key)
                    self.strategy_key = new_key
                    self.strategy = INCOME_STRATEGIES[new_key]
                    logger.info("[MoneyAgent] Switched strategy to: %s", self.strategy["name"])
                else:
                    logger.warning("[MoneyAgent] AI recommended unknown strategy '%s', keeping current", new_key)

            opportunities = await self.find_opportunities()
            if not opportunities:
                logger.info("[MoneyAgent] No opportunities found this cycle")
                return {"status": "no_opportunities", "found": 0}

            # ── AI Decision Point 2: Rank and select best opportunities ──────
            selected = await self._ai_select_opportunities(opportunities)
            if not selected:
                logger.info("[MoneyAgent] AI selected no opportunities this cycle")
                return {"status": "no_opportunities_selected", "found": len(opportunities), "selected": 0}

            prepared = []
            for opp in selected:
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

    # ── AI Decision: Strategy Evaluation ──────────────────────────────────────

    async def _ai_evaluate_strategy(self) -> dict:
        """Use AI to evaluate whether the current strategy is optimal or should switch."""
        try:
            import core.money_roi_tracker as roi
            stats = roi.weekly_report()

            strategies_summary = "\n".join(
                f"- {k}: {v['name']} ({v['description']}) — income range {v['income_range']}, automation {v['automation_level']}"
                for k, v in INCOME_STRATEGIES.items()
            )

            prompt = (
                f"You are the Money Agent strategist for the NexusOS/OmniBot autonomous income system.\n"
                f"Current active strategy: '{self.strategy_key}' — {self.strategy['name']}\n\n"
                f"Weekly performance stats:\n"
                f"- Opportunities found: {stats.get('opportunities_found', 0)}\n"
                f"- Pitches sent: {stats.get('pitches_sent', 0)}\n"
                f"- Deals closed: {stats.get('deals_closed', 0)}\n"
                f"- Total earned: ${stats.get('total_earned', 0):.2f}\n"
                f"- Conversion rate: {stats.get('conversion_rate_pct', 0)}%\n"
                f"- Best strategy: {stats.get('best_strategy', 'content')}\n\n"
                f"Available strategies:\n{strategies_summary}\n\n"
                f"Based on this data, should the agent continue with the current strategy or switch to a different one?\n"
                f"Respond with a JSON object only (no markdown, no explanation):\n"
                f'{{"strategy_decision": "continue" or "switch", "switch_to": "<strategy_key or null>", "reason": "<brief reason>"}}'
            )
            response = await call_model(
                messages=[{"role": "user", "content": prompt}],
                task_type="money_strategy",
                max_tokens=300
            )
            if response and "[MODEL_ROUTER_ERROR]" not in response:
                # Parse JSON from response (handle potential wrapping)
                cleaned = response.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("\n", 1)[1]
                    cleaned = cleaned.rsplit("\n", 1)[0] if cleaned.endswith("```") else cleaned
                decision = json.loads(cleaned)
                logger.info("[MoneyAgent] AI strategy decision: %s", decision)
                return decision
        except json.JSONDecodeError as e:
            logger.warning("[MoneyAgent] Failed to parse AI strategy decision JSON: %s", e)
        except Exception as e:
            logger.warning("[MoneyAgent] AI strategy evaluation failed (graceful fallback): %s", e)
        return {"strategy_decision": "continue", "switch_to": None, "reason": "AI call failed, defaulting to continue"}

    # ── AI Decision: Opportunity Selection ────────────────────────────────────

    async def _ai_select_opportunities(self, opportunities: list[dict]) -> list[dict]:
        """Use AI to rank and select the best opportunities from the found list."""
        if not opportunities:
            return []

        try:
            # Summarize opportunities for the AI prompt
            opps_summary = "\n".join(
                f"{i+1}. Title: {o.get('title', 'Unknown')[:80]} | URL: {o.get('url', 'N/A')[:60]} | "
                f"Snippet: {o.get('snippet', 'N/A')[:150]} | Value: ${o.get('estimated_value', 0):.0f} | Source: {o.get('source', 'unknown')}"
                for i, o in enumerate(opportunities)
            )

            prompt = (
                f"You are the Money Agent opportunity selector for NexusOS/OmniBot.\n"
                f"Current strategy: {self.strategy['name']} ({self.strategy.get('niche', 'general')})\n"
                f"Income range: {self.strategy.get('income_range', 'N/A')}\n\n"
                f"Below are {len(opportunities)} potential opportunities found from searches. "
                f"Select the top 1-3 most promising opportunities that are most likely to convert into paying clients.\n"
                f"Rank them by: relevance to the niche, likelihood of response, estimated value, and quality of the contact info.\n\n"
                f"Opportunities:\n{opps_summary}\n\n"
                f"Respond with a JSON array only (no markdown, no explanation):\n"
                f'[{{"index": <1-based index>, "score": <0.0-1.0>, "reason": "<brief why this is promising>"}}]'
                f"\nReturn an empty array if none are worth pursuing."
            )
            response = await call_model(
                messages=[{"role": "user", "content": prompt}],
                task_type="money_opportunity_selection",
                max_tokens=500
            )
            if response and "[MODEL_ROUTER_ERROR]" not in response:
                cleaned = response.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("\n", 1)[1]
                    cleaned = cleaned.rsplit("\n", 1)[0] if cleaned.endswith("```") else cleaned
                selections = json.loads(cleaned)
                if isinstance(selections, list) and selections:
                    # Sort by score descending, pick top selections
                    selections.sort(key=lambda s: s.get("score", 0), reverse=True)
                    selected_indices = []
                    for sel in selections[:3]:  # cap at 3
                        idx = sel.get("index", 0) - 1  # convert to 0-based
                        if 0 <= idx < len(opportunities):
                            selected_indices.append(idx)
                    if selected_indices:
                        result = [opportunities[i] for i in selected_indices]
                        logger.info("[MoneyAgent] AI selected %d/%d opportunities", len(result), len(opportunities))
                        return result
        except json.JSONDecodeError as e:
            logger.warning("[MoneyAgent] Failed to parse AI opportunity selection JSON: %s", e)
        except Exception as e:
            logger.warning("[MoneyAgent] AI opportunity selection failed (graceful fallback): %s", e)

        # Fallback: take first 2 if AI fails
        logger.info("[MoneyAgent] AI selection failed, fallback: taking first 2 opportunities")
        return opportunities[:2]

    # ── Opportunity finder ───────────────────────────────────────────────────

    async def find_opportunities(self) -> list[dict]:
        """Use browser or search tool to find potential clients."""
        await self.load_strategy_settings()
        niche = self.strategy.get("niche", "blog writing")
        keywords = self.strategy.get("keywords", [])
        est_val = float(self.strategy.get("price", 150.0))
        
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
                    "estimated_value": est_val,
                    "source": "browser",
                })
        except Exception as e:
            logger.warning("[MoneyAgent] Browser search failed, falling back to search_engine: %s", e)

        # Fallback: DuckDuckGo via search_engine service
        if not results:
            try:
                from services.search_engine import SearchEngine
                engine = SearchEngine()
                
                # If no custom keywords defined, default to basic search queries
                queries = keywords if keywords else [
                    f"small business hire freelance {niche}",
                    f"need {niche} remote provider",
                ]
                
                for q in queries[:2]:
                    hits = await asyncio.to_thread(engine.search, q)
                    for h in (hits or [])[:4]:
                        results.append({
                            "title": h.get("title", ""),
                            "url": h.get("url", ""),
                            "snippet": h.get("body", ""),
                            "niche": niche,
                            "estimated_value": est_val,
                            "source": "search_engine",
                        })
            except Exception as e:
                logger.warning("[MoneyAgent] Search engine fallback failed: %s", e)

        return results

    # ── Pitch writer ─────────────────────────────────────────────────────────

    async def _prepare_pitch(self, opportunity: dict) -> dict:
        """Generate a personalized cold email pitch using LiteLLM cascader."""
        await self.load_strategy_settings()
        item_id = str(uuid.uuid4())[:8]
        niche = self.strategy.get("niche", "blog writing")
        est_val = float(self.strategy.get("price", opportunity.get("estimated_value", 150.0)))

        prompt = f"""You are a professional in the niche of '{niche}' writing a short cold email outreach.

Business/contact info:
- Name/Title: {opportunity.get('title', 'the business owner')}
- URL: {opportunity.get('url', '')}
- Context: {opportunity.get('snippet', '')[:300]}

Write a concise, human-sounding cold outreach email (max 120 words) that:
1. Opens with a specific observation about their business or target area (not generic)
2. Offers a concrete deliverable/solution matching niche '{niche}'
3. States your target pricing/rate range (${self.strategy.get('income_range', '$50-500')})
4. Ends with a simple call to action (reply to discuss)
5. Does NOT sound salesy, automated, or spammy

Output only the email body, no subject line, no placeholder brackets."""

        # Use LiteLLM cascader — works with any available provider (Claude, Groq, OpenRouter, etc.)
        try:
            pitch_body = await call_model(
                messages=[{"role": "user", "content": prompt}],
                task_type="pitch_generation",
                max_tokens=300
            )
            pitch_body = pitch_body.strip()
        except Exception as e:
            logger.warning("[MoneyAgent] Pitch generation failed (cascader exhausted?): %s", e)
            pitch_body = f"[Pitch generation failed: {str(e)[:100]}]"

        subject = f"Quick question about your {niche} needs"
        item = {
            "id": item_id,
            "opportunity": opportunity,
            "pitch_subject": subject,
            "pitch_body": pitch_body,
            "estimated_value": est_val,
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
            except Exception as e:
                logger.debug("Failed to find contact email for opportunity %s: %s", item["opportunity"].get("url"), e)

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
