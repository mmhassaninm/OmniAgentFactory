"""
Money Agent API router — /api/money/*
Exposes agent status, PayPal data, earnings, pitch approval, and invoice creation.
"""
import asyncio
import logging
import hashlib

from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, validator

from utils.validators import (
    validate_email,
    validate_positive_int,
    validate_percentage,
    ValidationError,
)
from utils.error_response import http_exception, ErrorCode
from utils.query_optimizer import get_query_cache

logger = logging.getLogger(__name__)
router = APIRouter()

# Get the query cache instance for request deduplication
_query_cache = get_query_cache()
_IDEMPOTENCY_KEY_HEADER = "X-Idempotency-Key"


# ── Request models ────────────────────────────────────────────────────────────

class InvoiceRequest(BaseModel):
    client_email: str
    amount: float
    description: str
    currency: str = "USD"

    @validator("client_email")
    def validate_client_email(cls, v):
        try:
            validate_email(v)
        except ValidationError as e:
            raise ValueError(e.message)
        return v

    @validator("amount")
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        if v > 1_000_000:
            raise ValueError("Amount must be less than $1,000,000")
        return v

    @validator("currency")
    def validate_currency(cls, v):
        valid_currencies = {"USD", "EUR", "GBP", "JPY", "CAD", "AUD"}
        if v.upper() not in valid_currencies:
            raise ValueError(f"Currency must be one of: {', '.join(valid_currencies)}")
        return v.upper()


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
    try:
        if days < 1 or days > 365:
            raise ValueError("Days must be between 1 and 365")
        validate_positive_int(days, "days")
    except ValidationError as e:
        raise http_exception(e.message, 400, ErrorCode.VALIDATION_ERROR, {"field": "days"})
    except ValueError as e:
        raise http_exception(str(e), 400, ErrorCode.BAD_REQUEST, {"field": "days"})

    from services.paypal_service import get_paypal_service
    return {"days": days, "payments": await get_paypal_service().get_recent_payments(days)}


@router.post("/invoice")
async def create_invoice(
    req: InvoiceRequest,
    idempotency_key: str = Header(None, alias=_IDEMPOTENCY_KEY_HEADER)
):
    """Create and send a PayPal invoice to a client.

    Supports idempotency via X-Idempotency-Key header to prevent duplicate invoices.
    Returns cached result if same idempotency key is used within 24 hours.
    """
    # Check if idempotency key was provided and result is cached
    if idempotency_key:
        cache_key = f"invoice_idempotency:{idempotency_key}"
        cached_result = _query_cache.get(cache_key)
        if cached_result is not None:
            logger.info("Returning cached invoice result for idempotency key: %s", idempotency_key)
            return cached_result

    from services.paypal_service import get_paypal_service
    result = await get_paypal_service().create_invoice(
        req.client_email, req.amount, req.description, req.currency
    )
    if "error" in result and result.get("invoice_id") is None:
        raise http_exception(
            result["error"],
            502,
            ErrorCode.EXTERNAL_SERVICE_ERROR,
            {"service": "paypal", "error": result["error"]}
        )

    # Cache successful result with 24-hour TTL if idempotency key was provided
    if idempotency_key:
        try:
            cache_key = f"invoice_idempotency:{idempotency_key}"
            _query_cache.set(cache_key, result, ttl_seconds=86400)  # 24 hours
            logger.debug("Cached invoice result for idempotency key: %s", idempotency_key)
        except Exception as e:
            logger.warning("Failed to cache invoice result: %s", e)

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
