import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

TOOL_TIMEOUT_SECS = 10
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
    try:
        future = _pool.submit(_dispatch, tool_name, arguments)
        output = future.result(timeout=TOOL_TIMEOUT_SECS)
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
        result = ToolResult(output="", error=f"Timed out after {TOOL_TIMEOUT_SECS}s", execution_time_ms=ms)
    except Exception as exc:
        ms = int((time.monotonic() - t0) * 1000)
        result = ToolResult(output="", error=str(exc), execution_time_ms=ms)

    _log(tool_name, arguments, result)
    logger.info("[tool] %s → %dms ok=%s", tool_name, result.execution_time_ms, result.ok)
    return result
