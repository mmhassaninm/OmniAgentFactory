"""
WhatsApp Gateway for OmniBot — connects via Whapi HTTP API.
Provides: connect(), send_message(to, text), receive_handler().

If the WHATSAPP_API_KEY is not set, all methods log a warning and return
gracefully — the system continues running without this channel.
"""

import asyncio
import logging
from typing import Optional, Callable, Awaitable

import httpx

logger = logging.getLogger(__name__)

WHAPI_BASE = "https://gate.whapi.cloud"


class WhatsAppChannel:
    """WhatsApp integration using Whapi Cloud HTTP API."""

    def __init__(self, api_key: str = "") -> None:
        self.api_key: str = api_key
        self._enabled: bool = bool(api_key)
        self._headers: dict[str, str] = {}
        self._message_handler: Optional[Callable[[str, str, str], Awaitable[None]]] = None
        self._running: bool = False

    async def connect(self) -> bool:
        """Initialize connection to Whapi API. Returns True if ready."""
        if not self._enabled:
            logger.warning("[WhatsApp] Channel disabled — no WHATSAPP_API_KEY configured")
            return False
        self._headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{WHAPI_BASE}/health", headers=self._headers)
                if resp.status_code == 200:
                    logger.info("[WhatsApp] Channel connected successfully")
                    self._running = True
                    return True
                logger.warning("[WhatsApp] Health check failed: HTTP %d", resp.status_code)
                return False
        except Exception as e:
            logger.warning("[WhatsApp] Connection failed: %s", e)
            return False

    async def send_message(self, to: str, text: str) -> bool:
        """Send a WhatsApp message to a phone number (with country code)."""
        if not self._enabled:
            logger.debug("[WhatsApp] send_message skipped — channel disabled")
            return False
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{WHAPI_BASE}/messages/text",
                    headers=self._headers,
                    json={"to": to, "body": text},
                )
                if resp.status_code in (200, 201):
                    logger.info("[WhatsApp] Message sent to %s (len=%d)", to[:8], len(text))
                    return True
                logger.warning("[WhatsApp] Send failed: HTTP %d %s", resp.status_code, resp.text[:200])
                return False
        except Exception as e:
            logger.warning("[WhatsApp] send_message error: %s", e)
            return False

    async def receive_handler(self, payload: dict) -> Optional[dict]:
        """
        Process an incoming webhook payload from Whapi.
        Returns a dict with keys: channel, user_id, message, raw
        or None if the payload is not a valid message.
        """
        if not self._enabled:
            return None
        try:
            messages = payload.get("messages", [])
            if not messages:
                return None
            msg = messages[0]
            msg_type = msg.get("type", "")
            if msg_type != "text":
                logger.debug("[WhatsApp] Ignored non-text message type: %s", msg_type)
                return None
            text = msg.get("text", {}).get("body", "")
            sender = msg.get("from", "")
            if not text or not sender:
                return None
            logger.info("[WhatsApp] Received message from %s: %.80s", sender, text)
            return {
                "channel": "whatsapp",
                "user_id": sender,
                "message": text,
                "raw": payload,
            }
        except Exception as e:
            logger.warning("[WhatsApp] receive_handler error: %s", e)
            return None

    async def listen_webhook(
        self,
        handler: Callable[[str, str, str], Awaitable[None]],
    ) -> None:
        """Register the callback for incoming messages (called by webhook endpoint)."""
        self._message_handler = handler
        logger.info("[WhatsApp] Webhook handler registered")

    async def disconnect(self) -> None:
        """Clean shutdown of the channel."""
        self._running = False
        logger.info("[WhatsApp] Channel disconnected")