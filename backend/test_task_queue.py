"""
OmniAgentFactory — Task Queue System Tests

Tests for:
- TaskItem model (serialization/deserialization)
- TaskQueueEngine (enqueue, dequeue, complete, fail, cancel)
- TaskFactory (all constructors)
- QueueSnapshot generation
- Archive system
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from models.task_queue import (
    TaskItem, TaskStatus, TaskPriority, TaskCategory,
    QueueSnapshot, QueueStats
)
from core.task_factory import (
    make_evolution_task, make_swarm_task, make_shopify_task,
    make_health_check_task, make_skill_task, make_money_task,
    make_dev_task, make_scheduled_task, make_manual_task,
)
from core.task_queue_engine import TaskQueueEngine, COLLECTION_ACTIVE, COLLECTION_HISTORY


# ── Fixtures ──────────────────────────────────────────────────────────────

@pytest.fixture
def sample_task():
    return TaskItem(
        name="Test Evolution Cycle",
        description="Running a test evolution cycle",
        category=TaskCategory.EVOLUTION,
        priority=TaskPriority.HIGH,
        created_by="test",
        assigned_to="test_agent",
        tags=["test", "evolution"],
        input_payload={"key": "value"},
    )


@pytest.fixture
async def mock_engine():
    """Create a TaskQueueEngine with mocked MongoDB."""
    engine = TaskQueueEngine()
    engine._db = AsyncMock()
    # Make collection access return async mock
    engine._db.__getitem__ = MagicMock(return_value=AsyncMock())
    engine._lock = asyncio.Lock()
    return engine


# ── TaskItem Model Tests ─────────────────────────────────────────────────

class TestTaskItem:
    def test_create_minimal(self):
        """Task can be created with minimal fields."""
        task = TaskItem(
            name="Minimal task",
            category=TaskCategory.SKILL,
            created_by="test",
        )
        assert task.id is not None
        assert len(task.id) > 0
        assert task.status == TaskStatus.PENDING
        assert task.priority == TaskPriority.NORMAL
        assert task.progress_pct == 0
        assert task.retry_count == 0
        assert task.max_retries == 3
        assert task.child_task_ids == []
        assert task.tags == []

    def test_to_dict_serialization(self, sample_task):
        """to_dict() converts enums to strings/ints properly."""
        d = sample_task.to_dict()
        assert d["status"] == "pending"
        assert d["priority"] == 2
        assert d["category"] == "evolution"
        assert d["name"] == "Test Evolution Cycle"
        assert d["tokens_used"] == 0

    def test_from_dict_roundtrip(self, sample_task):
        """from_dict() restores a TaskItem correctly."""
        d = sample_task.to_dict()
        restored = TaskItem.from_dict(d)
        assert restored.id == sample_task.id
        assert restored.name == sample_task.name
        assert restored.category == sample_task.category
        assert restored.priority == sample_task.priority
        assert restored.status == sample_task.status
        assert restored.tags == sample_task.tags

    def test_from_dict_with_object_id(self):
        """from_dict() handles MongoDB _id field."""
        data = {
            "_id": "custom-id-123",
            "name": "From DB",
            "category": "shopify",
            "priority": 1,
            "created_by": "scheduler",
            "status": "running",
        }
        task = TaskItem.from_dict(data)
        assert task.id == "custom-id-123"
        assert task.category == TaskCategory.SHOPIFY
        assert task.priority == TaskPriority.CRITICAL
        assert task.status == TaskStatus.RUNNING

    def test_all_enums_defined(self):
        """All enum values are defined correctly."""
        assert TaskStatus.PENDING.value == "pending"
        assert TaskStatus.RUNNING.value == "running"
        assert TaskStatus.COMPLETED.value == "completed"
        assert TaskStatus.FAILED.value == "failed"
        assert TaskStatus.CANCELLED.value == "cancelled"
        assert TaskStatus.RETRYING.value == "retrying"

        assert TaskPriority.CRITICAL.value == 1
        assert TaskPriority.HIGH.value == 2
        assert TaskPriority.NORMAL.value == 3
        assert TaskPriority.LOW.value == 4
        assert TaskPriority.IDLE.value == 5

        assert TaskCategory.EVOLUTION.value == "evolution"
        assert TaskCategory.SWARM.value == "swarm"
        assert TaskCategory.MONEY.value == "money"
        assert TaskCategory.SHOPIFY.value == "shopify"
        assert TaskCategory.DEV.value == "dev"
        assert TaskCategory.SKILL.value == "skill"
        assert TaskCategory.HEALTH.value == "health"
        assert TaskCategory.SCHEDULED.value == "scheduled"
        assert TaskCategory.MANUAL.value == "manual"


# ── TaskFactory Tests ────────────────────────────────────────────────────

class TestTaskFactory:
    def test_make_evolution_task(self):
        task = make_evolution_task(priority=TaskPriority.CRITICAL)
        assert task.category == TaskCategory.EVOLUTION
        assert task.created_by == "evolution_loop"
        assert task.assigned_to == "evolution_loop"
        assert task.priority == TaskPriority.CRITICAL

    def test_make_swarm_task(self):
        task = make_swarm_task("researcher", "Research AI trends")
        assert task.category == TaskCategory.SWARM
        assert task.name.startswith("Swarm: researcher")
        assert "researcher" in task.tags

    def test_make_shopify_task(self):
        task = make_shopify_task("Update products", {"products": ["p1"]})
        assert task.category == TaskCategory.SHOPIFY
        assert task.input_payload == {"products": ["p1"]}
        assert task.priority == TaskPriority.HIGH

    def test_make_health_check_task(self):
        task = make_health_check_task()
        assert task.category == TaskCategory.HEALTH
        assert task.priority == TaskPriority.IDLE

    def test_make_skill_task(self):
        task = make_skill_task("write_product_desc", {"product_name": "Shoe"})
        assert task.category == TaskCategory.SKILL
        assert "write_product_desc" in task.tags

    def test_make_money_task(self):
        task = make_money_task("Find affiliate program")
        assert task.category == TaskCategory.MONEY

    def test_make_dev_task(self):
        task = make_dev_task("Fix UI bug")
        assert task.category == TaskCategory.DEV

    def test_make_scheduled_task(self):
        task = make_scheduled_task("nightly_backup")
        assert task.category == TaskCategory.SCHEDULED

    def test_make_manual_task(self):
        task = make_manual_task("Run agent", "Analyze data", tools=["web_search"])
        assert task.category == TaskCategory.MANUAL
        assert "web_search" in task.tags


# ── Queue Engine Tests (unit) ────────────────────────────────────────────

class TestTaskQueueEngine:
    @pytest.mark.asyncio
    async def test_enqueue(self, mock_engine):
        """enqueue() stores task and emits event."""
        task = TaskItem(name="Test", category=TaskCategory.SKILL, created_by="test")
        mock_collection = AsyncMock()
        mock_engine._db.__getitem__.return_value = mock_collection

        with patch.object(mock_engine, '_emit_event', AsyncMock()) as mock_emit:
            task_id = await mock_engine.enqueue(task)

            assert task_id == task.id
            assert task.status == TaskStatus.PENDING
            assert task.queued_at is not None
            mock_collection.insert_one.assert_called_once()
            mock_emit.assert_called_once()

    @pytest.mark.asyncio
    async def test_dequeue(self, mock_engine):
        """dequeue() picks highest priority task."""
        mock_collection = AsyncMock()
        mock_engine._db.__getitem__.return_value = mock_collection
        mock_collection.find_one_and_update.return_value = {
            "_id": "test-id",
            "name": "Priority task",
            "category": "evolution",
            "priority": 1,
            "created_by": "test",
            "status": "running",
            "started_at": datetime.utcnow(),
        }

        with patch.object(mock_engine, '_emit_event', AsyncMock()):
            task = await mock_engine.dequeue()

            assert task is not None
            assert task.id == "test-id"
            assert task.status == TaskStatus.RUNNING
            assert task.started_at is not None

    @pytest.mark.asyncio
    async def test_dequeue_empty(self, mock_engine):
        """dequeue() returns None when queue is empty."""
        mock_collection = AsyncMock()
        mock_engine._db.__getitem__.return_value = mock_collection
        mock_collection.find_one_and_update.return_value = None

        task = await mock_engine.dequeue()
        assert task is None

    @pytest.mark.asyncio
    async def test_update_progress(self, mock_engine):
        """update_progress() updates task and emits event."""
        mock_collection = AsyncMock()
        mock_engine._db.__getitem__.return_value = mock_collection

        with patch.object(mock_engine, '_emit_event', AsyncMock()) as mock_emit:
            await mock_engine.update_progress("task-1", 50, "Halfway there")

            mock_collection.update_one.assert_called_once()
            mock_emit.assert_called_once_with("task_progress", {
                "task_id": "task-1",
                "progress_pct": 50,
                "progress_message": "Halfway there",
            })

    @pytest.mark.asyncio
    async def test_complete(self, mock_engine):
        """complete() moves task from active to history."""
        mock_active = AsyncMock()
        mock_history = AsyncMock()
        mock_engine._db.__getitem__.side_effect = lambda name: mock_active if name == COLLECTION_ACTIVE else mock_history
        mock_active.find_one.return_value = {
            "_id": "task-1",
            "name": "Test task",
            "category": "skill",
            "created_by": "test",
            "started_at": datetime.utcnow(),
        }

        with patch.object(mock_engine, '_emit_event', AsyncMock()):
            await mock_engine.complete("task-1", "Done!", {"result": "ok"}, tokens_used=150)

            mock_active.delete_one.assert_called_once_with({"_id": "task-1"})
            mock_history.insert_one.assert_called_once()

    @pytest.mark.asyncio
    async def test_fail_with_retry(self, mock_engine):
        """fail() re-enqueues task if retries remain."""
        mock_collection = AsyncMock()
        mock_engine._db.__getitem__.return_value = mock_collection
        mock_collection.find_one.return_value = {
            "_id": "task-1",
            "name": "Failing task",
            "category": "skill",
            "created_by": "test",
            "retry_count": 0,
            "max_retries": 3,
        }

        with patch.object(mock_engine, '_emit_event', AsyncMock()):
            await mock_engine.fail("task-1", "Something broke")

            mock_collection.update_one.assert_called_once()

    @pytest.mark.asyncio
    async def test_fail_no_retry(self, mock_engine):
        """fail() moves to history when retries exhausted."""
        mock_active = AsyncMock()
        mock_history = AsyncMock()
        mock_engine._db.__getitem__.side_effect = lambda name: mock_active if name == COLLECTION_ACTIVE else mock_history
        mock_active.find_one.return_value = {
            "_id": "task-1",
            "name": "Failing task",
            "category": "skill",
            "created_by": "test",
            "retry_count": 3,
            "max_retries": 3,
        }

        with patch.object(mock_engine, '_emit_event', AsyncMock()):
            await mock_engine.fail("task-1", "Failed too many times")

            mock_active.delete_one.assert_called_once_with({"_id": "task-1"})
            mock_history.insert_one.assert_called_once()

    @pytest.mark.asyncio
    async def test_cancel(self, mock_engine):
        """cancel() marks task as cancelled and moves to history."""
        mock_active = AsyncMock()
        mock_history = AsyncMock()
        mock_engine._db.__getitem__.side_effect = lambda name: mock_active if name == COLLECTION_ACTIVE else mock_history
        mock_active.find_one_and_update.return_value = {
            "_id": "task-1",
            "name": "Cancellable task",
            "category": "manual",
            "created_by": "test",
        }

        with patch.object(mock_engine, '_emit_event', AsyncMock()):
            await mock_engine.cancel("task-1", "No longer needed")

            mock_active.delete_one.assert_called_once_with({"_id": "task-1"})
            mock_history.insert_one.assert_called_once()


# ── QueueSnapshot Tests ──────────────────────────────────────────────────

class TestQueueSnapshot:
    def test_snapshot_creation(self):
        """QueueSnapshot can be created properly."""
        task = TaskItem(name="Test", category=TaskCategory.SKILL, created_by="test")
        snapshot = QueueSnapshot(
            total_pending=5,
            total_running=2,
            total_completed_today=100,
            total_failed_today=3,
            tasks=[task],
            queue_health="healthy",
            avg_wait_time_sec=12.5,
            avg_execution_time_sec=45.2,
        )
        assert snapshot.total_pending == 5
        assert snapshot.total_running == 2
        assert snapshot.total_completed_today == 100
        assert snapshot.queue_health == "healthy"
        assert len(snapshot.tasks) == 1
        assert snapshot.last_updated is not None


# ── Archive Tests ────────────────────────────────────────────────────────

class TestArchiveSystem:
    @pytest.mark.asyncio
    async def test_get_archive_files_no_files(self, tmp_path):
        """get_archive_files returns empty list when no archives exist."""
        from core.task_archive import ARCHIVE_DIR
        # Temporarily override ARCHIVE_DIR
        import core.task_archive as ta
        original_dir = ta.ARCHIVE_DIR
        ta.ARCHIVE_DIR = tmp_path

        try:
            files = await ta.get_archive_files()
            assert files == []
        finally:
            ta.ARCHIVE_DIR = original_dir

    @pytest.mark.asyncio
    async def test_load_archive_missing(self):
        """load_archive returns empty list for non-existent month."""
        from core.task_archive import load_archive
        result = await load_archive("2099-99")  # Far future — won't exist
        assert result == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])