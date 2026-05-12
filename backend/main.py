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

    # 5b. Initialize Money Agent and Hydrate Cache
    try:
        if db is not None:
            from core.money_roi_tracker import load_from_db
            await load_from_db(db)
            logger.info("✓ Money ROI Tracker cache hydrated from database")
            
            # Load general settings from DB and override Settings singleton
            stored_general = await db.settings.find_one({"_id": "general_settings"})
            if stored_general:
                settings_inst = get_settings()
                settings_inst.paypal_me_link = stored_general.get("paypal_me_link", settings_inst.paypal_me_link)
                settings_inst.default_service_price = int(stored_general.get("default_service_price", settings_inst.default_service_price))
                logger.info("✓ Loaded General settings (PayPal: %s, Price: $%d) from database", settings_inst.paypal_me_link, settings_inst.default_service_price)


        settings = get_settings()
        if settings.agent_mode in ("human_in_loop", "supervised", "review_only"):
            from agent.money_agent_loop import get_money_agent
            _money_agent = get_money_agent()
            app.state.money_agent = _money_agent
            logger.info("✓ Money Agent initialized (mode: %s)", settings.agent_mode)
    except Exception as e:
        logger.warning("Money Agent / ROI init failed: %s", e)

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

    # ── AUTONOMOUS EVOLUTION v3.0 (Nuclear Self-Evolution) ────────────────
    try:
        import os
        if os.getenv("ENABLE_AUTONOMOUS_EVOLUTION", "true").lower() == "true" and db is not None:
            from core.autonomous_evolution.registry_manager import RegistryManager
            from core.autonomous_evolution.idea_engine_v2 import IdeaEngineV2
            from core.autonomous_evolution.problem_scanner import ProblemScanner
            from core.autonomous_evolution.agent_council import AgentCouncil
            from core.autonomous_evolution.loop_orchestrator import LoopOrchestrator
            from core.autonomous_evolution.implementation_runner import ImplementationRunner
            from core.model_router import get_model_router

            # Initialize components
            registry_mgr = RegistryManager(db)
            router = get_model_router()
            idea_engine = IdeaEngineV2(router, registry_mgr)
            problem_scanner = ProblemScanner(router, registry_mgr)
            agent_council = AgentCouncil(router)
            # ImplementationRunner now receives model_router for LLM-guided code generation
            impl_runner = ImplementationRunner(model_router=router)

            # Create and start orchestrator — pass model_router so runner gets it
            orchestrator = LoopOrchestrator(
                idea_engine=idea_engine,
                problem_scanner=problem_scanner,
                agent_council=agent_council,
                registry_manager=registry_mgr,
                implementation_runner=impl_runner,
                model_router=router,
            )

            # Start in background
            asyncio.create_task(orchestrator.run_forever())
            app.state.evolution_orchestrator = orchestrator
            logger.info("🧠 AUTONOMOUS EVOLUTION LOOP v3.0 — ACTIVE")
            logger.info("   Components: IdeaEngineV2 + ProblemScanner + AgentCouncil + LoopOrchestrator")
            logger.info("   Memory: EVOLUTION_IDEAS_REGISTRY.md + PROBLEMS_REGISTRY.md")
        else:
            logger.info("ℹ️ Autonomous Evolution disabled (set ENABLE_AUTONOMOUS_EVOLUTION=true to enable)")
    except Exception as e:
        logger.warning("Autonomous Evolution v3.0 failed to start: %s", e)

    # ── SELF EVOLUTION SCHEDULER & IDEA ENGINE v4.0 ───────────────────────
    try:
        if db is not None:
            # 1. Load Self-Evolution settings from DB and override environment
            stored_ev = await db.settings.find_one({"_id": "self_evolution_settings"})
            if stored_ev:
                import os
                os.environ["SELF_EVOLUTION_ENABLED"] = str(stored_ev.get("self_evolution_enabled", True)).lower()
                os.environ["EVOLUTION_INTERVAL_MINUTES"] = str(stored_ev.get("evolution_interval_minutes", 30.0))
                os.environ["EVOLUTION_MAX_PATCHES_PER_CYCLE"] = str(stored_ev.get("evolution_max_patches_per_cycle", 5))
                os.environ["EVOLUTION_MAX_TOKENS"] = str(stored_ev.get("evolution_max_tokens", 30000))
                os.environ["EVOLUTION_ROLLBACK_ON_FAILURE"] = str(stored_ev.get("evolution_rollback_on_failure", True)).lower()
                os.environ["IDEA_ENGINE_ENABLED"] = str(stored_ev.get("idea_engine_enabled", True)).lower()
                os.environ["IDEA_ENGINE_RATE_PER_HOUR"] = str(stored_ev.get("idea_engine_rate_per_hour", 100.0))
                os.environ["IDEA_ENGINE_MAX_DAILY_EXECUTIONS"] = str(stored_ev.get("idea_engine_max_daily_executions", 2400))
                os.environ["IDEA_ENGINE_TARGET_SCOPES"] = ",".join(stored_ev.get("idea_engine_scopes", ["everything"]))
                os.environ["IDEA_ENGINE_MIN_SCORE"] = str(stored_ev.get("idea_engine_min_score", 5.0))
                logger.info("✓ Self-Evolution configurations loaded from MongoDB and mapped to environment")

            # 2. Start scheduler and idea engine
            from core.model_router import get_model_router
            from core.self_evolution.scheduler import start_evolution_scheduler
            from core.self_evolution.idea_engine import get_idea_engine

            router = get_model_router()
            
            # Start Evolution Scheduler
            start_evolution_scheduler(router, ".")
            
            # Start Idea Engine
            ie_engine = get_idea_engine(router, ".")
            ie_engine.start()
            
            logger.info("🚀 SELF-EVOLUTION SCHEDULER & IDEA ENGINE v4.0 started successfully!")
    except Exception as e:
        logger.warning("Failed to start Self-Evolution components: %s", e)

    # 5c. Start Universal Task Queue System
    try:
        from core.task_queue_engine import start_queue_system
        await start_queue_system()
        logger.info("✓ Universal Task Queue System started (MongoDB-backed)")
    except Exception as e:
        logger.warning("Task Queue System failed to start: %s", e)

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

    # DISABLED: Infinite Dev Loop Orchestrator (causes race conditions with LoopOrchestrator)
    # Use ENABLE_INFINITE_DEV_LOOP=true to re-enable for agent-specific improvements
    # Both orchestrators should not run in parallel without mutex coordination
    #try:
    #    from workers.infinite_dev_loop import start_infinite_dev_loop
    #    start_infinite_dev_loop()
    #    logger.info("✓ Infinite Dev Loop Orchestrator background worker started")
    #except Exception as e:
    #    logger.warning("Infinite Dev Loop Orchestrator failed to start: %s", e)
    logger.info("ℹ️ Infinite Dev Loop Orchestrator disabled (use LoopOrchestrator v3.0 instead)")

    # ── Shopify Theme Factory ───────────────────────────────────────────
    try:
        import os
        from shopify.swarm_engine import get_swarm_engine
        from api.websocket import manager as ws_manager
        _shopify_engine = get_swarm_engine()
        _shopify_engine.set_broadcast(ws_manager.broadcast_to_shopify)
        app.state.shopify_engine = _shopify_engine
        
        # Check database autostart first, fallback to env variable
        autostart = False
        try:
            if db is not None:
                settings_doc = await db.shopify_settings.find_one({"_id": "global"})
                if settings_doc and "swarm_autostart" in settings_doc:
                    autostart = bool(settings_doc["swarm_autostart"])
                else:
                    autostart = os.getenv("SHOPIFY_SWARM_AUTOSTART", "false").lower() == "true"
            else:
                autostart = os.getenv("SHOPIFY_SWARM_AUTOSTART", "false").lower() == "true"
        except Exception as e:
            logger.warning("Could not check MongoDB shopify_settings autostart: %s", e)
            autostart = os.getenv("SHOPIFY_SWARM_AUTOSTART", "false").lower() == "true"

        if autostart:
            _shopify_engine.start(db)
            logger.info("✓ Shopify Swarm Engine started (AUTOSTART)")
        else:
            logger.info("✓ Shopify Swarm Engine initialized (start via POST /api/shopify/start)")
            
        # ── Shopify Autonomous Manager ──────────────────────────────────────
        try:
            from shopify.autonomous_manager import get_autonomous_manager
            _auto_mgr = get_autonomous_manager()
            _auto_mgr.start()
            app.state.shopify_autonomous_manager = _auto_mgr
            logger.info("✓ Shopify Autonomous Manager started (Continuous Loop active)")
        except Exception as e:
            logger.warning("Shopify Autonomous Manager failed to start: %s", e)
    except Exception as e:
        logger.warning("Shopify Swarm Engine failed to initialize: %s", e)


    # ── Self-Evolution Engine (Phase S) ─────────────────────────────────
    try:
        import os
        if os.getenv("SELF_EVOLUTION_ENABLED", "true").lower() == "true" and db is not None:
            from core.self_evolution.scheduler import get_evolution_scheduler
            from core.model_router import get_model_router

            router = get_model_router()
            ev_root = "/project" if os.path.exists("/project") else "."
            scheduler = get_evolution_scheduler(router, root_path=ev_root)
            scheduler.start()
            app.state.evolution_scheduler = scheduler
            logger.info("🧬 SELF-EVOLUTION ENGINE (Phase S) — ACTIVE")
            logger.info("   Scheduler: autonomous code improvement loop running every %d hours",
                       int(os.getenv("EVOLUTION_INTERVAL_HOURS", "6")))
        else:
            logger.info("ℹ️ Self-Evolution disabled (set SELF_EVOLUTION_ENABLED=true to enable)")
    except Exception as e:
        logger.warning("Self-Evolution Engine failed to start: %s", e)

    logger.info("═══ OmniBot Agent Factory — ONLINE ═══")
    yield

    # ── Shutdown ────────────────────────────────────────────────────────
    logger.info("OmniBot backend shutting down")
    try:
        from core.self_evolution.scheduler import stop_evolution_scheduler
        stop_evolution_scheduler()
    except Exception:
        pass
    try:
        from shopify.autonomous_manager import get_autonomous_manager
        get_autonomous_manager().stop()
    except Exception:
        pass
    try:
        from core.scheduler import get_night_scheduler
        get_night_scheduler().stop()
    except Exception:
        pass
    try:
        from core.task_queue_engine import stop_queue_system
        await stop_queue_system()
    except Exception:
        pass
    try:
        from core.database import close_db
        await close_db()
    except Exception:
        pass

