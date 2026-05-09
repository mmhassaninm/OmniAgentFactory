import asyncio
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager

# Session log file must be configured before any other module emits log records
try:
    from logging_config import setup_session_logging
    setup_session_logging()
except ImportError:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("OmniBot backend starting up")

    # ── Agent Factory Systems ───────────────────────────────────────────
    # 1. Connect to MongoDB (with retry)
    try:
        from core.database import connect_db, close_db
        await connect_db()
        logger.info("✓ MongoDB connected")
    except Exception as e:
        logger.error("MongoDB connection failed (factory features disabled): %s", e)

    # 2. Crash recovery — rollback any agents stuck in draft/testing
    try:
        from core.checkpoint import recover_all_agents
        await recover_all_agents()
        logger.info("✓ Crash recovery completed")
    except Exception as e:
        logger.warning("Crash recovery skipped: %s", e)

    # 3. Initialize model router (from .env first, then overlay MongoDB keys)
    try:
        from core.model_router import get_model_router
        router_inst = get_model_router()
        await router_inst.reload_keys_from_db()
        logger.info("✓ Model router initialized (MongoDB keys loaded)")
    except Exception as e:
        logger.warning("Model router init failed: %s", e)

    # 4. Start night mode scheduler
    try:
        from core.scheduler import get_night_scheduler
        scheduler = get_night_scheduler()
        scheduler.start()
        logger.info("✓ Night mode scheduler started")
    except Exception as e:
        logger.warning("Night scheduler start failed: %s", e)

    # 5. Initialize Prompt Evolver (Phase 7: Self-Rewriting Prompt Templates)
    try:
        from core.prompt_evolver import get_prompt_evolver
        from core.database import get_db
        evolver = get_prompt_evolver()
        await evolver.initialize(get_db())
        logger.info("✓ Prompt Evolver initialized (Self-Rewriting Templates active)")
    except Exception as e:
        logger.warning("Prompt Evolver init failed: %s", e)

    # ── Legacy Systems ──────────────────────────────────────────────────
    # Initialize multi-provider registry from DB settings
    try:
        from services.providers import provider_registry
        await provider_registry.initialize()
        logger.info("Provider registry initialized")
    except Exception as e:
        logger.warning("Legacy provider registry failed: %s", e)

    # Ignite the autonomous Swarm optimization loop
    try:
        from workers.optimization_loop import start_optimization_loop
        start_optimization_loop()
        logger.info("Swarm optimization loop started")
    except Exception as e:
        logger.warning("Swarm optimization loop failed: %s", e)

    # Start the AI Traffic Controller background sentinel
    try:
        from services.ai_service import sleep_wake_controller
        asyncio.create_task(sleep_wake_controller.start_autonomous_loop())
        logger.info("Sleep/Wake controller started — backend ready")
    except Exception as e:
        logger.warning("Sleep/Wake controller failed: %s", e)

    logger.info("═══ OmniBot Agent Factory — ONLINE ═══")
    yield

    # ── Shutdown ────────────────────────────────────────────────────────
    logger.info("OmniBot backend shutting down")
    try:
        from core.scheduler import get_night_scheduler
        get_night_scheduler().stop()
    except Exception:
        pass
    try:
        from core.database import close_db
        await close_db()
    except Exception:
        pass

app = FastAPI(title="OmniBot Agent Factory", version="2.0.0", lifespan=lifespan)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info("→ %s %s", request.method, request.url.path)
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error("✗ %s %s — unhandled error: %s", request.method, request.url.path, exc)
        raise
    logger.info("← %s %s %s", request.method, request.url.path, response.status_code)
    return response


# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Legacy Routers (existing chat system) ───────────────────────────────
# Wrapped in try/except so factory starts even if legacy modules have issues
try:
    from routers.chat import router as chat_router
    from routers.models import router as models_router
    from routers.swarm import router as swarm_router
    from routers.neuro import router as neuro_router
    from routers.settings import router as settings_router
    from routers.providers import router as providers_router
    from routers.tools import router as tools_router
    from routers.agent import router as agent_router

    app.include_router(chat_router, prefix="/api/chat", tags=["Chat"])
    app.include_router(models_router, prefix="/api/models", tags=["Models"])
    app.include_router(swarm_router, prefix="/api/hive", tags=["Swarm Hub"])
    app.include_router(neuro_router, prefix="/api/neuro", tags=["Neuro Stream"])
    app.include_router(settings_router, prefix="/api/settings", tags=["Settings"])
    app.include_router(providers_router, prefix="/api/providers", tags=["Providers"])
    app.include_router(tools_router, prefix="/api/tools", tags=["Tools"])
    app.include_router(agent_router, prefix="/api/agent", tags=["Agent"])
    logger.info("Legacy routers loaded successfully")
except Exception as e:
    logger.warning("Legacy routers failed to load (factory will still work): %s", e)

# ── Agent Factory Routers (new) ─────────────────────────────────────────
from api.agents import router as factory_agents_router
from api.factory import router as factory_control_router
from api.websocket import router as websocket_router
from api.settings import router as factory_settings_router

app.include_router(factory_agents_router, prefix="/api/factory/agents", tags=["Factory Agents"])
app.include_router(factory_control_router, prefix="/api/factory", tags=["Factory Control"])
app.include_router(factory_settings_router, prefix="/api/factory/settings", tags=["Factory Settings"])
app.include_router(websocket_router, prefix="/ws", tags=["WebSocket"])


@app.get("/api/health")
async def health_check():
    """Enhanced health check with factory status."""
    health = {"status": "FastAPI Backend Online", "service": "OmniBot Agent Factory", "version": "2.0.0"}
    try:
        from core.database import check_db_health
        health["mongodb"] = "connected" if await check_db_health() else "disconnected"
    except Exception:
        health["mongodb"] = "unknown"
    try:
        from core.evolve_engine import get_evolution_manager
        manager = get_evolution_manager()
        health["active_evolutions"] = manager.active_count
    except Exception:
        health["active_evolutions"] = 0
    try:
        from core.config import get_settings
        health["night_mode"] = get_settings().is_night_mode()
    except Exception:
        health["night_mode"] = False
    return health

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=3001, reload=True)
