"""
🛡️ Nexus-Sentinel V2: Python Runtime Hook
==========================================
This module is imported at the top of any Python daemon to enable
cross-runtime self-healing. It overrides sys.excepthook and
warnings.showwarning to serialize intercepts as JSON and print
them to stdout with the [SENTINEL_PY_INTERCEPT] prefix.

The Node.js pythonOrchestrator detects this prefix and routes
the payload to sentinelService for AI analysis and patching.
"""

import sys
import warnings
import json
import traceback
import os

SENTINEL_PREFIX = "[SENTINEL_PY_INTERCEPT]"


def _sentinel_excepthook(exc_type, exc_value, exc_tb):
    """Override sys.excepthook to intercept crashes."""
    # Format the traceback
    tb_lines = traceback.format_exception(exc_type, exc_value, exc_tb)
    tb_str = "".join(tb_lines)

    # Extract file and line from the traceback
    file_path = "<unknown>"
    line_no = 0
    if exc_tb:
        # Walk to the deepest frame in the traceback
        tb = exc_tb
        while tb.tb_next:
            tb = tb.tb_next
        file_path = tb.tb_frame.f_code.co_filename
        line_no = tb.tb_lineno

    payload = {
        "type": "exception",
        "exception_type": exc_type.__name__,
        "message": str(exc_value),
        "file": os.path.abspath(file_path),
        "line": line_no,
        "traceback": tb_str.strip()
    }

    # Print the sentinel intercept to stdout for Node.js to pick up
    print(f"{SENTINEL_PREFIX}{json.dumps(payload)}", flush=True)

    # Also print the original traceback to stderr for human readability
    sys.__excepthook__(exc_type, exc_value, exc_tb)


def _sentinel_warning_handler(message, category, filename, lineno, file=None, line=None):
    """Override warnings.showwarning to intercept warnings."""
    payload = {
        "type": "warning",
        "category": category.__name__,
        "message": str(message),
        "file": os.path.abspath(filename),
        "line": lineno
    }

    # Print the sentinel intercept to stdout for Node.js to pick up
    print(f"{SENTINEL_PREFIX}{json.dumps(payload)}", flush=True)

    # Also show the warning normally via stderr
    formatted = warnings.formatwarning(message, category, filename, lineno, line)
    sys.stderr.write(formatted)


def activate():
    """Activate Sentinel hooks for the Python runtime."""
    sys.excepthook = _sentinel_excepthook
    warnings.showwarning = _sentinel_warning_handler
    print(f"{SENTINEL_PREFIX}" + json.dumps({"type": "status", "message": "Python Sentinel Hook ACTIVATED"}), flush=True)


# Auto-activate on import
activate()
