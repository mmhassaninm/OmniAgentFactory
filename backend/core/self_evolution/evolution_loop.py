"""
Evolution Loop

Main orchestrator that ties all self-evolution components together.
Runs one complete cycle: read code → reason about improvements → apply patches → verify → record result
"""

import logging
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from .state_manager import get_state_manager
from .codebase_reader import get_codebase_reader
from .ai_reasoner import get_ai_reasoner
from .patch_applier import get_patch_applier
from .verifier import get_verifier

logger = logging.getLogger(__name__)

class EvolutionLoop:
    def __init__(self, model_router=None, root_path: str = "."):
        self.model_router = model_router
        self.root_path = root_path

        # Initialize components
        self.state_mgr = get_state_manager()
        self.reader = get_codebase_reader(root_path=root_path)
        self.reasoner = get_ai_reasoner(model_router)
        self.applier = get_patch_applier(root_path=root_path)
        self.verifier = get_verifier(root_path=root_path)

    async def run_one_cycle(self) -> Dict[str, Any]:
        """
        Run one complete evolution cycle.

        Returns:
            {
              "iteration": N,
              "timestamp": "ISO timestamp",
              "item_implemented": "ITEM_ID or error message",
              "patches_applied": N,
              "patches_skipped": M,
              "verified": true/false,
              "rolled_back": true/false,
              "error": "error message if any"
            }
        """
        import os
        import sys
        cycle_result = {
            "iteration": 0,
            "timestamp": datetime.now().isoformat(),
            "item_implemented": None,
            "patches_applied": 0,
            "patches_skipped": 0,
            "verified": False,
            "rolled_back": False,
            "error": None
        }

        lock_file_path = Path(self.root_path) / "autonomous_logs" / "evolution_cycle.lock"
        lock_file_path.parent.mkdir(parents=True, exist_ok=True)

        # Check lockfile
        if lock_file_path.exists():
            try:
                lock_content = lock_file_path.read_text().strip()
                if lock_content:
                    running_pid = int(lock_content)
                    is_running = False
                    try:
                        os.kill(running_pid, 0)
                        is_running = True
                    except OSError:
                        is_running = False

                    if is_running:
                        msg = f"Aborting cycle: Evolution cycle is already running in another process (PID {running_pid})"
                        logger.warning(msg)
                        cycle_result["error"] = msg
                        return cycle_result
                    else:
                        logger.warning(f"Found stale lockfile for PID {running_pid} (process not running). Cleaning up.")
                        lock_file_path.unlink(missing_ok=True)
            except Exception as e:
                logger.warning(f"Failed to read/verify lockfile: {e}. Removing.")
                lock_file_path.unlink(missing_ok=True)

        # Acquire lock
        try:
            lock_file_path.write_text(str(os.getpid()))
        except Exception as e:
            msg = f"Failed to acquire lockfile: {e}"
            logger.error(msg)
            cycle_result["error"] = msg
            return cycle_result

        try:
            # Step 1: Load state and increment iteration
            logger.info("=" * 80)
            iteration = self.state_mgr.increment_iteration()
            cycle_result["iteration"] = iteration
            logger.info("🔄 EVOLUTION CYCLE %d STARTING", iteration)

            # Step 2: Read codebase snapshot
            logger.info("Reading codebase snapshot...")
            codebase_snapshot = self.reader.read_codebase()
            logger.info("Codebase snapshot: ~%d tokens", len(codebase_snapshot) // 4)

            # Step 3: Read Evolve_plan.md
            evolve_plan_path = Path(self.root_path) / "Evolve_plan.md"
            if not evolve_plan_path.exists():
                cycle_result["error"] = "Evolve_plan.md not found"
                logger.error(cycle_result["error"])
                self.state_mgr.record_result(False, "Evolve_plan.md missing")
                return cycle_result

            evolve_plan = evolve_plan_path.read_text(encoding="utf-8")
            logger.info("Evolve_plan.md loaded: %d lines", len(evolve_plan.split("\n")))

            # Step 4: Call AI reasoner to generate patches
            logger.info("Calling AI reasoner...")
            patches_response = await self.reasoner.reason(codebase_snapshot, evolve_plan)

            if not patches_response:
                cycle_result["error"] = "AI reasoner failed or returned no patches"
                logger.error(cycle_result["error"])
                self.state_mgr.record_result(False, "AI reasoning failed")
                self._write_cycle_report(cycle_result)
                return cycle_result

            patches = patches_response.get("patches", [])
            item_id = patches_response.get("item_id", "UNKNOWN")
            cycle_result["item_implemented"] = item_id

            if not patches:
                logger.info("No patches generated (may be at completion or no pending items)")
                cycle_result["error"] = "No patches generated"
                self.state_mgr.record_result(False, f"No patches for {item_id}")
                self._write_cycle_report(cycle_result)
                return cycle_result

            logger.info("✓ Generated %d patches for %s", len(patches), item_id)

            # Step 5: Apply patches
            logger.info("Applying patches...")
            apply_result = self.applier.apply_patches(patches, iteration)
            cycle_result["patches_applied"] = apply_result["patches_applied"]
            cycle_result["patches_skipped"] = apply_result["patches_skipped"]

            if apply_result["patches_skipped"] > 0:
                logger.warning("⚠ %d patches were skipped", apply_result["patches_skipped"])
                for err in apply_result["errors"]:
                    logger.warning("  - %s", err)

            if apply_result["patches_applied"] == 0:
                cycle_result["error"] = "No patches were successfully applied"
                logger.error(cycle_result["error"])
                self.state_mgr.record_result(False, f"No patches applied for {item_id}")
                return cycle_result

            logger.info("✓ %d patches applied to %d files", apply_result["patches_applied"], len(apply_result["files_modified"]))

            # Step 6: Verify patches
            logger.info("Verifying patches...")
            verify_result = await self.verifier.verify_and_rollback_if_needed(
                apply_result["files_modified"],
                f"autonomous_logs/backups/iter_{iteration}",
                iteration
            )

            cycle_result["verified"] = verify_result["verified"]
            cycle_result["rolled_back"] = verify_result["rolled_back"]

            if verify_result["rolled_back"]:
                cycle_result["error"] = f"Verification failed and rolled back: {verify_result['error']}"
                logger.error("✗ %s", cycle_result["error"])
                self.state_mgr.record_result(False, f"Rollback after verification failure")
                return cycle_result

            if not verify_result["verified"]:
                cycle_result["error"] = verify_result.get("error", "Verification failed")
                logger.error("✗ %s", cycle_result["error"])
                self.state_mgr.record_result(False, f"Verification failed: {cycle_result['error']}")
                return cycle_result

            logger.info("✓ All verification checks passed")

            # Step 7: Record success
            self.state_mgr.record_result(
                True,
                f"Successfully implemented {item_id}: {apply_result['patches_applied']} patches applied",
                tokens_used=len(codebase_snapshot) // 4
            )

            # Step 8: Write cycle report
            cycle_result["timestamp"] = datetime.now().isoformat()
            self._write_cycle_report(cycle_result)

            logger.info("✅ CYCLE %d COMPLETE: %s", iteration, item_id)
            logger.info("=" * 80)
            return cycle_result

        except Exception as e:
            logger.error("Cycle %d crashed: %s", cycle_result.get("iteration", "?"), e)
            cycle_result["error"] = str(e)
            self.state_mgr.record_result(False, f"Cycle crashed: {str(e)}")
            cycle_result["timestamp"] = datetime.now().isoformat()
            self._write_cycle_report(cycle_result)
            return cycle_result
        finally:
            # Clean up lockfile
            try:
                if lock_file_path.exists():
                    lock_file_path.unlink(missing_ok=True)
            except Exception as e:
                logger.warning(f"Failed to clean up lockfile: {e}")

    def _write_cycle_report(self, cycle_result: Dict[str, Any]) -> bool:
        """Write detailed cycle report to autonomous_logs/cycle_reports/."""
        try:
            reports_dir = Path(self.root_path) / "autonomous_logs" / "cycle_reports"
            reports_dir.mkdir(parents=True, exist_ok=True)

            iteration = cycle_result.get("iteration", 0)
            report_path = reports_dir / f"cycle_{iteration:04d}.json"

            with open(report_path, "w") as f:
                json.dump(cycle_result, f, indent=2)

            logger.info("Cycle report written: %s", report_path)
            return True

        except Exception as e:
            logger.error("Failed to write cycle report: %s", e)
            return False


# Singleton instance
_loop = None

def get_evolution_loop(model_router=None, root_path: str = ".") -> EvolutionLoop:
    """Get or create evolution loop singleton."""
    global _loop
    if _loop is None:
        _loop = EvolutionLoop(model_router, root_path)
    return _loop

async def run_self_evolution_cycle(model_router=None) -> Dict[str, Any]:
    """
    Convenience function to run one evolution cycle.

    Usage:
        from backend.core.self_evolution.evolution_loop import run_self_evolution_cycle
        result = await run_self_evolution_cycle(model_router)
    """
    loop = get_evolution_loop(model_router)
    return await loop.run_one_cycle()
