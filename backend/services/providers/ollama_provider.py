"""
Ollama Provider — Direction 6 of Phase 5.

Extends OpenAICompatibleProvider for the local Ollama server (localhost:11434/v1).
Adds:
  - Tool-calling support detection per model name (whitelist of known capable models)
  - Model size / quantization metadata from Ollama's native /api/tags endpoint
  - Graceful no-tools path for models that don't support function calling
"""
import logging
from typing import AsyncGenerator, Any, Dict, List, Optional, Tuple

import httpx

from .openai_compat import OpenAICompatibleProvider

logger = logging.getLogger(__name__)

# Models known to support tool/function calling via Ollama
_TOOL_CAPABLE_MODELS = {
    "llama3", "llama3.1", "llama3.2", "llama3.3",
    "mistral", "mistral-nemo", "mistral-small",
    "qwen2", "qwen2.5", "qwen2.5-coder",
    "phi3", "phi3.5",
    "gemma2", "command-r",
    "hermes3", "firefunction",
    "nexusraven",
}

_OLLAMA_NATIVE_URL = "http://localhost:11434"


def _model_supports_tools(model_id: str) -> bool:
    """Return True if the model is known to support tool/function calling."""
    lower = model_id.lower()
    return any(known in lower for known in _TOOL_CAPABLE_MODELS)


class OllamaProvider(OpenAICompatibleProvider):
    """
    Local Ollama server — OpenAI-compatible at /v1, native API at /.
    Auto-detects tool support per model and suppresses tool schemas for incapable models.
    """

    _default_base_url = f"{_OLLAMA_NATIVE_URL}/v1"
    _default_api_key_env = ""
    _provider_name = "ollama"
    _provider_display = "Ollama (Local)"

    def __init__(self):
        super().__init__()
        self._api_key = "ollama"  # Ollama accepts any Bearer value — "ollama" is the conventional choice

    # ── Config (api_key intentionally ignored) ────────────────────────────────

    def configure(self, config: dict) -> None:
        if config.get("base_url"):
            self._base_url = config["base_url"]

    # ── Availability ──────────────────────────────────────────────────────────

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(f"{_OLLAMA_NATIVE_URL}/api/tags")
                return r.status_code == 200
        except Exception:
            return False

    # ── Model listing (with size/quantization from native API) ────────────────

    async def list_models(self) -> List[Dict[str, str]]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{_OLLAMA_NATIVE_URL}/api/tags")
                r.raise_for_status()
                models_raw = r.json().get("models", [])
            result = []
            for m in models_raw:
                model_id = m.get("name", "")
                size_bytes = m.get("size", 0)
                size_gb = f"{size_bytes / 1e9:.1f}GB" if size_bytes else ""
                details = m.get("details", {})
                quant = details.get("quantization_level", "")
                family = details.get("family", "")
                param_size = details.get("parameter_size", "")
                label_parts = [p for p in [family, param_size, quant, size_gb] if p]
                label = f"{model_id} ({', '.join(label_parts)})" if label_parts else model_id
                result.append({
                    "id": model_id,
                    "name": label,
                    "supports_tools": _model_supports_tools(model_id),
                    "size_gb": size_gb,
                    "quantization": quant,
                    "family": family,
                })
            return result
        except Exception as exc:
            logger.warning("[ollama] list_models failed: %s", exc)
            return []

    # ── Chat streaming (suppress tools for incapable models) ─────────────────

    async def stream_chat(
        self,
        messages: List[Dict[str, Any]],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        tools: Optional[List[Dict]] = None,
        **kwargs,
    ) -> AsyncGenerator[Tuple[str, Any], None]:
        # Drop tool schemas for models that don't support function calling
        if tools and not _model_supports_tools(model):
            logger.debug("[ollama] %s does not support tools — stripping tool schemas", model)
            tools = None

        async for event in super().stream_chat(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            **kwargs,
        ):
            yield event

