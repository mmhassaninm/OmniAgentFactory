"""
Evolution Registry API — REST endpoints for autonomous evolution system
Provides read/write access to ideas and problems registries
"""
from fastapi import APIRouter, HTTPException, Request
from typing import Optional

router = APIRouter(prefix="/api/evolution", tags=["Evolution Registry"])


def get_orchestrator(request: Request):
    """Get the evolution orchestrator from app state."""
    orch = getattr(request.app.state, "evolution_orchestrator", None)
    if not orch:
        raise HTTPException(status_code=503, detail="Evolution system not initialized")
    return orch


@router.get("/ideas")
async def get_ideas(request: Request, status: Optional[str] = None, limit: int = 50):
    """Get all ideas with optional status filter."""
    try:
        orch = get_orchestrator(request)
        registry = orch.registry

        if status:
            ideas = await registry.ideas_col.find(
                {"status": status},
                {"_id": 0}
            ).sort("created_at", -1).limit(limit).to_list(length=limit)
        else:
            ideas = await registry.ideas_col.find(
                {},
                {"_id": 0}
            ).sort("created_at", -1).limit(limit).to_list(length=limit)

        return {
            "count": len(ideas),
            "ideas": ideas
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch ideas: {str(e)}")


@router.get("/problems")
async def get_problems(request: Request, status: Optional[str] = None, severity: Optional[str] = None, limit: int = 50):
    """Get all problems with optional filters."""
    try:
        orch = get_orchestrator(request)
        registry = orch.registry

        query = {}
        if status:
            query["status"] = status
        if severity:
            query["severity"] = severity

        problems = await registry.problems_col.find(
            query,
            {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(length=limit)

        return {
            "count": len(problems),
            "problems": problems
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch problems: {str(e)}")


@router.get("/stats")
async def get_stats(request: Request):
    """Get registry statistics."""
    try:
        orch = get_orchestrator(request)
        registry = orch.registry
        stats = await registry.get_stats()

        return {
            "stats": stats,
            "loop_cycle": orch.cycle_count,
            "loop_active": orch.running,
            "loop_paused": orch.paused
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")


@router.post("/ideas/{idea_id}/approve")
async def approve_idea(request: Request, idea_id: str):
    """Manually approve an idea for implementation."""
    try:
        orch = get_orchestrator(request)
        registry = orch.registry

        await registry.ideas_col.update_one(
            {"id": idea_id},
            {"$set": {"status": "approved_manually"}}
        )

        return {"status": "ok", "message": f"Idea {idea_id} approved"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to approve idea: {str(e)}")


@router.post("/ideas/{idea_id}/reject")
async def reject_idea(request: Request, idea_id: str, reason: str = "Manual rejection"):
    """Manually reject an idea."""
    try:
        orch = get_orchestrator(request)
        registry = orch.registry

        await registry.ideas_col.update_one(
            {"id": idea_id},
            {"$set": {"status": "rejected", "outcome": reason}}
        )

        return {"status": "ok", "message": f"Idea {idea_id} rejected"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reject idea: {str(e)}")


@router.post("/loop/pause")
async def pause_loop(request: Request):
    """Pause the evolution loop."""
    try:
        orch = get_orchestrator(request)
        orch.pause()
        return {"status": "ok", "message": "Evolution loop paused"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to pause loop: {str(e)}")


@router.post("/loop/resume")
async def resume_loop(request: Request):
    """Resume the paused evolution loop."""
    try:
        orch = get_orchestrator(request)
        orch.resume()
        return {"status": "ok", "message": "Evolution loop resumed"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to resume loop: {str(e)}")


@router.get("/loop/status")
async def get_loop_status(request: Request):
    """Get current loop status."""
    try:
        orch = get_orchestrator(request)
        return {
            "cycle": orch.cycle_count,
            "active": orch.running,
            "paused": orch.paused,
            "next_cycle_type": "ideas" if orch.cycle_count % 2 == 1 else "problems"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get loop status: {str(e)}")


@router.get("/diagnostics")
async def get_diagnostics(request: Request):
    """Get comprehensive diagnostics of the evolution system."""
    try:
        orch = get_orchestrator(request)
        registry = orch.registry

        # Check component states
        components = {
            "idea_engine": orch.idea_engine is not None,
            "problem_scanner": orch.problem_scanner is not None,
            "agent_council": orch.agent_council is not None,
            "implementation_runner": orch.runner is not None,
            "model_router": orch.model_router is not None,
        }

        # Get database stats
        ideas_count = await registry.ideas_col.count_documents({})
        problems_count = await registry.problems_col.count_documents({})
        implemented_count = await registry.ideas_col.count_documents({"status": "implemented"})
        failed_count = await registry.ideas_col.count_documents({"status": "rejected"})

        return {
            "loop_active": orch.running,
            "loop_paused": orch.paused,
            "cycle_count": orch.cycle_count,
            "components_ready": components,
            "all_components_ready": all(components.values()),
            "database_stats": {
                "total_ideas": ideas_count,
                "total_problems": problems_count,
                "implemented_ideas": implemented_count,
                "rejected_ideas": failed_count,
            },
            "system_health": "healthy" if all(components.values()) and orch.running else "degraded",
            "warnings": [
                "Loop is paused" if orch.paused else None,
                "Implementation runner not configured" if not components["implementation_runner"] else None,
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diagnostics failed: {str(e)}")
