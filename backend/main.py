import asyncio
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager

from core.config import get_settings

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

    # 0. Initialize error log (clears previous session's log)
    try:
        from utils.error_log import clear_error_log
        clear_error_log()
        logger.info("✓ Error log initialized")
    except Exception as e:
        logger.warning("Error log init failed: %s", e)

    # ── Agent Factory Systems ───────────────────────────────────────────
    # 1. Connect to MongoDB (with retry)
    try:
        from core.database import connect_db, close_db, get_db
        await connect_db()
        db = get_db()
        logger.info("✓ MongoDB connected")
    except Exception as e:
        db = None
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

    # 5. Start Telegram command center if configured
    try:
        settings = get_settings()
        if settings.telegram_bot_token and settings.telegram_chat_id and db is not None:
            from services.telegram_commander import TelegramCommander
            commander = TelegramCommander(settings.telegram_bot_token, settings.telegram_chat_id)
            asyncio.create_task(commander.listen(db))
            await commander.send("🚀 OmniBot Factory started!")
            logger.info("✓ Telegram Commander started")
    except Exception as e:
        logger.warning("Telegram Commander failed: %s", e)

    # 5. Initialize Prompt Evolver (Phase 7: Self-Rewriting Prompt Templates)
    try:
        from core.prompt_evolver import get_prompt_evolver
        from core.database import get_db
        evolver = get_prompt_evolver()
        await evolver.initialize(get_db())
        logger.info("✓ Prompt Evolver initialized (Self-Rewriting Templates active)")
        logger.info("✓ [IMPROVER] AutonomousImprover initialized (MetaImprover active)")
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

    # Start the Infinite Dev Loop Orchestrator background worker
    try:
        from workers.infinite_dev_loop import start_infinite_dev_loop
        start_infinite_dev_loop()
        logger.info("✓ Infinite Dev Loop Orchestrator background worker started")
    except Exception as e:
        logger.warning("Infinite Dev Loop Orchestrator failed to start: %s", e)

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
# Wrapped in individual try/except blocks so a single failing router doesn't prevent other healthy routers from loading
try:
    from routers.chat import router as chat_router
    app.include_router(chat_router, prefix="/api/chat", tags=["Chat"])
    logger.info("✓ Legacy Chat router loaded")
except Exception as e:
    logger.warning("Legacy Chat router failed to load: %s", e)

try:
    from routers.models import router as models_router
    app.include_router(models_router, prefix="/api/models", tags=["Models"])
    logger.info("✓ Legacy Models router loaded")
except Exception as e:
    logger.warning("Legacy Models router failed to load: %s", e)

try:
    from routers.swarm import router as swarm_router
    app.include_router(swarm_router, prefix="/api/hive", tags=["Swarm Hub"])
    logger.info("✓ Legacy Swarm router loaded")
except Exception as e:
    logger.warning("Legacy Swarm router failed to load: %s", e)

try:
    from routers.neuro import router as neuro_router
    app.include_router(neuro_router, prefix="/api/neuro", tags=["Neuro Stream"])
    logger.info("✓ Legacy Neuro router loaded")
except Exception as e:
    logger.warning("Legacy Neuro router failed to load: %s", e)

try:
    from routers.settings import router as settings_router
    app.include_router(settings_router, prefix="/api/settings", tags=["Settings"])
    logger.info("✓ Legacy Settings router loaded")
except Exception as e:
    logger.warning("Legacy Settings router failed to load: %s", e)

try:
    from routers.providers import router as providers_router
    app.include_router(providers_router, prefix="/api/providers", tags=["Providers"])
    logger.info("✓ Legacy Providers router loaded")
except Exception as e:
    logger.warning("Legacy Providers router failed to load: %s", e)

try:
    from routers.tools import router as tools_router
    app.include_router(tools_router, prefix="/api/tools", tags=["Tools"])
    logger.info("✓ Legacy Tools router loaded")
except Exception as e:
    logger.warning("Legacy Legacy Tools router failed to load: %s", e)

