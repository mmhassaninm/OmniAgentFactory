import os
import subprocess
import sys
import tempfile

_TIMEOUT_SECS = 8
_BLOCKED_IMPORTS = ["os.system", "subprocess", "shutil.rmtree", "__import__('os').system"]


def _contains_blocked_pattern(code: str) -> bool:
    lower = code.lower()
    patterns = ["os.system(", "subprocess.run(", "subprocess.call(", "shutil.rmtree(", "eval(", "exec("]
    return any(p in lower for p in patterns)


def run_python(code: str) -> str:
    if _contains_blocked_pattern(code):
        return (
            "Security restriction: This code contains potentially dangerous operations "
            "(os.system, subprocess, shutil.rmtree, eval, exec). "
            "Use run_in_sandbox for untrusted code execution."
        )
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
        f.write(code)
        tmp_path = f.name
    try:
        result = subprocess.run(
            [sys.executable, tmp_path],
            capture_output=True, text=True, timeout=_TIMEOUT_SECS,
            env={k: v for k, v in os.environ.items() if k not in ("PYTHONPATH",)},
        )
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()
        if result.returncode != 0:
            return f"Exit code {result.returncode}\n" + (f"OUTPUT:\n{stdout}\n" if stdout else "") + (f"ERROR:\n{stderr}" if stderr else "")
        return stdout if stdout else "(no output)"
    except subprocess.TimeoutExpired:
        return f"Timeout: code exceeded {_TIMEOUT_SECS}s execution limit"
    except Exception as e:
        return f"Execution error: {e}"
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
