import json
import os
from typing import AsyncGenerator, Any, Dict, List, Optional, Tuple

import httpx

from .base import BaseProvider

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

# Hardcoded because Anthropic has no public /models listing endpoint
ANTHROPIC_MODELS = [
    {"id": "claude-opus-4-7", "name": "Claude Opus 4.7"},
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6"},
    {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5"},
]


def _convert_tools_to_anthropic(tools: List[Dict]) -> List[Dict]:
    """Convert OpenAI tool format → Anthropic tool format."""
    converted = []
    for t in tools:
        if t.get("type") != "function":
            continue
        fn = t["function"]
        converted.append({
            "name": fn["name"],
            "description": fn.get("description", ""),
            "input_schema": fn.get("parameters", {"type": "object", "properties": {}}),
        })
    return converted


def _convert_messages_to_anthropic(messages: List[Dict]) -> tuple:
    """
    Split messages into (system_prompt, anthropic_messages).
    Anthropic puts the system prompt as a top-level field, not a message.
    Also converts tool_call / tool result messages to Anthropic format.
    """
    system_prompt = ""
    anthropic_msgs = []

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")

        if role == "system":
            system_prompt += (content or "") + "\n"
            continue

        if role == "tool":
            # OpenAI tool result → Anthropic tool_result content block
            anthropic_msgs.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": msg.get("tool_call_id", "call_0"),
                    "content": str(content),
                }],
            })
            continue

        if role == "assistant" and msg.get("tool_calls"):
            # OpenAI assistant tool_calls → Anthropic tool_use content blocks
            blocks = []
            if content:
                blocks.append({"type": "text", "text": content})
            for tc in msg["tool_calls"]:
                fn = tc.get("function", {})
                try:
                    input_data = json.loads(fn.get("arguments", "{}"))
                except Exception:
                    input_data = {}
                blocks.append({
                    "type": "tool_use",
                    "id": tc.get("id", "call_0"),
                    "name": fn.get("name", ""),
                    "input": input_data,
                })
            anthropic_msgs.append({"role": "assistant", "content": blocks})
            continue

        # Standard user/assistant message
        if content is not None:
            anthropic_msgs.append({"role": role, "content": str(content)})

    return system_prompt.strip(), anthropic_msgs


class AnthropicProvider(BaseProvider):
    """Anthropic Claude provider with unique SSE format and tool schema."""

    def __init__(self):
        self._api_key: str = os.getenv("ANTHROPIC_API_KEY", "")

    @property
    def name(self) -> str:
        return "anthropic"

    @property
    def display_name(self) -> str:
        return "Anthropic"

    def configure(self, config: dict) -> None:
        if config.get("api_key"):
            self._api_key = config["api_key"]

    def _headers(self) -> Dict[str, str]:
        return {
            "Content-Type": "application/json",
            "x-api-key": self._api_key,
            "anthropic-version": ANTHROPIC_VERSION,
        }

    async def is_available(self) -> bool:
        return bool(self._api_key)

    async def list_models(self) -> List[Dict[str, str]]:
        return ANTHROPIC_MODELS

    async def stream_chat(
        self,
        messages: List[Dict[str, Any]],
        model: str,
        temperature: float = 0.6,
        max_tokens: int = 2048,
        tools: Optional[List[Dict]] = None,
    ) -> AsyncGenerator[Tuple[str, Any], None]:
        if not self._api_key:
            yield ("error", "Anthropic API key not configured. Go to Settings → Providers.")
            return

        system_prompt, anthropic_messages = _convert_messages_to_anthropic(messages)

        payload: Dict[str, Any] = {
            "model": model,
            "messages": anthropic_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
        }
        if system_prompt:
            payload["system"] = system_prompt
        if tools:
            payload["tools"] = _convert_tools_to_anthropic(tools)

        # Track tool use blocks being built during streaming
        tool_blocks: Dict[int, Dict] = {}

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    ANTHROPIC_API_URL,
                    json=payload,
                    headers=self._headers(),
                ) as resp:
                    if resp.status_code >= 400:
                        body = await resp.aread()
                        err = body.decode("utf-8", errors="ignore")
                        yield ("error", f"Anthropic HTTP {resp.status_code}: {err[:300]}")
                        return

                    current_event = None

                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if line.startswith("event:"):
                            current_event = line[6:].strip()
                            continue
                        if not line.startswith("data:"):
                            continue

                        raw = line[5:].strip()
                        if not raw or raw == "[DONE]":
                            continue

                        try:
                            data = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        event_type = data.get("type", current_event or "")

                        if event_type == "content_block_start":
                            block = data.get("content_block", {})
                            idx = data.get("index", 0)
                            if block.get("type") == "tool_use":
                                tool_blocks[idx] = {
                                    "index": idx,
                                    "id": block.get("id", ""),
                                    "name": block.get("name", ""),
                                    "arguments": "",
                                }
                            elif block.get("type") == "thinking":
                                pass  # thinking text arrives via content_block_delta

                        elif event_type == "content_block_delta":
                            idx = data.get("index", 0)
                            delta = data.get("delta", {})
                            delta_type = delta.get("type", "")

                            if delta_type == "text_delta":
                                yield ("content", delta.get("text", ""))

                            elif delta_type == "thinking_delta":
                                # Wrap thinking in <think> tags for existing frontend parser
                                text = delta.get("thinking", "")
                                if text:
                                    yield ("content", f"<think>{text}</think>")

                            elif delta_type == "input_json_delta":
                                if idx in tool_blocks:
                                    tool_blocks[idx]["arguments"] += delta.get("partial_json", "")
                                    yield ("tool_call", dict(tool_blocks[idx]))

                        elif event_type == "content_block_stop":
                            # Tool block is complete — emit final state if it's a tool use
                            idx = data.get("index", 0)
                            if idx in tool_blocks:
                                yield ("tool_call", dict(tool_blocks[idx]))

                        elif event_type == "message_stop":
                            break

                        elif event_type == "error":
                            err_msg = data.get("error", {}).get("message", str(data))
                            yield ("error", f"Anthropic stream error: {err_msg}")
                            return

        except Exception as exc:
            yield ("error", f"Anthropic request failed: {exc}")
            return

        yield ("done", None)