try:
    from routers.agent import router as agent_router
    app.include_router(agent_router, prefix="/api/agent", tags=["Agent"])
    logger.info("✓ Legacy Agent router loaded")
except Exception as e:
    logger.warning("Legacy Agent router failed to load: %s", e)

# ── Agent Factory Routers (new) ─────────────────────────────────────────
from api.agents import router as factory_agents_router
from api.factory import router as factory_control_router
from api.websocket import router as websocket_router
from api.settings import router as factory_settings_router
from api.dev_loop import router as dev_loop_router

app.include_router(factory_agents_router, prefix="/api/factory/agents", tags=["Factory Agents"])
app.include_router(factory_control_router, prefix="/api/factory", tags=["Factory Control"])
app.include_router(factory_settings_router, prefix="/api/factory/settings", tags=["Factory Settings"])
app.include_router(dev_loop_router, prefix="/api/dev-loop", tags=["Dev Loop"])
app.include_router(websocket_router, prefix="/ws", tags=["WebSocket"])

# ── OS Shell UI Routers (desktop shell) ─────────────────────────────────
try:
    from routers.files import router as files_router
    app.include_router(files_router, tags=["Files"])
    logger.info("✓ Files router loaded")
except Exception as e:
    logger.warning("Files router failed to load: %s", e)

try:
    from routers.terminal import router as terminal_router
    app.include_router(terminal_router, tags=["Terminal"])
    logger.info("✓ Terminal router loaded")
except Exception as e:
    logger.warning("Terminal router failed to load: %s", e)

try:
    from routers.media import router as media_router
    app.include_router(media_router, tags=["Media"])
    logger.info("✓ Media router loaded")
except Exception as e:
    logger.warning("Media router failed to load: %s", e)

try:
    from api.hub import router as hub_router
    app.include_router(hub_router, prefix="/api/hub", tags=["Model Hub"])
    logger.info("✓ Model Hub router loaded")
except Exception as e:
    logger.warning("Model Hub router failed to load: %s", e)



@app.get("/api/router/status")
async def get_router_status():
    """Returns the live status and analytics of the multi-tier cascading model router."""
    try:
        from core.database import get_db
        from core.model_router import _cooling, _fetch_keys_for_provider
        import time as time_module
        
        db = get_db()
        stats = None
        if db is not None:
            stats = await db.router_stats.find_one({"_id": "global_stats"})
            
        if not stats:
            stats = {
                "current_tier": 1,
                "active_provider": "openrouter",
                "active_model": "openrouter/auto",
                "last_success": None,
                "total_requests": 0,
                "tier_stats": {
                    "tier1_hits": 0,
                    "tier2_hits": 0,
                    "tier3_hits": 0,
                    "tier4_hits": 0,
                    "tier5_hits": 0
                }
            }
            
        now = time_module.time()
        cooling_keys = sum(1 for k, v in _cooling.items() if k.startswith("openrouter:") and v > now)
        
        # Calculate keys
        openrouter_keys = await _fetch_keys_for_provider("openrouter")
        total_openrouter = len(openrouter_keys)
        available_openrouter = total_openrouter - cooling_keys
        
        return {
            "current_tier": stats.get("current_tier", 1),
            "active_provider": stats.get("active_provider", "openrouter"),
            "active_model": stats.get("active_model", "openrouter/auto"),
            "cooling_keys": cooling_keys,
            "total_openrouter_keys": total_openrouter,
            "available_openrouter_keys": max(available_openrouter, 0),
            "last_success": stats.get("last_success"),
            "total_requests": stats.get("total_requests", 0),
            "tier_stats": stats.get("tier_stats", {
                "tier1_hits": 0,
                "tier2_hits": 0,
                "tier3_hits": 0,
                "tier4_hits": 0,
                "tier5_hits": 0
            })
        }
    except Exception as e:
        logger.error(f"Error in GET /api/router/status: {e}")
        return {"error": str(e)}


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
