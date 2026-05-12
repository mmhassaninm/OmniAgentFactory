"""
Swarm Analyst Agent — analyzes data, generates insights, and builds reports.
Uses revenue intelligence and MongoDB queries.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def analyze_revenue() -> dict[str, Any]:
    """
    Analyze revenue data and generate insights.

    Returns:
        dict with revenue summary and insights
    """
    try:
        from core.revenue_intelligence import get_revenue_intelligence

        ri = get_revenue_intelligence()
        summary = await ri.get_summary()
        anomalies = await ri.detect_anomalies()
        chart = await ri.get_chart_data(days=30)

        # Find best performing day
        best_day = max(chart, key=lambda d: d.get("total", 0)) if chart else None

        return {
            "status": "ok",
            "summary": summary,
            "anomalies": anomalies,
            "best_day": best_day,
            "total_days_data": len(chart),
        }
    except Exception as e:
        logger.warning("[Swarm/Analyst] analyze_revenue error: %s", e)
        return {"status": "error", "error": str(e)[:200]}


async def get_system_metrics() -> dict[str, Any]:
    """
    Get system performance metrics from observability middleware.

    Returns:
        dict with endpoint stats, slowest endpoints, total requests
    """
    try:
        from middleware.observability import get_recent_requests, get_endpoint_stats, get_slowest_endpoints

        return {
            "status": "ok",
            "endpoint_stats": get_endpoint_stats(),
            "slowest_endpoints": get_slowest_endpoints(limit=5),
            "recent_requests": len(get_recent_requests()),
        }
    except Exception as e:
        logger.warning("[Swarm/Analyst] system_metrics error: %s", e)
        return {"status": "error", "error": str(e)[:200]}