app = FastAPI(title="OmniBot Agent Factory", version="2.0.0", lifespan=lifespan)


@app.middleware("http")
async def log_requests_with_correlation_id(request: Request, call_next):
    """Log requests with correlation ID for distributed tracing."""
    import uuid

    # Get or generate correlation ID
    correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))

    # Store in request state for access in handlers
    request.state.correlation_id = correlation_id

    logger.info("→ [%s] %s %s", correlation_id, request.method, request.url.path)
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error("✗ [%s] %s %s — unhandled error: %s", correlation_id, request.method, request.url.path, exc)
        raise

    # Add correlation ID to response headers
    response.headers["X-Correlation-ID"] = correlation_id
    logger.info("← [%s] %s %s %s", correlation_id, request.method, request.url.path, response.status_code)
    return response


@app.middleware("http")
async def request_timeout_middleware(request: Request, call_next):
    """Add request timeout to prevent hanging connections (default 30s, configurable per route)."""
    import asyncio
    import os
    timeout_seconds = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "30.0"))
    try:
        response = await asyncio.wait_for(call_next(request), timeout=timeout_seconds)
        return response
    except asyncio.TimeoutError:
        logger.error("Request timeout: %s %s after %.1fs", request.method, request.url.path, timeout_seconds)
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=504,
            content={"error": "Request timeout", "timeout_seconds": timeout_seconds}
        )


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    """Capture request metrics for observability."""
    import time
    from middleware.observability import record_request

    start_time = time.time()
    client_ip = request.client.host if request.client else "unknown"

    try:
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000
        record_request(
            endpoint=request.url.path,
            method=request.method,
            status_code=response.status_code,
            duration_ms=duration_ms,
            client_ip=client_ip
        )
        return response
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        record_request(
            endpoint=request.url.path,
            method=request.method,
            status_code=500,
            duration_ms=duration_ms,
            error=str(e)[:100],
            client_ip=client_ip
        )
        raise


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Apply rate limiting to public endpoints."""
    from middleware.rate_limiter import check_rate_limit, get_client_ip
    from fastapi.responses import JSONResponse

    # Exempt internal/health endpoints
    exempt_paths = ["/health", "/docs", "/openapi.json", "/favicon.ico"]
    if any(request.url.path.startswith(path) for path in exempt_paths):
        return await call_next(request)

    # Determine endpoint tier for rate limiting
    if "/api/chat" in request.url.path:
        tier = "chat"
    elif "/api/models" in request.url.path or "/api/providers" in request.url.path:
        tier = "models"
    elif "/api/files" in request.url.path:
        tier = "files"
    elif "/api/channels" in request.url.path:
        tier = "channels"
    elif "/api/browser" in request.url.path:
        tier = "browser"
    elif "/api/skills" in request.url.path and "/run" in request.url.path:
        tier = "skills"
    else:
        tier = "default"

    client_ip = get_client_ip(request)

    if not check_rate_limit(client_ip, tier):
        logger.warning("Rate limit exceeded for %s on %s tier", client_ip, tier)
        return JSONResponse(
            status_code=429,
            content={
                "status": "error",
                "code": "RATE_LIMIT",
                "message": f"Rate limit exceeded for {tier} endpoints",
                "details": {"tier": tier, "limit_type": tier},
                "timestamp": None
            }
        )

    return await call_next(request)


# Add CORS Middleware
# FIX: Removed wildcard "*" — only allow specific dev/prod origins
import os
_CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
if os.getenv("ALLOWED_ORIGINS"):
    _CORS_ORIGINS.extend(os.getenv("ALLOWED_ORIGINS", "").split(","))
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
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
from api.browser_session import router as browser_session_router
from api.omni_commander import router as omni_commander_router

app.include_router(factory_agents_router, prefix="/api/factory/agents", tags=["Factory Agents"])
app.include_router(factory_control_router, prefix="/api/factory", tags=["Factory Control"])
app.include_router(factory_settings_router, prefix="/api/factory/settings", tags=["Factory Settings"])
app.include_router(dev_loop_router, prefix="/api/dev-loop", tags=["Dev Loop"])
app.include_router(websocket_router, prefix="/ws", tags=["WebSocket"])
app.include_router(browser_session_router, prefix="/ws/browser", tags=["Browser Telemetry WS"])
app.include_router(omni_commander_router)


# ── OmniBot Master Upgrade Routers ──────────────────────────────────────
try:
    from api.channels import router as channels_router
    app.include_router(channels_router)
    logger.info("✓ Channels router loaded")
except Exception as e:
    logger.warning("Channels router failed to load: %s", e)

try:
    from api.memory import router as memory_router
    app.include_router(memory_router)
    logger.info("✓ Memory API router loaded")
except Exception as e:
    logger.warning("Memory API router failed to load: %s", e)

try:
    from api.heartbeat import router as heartbeat_router
    app.include_router(heartbeat_router)
    logger.info("✓ Heartbeat API router loaded")
except Exception as e:
    logger.warning("Heartbeat API router failed to load: %s", e)

try:
    from api.revenue import router as revenue_router
    app.include_router(revenue_router)
    logger.info("✓ Revenue API router loaded")
except Exception as e:
    logger.warning("Revenue API router failed to load: %s", e)

try:
    from api.skills import router as skills_router
    app.include_router(skills_router)
    logger.info("✓ Skills API router loaded")
except Exception as e:
    logger.warning("Skills API router failed to load: %s", e)

try:
    from api.browser import router as browser_api_router
    app.include_router(browser_api_router)
    logger.info("✓ Browser API router loaded")
except Exception as e:
    logger.warning("Browser API router failed to load: %s", e)

try:
    from middleware.auth import router as auth_router
    app.include_router(auth_router)
    logger.info("✓ Auth router loaded")
except Exception as e:
    logger.warning("Auth router failed to load: %s", e)

# ── AI Model Hub (Health Monitor) Router ─────────────────────────────────────
try:
    from api.ai_model_hub import router as ai_hub_router
    app.include_router(ai_hub_router)
    logger.info("✓ AI Model Hub router loaded")
except Exception as e:
    logger.warning("AI Model Hub router failed to load: %s", e)

# ── Free AI Model Access Router ──────────────────────────────────────────────
try:
    from api.ai_provider_status import router as free_ai_router
    app.include_router(free_ai_router, prefix="/api/free-ai", tags=["Free AI Model Status"])
    logger.info("✓ Free AI Model Status router registered")
except Exception as e:
    logger.warning("Free AI Model Status router failed to load: %s", e)

# ── Money Agent Router ───────────────────────────────────────────────────────
try:
    from api.money import router as money_router
    app.include_router(money_router, prefix="/api/money", tags=["Money Agent"])
    logger.info("✓ Money Agent router loaded")
except Exception as e:
    logger.warning("Money Agent router failed to load: %s", e)

# ── Collaboration Hub Router ─────────────────────────────────────────────────
try:
    from api.collaboration import router as collaboration_router
    app.include_router(collaboration_router, prefix="/api/collaboration", tags=["Collaboration Hub"])
    logger.info("✓ Collaboration Hub router loaded")
except Exception as e:
    logger.warning("Collaboration Hub router failed to load: %s", e)

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

# ── Shopify Theme Factory Router ─────────────────────────────────────────────
try:
    from routers.shopify import router as shopify_router
    app.include_router(shopify_router, prefix="/api/shopify", tags=["Shopify Factory"])
    logger.info("✓ Shopify Factory router loaded")
except Exception as e:
    logger.warning("Shopify Factory router failed to load: %s", e)

# ── System Health Check API ───────────────────────────────────────────────────
try:
    from api.health import router as health_router
    app.include_router(health_router, prefix="/api/health", tags=["Health"])
    logger.info("✓ System Health Check API registered")
except Exception as e:
    logger.warning("System Health Check API failed to load: %s", e)

# ── System Metrics API ────────────────────────────────────────────────────────
try:
    from api.metrics import router as metrics_router
    app.include_router(metrics_router, prefix="/api/metrics", tags=["Metrics"])
    logger.info("✓ System Metrics API registered")
except Exception as e:
    logger.warning("System Metrics API failed to load: %s", e)

# ── Centralized Logging System API ───────────────────────────────────────────
try:
    from routers.logs import router as logs_router
    app.include_router(logs_router, prefix="/api/logs", tags=["Logs"])
    logger.info("✓ Centralized Logging System API registered")
except Exception as e:
    logger.warning("Centralized Logging System API failed to load: %s", e)

# ── Autonomous Evolution Registry API ─────────────────────────────────────────
try:
    from api.evolution_registry import router as evolution_router
    app.include_router(evolution_router)
    logger.info("✓ Evolution Registry API registered")
except Exception as e:
    logger.warning("Evolution Registry API failed to load: %s", e)

# ── Task Queue API ────────────────────────────────────────────────────────────
try:
    from api.task_queue import router as task_queue_router
    app.include_router(task_queue_router)
    logger.info("✓ Task Queue API registered")
except Exception as e:
    logger.warning("Task Queue API failed to load: %s", e)

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


@app.get("/api/self-evolution/status")
async def self_evolution_status():
    """Get self-evolution engine status and recent cycle history."""
    try:
        from core.self_evolution.state_manager import get_state_manager
        import json
        from pathlib import Path
        import os

        manager = get_state_manager()
        state = manager.load_state()

        # Get recent cycle reports
        reports_dir = Path("autonomous_logs/cycle_reports")
        recent_cycles = []

        if reports_dir.exists():
            # Get last 5 cycle reports
            cycle_files = sorted(reports_dir.glob("cycle_*.json"), reverse=True)[:5]
            for cycle_file in cycle_files:
                try:
                    with open(cycle_file, "r") as f:
                        cycle_data = json.load(f)
                        recent_cycles.append(cycle_data)
                except Exception:
                    pass

        return {
            "enabled": os.getenv("SELF_EVOLUTION_ENABLED", "true").lower() == "true",
            "current_iteration": state.get("iteration", 0),
            "last_run": state.get("last_run"),
            "total_improvements_applied": state.get("total_improvements", 0),
            "total_errors": state.get("total_errors", 0),
            "interval_hours": int(os.getenv("EVOLUTION_INTERVAL_HOURS", "6")),
            "budget_consumed_this_cycle": state.get("budget_consumed_this_cycle", 0),
            "recent_cycles": recent_cycles,
        }

    except Exception as e:
        logger.error("Failed to get self-evolution status: %s", e)
        return {
            "error": str(e),
            "enabled": False,
            "current_iteration": 0,
            "total_improvements_applied": 0,
            "recent_cycles": [],
        }


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


@app.get("/health")
async def simple_health():
    """Simple health check endpoint."""
    from core.database import get_db
    db = get_db()
    return {
        "status": "ok",
        "db": "connected" if db is not None else "offline",
        "version": "2.0"
    }




if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
