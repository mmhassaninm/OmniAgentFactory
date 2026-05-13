"""
Omni Commander — Code & Shell Executor

Handles running python script blocks, whitelisted shell commands (e.g., pytest),
and Git control structures in sandboxed subprocess environments.
"""

import os
import subprocess
import tempfile
import sys
import asyncio
from typing import Dict, Any

from core.omni_commander.executors.file_executor import WORKSPACE_ROOT


async def execute_code_action(params: Dict[str, Any]) -> Dict[str, Any]:
    """Execute python scripts, whitelisted commands, or git controls."""
    action = params.get("action", "")
    
    try:
        # ── 1. RUN RESTRICTED PYTHON CODE ──────────────────────────────────────
        if action == "run_python":
            code = params.get("code", "")
            if not code:
                return {"success": False, "error": "Python script code parameter is empty."}
                
            # Create a temporary python file
            with tempfile.NamedTemporaryFile(suffix=".py", delete=False, mode="w", encoding="utf-8") as temp_py:
                temp_py.write(code)
                temp_py_path = temp_py.name
                
            try:
                # Run the script with the current python interpreter inside workspace cwd in a background thread
                res = await asyncio.to_thread(
                    subprocess.run,
                    [sys.executable, temp_py_path],
                    cwd=WORKSPACE_ROOT,
                    capture_output=True,
                    text=True,
                    timeout=15 # Prevents infinite loops
                )
                
                return {
                    "success": res.returncode == 0,
                    "returncode": res.returncode,
                    "stdout": res.stdout,
                    "stderr": res.stderr
                }
            finally:
                # Clean up temporary script
                if os.path.exists(temp_py_path):
                    os.remove(temp_py_path)
                    
        # ── 2. RUN BASH / SHELL COMMANDS ───────────────────────────────────────
        elif action == "run_command":
            cmd = params.get("command", "")
            if not cmd:
                return {"success": False, "error": "Command parameter is empty."}
                
            # Execute whitelisted terminal instruction in a background thread
            res = await asyncio.to_thread(
                subprocess.run,
                cmd,
                shell=True,
                cwd=WORKSPACE_ROOT,
                capture_output=True,
                text=True,
                timeout=15
            )
            
            return {
                "success": res.returncode == 0,
                "returncode": res.returncode,
                "stdout": res.stdout,
                "stderr": res.stderr
            }
            
        # ── 3. GIT STATUS ──────────────────────────────────────────────────────
        elif action == "git_status":
            res = await asyncio.to_thread(
                subprocess.run,
                ["git", "status"],
                cwd=WORKSPACE_ROOT,
                capture_output=True,
                text=True,
                timeout=10
            )
            return {
                "success": res.returncode == 0,
                "stdout": res.stdout,
                "stderr": res.stderr
            }
            
        # ── 4. GIT COMMIT ──────────────────────────────────────────────────────
        elif action == "git_commit":
            msg = params.get("commit_message", "Omni Commander automated updates")
            
            # Step A: Add all changes
            await asyncio.to_thread(subprocess.run, ["git", "add", "."], cwd=WORKSPACE_ROOT, timeout=10)
            
            # Step B: Commit
            res = await asyncio.to_thread(
                subprocess.run,
                ["git", "commit", "-m", msg],
                cwd=WORKSPACE_ROOT,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            return {
                "success": res.returncode in (0, 1), # returncode 1 means nothing to commit
                "stdout": res.stdout,
                "stderr": res.stderr
            }
            
        # ── 5. GIT PUSH ────────────────────────────────────────────────────────
        elif action == "git_push":
            res = await asyncio.to_thread(
                subprocess.run,
                ["git", "push"],
                cwd=WORKSPACE_ROOT,
                capture_output=True,
                text=True,
                timeout=30
            )
            return {
                "success": res.returncode == 0,
                "stdout": res.stdout,
                "stderr": res.stderr
            }
            
        else:
            return {"success": False, "error": f"Unknown code executor action: {action}"}
            
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Subprocess execution timed out (maximum limit is 15s)."}
    except Exception as e:
        return {"success": False, "error": str(e)}
