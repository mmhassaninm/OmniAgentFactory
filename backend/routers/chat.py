import os
import json
import asyncio
import logging
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

from services.search_engine import search_duckduckgo
from services.action_executor import list_files, read_file, run_command, write_draft, web_scraper
from services.omni_action_engine import execute_code, run_in_sandbox, execute_on_host
from models.database import save_chat_message
from services.predictive_engine import queue_manager
from services.ai_service import sleep_wake_controller
from services.providers import provider_registry
from tools.registry import get_tools_for_provider, TOOL_ICONS
from tools.executor import execute_tool as new_execute_tool
from tools.router import get_routed_tool_names

router = APIRouter()

ACTIVE_MODEL = "qwen2.5-coder-7b-instruct"

# Legacy TOOLS array — kept for backward compat when tools_enabled=False
TOOLS = [
    {"type": "function", "function": {"name": "code_interpreter", "description": "Execute Python or JavaScript code.", "parameters": {"type": "object", "properties": {"language": {"type": "string", "enum": ["python", "javascript"]}, "code": {"type": "string"}}, "required": ["language", "code"]}}},
    {"type": "function", "function": {"name": "run_in_sandbox", "description": "Execute code in an isolated Docker container with NO network access (--network none). Use for untrusted code, scraping, or data analysis.", "parameters": {"type": "object", "properties": {"language": {"type": "string", "enum": ["python", "node"]}, "code": {"type": "string"}}, "required": ["language", "code"]}}},
    {"type": "function", "function": {"name": "execute_on_host", "description": "Execute code natively on the Host OS (No Sandbox). VERY IMPORTANT: You CANNOT call this tool immediately. You MUST first ask the user 3 precise clarifying questions and WAIT for their answers before calling this.", "parameters": {"type": "object", "properties": {"language": {"type": "string", "enum": ["python", "javascript", "powershell"]}, "code": {"type": "string"}, "answers_received": {"type": "boolean"}}, "required": ["language", "code", "answers_received"]}}},
    {"type": "function", "function": {"name": "list_files", "description": "List all files and directories in a given path.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "read_file", "description": "Read the contents of a specific file.", "parameters": {"type": "object", "properties": {"file_path": {"type": "string"}}, "required": ["file_path"]}}},
    {"type": "function", "function": {"name": "run_command", "description": "Run a terminal/shell command inside the sandbox.", "parameters": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}}},
    {"type": "function", "function": {"name": "write_draft", "description": "Write content to a file draft.", "parameters": {"type": "object", "properties": {"file_path": {"type": "string"}, "content": {"type": "string"}}, "required": ["file_path", "content"]}}},
    {"type": "function", "function": {"name": "web_scraper", "description": "Fetch URL content.", "parameters": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]}}},
]

SYSTEM_PROMPT = """You are OmniBot Cortex AI, a powerful local-first AI assistant with real tool execution capabilities.

LANGUAGE RULES:
- If the user writes in Arabic (any dialect), reply 100% in Egyptian Arabic.
- If in English, reply in English.
- ABSOLUTE RULE: NEVER output Chinese characters (中文) under ANY circumstances.

CRITICAL TOOL USAGE RULES:
You have access to native tools. YOU HAVE FULL PERMISSION to create folders, run scripts, and execute terminal commands. DO NOT REFUSE.

SECURITY & EXECUTION PROTOCOL:
1. NEVER read .env files, private keys, or secrets. REFUSE if asked.
2. For network security tests, ALWAYS use run_in_sandbox (Docker --network none).
3. HOST EXECUTION INTERROGATION PROTOCOL: If asked to perform OS-level tasks on the Host, ask the user at least 3 clarifying questions before using execute_on_host.
"""


