"""
Terminal API endpoints
POST /api/terminal/exec - Execute a shell command
"""
import subprocess
import platform
from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/terminal", tags=["terminal"])

class ExecRequest(BaseModel):
    command: str

@router.post("/exec")
async def execute_command(req: ExecRequest):
    """
    Execute a shell command and return stdout/stderr.
    Only allows safe commands.
    """
    cmd = req.command.strip()

    if not cmd:
        return {"stdout": "", "stderr": ""}

    # Dangerous patterns to block
    dangerous_patterns = [
        "rm -rf /",
        "format c:",
        "del /s /q",
        "dropdb",
        "DROP TABLE",
    ]

    for pattern in dangerous_patterns:
        if pattern.lower() in cmd.lower():
            return {
                "stdout": "",
                "stderr": f"Error: Dangerous command blocked: {pattern}"
            }

    try:
        # Determine shell based on OS
        if platform.system() == "Windows":
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
        else:
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )

        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }

    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": "Error: Command timed out (30s limit)"
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Error: {str(e)}"
        }
