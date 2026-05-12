"""
Omni Commander — Safety Guard

Evaluates each ActionStep before execution to verify safety permissions.
Categorizes steps into:
- APPROVED: Can run immediately.
- CONFIRMATION_REQUIRED: Pauses execution until explicitly approved by the user.
- BLOCKED: Strictly forbidden due to security hazards (e.g. editing .env or executing dangerous commands).
"""

import logging
from typing import Tuple
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class SafetyResult(BaseModel):
    status: str  # "approved" | "confirmation_required" | "blocked"
    reason: str = ""


class SafetyGuard:
    """Checks executors and parameters for safety compliance."""

    # Sensitive paths that cannot be accessed or changed
    PROTECTED_PATTERNS = [
        ".env",
        "database.py",
        "key_vault",
        "keyvault",
        "settings",
        ".git/",
        "shadow",
        "passwd",
    ]

    # Whitelisted shell commands allowed to run immediately
    WHITELIST_COMMANDS = [
        "git status",
        "git branch",
        "git log -n",
        "pytest",
        "npm run dev",
        "docker ps",
        "docker-compose ps",
        "docker-compose logs",
    ]

    # Dangerous command fragments that are strictly blocked
    BLOCKED_COMMAND_FRAGMENTS = [
        "rm -rf",
        "format ",
        "mkfs",
        "dd ",
        "shutdown",
        "reboot",
        "> /dev/null",
        "curl ",
        "wget ",
        "ssh ",
        "scp ",
        "ftp ",
        "token",
        "secret",
        "password",
        "env ",
        "printenv",
    ]

    def check(self, step_type: str, params: dict) -> SafetyResult:
        """Evaluate if an action is safe or requires review."""
        action = params.get("action", "")

        # ── 1. FILE SYSTEM GUARD ──────────────────────────────────────────────
        if step_type == "file":
            path = str(params.get("path", "")).lower()

            # Prevent access to any protected system files/patterns
            for pattern in self.PROTECTED_PATTERNS:
                if pattern in path:
                    return SafetyResult(
                        status="blocked",
                        reason=f"Access to protected paths/files containing '{pattern}' is strictly forbidden."
                    )

            if action == "delete_file":
                return SafetyResult(
                    status="confirmation_required",
                    reason="Explicit confirmation required to delete a workspace file."
                )

            return SafetyResult(status="approved")

        # ── 2. BROWSER AUTOMATION GUARD ────────────────────────────────────────
        elif step_type == "browser":
            # Browser automation is generally safe unless it touches localhost settings
            url = str(params.get("url", "")).lower()
            if "localhost" in url or "127.0.0.1" in url:
                if "/api/" in url or "/settings" in url:
                    return SafetyResult(
                        status="blocked",
                        reason="Automated interactions with localhost API or Settings interfaces are prohibited."
                    )
            return SafetyResult(status="approved")

        # ── 3. EMAIL DISPATCH GUARD ───────────────────────────────────────────
        elif step_type == "email":
            # All email dispatches must be explicitly confirmed to prevent spamming
            to = params.get("to", "")
            return SafetyResult(
                status="confirmation_required",
                reason=f"Confirmation required to send outbound email to '{to}'."
            )

        # ── 4. ANALYTICS ENGINE GUARD ─────────────────────────────────────────
        elif step_type == "analysis":
            path = str(params.get("path", "")).lower()
            for pattern in self.PROTECTED_PATTERNS:
                if pattern in path:
                    return SafetyResult(
                        status="blocked",
                        reason=f"Analyzing sensitive files containing '{pattern}' is strictly blocked."
                    )
            return SafetyResult(status="approved")

        # ── 5. SHOPIFY ENGINE GUARD ───────────────────────────────────────────
        elif step_type == "shopify":
            if action == "update_product":
                return SafetyResult(
                    status="confirmation_required",
                    reason="Confirmation required before updating product information on Shopify store."
                )
            return SafetyResult(status="approved")

        # ── 6. SHELL & CODE INFERENCE GUARD ───────────────────────────────────
        elif step_type == "code":
            if action in ("run_command", "git_push", "git_commit"):
                if action == "git_push":
                    return SafetyResult(
                        status="confirmation_required",
                        reason="Confirmation required to push code changes to remote Git repository."
                    )

                command = str(params.get("command", "")).strip().lower()

                # Block dangerous system-level commands
                for frag in self.BLOCKED_COMMAND_FRAGMENTS:
                    if frag in command:
                        return SafetyResult(
                            status="blocked",
                            reason=f"Shell execution blocked. Command contains unsafe fragment: '{frag}'."
                        )

                # Check if command is fully whitelisted
                is_whitelisted = False
                for wl in self.WHITELIST_COMMANDS:
                    if command.startswith(wl):
                        is_whitelisted = True
                        break

                if is_whitelisted:
                    return SafetyResult(status="approved")

                # All other shell commands require user confirmation
                return SafetyResult(
                    status="confirmation_required",
                    reason=f"Confirmation required to execute arbitrary shell command: '{command}'."
                )

            elif action == "run_python":
                # Executing arbitrary python code requires confirmation
                return SafetyResult(
                    status="confirmation_required",
                    reason="Confirmation required to execute arbitrary Python code block."
                )

            return SafetyResult(status="approved")

        # ── 7. DEFAULT CHAT OR OTHER SERVICES ─────────────────────────────────
        return SafetyResult(status="approved")
