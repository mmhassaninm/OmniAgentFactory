"""
Unit tests for Self-Evolution Engine components.
Tests StateManager and CodebaseReader.
"""
import pytest
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

from core.self_evolution.state_manager import StateManager
from core.self_evolution.codebase_reader import CodebaseReader


class TestSelfEvolutionCore:
    """Suite of tests for Self-Evolution Core Components."""

    def test_state_manager_init_and_load(self):
        """Test that StateManager initializes and loads/saves state correctly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            state_filepath = Path(tmpdir) / "state.json"
            mgr = StateManager(state_file=str(state_filepath))

            # Initial load should return default initialized state
            state = mgr.load_state()
            assert state["iteration"] == 0
            assert state["total_improvements"] == 0
            assert state["total_errors"] == 0

            # Update state parameters
            state["iteration"] = 5
            state["total_improvements"] = 12
            mgr.save_state(state)

            # Re-load should fetch the updated state
            new_mgr = StateManager(state_file=str(state_filepath))
            loaded_state = new_mgr.load_state()
            assert loaded_state["iteration"] == 5
            assert loaded_state["total_improvements"] == 12

    def test_codebase_reader_filter(self):
        """Test that CodebaseReader correctly honors token budget and files exclusion."""
        # Instantiate codebase reader
        reader = CodebaseReader(max_tokens=10000)
        
        # Test file filter
        assert reader._should_ignore(Path(".git/config")) is True
        assert reader._should_ignore(Path("node_modules/package/index.js")) is True
        assert reader._should_ignore(Path("backend/core/database.py")) is False
        assert reader._should_ignore(Path("frontend/src/App.tsx")) is False

    @pytest.mark.asyncio
    async def test_evolution_loop_end_to_end(self):
        """Test that EvolutionLoop runs an end-to-end cycle successfully with mocked AI reasoning and verifier."""
        import core.self_evolution.state_manager as sm_mod
        import core.self_evolution.evolution_loop as el_mod
        from unittest.mock import AsyncMock

        import sys
        for name, module in list(sys.modules.items()):
            if "state_manager" in name and hasattr(module, "_state_manager"):
                module._state_manager = None
            if "evolution_loop" in name and hasattr(module, "_loop"):
                module._loop = None

        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            
            # 1. Create a dummy codebase file to modify
            target_file = tmpdir_path / "hello.py"
            target_file.write_text("def run():\n    print('old_content')\n", encoding="utf-8")

            # 2. Create a dummy Evolve_plan.md
            evolve_plan_file = tmpdir_path / "Evolve_plan.md"
            evolve_plan_file.write_text(
                "# Evolve Plan\n- **Item:** ITEM-001\n  - **Status:** `[ pending ]`\n", 
                encoding="utf-8"
            )

            # 3. Instantiate the loop inside our temp directory
            from core.self_evolution.evolution_loop import EvolutionLoop
            from core.self_evolution.state_manager import StateManager
            loop = EvolutionLoop(model_router=MagicMock(), root_path=tmpdir)
            loop.state_mgr = StateManager(state_file=str(tmpdir_path / "autonomous_logs" / "evolution_state.json"))

            # 4. Mock AI Reasoner to return a successful patch recommendation
            loop.reasoner.reason = AsyncMock(return_value={
                "item_id": "ITEM-001",
                "patches": [
                    {
                        "file": "hello.py",
                        "action": "replace_block",
                        "old_content": "print('old_content')",
                        "new_content": "print('new_content')"
                    }
                ]
            })

            # 5. Mock Verifier to return true with no rollbacks
            loop.verifier.verify_and_rollback_if_needed = AsyncMock(return_value={
                "verified": True,
                "rolled_back": False,
                "error": None
            })

            # 6. Execute one loop cycle
            result = await loop.run_one_cycle()

            # 7. Assertions
            assert result["iteration"] == 1
            assert result["verified"] is True
            assert result["rolled_back"] is False
            assert result["patches_applied"] == 1
            assert result["error"] is None

            # Verify file change actually happened
            assert "new_content" in target_file.read_text(encoding="utf-8")

            # Verify that state manager correctly updated the iteration in state file
            state_file = tmpdir_path / "autonomous_logs" / "evolution_state.json"
            assert state_file.exists()
            with open(state_file, "r") as f:
                state_data = json.load(f)
                assert state_data["iteration"] == 1
                assert state_data["total_improvements"] == 1

            # Verify that cycle report is written
            report_file = tmpdir_path / "autonomous_logs" / "cycle_reports" / "cycle_0001.json"
            assert report_file.exists()

