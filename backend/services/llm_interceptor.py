"""
LLM Call Interceptor — Auto-logs EVERY AI call to the telemetry system.
Hooks into AIProvider interface calls and model router calls.
Emits via WebSocket to frontend in real-time.
Stores in MongoDB `ai_telemetry` collection.

Usage:
    from services.llm_interceptor import intercept_llm_call
    
    # Wrap any AI call:
    result = await intercept_llm_call(
        provider="gemini",
        model="gemini-2.0-flash",
        func=my_ai_call,  # The actual AI call function
        *args, **kwargs
    )
"""

import time
import logging
from datetime import datetime, timezone
from typing import Callable, Any, Optional, Dict

from services.ai_health_monitor import get_ai_health_monitor
from api.ai_model_hub import broadcast_telemetry

logger = logging.getLogger(__name__)

# Track currently active (in-flight) calls
_active_calls: Dict[str, Dict[str, Any]] = {}
_call_counter: int = 0


def _estimate_tokens(text: str) -> int:
    """Rough token estimation (~4 chars per token for most languages)."""
    return max(1, len(text) // 4)


async def intercept_llm_call(
    provider: str,
    model: str,
    func: Callable,
    messages: list = None,
    agent_id: str = None,
    task_type: str = None,
    max_tokens: int = None,
    *args,
    **kwargs
) -> Any:
    """
    Intercept an AI provider call, log telemetry, and return the result.

    Args:
        provider: Provider name (e.g., "gemini", "groq", "openrouter")
        model: Model name (e.g., "gemini-2.0-flash", "llama-3.3-70b")
        func: Async callable that makes the actual AI request
        messages: Input messages (for token estimation)
        agent_id: Optional agent identifier
        task_type: Optional task type hint
        max_tokens: Optional max output tokens
        *args, **kwargs: Passed to func

    Returns:
        The result of func(*args, **kwargs)
    """
    global _call_counter
    _call_counter += 1

    # Estimate input tokens
    input_text = ""
    if messages:
        if isinstance(messages, str):
            input_text = messages
        elif isinstance(messages, list):
            input_text = " ".join(
                m.get("content", "") if isinstance(m, dict) else str(m)
                for m in messages
            )
    tokens_in = _estimate_tokens(input_text)

    start_time = time.monotonic()
    error = None
    output_text = ""

    try:
        # Execute the actual call
        result = await func(*args, **kwargs)

        latency_ms = int((time.monotonic() - start_time) * 1000)

        # Extract response text
        if result is None:
            output_text = ""
        elif isinstance(result, str):
            output_text = result
        elif hasattr(result, "content"):
            output_text = result.content
        elif isinstance(result, dict) and "content" in result:
            output_text = result["content"]
        else:
            output_text = str(result)

        tokens_out = _estimate_tokens(output_text)

        # Log telemetry
        monitor = get_ai_health_monitor()
        entry = monitor.log_call(
            provider=provider,
            model=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=latency_ms,
            error=None,
            agent_id=agent_id,
            task_type=task_type or "general",
        )

        # Store to MongoDB
        await monitor.store_telemetry(entry)

        # Broadcast via WebSocket
        try:
            await broadcast_telemetry(entry)
        except Exception:
            pass

        logger.debug(f"[Interceptor] {provider}/{model}: {tokens_in}in/{tokens_out}out ({latency_ms}ms)")

        return result

    except Exception as e:
        latency_ms = int((time.monotonic() - start_time) * 1000)
        error = str(e)[:500]
        output_text = error

        tokens_out = _estimate_tokens(output_text)

        # Log failed telemetry
        monitor = get_ai_health_monitor()
        entry = monitor.log_call(
            provider=provider,
            model=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=latency_ms,
            error=error,
            agent_id=agent_id,
            task_type=task_type or "general",
        )

        await monitor.store_telemetry(entry)

        try:
            await broadcast_telemetry(entry)
        except Exception:
            pass

        logger.warning(f"[Interceptor] FAILED {provider}/{model}: {error[:100]}")

        raise


def get_active_call_count() -> int:
    """Get number of currently in-flight calls."""
    return len(_active_calls)


def get_total_calls() -> int:
    """Get total intercepted calls this session."""
    return _call_counter