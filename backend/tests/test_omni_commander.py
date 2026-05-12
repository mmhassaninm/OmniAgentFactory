"""
Omni Commander — Integration Test Suite

Verifies:
- SafetyGuard blocks sensitive paths and unsafe system commands while allowing whitelists.
- FileExecutor operations relative to normalized workspace routes.
- IntentRouter parsing.
- Orchestrator streaming execution flow and manual confirmation pause triggers.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from core.omni_commander.safety_guard import SafetyGuard
from core.omni_commander.executors.file_executor import normalize_path, execute_file_action
from core.omni_commander.intent_router import IntentRouter, ActionPlan
from core.omni_commander.orchestrator import OmniOrchestrator


# ── 1. TEST SAFETY GUARD ───────────────────────────────────────────────

def test_safety_guard_protected_paths():
    guard = SafetyGuard()
    
    # Block access to environment secrets
    res = guard.check("file", {"action": "read_file", "path": ".env"})
    assert res.status == "blocked"
    assert "protected" in res.reason
    
    # Block access to database layer directly
    res = guard.check("file", {"action": "write_file", "path": "backend/core/database.py"})
    assert res.status == "blocked"
    
    # Approve safe file reads
    res = guard.check("file", {"action": "read_file", "path": "backend/main.py"})
    assert res.status == "approved"
    
    # Require confirmation on file deletion
    res = guard.check("file", {"action": "delete_file", "path": "temp_file.txt"})
    assert res.status == "confirmation_required"


def test_safety_guard_commands():
    guard = SafetyGuard()
    
    # Allow whitelisted shell command immediately
    res = guard.check("code", {"action": "run_command", "command": "pytest"})
    assert res.status == "approved"
    
    # Require confirmation for arbitrary system commands
    res = guard.check("code", {"action": "run_command", "command": "python script.py"})
    assert res.status == "confirmation_required"
    
    # Hard block hazardous commands
    res = guard.check("code", {"action": "run_command", "command": "rm -rf /"})
    assert res.status == "blocked"


# ── 2. TEST FILE EXECUTOR ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_file_executor_actions(tmp_path):
    # Patch workspace root to use custom tmp_path for isolated sandbox testing
    with patch("core.omni_commander.executors.file_executor.WORKSPACE_ROOT", str(tmp_path)):
        
        # Write file action
        write_params = {
            "action": "write_file",
            "path": "test_folder/note.txt",
            "content": "Hello Omni Commander integration test!"
        }
        res_write = await execute_file_action(write_params)
        assert res_write["success"] is True
        assert "Successfully wrote" in res_write["message"]
        
        # Read file action
        read_params = {
            "action": "read_file",
            "path": "test_folder/note.txt"
        }
        res_read = await execute_file_action(read_params)
        assert res_read["success"] is True
        assert res_read["content"] == "Hello Omni Commander integration test!"
        
        # List dir action
        list_params = {
            "action": "list_dir",
            "path": "test_folder"
        }
        res_list = await execute_file_action(list_params)
        assert res_list["success"] is True
        assert len(res_list["contents"]) == 1
        assert res_list["contents"][0]["name"] == "note.txt"


# ── 3. TEST INTENT ROUTER ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_intent_router_parsing():
    mock_router = MagicMock()
    mock_router.call_model = AsyncMock(return_value="""
    {
      "intent": "Run pytest suite and summarize",
      "steps": [
        {
          "type": "code",
          "params": {
            "action": "run_command",
            "command": "pytest"
          },
          "description": "Trigger the pytest automation suite."
        }
      ],
      "requires_confirmation": false,
      "estimated_duration": "5s",
      "tools_needed": ["terminal"]
    }
    """)
    
    with patch("core.omni_commander.intent_router.get_model_router", return_value=mock_router):
        router = IntentRouter()
        plan = await router.route("Run tests please")
        
        assert plan.intent == "Run pytest suite and summarize"
        assert len(plan.steps) == 1
        assert plan.steps[0].type == "code"
        assert plan.steps[0].params["command"] == "pytest"


# ── 4. TEST ORCHESTRATOR CONFIRMATION GATES ────────────────────────────

@pytest.mark.asyncio
async def test_orchestrator_confirmation_workflow():
    orchestrator = OmniOrchestrator()
    
    # Mock db and queue engine dependencies
    mock_db = MagicMock()
    mock_db.commander_sessions.find_one = AsyncMock(return_value={})
    mock_db.commander_sessions.update_one = AsyncMock()
    
    mock_queue = MagicMock()
    mock_queue.enqueue = AsyncMock()
    
    # Formulate a mock ActionPlan with a confirmation_required step (like delete_file)
    mock_plan = ActionPlan(
        intent="Delete test document",
        steps=[
            {
                "type": "file",
                "params": {"action": "delete_file", "path": "dummy.txt"},
                "description": "Delete dummy file."
            }
        ],
        requires_confirmation=True,
        estimated_duration="3s",
        tools_needed=["file"]
    )
    
    with patch("core.omni_commander.orchestrator.get_db", return_value=mock_db), \
         patch("core.omni_commander.orchestrator.get_queue_engine", return_value=mock_queue), \
         patch.object(orchestrator.intent_router, "route", AsyncMock(return_value=mock_plan)):
             
        # Execute stream and assert it pauses on confirmation required
        events = []
        async for event in orchestrator.execute_prompt_stream("Delete dummy.txt", "test_session"):
            events.append(event)
            
        assert any(e["type"] == "plan_created" for e in events)
        assert any(e["type"] == "confirmation_required" for e in events)
        
        # Verify db updated session to paused status
        mock_db.commander_sessions.update_one.assert_any_call(
            {"_id": "test_session"},
            {"$set": {"status": "paused", "current_step_index": 0}}
        )
