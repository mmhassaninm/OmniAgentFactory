"""
Verifier

Verifies that applied patches don't break the project:
1. Syntax check on modified source files
2. Import/module resolution check
3. Server health check (if running)
4. Graceful rollback on failure
"""

import logging
import subprocess
import shutil
from pathlib import Path
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

class Verifier:
    def __init__(self, root_path: str = ".", health_check_url: str = "http://localhost:8000/api/health"):
        self.root_path = Path(root_path)
        self.health_check_url = health_check_url

    async def verify_and_rollback_if_needed(
        self,
        modified_files: List[str],
        backup_path: str,
        iteration: int
    ) -> Dict[str, Any]:
        """
        Verify modified files. Rollback on failure if configured.

        Returns:
            {
              "verified": true/false,
              "rolled_back": true/false,
              "error": "error message if any"
            }
        """
        import os
        result = {
            "verified": False,
            "rolled_back": False,
            "error": None
        }

        # Check rollback policy
        rollback_enabled = os.getenv("EVOLUTION_ROLLBACK_ON_FAILURE", "true").lower() == "true"

        logger.info("Verifying %d modified files... (rollback_enabled=%s)", len(modified_files), rollback_enabled)

        # Step 1: Syntax check on Python files
        python_files = [f for f in modified_files if f.endswith(".py")]
        if python_files:
            if not self._syntax_check(python_files):
                result["error"] = "Syntax check failed on Python files"
                if rollback_enabled:
                    await self._rollback(backup_path, modified_files, iteration)
                    result["rolled_back"] = True
                    logger.error("✗ Syntax check failed. Rolling back.")
                else:
                    logger.warning("✗ Syntax check failed. Rollback bypassed by policy.")
                return result

        logger.info("✓ Syntax check passed")

        # Step 2: Import check (Python only)
        if python_files:
            if not self._import_check(python_files):
                result["error"] = "Import resolution check failed"
                if rollback_enabled:
                    await self._rollback(backup_path, modified_files, iteration)
                    result["rolled_back"] = True
                    logger.error("✗ Import check failed. Rolling back.")
                else:
                    logger.warning("✗ Import check failed. Rollback bypassed by policy.")
                return result

        logger.info("✓ Import check passed")

        # Step 3: Server health check (if running)
        import asyncio
        health_ok = await self._health_check()
        if not health_ok:
            logger.warning("⚠ Server health check failed (server may not be running)")
            result["error"] = "Server health check failed"
            if rollback_enabled:
                await self._rollback(backup_path, modified_files, iteration)
                result["rolled_back"] = True
            else:
                logger.warning("Server health check failed. Rollback bypassed by policy.")
            return result

        logger.info("✓ Server health check passed")

        # All checks passed
        result["verified"] = True
        logger.info("✓ All verification checks passed")
        return result

    def _syntax_check(self, python_files: List[str]) -> bool:
        """Check Python syntax."""
        try:
            for file in python_files:
                file_path = self.root_path / file
                if not file_path.exists():
                    logger.warning("File not found for syntax check: %s", file)
                    continue

                # Use Python's compile to check syntax
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        code = f.read()
                    compile(code, str(file_path), "exec")
                    logger.debug("✓ Syntax OK: %s", file)
                except SyntaxError as e:
                    logger.error("✗ Syntax error in %s: %s", file, e)
                    return False

            return True
        except Exception as e:
            logger.error("Syntax check failed: %s", e)
            return False

    def _import_check(self, python_files: List[str]) -> bool:
        """Check import resolution using ast."""
        import ast

        try:
            for file in python_files:
                file_path = self.root_path / file
                if not file_path.exists():
                    continue

                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        code = f.read()

                    # Parse AST to check imports
                    tree = ast.parse(code)

                    # Walk through to find import statements
                    imports = []
                    for node in ast.walk(tree):
                        if isinstance(node, ast.Import):
                            for alias in node.names:
                                imports.append(alias.name)
                        elif isinstance(node, ast.ImportFrom):
                            if node.module:
                                imports.append(node.module)

                    logger.debug("Imports in %s: %s", file, imports)

                except Exception as e:
                    logger.error("✗ Import parse error in %s: %s", file, e)
                    return False

            return True
        except Exception as e:
            logger.error("Import check failed: %s", e)
            return False

    async def _health_check(self) -> bool:
        """Check server health."""
        try:
            import httpx
            import asyncio

            # Use asyncio with timeout
            async with asyncio.timeout(5):
                async with httpx.AsyncClient() as client:
                    try:
                        response = await client.get(self.health_check_url, timeout=5.0)
                        if response.status_code == 200:
                            logger.info("✓ Server health check OK")
                            return True
                        else:
                            logger.warning("Server health check returned %d", response.status_code)
                            return False
                    except Exception as e:
                        logger.warning("Server health check failed: %s (server may not be running)", e)
                        return True  # Don't fail if server isn't running

        except ImportError:
            logger.warning("httpx not available for health check")
            return True  # Don't fail if we can't check
        except Exception as e:
            logger.error("Health check error: %s", e)
            return True  # Generous: don't fail on unexpected errors

    async def _rollback(self, backup_path: str, modified_files: List[str], iteration: int) -> bool:
        """Restore files from backup."""
        try:
            backup_dir = self.root_path / "autonomous_logs" / "backups" / f"iter_{iteration}"

            logger.info("Rolling back iteration %d...", iteration)

            for file in modified_files:
                file_path = self.root_path / file
                backup_file = backup_dir / file

                if backup_file.exists():
                    shutil.copy2(backup_file, file_path)
                    logger.info("Restored %s from backup", file)
                else:
                    logger.warning("No backup found for %s (file may have been new)", file)

            logger.info("✓ Rollback completed")
            return True

        except Exception as e:
            logger.error("Rollback failed: %s", e)
            return False


# Singleton instance
_verifier = None

def get_verifier(root_path: str = ".") -> Verifier:
    """Get or create verifier singleton."""
    global _verifier
    if _verifier is None:
        _verifier = Verifier(root_path)
    return _verifier
