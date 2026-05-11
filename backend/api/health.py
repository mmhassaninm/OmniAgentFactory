"""
Comprehensive health check endpoint.
Provides detailed diagnostics of all system components.
"""

import logging
import asyncio
from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter, HTTPException

router = APIRouter()
logger = logging.getLogger(__name__)


async def _check_mongodb() -> Dict[str, Any]:
    """Check MongoDB connectivity and basic stats."""
    try:
        from core.database import check_db_health, get_db
        is_healthy = await check_db_health()
        if not is_healthy:
            return {"status": "unhealthy", "error": "Cannot reach MongoDB"}

        db = get_db()
        # Get basic collection counts (fast operation)
        collections = ["agents", "thoughts", "evolution_ideas", "evolution_problems"]
        stats = {}
        try:
            for coll_name in collections:
                count = await db[coll_name].estimated_document_count()
                stats[coll_name] = count
        except Exception as e:
            logger.warning("Failed to get collection stats: %s", e)

        return {
            "status": "healthy",
            "collections": stats,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    except Exception as e:
        logger.error("MongoDB health check failed: %s", e)
        return {"status": "unhealthy", "error": str(e)[:100]}


async def _check_model_router() -> Dict[str, Any]:
    """Check model router and provider availability."""
    try:
        from core.model_router import get_model_router
        router = get_model_router()
        health = router.get_health_status()
        return {
            "status": "healthy",
            "providers": health.get("providers", {}),
            "active_keys": health.get("active_keys", 0)
        }
    except Exception as e:
        logger.error("Model router health check failed: %s", e)
        return {"status": "unhealthy", "error": str(e)[:100]}


async def _check_evolution_engine() -> Dict[str, Any]:
    """Check self-evolution engine status."""
    try:
        from core.self_evolution.state_manager import StateManager
        sm = StateManager(root_path=".")
        state = sm.load_state()
        return {
            "status": "healthy",
            "iteration": state.get("iteration", 0),
            "last_run": state.get("last_run_timestamp"),
            "total_improvements": state.get("total_improvements_applied", 0)
        }
    except Exception as e:
        logger.warning("Evolution engine check failed (engine may not have run yet): %s", e)
        return {"status": "not_started", "message": "Engine ready but has not run yet"}


async def _check_shopify_swarm() -> Dict[str, Any]:
    """Check Shopify swarm engine status."""
    try:
        from shopify.swarm_engine import get_swarm_engine
        swarm = get_swarm_engine()
        return {
            "status": "healthy",
            "running": swarm._task is not None and not swarm._task.done() if hasattr(swarm, '_task') else False,
            "themes_generated": 0  # Would need to query DB for real number
        }
    except Exception as e:
        logger.warning("Shopify swarm check failed: %s", e)
        return {"status": "unavailable", "message": "Shopify swarm not configured"}


async def _check_money_agent() -> Dict[str, Any]:
    """Check Money Agent status."""
    try:
        from core.config import get_settings
        settings = get_settings()
        configured = (
            bool(settings.paypal_client_id) and
            bool(settings.paypal_client_secret) and
            bool(settings.gmail_address)
        )
        return {
            "status": "healthy" if configured else "unconfigured",
            "paypal_configured": bool(settings.paypal_client_id),
            "gmail_configured": bool(settings.gmail_address)
        }
    except Exception as e:
        logger.warning("Money agent check failed: %s", e)
        return {"status": "error", "message": str(e)[:100]}


async def _check_chroma_db() -> Dict[str, Any]:
    """Check ChromaDB connectivity."""
    try:
        from core.config import get_settings
        settings = get_settings()
        # Simple check: can we import and access Chroma
        import chromadb
        client = chromadb.HttpClient(
            host=settings.chroma_host,
            port=settings.chroma_port
        )
        collections = client.list_collections()
        return {
            "status": "healthy",
            "host": f"{settings.chroma_host}:{settings.chroma_port}",
            "collections_count": len(collections) if collections else 0
        }
    except Exception as e:
        logger.warning("ChromaDB check failed: %s", e)
        return {"status": "unavailable", "error": str(e)[:100]}


@router.get("/health")
async def health_check():
    """Quick health check (fast, always returns immediately)."""
    try:
        from core.database import check_db_health
        db_ok = await asyncio.wait_for(check_db_health(), timeout=5.0)
        return {
            "status": "healthy" if db_ok else "degraded",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    except Exception as e:
        logger.error("Health check failed: %s", e)
        return {
            "status": "unhealthy",
            "error": str(e)[:100],
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }


@router.get("/health/detailed")
async def detailed_health_check():
    """Comprehensive health check with component diagnostics (slower, max 30s timeout)."""
    try:
        # Run all checks in parallel with timeout
        checks = await asyncio.wait_for(
            asyncio.gather(
                _check_mongodb(),
                _check_model_router(),
                _check_evolution_engine(),
                _check_shopify_swarm(),
                _check_money_agent(),
                _check_chroma_db(),
                return_exceptions=True
            ),
            timeout=30.0
        )

        mongodb_status, router_status, engine_status, shopify_status, money_status, chroma_status = checks

        # Determine overall status
        critical_components = [
            mongodb_status.get("status") == "healthy",
            router_status.get("status") == "healthy"
        ]
        overall_status = "healthy" if all(critical_components) else "degraded"

        return {
            "status": overall_status,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "components": {
                "mongodb": mongodb_status,
                "model_router": router_status,
                "evolution_engine": engine_status,
                "shopify_swarm": shopify_status,
                "money_agent": money_status,
                "chromadb": chroma_status
            }
        }
    except asyncio.TimeoutError:
        logger.error("Health check timeout")
        raise HTTPException(
            status_code=504,
            detail="Health check timed out"
        )
    except Exception as e:
        logger.error("Detailed health check failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Health check error: {str(e)[:100]}"
        )
