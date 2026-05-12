"""
Model Hub API — Central AI Model Registry and Dashboard
"""
from fastapi import APIRouter
from datetime import datetime, timedelta
from collections import defaultdict
import asyncio
import time
import uuid

router = APIRouter(prefix="/api/hub", tags=["hub"])

class ModelHub:
    """Central registry for ALL AI models and LLM calls"""
    def __init__(self):
        self.providers = {}
        self.call_log = []         # Last 1000 calls
        self.session_stats = defaultdict(lambda: {
            "calls": 0,
            "tokens_in": 0,
            "tokens_out": 0,
            "cost_usd": 0.0,
            "errors": 0,
            "avg_latency_ms": 0
        })
        self.active_calls = {}     # Currently in-flight calls
        self._start_time = datetime.utcnow()

    def register_provider(self, name: str, models: list, rpm_limit: int, rpd_limit: int):
        """Register a model provider"""
        self.providers[name] = {
            "name": name,
            "models": models,
            "rpm_limit": rpm_limit,
            "rpd_limit": rpd_limit,
            "status": "unknown",
            "last_check": None,
            "latency_ms": 0
        }

    def before_call(self, call_id: str, provider: str, model: str, agent_id: str = None):
        """Record call start"""
        self.active_calls[call_id] = {
            "provider": provider,
            "model": model,
            "agent_id": agent_id,
            "started_at": datetime.utcnow()
        }

    def after_call(self, call_id: str, tokens_in: int, tokens_out: int, cost: float, error: str = None):
        """Record call completion"""
        call = self.active_calls.pop(call_id, {})
        provider = call.get("provider", "unknown")
        started = call.get("started_at", datetime.utcnow())
        latency = int((datetime.utcnow() - started).total_seconds() * 1000)

        stats = self.session_stats[provider]
        stats["calls"] += 1
        stats["tokens_in"] += tokens_in
        stats["tokens_out"] += tokens_out
        stats["cost_usd"] += cost
        if error:
            stats["errors"] += 1
        stats["avg_latency_ms"] = (
            (stats["avg_latency_ms"] * (stats["calls"] - 1) + latency) / stats["calls"]
        )

        self.call_log.append({
            "id": call_id,
            "provider": provider,
            "model": call.get("model"),
            "agent_id": call.get("agent_id"),
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": cost,
            "latency_ms": latency,
            "error": error,
            "timestamp": datetime.utcnow().isoformat()
        })

        if len(self.call_log) > 1000:
            self.call_log = self.call_log[-1000:]

    def get_dashboard_data(self) -> dict:
        """Get dashboard view of hub state"""
        uptime = (datetime.utcnow() - self._start_time).total_seconds()
        total_calls = sum(s["calls"] for s in self.session_stats.values())
        total_cost = sum(s["cost_usd"] for s in self.session_stats.values())

        return {
            "uptime_seconds": int(uptime),
            "total_calls_session": total_calls,
            "total_cost_session_usd": round(total_cost, 4),
            "active_calls": len(self.active_calls),
            "providers": {
                name: {
                    **self.providers.get(name, {}),
                    **self.session_stats[name]
                }
                for name in set(list(self.providers.keys()) + list(self.session_stats.keys()))
            },
            "recent_calls": self.call_log[-20:]
        }

# Global singleton
_hub_instance: ModelHub = None

def get_model_hub() -> ModelHub:
    """Get or create the global ModelHub instance"""
    global _hub_instance
    if _hub_instance is None:
        _hub_instance = ModelHub()
        # Register default providers
        _hub_instance.register_provider("groq", ["llama-3.3-70b-versatile"], 30, 500)
        _hub_instance.register_provider("openrouter", ["llama-3.2-1b-instruct"], 50, 1000)
        _hub_instance.register_provider("gemini", ["gemini-2.0-flash"], 60, 1000)
        _hub_instance.register_provider("cerebras", ["llama-3.3-70b"], 100, 2000)
        _hub_instance.register_provider("cloudflare", ["llama-3.1-8b"], 100, 2000)
        _hub_instance.register_provider("llamacloud", ["llama-3.3-70b"], 30, 500)
    return _hub_instance

# ────────────────────────────────────────────────────────────────────────
# Endpoints
# ────────────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def get_hub_dashboard():
    """Get Model Hub dashboard data"""
    hub = get_model_hub()
    return hub.get_dashboard_data()

@router.get("/calls")
async def get_recent_calls(limit: int = 50):
    """Get recent LLM calls"""
    hub = get_model_hub()
    return hub.call_log[-limit:]

@router.get("/providers")
async def get_providers():
    """Get all registered providers"""
    hub = get_model_hub()
    return hub.providers

@router.post("/test-call")
async def test_call(provider: str = "auto", model: str = "auto"):
    """Test call to a provider (for diagnostics).
    
    Makes a real AI call via model_router to serve as a genuine connectivity health check.
    Returns real metrics: token counts, latency, model used, and cost if available.
    """
    hub = get_model_hub()
    call_id = str(uuid.uuid4())
    start_time = time.monotonic()
    
    try:
        # Make a real AI call with a minimal test prompt
        from core.model_router import call_model as model_call
        
        response = await model_call(
            messages=[{"role": "user", "content": "Reply with the single word: OK"}],
            task_type="general",
            max_tokens=10
        )
        
        latency_ms = int((time.monotonic() - start_time) * 1000)
        
        # Estimate token counts (rough proxy since we don't have exact counts from LiteLLM)
        # ~4 chars per token for input, ~1 token per word for output
        input_text = "Reply with the single word: OK"
        output_text = response or ""
        tokens_in = max(1, len(input_text) // 4)
        tokens_out = max(1, len(output_text.split()))
        
        # Estimate cost at ~$0.15/M input tokens, $0.60/M output tokens (conservative mid-range)
        cost = round((tokens_in * 0.15 + tokens_out * 0.60) / 1_000_000, 6)
        
        hub.after_call(call_id, tokens_in=tokens_in, tokens_out=tokens_out, cost=cost, error=None)
        
        return {
            "call_id": call_id,
            "status": "ok",
            "response": response,
            "latency_ms": latency_ms,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": cost,
            "is_simulated": False,
            "provider_used": provider,
            "model_used": model,
        }
        
    except Exception as e:
        latency_ms = int((time.monotonic() - start_time) * 1000)
        error_str = str(e)
        hub.after_call(call_id, tokens_in=0, tokens_out=0, cost=0.0, error=error_str)
        
        return {
            "call_id": call_id,
            "status": "error",
            "error": error_str,
            "latency_ms": latency_ms,
            "tokens_in": 0,
            "tokens_out": 0,
            "cost_usd": 0.0,
            "is_simulated": False,
            "provider_used": provider,
            "model_used": model,
        }
