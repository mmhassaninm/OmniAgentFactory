"""
FastAPI router for monitoring the free AI provider integration layer.
Exposes endpoints showing live sub-provider health and circuit breaker statuses.
"""

import logging
from typing import Dict, Any, List
from fastapi import APIRouter

from ai_provider import G4FProvider

logger = logging.getLogger(__name__)
router = APIRouter()

# Shareable singleton provider instance to retain circuit breaker/degradation state
free_ai_provider = G4FProvider()


@router.get("/providers/status")
async def get_providers_status() -> Dict[str, Any]:
    """
    Get a live status report of all sub-providers inside the g4f integration.
    Shows ACTIVE / DEGRADED status, failure count, and remaining cool-down time.
    """
    try:
        report = free_ai_provider.get_providers_report()
        active_count = sum(1 for row in report if row["status"] == "ACTIVE")
        
        return {
            "status": "operational" if active_count > 0 else "degraded",
            "total_providers": len(report),
            "active_providers": active_count,
            "providers": report
        }
    except Exception as e:
        logger.error(f"Error fetching free AI providers status: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@router.get("/health")
async def free_ai_health_check() -> Dict[str, Any]:
    """
    Check the health of the Free AI integration layer.
    Returns healthy if at least one sub-provider is in ACTIVE state.
    """
    try:
        report = free_ai_provider.get_providers_report()
        active_count = sum(1 for row in report if row["status"] == "ACTIVE")
        
        if active_count > 0:
            return {
                "status": "healthy",
                "message": f"Integration is healthy with {active_count}/{len(report)} sub-providers active.",
                "providers_active": True
            }
        else:
            return {
                "status": "unhealthy",
                "message": "All free sub-providers are currently DEGRADED. Backoff cooling in progress.",
                "providers_active": False
            }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Free AI health check failed: {str(e)}"
        }
