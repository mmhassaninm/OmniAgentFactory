"""
Unified Revenue Intelligence — aggregates revenue from PayPal, Shopify, and manual entries.
Stores daily snapshots in MongoDB and detects anomalies.
"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from core.database import get_db

logger = logging.getLogger(__name__)


class RevenueIntelligence:
    """
    Aggregates revenue across all sources, stores daily snapshots,
    calculates growth metrics, and detects anomalies.
    """

    async def record_snapshot(self, source: str, amount: float, currency: str = "USD", metadata: dict[str, Any] | None = None) -> None:
        """Record a daily revenue snapshot from any source."""
        db = get_db()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        await db.revenue_snapshots.insert_one({
            "date": today,
            "source": source,
            "amount": amount,
            "currency": currency,
            "metadata": metadata or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    async def get_summary(self) -> dict[str, Any]:
        """Get revenue summary for today, week, month, and growth."""
        db = get_db()
        now = datetime.now(timezone.utc)
        today_start = now.strftime("%Y-%m-%d")
        week_ago = (now - timedelta(days=7)).isoformat()
        month_ago = (now - timedelta(days=30)).isoformat()

        # Daily revenue
        pipeline_today: list[dict[str, Any]] = [
            {"$match": {"date": today_start}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        today_result = await db.revenue_snapshots.aggregate(pipeline_today).to_list(1)
        today_revenue = round(today_result[0]["total"], 2) if today_result else 0.0

        # Weekly revenue
        pipeline_week: list[dict[str, Any]] = [
            {"$match": {"timestamp": {"$gte": week_ago}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        week_result = await db.revenue_snapshots.aggregate(pipeline_week).to_list(1)
        week_revenue = round(week_result[0]["total"], 2) if week_result else 0.0

        # Monthly revenue
        pipeline_month: list[dict[str, Any]] = [
            {"$match": {"timestamp": {"$gte": month_ago}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        month_result = await db.revenue_snapshots.aggregate(pipeline_month).to_list(1)
        month_revenue = round(month_result[0]["total"], 2) if month_result else 0.0

        # MoM growth
        two_months_ago = (now - timedelta(days=60)).isoformat()
        pipeline_prev: list[dict[str, Any]] = [
            {"$match": {"timestamp": {"$gte": two_months_ago, "$lt": month_ago}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        prev_result = await db.revenue_snapshots.aggregate(pipeline_prev).to_list(1)
        prev_revenue = prev_result[0]["total"] if prev_result else 0.0
        mom_growth = round(((month_revenue - prev_revenue) / prev_revenue) * 100, 1) if prev_revenue > 0 else 0.0

        # Source breakdown
        pipeline_sources: list[dict[str, Any]] = [
            {"$group": {"_id": "$source", "total": {"$sum": "$amount"}}},
        ]
        source_results = await db.revenue_snapshots.aggregate(pipeline_sources).to_list(100)
        source_breakdown = {s["_id"]: round(s["total"], 2) for s in source_results}

        return {
            "today": today_revenue,
            "this_week": week_revenue,
            "this_month": month_revenue,
            "mom_growth_pct": mom_growth,
            "source_breakdown": source_breakdown,
        }

    async def get_chart_data(self, days: int = 30) -> list[dict[str, Any]]:
        """Get time-series revenue data for charting."""
        db = get_db()
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        pipeline: list[dict[str, Any]] = [
            {"$match": {"timestamp": {"$gte": since}}},
            {"$group": {
                "_id": {"date": "$date", "source": "$source"},
                "total": {"$sum": "$amount"},
            }},
            {"$sort": {"_id.date": 1}},
        ]
        results = await db.revenue_snapshots.aggregate(pipeline).to_list(500)

        # Group by date
        by_date: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        for r in results:
            date = r["_id"]["date"]
            source = r["_id"]["source"]
            by_date[date][source] = round(r["total"], 2)

        chart_data: list[dict[str, Any]] = []
        for date in sorted(by_date.keys()):
            entry: dict[str, Any] = {"date": date}
            entry.update(by_date[date])
            entry["total"] = round(sum(by_date[date].values()), 2)
            chart_data.append(entry)

        return chart_data

    async def detect_anomalies(self) -> list[dict[str, Any]]:
        """Detect revenue anomalies (drop > 20% from 7-day avg)."""
        db = get_db()
        now = datetime.now(timezone.utc)
        week_ago = (now - timedelta(days=7)).isoformat()
        two_weeks_ago = (now - timedelta(days=14)).isoformat()

        # Previous 7-day average
        pipeline_avg: list[dict[str, Any]] = [
            {"$match": {"timestamp": {"$gte": two_weeks_ago, "$lt": week_ago}}},
            {"$group": {"_id": "$date", "daily_total": {"$sum": "$amount"}}},
        ]
        prev_days = await db.revenue_snapshots.aggregate(pipeline_avg).to_list(100)
        if not prev_days:
            return []
        avg_daily = sum(d["daily_total"] for d in prev_days) / len(prev_days)

        # Last 3 days
        three_days_ago = (now - timedelta(days=3)).isoformat()
        pipeline_recent: list[dict[str, Any]] = [
            {"$match": {"timestamp": {"$gte": three_days_ago}}},
            {"$group": {"_id": "$date", "daily_total": {"$sum": "$amount"}}},
        ]
        recent_days = await db.revenue_snapshots.aggregate(pipeline_recent).to_list(100)

        anomalies: list[dict[str, Any]] = []
        for day in recent_days:
            if avg_daily > 0 and day["daily_total"] < avg_daily * 0.8:
                drop_pct = round((1 - day["daily_total"] / avg_daily) * 100, 1)
                anomalies.append({
                    "date": day["_id"],
                    "daily_total": round(day["daily_total"], 2),
                    "avg_7_day": round(avg_daily, 2),
                    "drop_pct": drop_pct,
                    "severity": "high" if drop_pct > 30 else "medium",
                })
        return anomalies


# Singleton
_revenue_instance: Optional[RevenueIntelligence] = None


def get_revenue_intelligence() -> RevenueIntelligence:
    """Get or create the singleton RevenueIntelligence."""
    global _revenue_instance
    if _revenue_instance is None:
        _revenue_instance = RevenueIntelligence()
    return _revenue_instance