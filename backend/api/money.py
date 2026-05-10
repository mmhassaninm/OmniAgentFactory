"""
Money Agent API router — /api/money/*
Exposes agent status, PayPal data, earnings, pitch approval, and invoice creation.
"""
import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request models ────────────────────────────────────────────────────────────

class InvoiceRequest(BaseModel):
    client_email: str
    amount: float
    description: str
    currency: str = "USD"


# ── Status & config ───────────────────────────────────────────────────────────

@router.get("/status")
async def get_status():
    """Agent mode, pending approval count, and readiness flags."""
    from core.config import get_settings
    from agent.money_agent_loop import get_pending
    from tools.email_tool import get_pending_drafts

    s = get_settings()
    pending = get_pending()
    pending_pitches = len([v for v in pending.values() if v.get("status") == "PENDING_HUMAN"])
    pending_emails  = len(get_pending_drafts())

    return {
        "agent_mode": s.agent_mode,
        "paypal_configured": bool(s.paypal_client_id and s.paypal_client_secret),
        "paypal_sandbox": s.paypal_sandbox,
        "gmail_configured": bool(s.gmail_address and s.gmail_app_password),
        "telegram_configured": bool(s.telegram_bot_token and s.telegram_chat_id),
        "pending_pitches": pending_pitches,
        "pending_emails": pending_emails,
        "paypal_me_link": s.paypal_me_link,
    }


# ── PayPal ────────────────────────────────────────────────────────────────────

@router.get("/balance")
async def get_paypal_balance():
    """Fetch live PayPal account balance."""
    from services.paypal_service import get_paypal_service
    return await get_paypal_service().check_balance()


@router.get("/payments")
async def get_recent_payments(days: int = 7):
    """Return recent PayPal payments received."""
    from services.paypal_service import get_paypal_service
    return {"days": days, "payments": await get_paypal_service().get_recent_payments(days)}


@router.post("/invoice")
async def create_invoice(req: InvoiceRequest):
    """Create and send a PayPal invoice to a client."""
    from services.paypal_service import get_paypal_service
    result = await get_paypal_service().create_invoice(
        req.client_email, req.amount, req.description, req.currency
    )
    if "error" in result and result.get("invoice_id") is None:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


# ── Earnings ──────────────────────────────────────────────────────────────────

@router.get("/earnings")
async def get_earnings():
    """Today / week / month earnings from logged deals."""
    import core.money_roi_tracker as roi
    return {
        "today": roi.today_earnings(),
        "week": roi.week_earnings(),
        "month": roi.month_earnings(),
        "pitches_sent_week": roi.pitches_sent_this_week(),
        "deals_closed_week": roi.deals_closed_this_week(),
        "conversion_rate_pct": roi.conversion_rate(),
        "best_strategy": roi.best_performing_strategy(),
    }


@router.get("/report")
async def weekly_report():
    """Full weekly income report."""
    import core.money_roi_tracker as roi
    return roi.weekly_report()


# ── Opportunities ─────────────────────────────────────────────────────────────

@router.get("/opportunities")
async def get_opportunities():
    """Recent opportunities found by the agent."""
    import core.money_roi_tracker as roi
    return {"opportunities": roi.recent_opportunities(20)}


# ── Pitches / approval flow ───────────────────────────────────────────────────

@router.get("/pending")
async def get_pending_items():
    """List all pitches awaiting human approval."""
    from agent.money_agent_loop import get_pending
    pending = get_pending()
    items = [v for v in pending.values() if v.get("status") == "PENDING_HUMAN"]
    return {"count": len(items), "items": items}


@router.post("/approve/{item_id}")
async def approve_pitch(item_id: str):
    """Approve a pitch — drafts and sends the email."""
    from agent.money_agent_loop import get_money_agent
    agent = get_money_agent()
    sent = await agent.handle_approved(item_id)
    return {"item_id": item_id, "sent": sent, "status": "APPROVED_SENT" if sent else "APPROVED_EMAIL_FAILED"}


@router.post("/skip/{item_id}")
async def skip_pitch(item_id: str):
    """Skip (reject) a pending pitch."""
    from agent.money_agent_loop import remove_pending
    from tools.email_tool import skip_draft
    removed = remove_pending(item_id)
    skip_draft(item_id)
    if removed is None:
        raise HTTPException(status_code=404, detail=f"Item {item_id} not found")
    return {"item_id": item_id, "status": "SKIPPED"}


# ── Hunt trigger ──────────────────────────────────────────────────────────────

@router.post("/hunt")
async def trigger_hunt():
    """Start a new opportunity search cycle (async — returns immediately)."""
    from agent.money_agent_loop import get_money_agent
    agent = get_money_agent()

    async def _run():
        try:
            await agent.run_daily_cycle()
        except Exception as e:
            logger.error("[MoneyAPI] Background hunt failed: %s", e)

    asyncio.create_task(_run())
    return {"status": "hunt_started", "message": "Agent is searching for opportunities in the background."}