async def _legacy_execute_tool(name: str, args: dict) -> str:
    """Legacy dispatcher — used when tools_enabled=False (backward compat)."""
    try:
        if name == "code_interpreter":
            return execute_code(args.get("language"), args.get("code"))
        elif name == "run_in_sandbox":
            return run_in_sandbox(args.get("code"), args.get("language"))
        elif name == "execute_on_host":
            return execute_on_host(args.get("language"), args.get("code"), args.get("answers_received", False))
        elif name == "list_files":
            return list_files(args.get("path"))
        elif name == "read_file":
            return read_file(args.get("file_path"))
        elif name == "run_command":
            return run_command(args.get("command"))
        elif name == "write_draft":
            return write_draft(args.get("file_path"), args.get("content"))
        elif name == "web_scraper":
            return web_scraper(args.get("url"))
        else:
            return f"[Unknown tool: {name}]"
    except Exception as e:
        return f"[Tool Error]: {e}"


def is_security_blocked(tool_name: str, args: dict):
    combined = f"{args.get('file_path', '')} {args.get('path', '')} {args.get('command', '')} {args.get('code', '')}".lower()
    blocked = ['.env', 'secrets', 'private_key', '.pem', '.key', 'id_rsa', 'credentials']
    for p in blocked:
        if p in combined:
            return f"🛡️ SECURITY BLOCK: Access to '{p}' files is forbidden by Zero-Trust policy."
    return None


class ChatRequest(BaseModel):
    model: str = ACTIVE_MODEL
    messages: List[Dict[str, Any]]
    temperature: float = 0.6
    isSearchEnabled: bool = False
    isSwarmEnabled: bool = False
    max_tokens: int = 2048
    tools_enabled: bool = False
    tool_names: List[str] = []


