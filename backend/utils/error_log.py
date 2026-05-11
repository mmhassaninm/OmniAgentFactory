"""
Centralized error logging for OmniBot.
Logs all exceptions to ERROR_LOG.md in project root.
"""

import traceback
from datetime import datetime
from pathlib import Path

ERROR_LOG_PATH = Path("ERROR_LOG.md")


def log_error(context: str, error: Exception, agent_id: str = None, extra_info: dict = None):
    """
    Appends structured error to ERROR_LOG.md in project root with full context.
    Call this from any except block.

    Args:
        context: Description of what was happening (e.g. "Evolution cycle failed")
        error: The Exception object
        agent_id: Optional agent ID for context
        extra_info: Optional dict with additional diagnostic info (e.g., {"db_status": "offline"})
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    tb = traceback.format_exc()
    error_type = type(error).__name__
    error_msg = str(error)

    with open(ERROR_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(f"\n---\n")
        f.write(f"## [{timestamp}] {context}\n")
        if agent_id:
            f.write(f"**Agent:** `{agent_id}`\n")
        f.write(f"**Error Type:** `{error_type}`\n")
        f.write(f"**Message:** `{error_msg}`\n")

        if extra_info:
            f.write(f"\n### Context\n")
            for key, value in extra_info.items():
                f.write(f"- **{key}:** {value}\n")

        f.write(f"\n### Stack Trace\n")
        f.write(f"```\n{tb}\n```\n")


def clear_error_log():
    """Clear the error log (call at startup)."""
    with open(ERROR_LOG_PATH, "w", encoding="utf-8") as f:
        f.write(f"# OmniBot Error Log\n")
        f.write(f"*Session started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} UTC*\n\n")
