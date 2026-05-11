"""
System metrics API endpoint.
Exposes request statistics, health summaries, and performance data.
"""

from fastapi import APIRouter
from middleware.observability import get_metrics

router = APIRouter()


@router.get("/health")
async def system_health():
    """Get overall system health summary."""
    metrics = get_metrics()
    return metrics.get_health_summary()


@router.get("/endpoints")
async def endpoint_stats():
    """Get aggregated statistics for all endpoints."""
    metrics = get_metrics()
    return {
        "endpoints": metrics.get_all_stats(),
        "timestamp": None
    }


@router.get("/slowest")
async def slowest_endpoints(limit: int = 10):
    """Get slowest endpoints by average latency."""
    metrics = get_metrics()
    return {
        "slowest": metrics.get_slowest_endpoints(limit),
        "limit": limit
    }


@router.get("/errors")
async def error_summary():
    """Get summary of recent errors by endpoint."""
    metrics = get_metrics()
    return {
        "errors": metrics.get_error_summary(),
        "timestamp": None
    }


@router.get("/requests")
async def recent_requests(limit: int = 50, endpoint: str = None):
    """Get recent requests, optionally filtered by endpoint."""
    metrics = get_metrics()
    return {
        "requests": metrics.get_recent_requests(limit, endpoint),
        "count": len(metrics.get_recent_requests(limit, endpoint))
    }
