"""
Money ROI Tracker — income-level tracking for the Money Agent.
Separate from core/roi_tracker.py which tracks token/score ROI for agent evolution.
Persists to MongoDB collection `money_roi`; gracefully degrades if DB is unavailable.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── In-memory fallback (also used as write-through cache) ────────────────────
_opportunities: list[dict] = []
_pitches: dict[str, dict] = {}         # pitch_id → pitch record
_deals: list[dict] = []


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _day_start(offset_days: int = 0) -> datetime:
    d = _now() - timedelta(days=offset_days)
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


# ── Write operations ─────────────────────────────────────────────────────────

async def log_opportunity(opp: dict, db=None) -> str:
    """Record a found lead/opportunity. Returns its generated ID."""
    opp_id = str(uuid.uuid4())[:8]
    record = {
        "id": opp_id,
        "title": opp.get("title", "Unknown"),
        "url": opp.get("url", ""),
        "niche": opp.get("niche", "content"),
        "estimated_value": float(opp.get("estimated_value", 0)),
        "found_at": _now(),
    }
    _opportunities.append(record)
    if db is not None:
        try:
            await db.money_roi.insert_one({"type": "opportunity", **record})
        except Exception as e:
            logger.debug("[MoneyROI] DB write failed for opportunity: %s", e)
    return opp_id


async def log_pitch_sent(pitch_id: str, estimated_value: float = 0.0, strategy: str = "content", db=None) -> None:
    """Record that a pitch was approved by human and sent."""
    _pitches[pitch_id] = {
        "pitch_id": pitch_id,
        "estimated_value": estimated_value,
        "strategy": strategy,
        "sent_at": _now(),
        "replied": False,
        "closed": False,
    }
    if db is not None:
        try:
            await db.money_roi.insert_one({"type": "pitch", **_pitches[pitch_id]})
        except Exception as e:
            logger.debug("[MoneyROI] DB write failed for pitch: %s", e)


async def log_reply_received(pitch_id: str, db=None) -> None:
    """Record that a client replied to a pitch."""
    if pitch_id in _pitches:
        _pitches[pitch_id]["replied"] = True
        _pitches[pitch_id]["replied_at"] = _now()
    if db is not None:
        try:
            await db.money_roi.update_one(
                {"type": "pitch", "pitch_id": pitch_id},
                {"$set": {"replied": True, "replied_at": _now()}},
            )
        except Exception as e:
            logger.debug("[MoneyROI] DB update failed for reply: %s", e)


async def log_deal_closed(amount: float, source: str = "content", client_email: str = "", pitch_id: str = "", db=None) -> None:
    """Record a completed, paid deal."""
    record = {
        "id": str(uuid.uuid4())[:8],
        "amount": amount,
        "source": source,
        "client_email": client_email,
        "pitch_id": pitch_id,
        "closed_at": _now(),
    }
    _deals.append(record)
    if pitch_id and pitch_id in _pitches:
        _pitches[pitch_id]["closed"] = True
        _pitches[pitch_id]["actual_value"] = amount
    if db is not None:
        try:
            await db.money_roi.insert_one({"type": "deal", **record})
        except Exception as e:
            logger.debug("[MoneyROI] DB write failed for deal: %s", e)
    logger.info("[MoneyROI] Deal closed: $%.2f from %s (%s)", amount, client_email, source)


# ── Read operations ──────────────────────────────────────────────────────────

def today_earnings() -> float:
    start = _day_start()
    return sum(d["amount"] for d in _deals if d["closed_at"] >= start)


def week_earnings() -> float:
    start = _day_start(6)
    return sum(d["amount"] for d in _deals if d["closed_at"] >= start)


def month_earnings() -> float:
    start = _day_start(29)
    return sum(d["amount"] for d in _deals if d["closed_at"] >= start)


def pitches_sent_this_week() -> int:
    start = _day_start(6)
    return sum(1 for p in _pitches.values() if p.get("sent_at", _now()) >= start)


def deals_closed_this_week() -> int:
    start = _day_start(6)
    return sum(1 for d in _deals if d["closed_at"] >= start)


def conversion_rate() -> float:
    total_pitches = len(_pitches)
    total_deals = len(_deals)
    if total_pitches == 0:
        return 0.0
    return round(total_deals / total_pitches * 100, 1)


def best_performing_strategy() -> str:
    if not _deals:
        return "content"
    from collections import Counter
    return Counter(d["source"] for d in _deals).most_common(1)[0][0]


def weekly_report() -> dict:
    return {
        "period": "last_7_days",
        "opportunities_found": len([o for o in _opportunities if o["found_at"] >= _day_start(6)]),
        "pitches_sent": pitches_sent_this_week(),
        "deals_closed": deals_closed_this_week(),
        "total_earned": week_earnings(),
        "conversion_rate_pct": conversion_rate(),
        "best_strategy": best_performing_strategy(),
        "generated_at": _now().isoformat(),
    }


def recent_opportunities(limit: int = 20) -> list[dict]:
    return list(reversed(_opportunities[-limit:]))


def get_all_pitches() -> list[dict]:
    return list(_pitches.values())


async def load_from_db(db) -> None:
    """Load existing money ROI history from MongoDB to hydrate the in-memory cache."""
    global _opportunities, _pitches, _deals
    if db is None:
        return
    try:
        # Clear in-memory cache first to avoid duplicates
        _opportunities.clear()
        _pitches.clear()
        _deals.clear()

        # Load opportunities
        async for doc in db.money_roi.find({"type": "opportunity"}):
            doc.pop("_id", None)
            doc.pop("type", None)
            _opportunities.append(doc)

        # Load pitches
        async for doc in db.money_roi.find({"type": "pitch"}):
            doc.pop("_id", None)
            doc.pop("type", None)
            pitch_id = doc.get("pitch_id")
            if pitch_id:
                _pitches[pitch_id] = doc

        # Load deals
        async for doc in db.money_roi.find({"type": "deal"}):
            doc.pop("_id", None)
            doc.pop("type", None)
            _deals.append(doc)

        logger.info(
            "[MoneyROI] Hydrated from MongoDB: %d opportunities, %d pitches, %d deals",
            len(_opportunities), len(_pitches), len(_deals)
        )
    except Exception as e:
        logger.error("[MoneyROI] Failed to hydrate cache from DB: %s", e)

