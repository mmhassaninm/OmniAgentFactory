"""
Resilient wrapper around model router with circuit breaker pattern.
Prevents cascading failures when providers are consistently failing.
Includes fallback chain through FreeCloudProvider (Gemini, Groq, Mistral, etc.)
"""

import logging
import asyncio
from typing import Any, Optional, List, Dict
from middleware.circuit_breaker import call_with_breaker, get_all_breakers

logger = logging.getLogger(__name__)


# ── FreeCloudProvider Fallback ──────────────────────────────────────────────

async def call_free_cloud_model(
    messages: List[Dict[str, str]],
    model: str = "gemini-2.0-flash",
    require_tool_calling: bool = False,
    **kwargs
) -> Optional[str]:
    """
    Attempt to call a free cloud AI provider (Gemini, Groq, Mistral, etc.)
    via the FreeCloudProvider. Returns None if no cloud provider is configured.

    Args:
        messages: Message list for LLM
        model: Model name to use (default: gemini-2.0-flash)
        require_tool_calling: If True, only providers with tool calling support are used
        **kwargs: Additional arguments

    Returns:
        Response string, or None if unavailable
    """
    try:
        from ai_provider.free_cloud_provider import FreeCloudProvider, CLOUD_PROVIDERS

        provider = FreeCloudProvider()
        available = provider.get_available_providers()

        if not any(p.get("configured") for p in available):
            logger.debug("[ResilientRouter] FreeCloudProvider: no API keys configured")
            return None

        response = await provider.chat_async(messages, model=model, **kwargs)
        if response and response.success:
            logger.info(f"[ResilientRouter] FreeCloudProvider success via {response.provider}")
            return response.content

        return None

    except Exception as e:
        logger.warning(f"[ResilientRouter] FreeCloudProvider fallback failed: {e}")
        return None


async def call_model_resilient(
    messages: List[Dict[str, str]],
    task_type: str = "general",
    agent_id: Optional[str] = None,
    fallback_content: Optional[str] = None,
    **kwargs
) -> str:
    """
    Call model router with circuit breaker protection.

    If the router circuit is open (failing), returns fallback content instead of raising.

    Args:
        messages: Message list for LLM
        task_type: Task type hint
        agent_id: Agent making the request
        fallback_content: Content to return if circuit is open
        **kwargs: Additional arguments for router

    Returns:
        Model response or fallback content if circuit breaker is open
    """
    from core.model_router import call_model, RouterExhaustedError

    try:
        # Wrap the router call with circuit breaker
        response = await call_with_breaker(
            "model_router",
            call_model,
            messages,
            task_type=task_type,
            agent_id=agent_id,
            **kwargs
        )
        return response
    except Exception as e:
        # If circuit is open or provider is down
        error_msg = str(e)
        logger.error(
            "Model router failed for agent %s: %s",
            agent_id or "unknown",
            error_msg[:200]
        )

        # Return fallback or raise
        if fallback_content is not None:
            logger.warning(
                "Using fallback content for agent %s",
                agent_id or "unknown"
            )
            return fallback_content
        else:
            raise


async def get_router_health() -> Dict[str, Any]:
    """Get health status of model router circuit breaker."""
    breakers = get_all_breakers()
    router_breaker = breakers.get("model_router", {})

    return {
        "service": "model_router",
        "state": router_breaker.get("state", "unknown"),
        "failure_count": router_breaker.get("failure_count", 0),
        "success_count": router_breaker.get("success_count", 0),
        "opened_at": router_breaker.get("opened_at"),
        "last_failure_time": router_breaker.get("last_failure_time")
    }


async def call_model_with_retry(
    messages: List[Dict[str, str]],
    max_retries: int = 3,
    task_type: str = "general",
    agent_id: Optional[str] = None,
    **kwargs
) -> str:
    """
    Call model router with automatic retry on transient failures.

    Args:
        messages: Message list for LLM
        max_retries: Maximum retry attempts (default 3)
        task_type: Task type hint
        agent_id: Agent making the request
        **kwargs: Additional arguments for router

    Returns:
        Model response

    Raises:
        Exception if all retries exhausted
    """
    from core.model_router import RouterExhaustedError

    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            logger.debug(
                "Model call attempt %d/%d for agent %s",
                attempt, max_retries, agent_id or "unknown"
            )
            return await call_model_resilient(
                messages,
                task_type=task_type,
                agent_id=agent_id,
                **kwargs
            )
        except RouterExhaustedError as e:
            # Provider tier fully exhausted, don't retry
            logger.error("Router exhausted on attempt %d: %s", attempt, e)
            raise
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                # Exponential backoff: 1s, 2s, 4s
                wait_time = 2 ** (attempt - 1)
                logger.warning(
                    "Model call attempt %d failed (will retry in %ds): %s",
                    attempt, wait_time, str(e)[:100]
                )
                await asyncio.sleep(wait_time)
            else:
                logger.error(
                    "Model call failed after %d retries for agent %s: %s",
                    max_retries, agent_id or "unknown", str(e)[:200]
                )

    # All retries exhausted
    if last_error:
        raise last_error
    else:
        raise Exception("Model call failed after all retries")


async def call_model_with_fallback(
    messages: List[Dict[str, str]],
    fallback_responses: Optional[List[str]] = None,
    task_type: str = "general",
    agent_id: Optional[str] = None,
    **kwargs
) -> str:
    """
    Call model router, returning fallback response if unavailable.

    Useful for non-critical operations that can gracefully degrade.

    Args:
        messages: Message list for LLM
        fallback_responses: List of fallback responses to pick from
        task_type: Task type hint
        agent_id: Agent making the request
        **kwargs: Additional arguments for router

    Returns:
        Model response or fallback response
    """
    try:
        return await call_model_resilient(
            messages,
            task_type=task_type,
            agent_id=agent_id,
            **kwargs
        )
    except Exception as e:
        # Use fallback response
        if fallback_responses:
            import random
            fallback = random.choice(fallback_responses)
            logger.warning(
                "Model unavailable, using fallback response for agent %s",
                agent_id or "unknown"
            )
            return fallback
        else:
            logger.error(
                "Model failed and no fallback available for agent %s: %s",
                agent_id or "unknown",
                str(e)[:100]
            )
            raise
