"""
Channel Management API — webhook endpoints for external messaging channels.

Endpoints:
  POST /api/channels/whatsapp/webhook — receive WhatsApp messages via Whapi
  GET  /api/channels/status — health check for all registered channels
"""

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

from services.channels.channel_router import get_channel_router

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/channels", tags=["Channels"])


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request) -> dict[str, str]:
    """
    Webhook endpoint for Whapi Cloud WhatsApp messages.
    Receives incoming WhatsApp messages and routes them through the channel router.
    """
    try:
        payload = await request.json()
    except Exception as e:
        logger.warning("[Channels] WhatsApp webhook invalid JSON: %s", e)
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Import here to avoid circular imports
    try:
        from services.channels.whatsapp_channel import WhatsAppChannel
        from core.database import get_db
        from core.config import get_settings

        settings = get_settings()
        whatsapp = WhatsAppChannel(settings.whatsapp_api_key)
        parsed = await whatsapp.receive_handler(payload)
        if parsed is None:
            # Not a text message — acknowledge receipt
            return {"status": "ignored"}

        # Route through channel router
        router = get_channel_router()
        await router.route_message(
            channel="whatsapp",
            user_id=parsed["user_id"],
            message=parsed["message"],
        )
        logger.info("[Channels] WhatsApp message routed: %s", parsed["user_id"])
        return {"status": "ok"}
    except Exception as e:
        logger.warning("[Channels] WhatsApp webhook handler error: %s", e)
        return {"status": "error", "detail": str(e)[:200]}


@router.post("/discord/webhook")
async def discord_webhook(request: Request) -> dict[str, str]:
    """
    Webhook endpoint for Discord interaction endpoints (fallback if bot isn't running).
    """
    try:
        payload = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    try:
        text = payload.get("content", "")
        user_id = str(payload.get("author", {}).get("id", "unknown"))
        if text:
            router = get_channel_router()
            await router.route_message(channel="discord", user_id=user_id, message=text)
            return {"status": "ok"}
        return {"status": "ignored", "reason": "empty content"}
    except Exception as e:
        logger.warning("[Channels] Discord webhook error: %s", e)
        return {"status": "error", "detail": str(e)[:200]}


@router.get("/status")
async def channels_status() -> dict[str, Any]:
    """
    Health check for all registered messaging channels.
    Returns the enabled/running status of each channel.
    """
    try:
        router = get_channel_router()
        status = await router.get_status()
        return {"status": "ok", "channels": status}
    except Exception as e:
        logger.warning("[Channels] Status check error: %s", e)
        return {"status": "error", "channels": {}, "detail": str(e)[:200]}