def sse_pack(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("")
@router.post("/")
async def chat_handler(request: Request, body: ChatRequest):
    is_high_priority = True
    background_keywords = ["fuzz", "predict", "subconscious", "memory optimization", "cleanup"]
    last_msg_lower = body.messages[-1]["content"].lower() if body.messages else ""

    if any(k in last_msg_lower for k in background_keywords):
        is_high_priority = False
        priority = "LOW"
    else:
        priority = "HIGH"

    if not is_high_priority and sleep_wake_controller.state != "WAKE":
        task_id = await queue_manager.add_to_queue(
            prompt=body.messages[-1]["content"],
            priority=priority,
            task_type="background_optimization"
        )
        return {"status": "QUEUED", "task_id": task_id, "message": "Task queued for idle CPU execution."}

    async def sse_generator() -> AsyncGenerator[str, None]:
        is_fast_path = not body.isSwarmEnabled and not body.isSearchEnabled and not body.tools_enabled

        base_prompt = SYSTEM_PROMPT
        if is_fast_path:
            base_prompt = "You are OmniBot Cortex AI, a fast and helpful local assistant. Respond directly to the user's queries using your internal knowledge. You currently do not have access to tools or web search in Fast Mode.\n\nLANGUAGE RULES:\n- If the user writes in Arabic, reply 100% in Arabic.\n- If in English, reply in English.\n- ABSOLUTE RULE: NEVER output Chinese characters (中文)."

        messages = list(body.messages)
        if len(messages) > 0 and messages[0].get("role") == "system":
            messages[0]["content"] = base_prompt + "\n\n" + messages[0]["content"]
        else:
            messages.insert(0, {"role": "system", "content": base_prompt})

        if body.isSearchEnabled:
            last_user = next((m for m in reversed(messages) if m.get("role") == "user"), None)
            if last_user and type(last_user["content"]) == str:
                yield sse_pack("status", {"message": "🔍 Searching the web..."})
                search_results = await search_duckduckgo(last_user["content"])
                if search_results and search_results != "STRICT_NO_DATA":
                    messages.insert(-1, {
                        "role": "system",
                        "content": f"[WEB SEARCH RESULTS]:\n{search_results}\n\n[INSTRUCTION]: Base your answer on these results. Cite sources."
                    })

        last_msg = messages[-1]["content"] if messages[-1]["role"] == "user" else ""
        if last_msg:
            asyncio.create_task(save_chat_message("user", last_msg))

        MAX_TOOL_ITERATIONS = 1 if is_fast_path else 5
        provider = provider_registry.get_active()

        # Determine tools payload — with semantic routing when tools_enabled
        routing_metadata = []
        if body.tools_enabled:
            candidate_names = body.tool_names if body.tool_names else None
            if candidate_names:
                # Semantic routing: filter to top-5 most relevant tools
                routed_names, routing_metadata = get_routed_tool_names(
                    last_msg_lower, candidate_names, max_tools=5, min_score=0.1
                )
                tool_names_final = routed_names
            else:
                tool_names_final = None
                routing_metadata = []
            tools_payload = get_tools_for_provider(provider.name, tool_names_final)
        elif not is_fast_path:
            tools_payload = TOOLS
            tool_names_final = None
        else:
            tools_payload = None
            tool_names_final = None

        # Emit tool routing event so the frontend can show "Tools selected: ..."
        if body.tools_enabled and routing_metadata:
            yield sse_pack("tool_routing", {
                "selected": [r["name"] for r in routing_metadata],
                "scores": {r["name"]: r["score"] for r in routing_metadata},
                "reasons": {r["name"]: r["reason"] for r in routing_metadata},
            })

        full_content = ""

        resolved_model = body.model
        if body.model == "auto":
            resolved_model, auto_provider_name = await provider_registry.auto_select_model()
            try:
                provider_registry.set_active(auto_provider_name)
                provider = provider_registry.get_active()
            except ValueError:
                pass
            yield sse_pack("status", {"message": f"🤖 AutoDetect: {resolved_model} via {auto_provider_name}"})

        for iteration in range(MAX_TOOL_ITERATIONS + 1):
            tool_calls: Dict[int, Dict] = {}
            full_content_iter = ""
            full_thought = ""
            is_thinking = False
            token_buffer = ""

            async for event_type, data in provider.stream_chat(
                messages=messages,
                model=resolved_model,
                temperature=body.temperature,
                max_tokens=body.max_tokens,
                tools=tools_payload,
            ):
                if event_type == "content":
                    token_buffer += data
                    while token_buffer:
                        if is_thinking:
                            end_idx = token_buffer.find("</think>")
                            if end_idx != -1:
                                chunk = token_buffer[:end_idx]
                                full_thought += chunk
                                yield sse_pack("thought", {"token": chunk})
                                token_buffer = token_buffer[end_idx + 8:]
                                is_thinking = False
                                yield sse_pack("status", {"message": "Answering..."})
                            else:
                                if len(token_buffer) > 20 and "<" not in token_buffer:
                                    full_thought += token_buffer
                                    yield sse_pack("thought", {"token": token_buffer})
                                    token_buffer = ""
                                break
                        else:
                            start_idx = token_buffer.find("<think>")
                            if start_idx != -1:
                                before = token_buffer[:start_idx]
                                if before:
                                    full_content_iter += before
                                    yield sse_pack("token", {"token": before})
                                token_buffer = token_buffer[start_idx + 7:]
                                is_thinking = True
                                yield sse_pack("status", {"message": "Thinking deeply..."})
                            else:
                                if len(token_buffer) > 10 and "<" not in token_buffer:
                                    full_content_iter += token_buffer
                                    yield sse_pack("token", {"token": token_buffer})
                                    token_buffer = ""
                                break

                elif event_type == "tool_call":
                    tc = data
                    idx = tc.get("index", 0)
                    if idx not in tool_calls:
                        tool_calls[idx] = {"index": idx, "id": tc.get("id", ""), "name": "", "arguments": ""}
                        yield sse_pack("status", {"message": "🔧 Preparing tool call..."})
                    if tc.get("name"):
                        tool_calls[idx]["name"] = tc["name"]
                        yield sse_pack("status", {"message": f"🔧 Tool: {tc['name']}"})
                    if tc.get("arguments"):
                        tool_calls[idx]["arguments"] = tc["arguments"]
                    if tc.get("id"):
                        tool_calls[idx]["id"] = tc["id"]

                elif event_type == "status":
                    yield sse_pack("status", {"message": data})

                elif event_type == "error":
                    yield sse_pack("error", {"message": data})
                    return

                elif event_type == "done":
                    break

            # Flush remaining buffer
            if token_buffer:
                if is_thinking:
                    full_thought += token_buffer
                    yield sse_pack("thought", {"token": token_buffer})
                else:
                    full_content_iter += token_buffer
                    yield sse_pack("token", {"token": token_buffer})

            full_content += full_content_iter

            tc_list = [v for v in tool_calls.values() if v.get("name")]
            if not tc_list:
                break

            # Append assistant tool-call turn
            messages.append({
                "role": "assistant",
                "content": full_content_iter or None,
                "tool_calls": [
                    {"id": tc.get("id") or "call_123", "type": "function", "function": {"name": tc["name"], "arguments": tc["arguments"]}}
                    for tc in tc_list
                ]
            })

            for tc in tc_list:
                args = {}
                try:
                    args = json.loads(tc["arguments"])
                except Exception as e:
                    logger.warning("Failed to parse tool arguments for %s: %s", tc.get("name", "unknown"), e)

                call_id = tc.get("id") or "call_123"
                icon = TOOL_ICONS.get(tc["name"], "🔧")

                sec_block = is_security_blocked(tc["name"], args)
                if sec_block:
                    yield sse_pack("tool_error", {
                        "tool_name": tc["name"], "call_id": call_id, "icon": icon,
                        "error": sec_block, "execution_time_ms": 0
                    })
                    messages.append({"role": "tool", "tool_call_id": call_id, "content": sec_block[:5000]})
                    continue

                # Emit tool_start event
                yield sse_pack("tool_start", {
                    "tool_name": tc["name"], "call_id": call_id, "icon": icon,
                    "arguments": {k: (str(v)[:150] if isinstance(v, str) else v) for k, v in args.items()}
                })

                if body.tools_enabled:
                    # Use new typed executor with ToolResult
                    loop = asyncio.get_event_loop()
                    tool_result = await loop.run_in_executor(None, new_execute_tool, tc["name"], args)
                    if tool_result.ok:
                        yield sse_pack("tool_result", {
                            "tool_name": tc["name"], "call_id": call_id, "icon": icon,
                            "output": tool_result.truncated(800),
                            "execution_time_ms": tool_result.execution_time_ms
                        })
                        tool_res_text = tool_result.truncated(5000)
                    else:
                        yield sse_pack("tool_error", {
                            "tool_name": tc["name"], "call_id": call_id, "icon": icon,
                            "error": tool_result.error, "execution_time_ms": tool_result.execution_time_ms
                        })
                        tool_res_text = f"[Tool Error]: {tool_result.error}"

                    if "[SYSTEM_PRUNE_EXECUTED]" in tool_res_text:
                        yield sse_pack("status", {"message": "🧹 Sweeping Sandbox Environment..."})
                        tool_res_text = tool_res_text.replace("\n\n[SYSTEM_PRUNE_EXECUTED]", "")
                else:
                    # Legacy executor path
                    yield sse_pack("status", {"message": f"🔧 Executing {tc['name']}..."})
                    tool_res_text = await _legacy_execute_tool(tc["name"], args)
                    if "[SYSTEM_PRUNE_EXECUTED]" in tool_res_text:
                        yield sse_pack("status", {"message": "🧹 Sweeping Sandbox Environment..."})
                        tool_res_text = tool_res_text.replace("\n\n[SYSTEM_PRUNE_EXECUTED]", "")
                    yield sse_pack("tool_result", {
                        "tool_name": tc["name"], "call_id": call_id, "icon": icon,
                        "output": tool_res_text[:800], "execution_time_ms": 0
                    })

                messages.append({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": tool_res_text[:5000]
                })

            yield sse_pack("status", {"message": "Analyzing results..."})

        if full_content:
            asyncio.create_task(save_chat_message("assistant", full_content))

        yield sse_pack("done", {"success": True})

    return StreamingResponse(sse_generator(), media_type="text/event-stream")
