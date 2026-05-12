"""
Unified Channel Router — receives messages from ANY channel, routes them to
the central agent loop, and sends replies back through the originating channel.

All interactions are logged to MongoDB with: channel, user_id, message, response, timestamp.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Any

from core.database import get_db

logger = logging.getLogger(__name__)


class ChannelRouter:
    """
    Central message router for all communication channels.
    Each channel registers itself with a name and send function.
    Incoming messages are logged and forwarded to the agent loop.
    """

    def __init__(self) -> None:
        self._channels: dict[str, Any] = {}  # name -> channel instance
        self._send_functions: dict[str, Any] = {}  # name -> callable(to, text)

    def register_channel(self, name: str, instance: Any) -> None:
        """Register a channel instance by name (telegram, whatsapp, discord)."""
        self._channels[name] = instance
        logger.info("[ChannelRouter] Registered channel: %s", name)

    def register_send(self, name: str, send_func: Any) -> None:
        """Register a send function for a channel."""
        self._send_functions[name] = send_func
        logger.info("[ChannelRouter] Registered send function for: %s", name)

    async def route_message(
        self,
        channel: str,
        user_id: str,
        message: str,
    ) -> Optional[str]:
        """
        Route an incoming message to the agent loop and return the response.
        Logs the interaction to MongoDB.
        """
        logger.info("[ChannelRouter] %s message from %s: %.80s", channel, user_id, message)
        response: Optional[str] = None

        try:
            # Attempt to process via the agent loop
            from agent.loop import run_agent_loop
            from core.model_router import get_model_router

            router = get_model_router()
            provider = router.get_fastest_provider()
            model = router.get_fastest_model()

            response_text = ""
            async for event in run_agent_loop(
                task=message,
                tools=[],
                provider=provider,
                model=model or "openai/gpt-4o-mini",
                max_iterations=3,
            ):
                # Parse SSE to extract final answer
                if "event: agent_finish" in event:
                    import json
                    data_str = event.replace("event: agent_finish\ndata: ", "").strip()
                    try:
                        data = json.loads(data_str)
                        response_text = data.get("answer", "")
                    except json.JSONDecodeError:
                        response_text = data_str

            if response_text:
                response = response_text
                # Send response back through originating channel
                send_func = self._send_functions.get(channel)
                if send_func:
                    await send_func(user_id, response)

        except Exception as e:
            logger.warning("[ChannelRouter] Agent loop error for %s/%s: %s", channel, user_id, e)
            response = f"⚠️ Error processing your request: {str(e)[:200]}"
            send_func = self._send_functions.get(channel)
            if send_func:
                await send_func(user_id, response)

        # Log to MongoDB
        try:
            db = get_db()
            await db.channel_messages.insert_one({
                "channel": channel,
                "user_id": user_id,
                "message": message,
                "response": response or "",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.warning("[ChannelRouter] Failed to log message to MongoDB: %s", e)

        return response

    async def broadcast(self, text: str, channels: Optional[list[str]] = None) -> dict[str, bool]:
        """
        Send a message to all (or specified) channels.
        Returns dict of channel_name -> success_bool.
        """
        targets = channels or list(self._send_functions.keys())
        results: dict[str, bool] = {}
        for ch_name in targets:
            send_func = self._send_functions.get(ch_name)
            if send_func:
                try:
                    # broadcast uses "all" as target — channels interpret this
                    await send_func("all", text)
                    results[ch_name] = True
                except Exception as e:
                    logger.warning("[ChannelRouter] Broadcast to %s failed: %s", ch_name, e)
                    results[ch_name] = False
            else:
                results[ch_name] = False
        return results

    async def get_status(self) -> dict[str, Any]:
        """Return health status of all registered channels."""
        status: dict[str, Any] = {}
        for name, instance in self._channels.items():
            is_enabled = getattr(instance, "_enabled", False)
            is_running = getattr(instance, "_running", False)
            status[name] = {
                "registered": True,
                "enabled": bool(is_enabled),
                "running": bool(is_running),
            }
        return status


# Singleton
_router_instance: Optional[ChannelRouter] = None


def get_channel_router() -> ChannelRouter:
    """Get or create the singleton ChannelRouter."""
    global _router_instance
    if _router_instance is None:
        _router_instance = ChannelRouter()
    return _router_instance