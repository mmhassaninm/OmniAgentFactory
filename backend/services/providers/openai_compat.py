import json
import os
from typing import AsyncGenerator, Any, Dict, List, Optional, Tuple

import httpx

from .base import BaseProvider


class OpenAICompatibleProvider(BaseProvider):
    """
    Handles any provider that exposes an OpenAI-compatible REST API:
    OpenAI, Groq, Google Gemini (v1beta/openai), OpenRouter, and local servers.

    Subclass and set _default_base_url / _default_api_key_env to specialise.
    """

    _default_base_url: str = ""
    _default_api_key_env: str = ""
    _provider_name: str = ""
    _provider_display: str = ""

    def __init__(self):
        self._base_url: str = self._default_base_url
        self._api_key: Optional[str] = os.getenv(self._default_api_key_env, "") if self._default_api_key_env else ""

    # ── Identity ──────────────────────────────────────────────────────────────

    @property
    def name(self) -> str:
        return self._provider_name

    @property
    def display_name(self) -> str:
        return self._provider_display

    # ── Config ────────────────────────────────────────────────────────────────

    def configure(self, config: dict) -> None:
        if config.get("api_key"):
            self._api_key = config["api_key"]
        if config.get("base_url"):
            self._base_url = config["base_url"]

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    # ── Availability ──────────────────────────────────────────────────────────

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(f"{self._base_url}/models", headers=self._headers())
                return r.status_code in (200, 401, 403)  # 401/403 = key wrong but server is up
        except Exception:
            return False

    # ── Model listing ─────────────────────────────────────────────────────────

    async def list_models(self) -> List[Dict[str, str]]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self._base_url}/models", headers=self._headers())
                r.raise_for_status()
                data = r.json().get("data", [])
                return [{"id": m["id"], "name": m.get("name", m["id"])} for m in data]
        except Exception:
            return []

    # ── Streaming chat ────────────────────────────────────────────────────────

    async def stream_chat(
        self,
        messages: List[Dict[str, Any]],
        model: str,
        temperature: float = 0.6,
        max_tokens: int = 2048,
        tools: Optional[List[Dict]] = None,
    ) -> AsyncGenerator[Tuple[str, Any], None]:
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if tools:
            payload["tools"] = tools

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{self._base_url}/chat/completions",
                    json=payload,
                    headers=self._headers(),
                ) as resp:
                    if resp.status_code >= 400:
                        body = await resp.aread()
                        err = body.decode("utf-8", errors="ignore")
                        yield ("error", f"HTTP {resp.status_code}: {err[:300]}")
                        return

                    tool_calls: Dict[int, Dict] = {}

                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        raw = line[6:].strip()
                        if raw == "[DONE]":
                            break
                        try:
                            chunk = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        delta = chunk.get("choices", [{}])[0].get("delta", {})

                        # ── Tool-call deltas ──────────────────────────────────
                        if "tool_calls" in delta:
                            for tc in delta["tool_calls"]:
                                idx = tc.get("index", 0)
                                if idx not in tool_calls:
                                    tool_calls[idx] = {
                                        "index": idx,
                                        "id": tc.get("id", ""),
                                        "name": "",
                                        "arguments": "",
                                    }
                                fn = tc.get("function", {})
                                if fn.get("name"):
                                    tool_calls[idx]["name"] = fn["name"]
                                if fn.get("arguments"):
                                    tool_calls[idx]["arguments"] += fn["arguments"]
                                if tc.get("id"):
                                    tool_calls[idx]["id"] = tc["id"]
                                yield ("tool_call", dict(tool_calls[idx]))
                            continue

                        # ── Text content ──────────────────────────────────────
                        content = delta.get("content") or ""
                        if content:
                            yield ("content", content)

        except Exception as exc:
            yield ("error", str(exc))
            return

        yield ("done", None)


# ── Concrete provider singletons ──────────────────────────────────────────────


class OpenAIProvider(OpenAICompatibleProvider):
    _default_base_url = "https://api.openai.com/v1"
    _default_api_key_env = "OPENAI_API_KEY"
    _provider_name = "openai"
    _provider_display = "OpenAI"


class GroqProvider(OpenAICompatibleProvider):
    _default_base_url = "https://api.groq.com/openai/v1"
    _default_api_key_env = "GROQ_API_KEY"
    _provider_name = "groq"
    _provider_display = "Groq"


class GoogleProvider(OpenAICompatibleProvider):
    _default_base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
    _default_api_key_env = "GOOGLE_API_KEY"
    _provider_name = "google"
    _provider_display = "Google Gemini"

    def _headers(self) -> Dict[str, str]:
        # Google also accepts the key via query param, but Bearer works too
        return super()._headers()


class OpenRouterProvider(OpenAICompatibleProvider):
    _default_base_url = "https://openrouter.ai/api/v1"
    _default_api_key_env = "OPENROUTER_API_KEY"
    _provider_name = "openrouter"
    _provider_display = "OpenRouter"

    def _headers(self) -> Dict[str, str]:
        headers = super()._headers()
        headers["HTTP-Referer"] = "https://omnibot.local"
        headers["X-Title"] = "OmniBot"
        return headers
