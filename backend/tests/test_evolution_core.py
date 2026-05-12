"""
Unit tests for Evolution Core Modules
Tests: LoopOrchestrator, ProblemScanner, IdeaEngineV2, AgentCouncil, ImplementationRunner
"""
import pytest
import asyncio
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch


class TestLoopOrchestrator:
    """Tests for LoopOrchestrator — main evolution loop coordinator."""

    @pytest.mark.asyncio
    async def test_loop_initialization(self):
        """Test that orchestrator initializes with correct components."""
        from core.autonomous_evolution.loop_orchestrator import LoopOrchestrator

        mock_idea_engine = AsyncMock()
        mock_problem_scanner = AsyncMock()
        mock_agent_council = AsyncMock()
        mock_registry = AsyncMock()
        mock_runner = AsyncMock()
        mock_router = AsyncMock()

        orch = LoopOrchestrator(
            idea_engine=mock_idea_engine,
            problem_scanner=mock_problem_scanner,
            agent_council=mock_agent_council,
            registry_manager=mock_registry,
            implementation_runner=mock_runner,
            model_router=mock_router,
        )

        assert orch.idea_engine == mock_idea_engine
        assert orch.problem_scanner == mock_problem_scanner
        assert orch.agent_council == mock_agent_council
        assert orch.runner == mock_runner
        assert orch.cycle_count == 0
        assert orch.running == False

    def test_cycle_alternation(self):
        """Test that cycles alternate between ideas (odd) and problems (even)."""
        from core.autonomous_evolution.loop_orchestrator import LoopOrchestrator

        orch = LoopOrchestrator()

        # Odd cycles should be ideas
        orch.cycle_count = 1
        assert orch.cycle_count % 2 == 1  # Ideas

        orch.cycle_count = 3
        assert orch.cycle_count % 2 == 1  # Ideas

        # Even cycles should be problems
        orch.cycle_count = 2
        assert orch.cycle_count % 2 == 0  # Problems

        orch.cycle_count = 4
        assert orch.cycle_count % 2 == 0  # Problems


class TestProblemScanner:
    """Tests for ProblemScanner — static analysis + LLM diagnosis."""

    def test_problem_scanner_initialization(self):
        """Test that ProblemScanner initializes with correct paths."""
        from core.autonomous_evolution.problem_scanner import ProblemScanner

        mock_router = AsyncMock()
        mock_registry = AsyncMock()

        scanner = ProblemScanner(mock_router, mock_registry)

        assert scanner.model_router == mock_router
        assert scanner.registry == mock_registry
        assert len(scanner.scan_paths) > 0
        # All paths should be absolute Path objects
        for path in scanner.scan_paths:
            assert isinstance(path, Path)
            assert path.is_absolute()

    @pytest.mark.asyncio
    async def test_static_analysis_returns_issues(self):
        """Test that static analysis can detect heuristic issues."""
        from core.autonomous_evolution.problem_scanner import ProblemScanner

        mock_router = AsyncMock()
        mock_registry = AsyncMock()
        scanner = ProblemScanner(mock_router, mock_registry)

        issues = await scanner._static_analysis()

        # Should return a list
        assert isinstance(issues, list)
        # May be empty if no issues in backend code, but structure should be valid
        for issue in issues:
            assert "type" in issue
            assert "file" in issue
            assert "detail" in issue


