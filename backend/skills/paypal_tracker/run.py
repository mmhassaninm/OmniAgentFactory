"""
PayPal Tracker skill — check balance, get transactions, and generate earnings summaries.
Entry points: check_balance, get_transactions, get_earnings_summary
"""

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def check_balance() -> dict[str, Any]:
    """
    Check PayPal balance using the paypal_service.

    Returns:
        dict with balance data and status
    """
    try:
        from services.paypal_service import get_paypal_service

        import asyncio
        loop = asyncio.new_event_loop()
        try:
            paypal = get_paypal_service()
            data = loop.run_until_complete(paypal.check_balance())
            return data
        finally:
            loop.close()
    except Exception as e:
        logger.warning("[Skill paypal_tracker] check_balance error: %s", e)
        return {"status": "error", "error": str(e)[:200]}


def get_transactions(days: int = 30) -> dict[str, Any]:
    """
    Get recent PayPal transactions.

    Args:
        days: Number of days to look back (default 30)

    Returns:
        dict with transactions list and status
    """
    try:
        from services.paypal_service import get_paypal_service

        import asyncio
        loop = asyncio.new_event_loop()
        try:
            paypal = get_paypal_service()
            data = loop.run_until_complete(paypal.get_transactions(days=days))
            return data
        finally:
            loop.close()
    except Exception as e:
        logger.warning("[Skill paypal_tracker] get_transactions error: %s", e)
        return {"status": "error", "error": str(e)[:200]}


def get_earnings_summary(days: int = 7) -> dict[str, Any]:
    """
    Get a summary of earnings over a period.

    Args:
        days: Number of days to look back (default 7)

    Returns:
        dict with earnings data and status
    """
    try:
        import core.money_roi_tracker as roi

        return {
            "status": "ok",
            "today": roi.today_earnings(),
            "this_week": roi.week_earnings(),
            "this_month": roi.month_earnings(),
            "pitches_sent": roi.pitches_sent_this_week(),
            "deals_closed": roi.deals_closed_this_week(),
            "conversion_rate": roi.conversion_rate(),
        }
    except Exception as e:
        logger.warning("[Skill paypal_tracker] get_earnings_summary error: %s", e)
        return {"status": "error", "error": str(e)[:200]}