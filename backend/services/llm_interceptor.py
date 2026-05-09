import httpx
import logging
from typing import Any
from models.settings import get_settings

logger = logging.getLogger(__name__)

class BackgroundAIDisabledException(Exception):
    """Raised when a background AI task attempts to reach the LLM but settings forbid it."""
    pass

class BackgroundLLMClient:
    """
    Middleware interceptor for httpx.AsyncClient.
    Strictly checks user settings before allowing network requests to the local LLM.
    """
    def __init__(self, *args, **kwargs):
        self._client = httpx.AsyncClient(*args, **kwargs)

    async def post(self, url: str, *args, **kwargs) -> httpx.Response:
        """
        Intercepts POST requests. If the URL points to the local LLM port 1234,
        it evaluates system settings before passing the request through.
        """
        if "1234" in url:
            settings = await get_settings()
            if not settings.proactiveBackgroundProcessing:
                logger.warning("[BackgroundLLMClient] 🛑 BLOCKED request to port 1234. Background AI is globally disabled.")
                raise BackgroundAIDisabledException("Background AI operations are currently disabled.")
        
        return await self._client.post(url, *args, **kwargs)

    async def __aenter__(self):
        await self._client.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._client.__aexit__(exc_type, exc_val, exc_tb)
