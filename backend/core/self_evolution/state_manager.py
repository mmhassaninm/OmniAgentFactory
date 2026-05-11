"""
Self-Evolution State Manager

Manages persistent state file (autonomous_logs/evolution_state.json) tracking:
- Current iteration number
- Last run timestamp
- Total improvements applied
- Total errors encountered
- Evolve_plan.md checksum
- Budget consumed this cycle

Uses file locking to prevent race conditions.
"""

import json
import logging
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional
try:
    import fcntl
except ImportError:
    fcntl = None
import os

logger = logging.getLogger(__name__)

class StateManager:
    def __init__(self, state_file: str = "autonomous_logs/evolution_state.json"):
        self.state_file = Path(state_file)
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self._lock_file = self.state_file.parent / ".evolution_state.lock"

    def _get_evolve_plan_checksum(self) -> str:
        """Calculate checksum of Evolve_plan.md."""
        evolve_plan = Path("Evolve_plan.md")
        if not evolve_plan.exists():
            return ""
        try:
            content = evolve_plan.read_text(encoding="utf-8")
            return hashlib.md5(content.encode()).hexdigest()
        except Exception as e:
            logger.warning("Failed to compute Evolve_plan checksum: %s", e)
            return ""

    def load_state(self) -> Dict[str, Any]:
        """Load state from file. Initialize if missing."""
        if not self.state_file.exists():
            return self._initialize_state()

        try:
            with open(self.state_file, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error("Failed to load state: %s. Reinitializing.", e)
            return self._initialize_state()

    def _initialize_state(self) -> Dict[str, Any]:
        """Create initial state."""
        state = {
            "iteration": 0,
            "last_run": None,
            "total_improvements": 0,
            "total_errors": 0,
            "evolve_plan_checksum": self._get_evolve_plan_checksum(),
            "budget_consumed_this_cycle": 0,
            "created_at": datetime.now().isoformat(),
        }
        self.save_state(state)
        return state

    def save_state(self, state: Dict[str, Any]) -> bool:
        """Save state to file with file locking."""
        try:
            if fcntl is not None:
                # Use file locking to prevent concurrent writes on Unix/Linux
                with open(self._lock_file, "w") as lock:
                    try:
                        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
                        with open(self.state_file, "w") as f:
                            json.dump(state, f, indent=2)
                        logger.debug("State saved: iteration %d", state.get("iteration", 0))
                        return True
                    finally:
                        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
            else:
                # Windows fallback (concurrency handled by single-threaded asyncio event loop)
                with open(self.state_file, "w") as f:
                    json.dump(state, f, indent=2)
                logger.debug("State saved on Windows: iteration %d (no fcntl)", state.get("iteration", 0))
                return True
        except Exception as e:
            logger.error("Failed to save state: %s", e)
            return False

    def increment_iteration(self) -> int:
        """Increment iteration counter and return new value."""
        state = self.load_state()
        state["iteration"] = state.get("iteration", 0) + 1
        state["last_run"] = datetime.now().isoformat()
        state["evolve_plan_checksum"] = self._get_evolve_plan_checksum()
        state["budget_consumed_this_cycle"] = 0
        self.save_state(state)
        return state["iteration"]

    def record_result(self, success: bool, description: str, tokens_used: int = 0) -> bool:
        """Record execution result."""
        state = self.load_state()

        if success:
            state["total_improvements"] = state.get("total_improvements", 0) + 1
        else:
            state["total_errors"] = state.get("total_errors", 0) + 1

        state["budget_consumed_this_cycle"] = state.get("budget_consumed_this_cycle", 0) + tokens_used
        state["last_run"] = datetime.now().isoformat()

        logger.info(
            "Result recorded: success=%s, description=%s, tokens=%d",
            success, description[:100], tokens_used
        )

        return self.save_state(state)


# Singleton instance
_state_manager = None

def get_state_manager(state_file: str = "autonomous_logs/evolution_state.json") -> StateManager:
    """Get or create state manager singleton."""
    global _state_manager
    if _state_manager is None:
        _state_manager = StateManager(state_file)
    return _state_manager
