import os
from typing import AsyncGenerator, Any, Dict, List, Optional, Tuple

import httpx

from .openai_compat import OpenAICompatibleProvider

EMBEDDING_MODEL = "text-embedding-bge-m3"


class LMStudioProvider(OpenAICompatibleProvider):
    """
    LM Studio local provider.
    Extends the OpenAI-compatible base with:
    - No API key required
    - Auto-Ignition on '400 No Models Loaded'
    - Filters the embedding model from the model list
    """

    _default_base_url = "http://127.0.0.1:1234/v1"
    _default_api_key_env = ""
    _provider_name = "lm_studio"
    _provider_display = "LM Studio"

    def __init__(self):
        super().__init__()
        # Allow custom LM Studio URL via env var; ensure /v1 suffix
        raw = os.getenv("LM_STUDIO_URL", "http://127.0.0.1:1234/v1")
        self._base_url = raw if raw.endswith("/v1") else raw.rstrip("/") + "/v1"

    def _headers(self) -> Dict[str, str]:
        return {"Content-Type": "application/json"}

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(f"{self._base_url}/models")
                return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> List[Dict[str, str]]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self._base_url}/models")
                r.raise_for_status()
                data = r.json().get("data", [])
                return [
                    {"id": m["id"], "name": m.get("name", m["id"])}
                    for m in data
                    if m["id"] != EMBEDDING_MODEL
                ]
        except Exception:
            return []

    async def stream_chat(
        self,
        messages: List[Dict[str, Any]],
        model: str,
        temperature: float = 0.6,
        max_tokens: int = 2048,
        tools: Optional[List[Dict]] = None,
    ) -> AsyncGenerator[Tuple[str, Any], None]:
        # Lazy import to avoid circular dependency (routers → providers → routers)
        from routers.models import auto_ignition

        for attempt in range(3):
            empty_vram = False
            # Collect events from the base OpenAI-compat streaming
            buf = []
            async for event in super().stream_chat(
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                tools=tools,
            ):
                event_type, data = event
                if event_type == "error" and "400" in str(data) and "No models loaded" in str(data):
                    empty_vram = True
                    break
                buf.append(event)

            if not empty_vram:
                for event in buf:
                    yield event
                return

            # Auto-Ignition
            yield ("status", f"⚠️ VRAM Empty! Auto-Ignition (attempt {attempt + 1}/3)...")
            healed = await auto_ignition()
            if healed:
                model = healed
                yield ("status", f"✅ Auto-Ignited: {healed}")
            else:
                yield ("error", "Auto-Ignition failed — no models available in LM Studio.")
                return

        yield ("error", "LM Studio: Max Auto-Ignition retries reached.")
