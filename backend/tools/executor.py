import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Dynamic timeouts per tool type — browser operations need more time
TOOL_TIMEOUTS = {
    "web_search": 20,
    "fetch_url": 15,
    "get_page_content": 20,
    "take_screenshot": 30,
    "search_for_clients": 45,
    "find_contact_email": 15,
    "fill_contact_form": 25,
    "run_python": 8,
    "calculator": 5,
    "get_datetime": 3,
    "code_interpreter": 10,
    "run_in_sandbox": 12,
    "execute_on_host": 15,
    "list_files": 5,
    "read_file": 5,
    "run_command": 10,
    "write_draft": 5,
    "web_scraper": 20,
    "llamacloud_parser": 25,
    "github_tool": 10,
    "search_tool": 10,
    "calendar_tool": 5,
    "email_tool": 10,
    "discord_tool": 10,
    "notion_tool": 10,
    "obsidian_tool": 10,
    # Desktop control (Windows)
    "desktop_mouse_move": 3,
    "desktop_mouse_click": 3,
    "desktop_type_text": 8,
    "desktop_press_key": 2,
    "desktop_screenshot": 5,
    "desktop_mouse_position": 1,
    "desktop_open_url": 5,
}

def get_tool_timeout(tool_name: str) -> int:
    """Get timeout for a specific tool, with fallback to default."""
    return TOOL_TIMEOUTS.get(tool_name, 10)
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="omni_tool")
_LOG_FILE = Path(__file__).parent.parent / "logs" / "tools_log.jsonl"


@dataclass
class ToolResult:
    output: str
    error: Optional[str] = None
    execution_time_ms: int = 0

    @property
    def ok(self) -> bool:
        return self.error is None

    def truncated(self, max_chars: int = 5000) -> str:
        text = self.output or self.error or ""
        if len(text) > max_chars:
            return text[:max_chars] + f"...[truncated at {max_chars}]"
        return text


def _dispatch(tool_name: str, arguments: dict) -> str:
    # ── Desktop Control (Windows only) ──────────────────────────────────────────
    if tool_name.startswith("desktop_"):
        from tools.desktop_control_tool import get_desktop_control_tool
        desktop = get_desktop_control_tool()

        # Parse desktop_* tool names: desktop_mouse_move, desktop_type_text, etc.
        action = tool_name.replace("desktop_", "")

        if action == "mouse_move":
            return str(desktop.mouse_move(int(arguments.get("x", 0)), int(arguments.get("y", 0))))
        if action == "mouse_click":
            return str(desktop.mouse_click(int(arguments.get("x", 0)), int(arguments.get("y", 0))))
        if action == "type_text":
            return str(desktop.type_text(arguments.get("text", "")))
        if action == "press_key":
            return str(desktop.press_key(arguments.get("key", "")))
        if action == "screenshot":
            return str(desktop.take_screenshot(arguments.get("save_path", "screenshot.png")))
        if action == "mouse_position":
            return str(desktop.get_mouse_position())
        if action == "open_url":
            return str(desktop.open_url_in_browser(arguments.get("url", "")))

        return f"[Unknown desktop action: {action}]"

    # ── New production tools ────────────────────────────────────────────────────
    if tool_name == "web_search":
        from tools.tools.web_search import web_search
        return web_search(arguments.get("query", ""), int(arguments.get("max_results", 5)))
    if tool_name == "calculator":
        from tools.tools.calculator import calculate
        return calculate(arguments.get("expression", ""))
    if tool_name == "get_datetime":
        from tools.tools.datetime_tool import get_datetime
        return get_datetime(arguments.get("timezone", "UTC"))
    if tool_name == "fetch_url":
        from tools.tools.url_fetch import fetch_url
        return fetch_url(arguments.get("url", ""))
    if tool_name == "run_python":
        from tools.tools.code_runner import run_python
        return run_python(arguments.get("code", ""))
    if tool_name == "llamacloud_parser":
        from tools.llamacloud_tool import dispatch_llamacloud
        return dispatch_llamacloud(arguments.get("action", ""), arguments.get("target", ""), arguments.get("query", ""))
    if tool_name == "github_tool":
        from tools.github_tool import dispatch_github
        return dispatch_github(arguments)
    if tool_name == "search_tool":
        from tools.search_tool import dispatch_search
        return dispatch_search(arguments)
    if tool_name == "calendar_tool":
        from tools.calendar_tool import dispatch_calendar
        return dispatch_calendar(arguments)
    if tool_name == "email_tool":
        from tools.email_tool import dispatch_email
        return dispatch_email(arguments)
    if tool_name == "discord_tool":
        from tools.discord_tool import dispatch_discord
        return dispatch_discord(arguments)
    if tool_name == "notion_tool":
        from tools.notion_tool import dispatch_notion
        return dispatch_notion(arguments)
    if tool_name == "obsidian_tool":
        from tools.obsidian_tool import dispatch_obsidian
        return dispatch_obsidian(arguments)
    # ── Existing system tools ───────────────────────────────────────────────────
    if tool_name == "code_interpreter":
        from services.omni_action_engine import execute_code
        return execute_code(arguments.get("language"), arguments.get("code"))
    if tool_name == "run_in_sandbox":
        from services.omni_action_engine import run_in_sandbox
        return run_in_sandbox(arguments.get("code"), arguments.get("language"))
    if tool_name == "execute_on_host":
        from services.omni_action_engine import execute_on_host
        return execute_on_host(arguments.get("language"), arguments.get("code"), arguments.get("answers_received", False))
    if tool_name == "list_files":
        from services.action_executor import list_files
        return list_files(arguments.get("path"))
    if tool_name == "read_file":
        from services.action_executor import read_file
        return read_file(arguments.get("file_path"))
    if tool_name == "run_command":
        from services.action_executor import run_command
        return run_command(arguments.get("command"))
    if tool_name == "write_draft":
        from services.action_executor import write_draft
        return write_draft(arguments.get("file_path"), arguments.get("content"))
    if tool_name == "web_scraper":
        from services.action_executor import web_scraper
        return web_scraper(arguments.get("url"))
    return f"[Unknown tool: {tool_name}]"


def _log(tool_name: str, arguments: dict, result: ToolResult) -> None:
    _LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "tool": tool_name,
        "args_preview": {k: (v[:200] if isinstance(v, str) else v) for k, v in arguments.items()},
        "ms": result.execution_time_ms,
        "ok": result.ok,
        "error": result.error,
        "output_preview": (result.output or "")[:200],
    }
    try:
        with open(_LOG_FILE, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as exc:
        logger.warning("tools_log write failed: %s", exc)


def execute_tool(tool_name: str, arguments: dict) -> ToolResult:
    t0 = time.monotonic()
    timeout_secs = get_tool_timeout(tool_name)
    try:
        future = _pool.submit(_dispatch, tool_name, arguments)
        output = future.result(timeout=timeout_secs)
        ms = int((time.monotonic() - t0) * 1000)
        # Direction 4: apply result intelligence post-processing
        try:
            from tools.result_processor import post_process
            output = post_process(tool_name, str(output))
        except Exception:
            output = str(output)
        result = ToolResult(output=output, execution_time_ms=ms)
    except FuturesTimeout:
        ms = int((time.monotonic() - t0) * 1000)
        result = ToolResult(output="", error=f"Timed out after {timeout_secs}s", execution_time_ms=ms)
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        result = ToolResult(output="", error=str(exc), execution_time_ms=ms)

    _log(tool_name, arguments, result)
    logger.info("[tool] %s (timeout=%ds) → %dms ok=%s", tool_name, timeout_secs, result.execution_time_ms, result.ok)
    return result
