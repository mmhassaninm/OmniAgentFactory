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
            assert state["applied_count"] == 0
            assert state["failed_count"] == 0

            # Update state parameters
            state["iteration"] = 5
            state["applied_count"] = 12
            mgr.save_state(state)

            # Re-load should fetch the updated state
            new_mgr = StateManager(state_file=str(state_filepath))
            loaded_state = new_mgr.load_state()
            assert loaded_state["iteration"] == 5
            assert loaded_state["applied_count"] == 12

    def test_codebase_reader_filter(self):
        """Test that CodebaseReader correctly honors token budget and files exclusion."""
        # Instantiate codebase reader
        reader = CodebaseReader(token_budget=10000)
        
        # Test file filter
        assert reader._should_ignore(Path(".git/config")) is True
        assert reader._should_ignore(Path("node_modules/package/index.js")) is True
        assert reader._should_ignore(Path("backend/core/database.py")) is False
        assert reader._should_ignore(Path("frontend/src/App.tsx")) is False
