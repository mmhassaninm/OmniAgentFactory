"""
Code Runner skill — execute Python snippets in a sandboxed subprocess.
Entry point: execute_python
"""

import logging
import subprocess
import sys
import tempfile
from typing import Any

logger = logging.getLogger(__name__)


def execute_python(code: str, timeout: int = 30) -> dict[str, Any]:
    """
    Execute a Python code snippet in a sandboxed subprocess.

    Args:
        code: Python code to execute
        timeout: Maximum execution time in seconds (default 30)

    Returns:
        dict with stdout, stderr, returncode, duration, status
    """
    import time
    start = time.time()
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8") as f:
            f.write(code)
            f.flush()
            temp_path = f.name

        result = subprocess.run(
            [sys.executable, temp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            env={},
        )
        duration = round(time.time() - start, 3)
        import os
        os.unlink(temp_path)

        return {
            "status": "ok",
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
            "duration_seconds": duration,
        }
    except subprocess.TimeoutExpired:
        return {
            "status": "error",
            "error": f"Execution timed out after {timeout}s",
            "stdout": "",
            "stderr": "Timeout",
            "duration_seconds": timeout,
        }
    except Exception as e:
        logger.warning("[Skill code_runner] execute_python error: %s", e)
        return {
            "status": "error",
            "error": str(e)[:200],
            "stdout": "",
            "stderr": str(e),
            "duration_seconds": 0,
        }