"""
Revenue Intelligence API — endpoints for revenue tracking and analytics.

Endpoints:
  GET /api/revenue/summary — today, week, month totals + growth
  GET /api/revenue/chart — time-series data for frontend chart
  GET /api/revenue/alerts — recent revenue anomalies
  POST /api/revenue/manual — add manual revenue entry
"""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from core.database import get_db
from core.revenue_intelligence import get_revenue_intelligence

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/revenue", tags=["Revenue"])


@router.get("/summary")
async def revenue_summary() -> dict[str, Any]:
    """
    Get revenue summary: today, this week, this month, MoM growth, source breakdown.
    """
    try:
        ri = get_revenue_intelligence()
        summary = await ri.get_summary()
        return {"status": "ok", "data": summary}
    except Exception as e:
        logger.warning("[Revenue] Summary error: %s", e)
        raise HTTPException(status_code=500, detail=str(e)[:200])


@router.get("/chart")
async def revenue_chart(days: int = 30) -> dict[str, Any]:
    """
    Get time-series revenue data for charting.
    Query param: days (default 30)
    """
    try:
        ri = get_revenue_intelligence()
        chart_data = await ri.get_chart_data(days=days)
        return {"status": "ok", "days": days, "data": chart_data}
    except Exception as e:
        logger.warning("[Revenue] Chart error: %s", e)
        return {"status": "ok", "data": []}


@router.get("/alerts")
async def revenue_alerts() -> dict[str, Any]:
    """
    Get recent revenue anomalies (drops > 20% from 7-day average).
    """
    try:
        ri = get_revenue_intelligence()
        anomalies = await ri.detect_anomalies()
        return {"status": "ok", "alerts": anomalies}
    except Exception as e:
        logger.warning("[Revenue] Alerts error: %s", e)
        return {"status": "ok", "alerts": []}


@router.post("/manual")
async def manual_revenue_entry(body: dict[str, Any]) -> dict[str, str]:
    """
    Add a manual revenue entry.
    Body: { source: str, amount: float, currency?: str, metadata?: dict }
    """
    source = body.get("source", "manual")
    amount = body.get("amount", 0.0)
    currency = body.get("currency", "USD")
    metadata = body.get("metadata", {})

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    try:
        ri = get_revenue_intelligence()
        await ri.record_snapshot(
            source=source,
            amount=float(amount),
            currency=currency,
            metadata=metadata,
        )
        logger.info("[Revenue] Manual entry: %s $%.2f", source, amount)
        return {"status": "ok", "source": source, "amount": f"${amount:.2f}"}
    except Exception as e:
        logger.warning("[Revenue] Manual entry error: %s", e)
        raise HTTPException(status_code=500, detail=str(e)[:200])