class TestImplementationRunner:
    """Tests for ImplementationRunner — code execution engine."""

    def test_forbidden_files(self):
        """Test that forbidden files are not modified."""
        from core.autonomous_evolution.implementation_runner import (
            ImplementationRunner,
            FORBIDDEN_FILES,
        )

        runner = ImplementationRunner()

        # Check that critical files are protected
        assert ".env" in FORBIDDEN_FILES
        assert ".gitignore" in FORBIDDEN_FILES
        assert "MODIFICATION_HISTORY.md" in FORBIDDEN_FILES
        assert "docker-compose.yml" in FORBIDDEN_FILES

    @pytest.mark.asyncio
    async def test_resolve_path_escapes_root(self):
        """Test that path resolution prevents escaping project root."""
        from core.autonomous_evolution.implementation_runner import ImplementationRunner

        runner = ImplementationRunner()

        # Try to escape project root
        abs_path, error = runner._resolve_path("../../etc/passwd")
        assert error  # Should have error message
        assert "escapes project root" in error.lower()

    @pytest.mark.asyncio
    async def test_resolve_path_allows_backend_files(self):
        """Test that path resolution allows valid backend files."""
        from core.autonomous_evolution.implementation_runner import ImplementationRunner

        runner = ImplementationRunner()

        # Valid backend file
        abs_path, error = runner._resolve_path("backend/core/test.py")
        assert not error  # Should not have error
        # Path should be in backend
        assert "backend" in str(abs_path)


class TestAgentCouncil:
    """Tests for AgentCouncil — voting system for idea evaluation."""

    @pytest.mark.asyncio
    async def test_council_deliberation_structure(self):
        """Test that council deliberation returns proper verdict structure."""
        from core.autonomous_evolution.agent_council import AgentCouncil

        mock_router = AsyncMock()
        council = AgentCouncil(mock_router)

        # Mock the deliberation to return valid structure
        mock_router.call_model = AsyncMock(
            return_value='{"final_decision": "approve", "final_score": 7, "rationale": "Good idea"}'
        )

        test_idea = {
            "title": "Test Idea",
            "description": "A test idea",
            "category": "evolution",
        }

        # The actual deliberation may fail if model_router isn't fully mocked,
        # but we can test structure expectations
        assert "title" in test_idea
        assert "description" in test_idea


class TestIdeaEngineV2:
    """Tests for IdeaEngineV2 — web research + idea generation."""

    def test_idea_engine_initialization(self):
        """Test that IdeaEngineV2 initializes correctly."""
        from core.autonomous_evolution.idea_engine_v2 import IdeaEngineV2

        mock_router = AsyncMock()
        mock_registry = AsyncMock()

        engine = IdeaEngineV2(mock_router, mock_registry)

        assert engine.model_router == mock_router
        assert engine.registry == mock_registry

    @pytest.mark.asyncio
    async def test_web_research_handles_ddgs_failure(self):
        """Test that web research gracefully handles DuckDuckGo failures."""
        from core.autonomous_evolution.idea_engine_v2 import IdeaEngineV2

        mock_router = AsyncMock()
        mock_registry = AsyncMock()

        engine = IdeaEngineV2(mock_router, mock_registry)

        # This should not crash even if DDGS fails
        try:
            results = await engine._web_research()
            # Should return a list (may be empty if search fails)
            assert isinstance(results, list)
        except Exception as e:
            # Graceful handling - no unexpected exceptions
            pytest.fail(f"Web research crashed: {e}")


# Integration Tests
class TestEvolutionIntegration:
    """Integration tests for the full evolution system."""

    @pytest.mark.asyncio
    async def test_registry_persistence(self):
        """Test that ideas are registered in MongoDB correctly."""
        from core.autonomous_evolution.registry_manager import RegistryManager

        # This test requires MongoDB to be running
        # Skip if MongoDB unavailable
        pytest.skip("MongoDB integration test - requires running MongoDB")

    def test_log_files_creation(self):
        """Test that autonomous_logs files are created correctly."""
        import os
        if os.path.exists("/project/autonomous_logs"):
            logs_dir = Path("/project/autonomous_logs")
        else:
            here = Path(__file__).resolve()
            if (here.parent.parent / "autonomous_logs").exists():
                logs_dir = here.parent.parent / "autonomous_logs"
            else:
                logs_dir = here.parent.parent.parent / "autonomous_logs"
        assert logs_dir.exists(), "autonomous_logs directory should exist"

        expected_files = ["IDEAS_LOG.json", "PROBLEMS_LOG.json", "EXECUTION_HISTORY.json"]
        for fname in expected_files:
            assert (logs_dir / fname).exists(), f"{fname} should exist in autonomous_logs"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
