"""
OmniAgentFactory — Universal AI Task Queue Data Model

Defines the schema for all tasks flowing through the queue system.
Used by the queue engine, API layer, and dashboard for real-time visibility.
"""

from enum import Enum
from datetime import datetime
from typing import Optional, Any, Dict, List
from pydantic import BaseModel, Field
import uuid


class TaskStatus(str, Enum):
    PENDING = "pending"       # في الطابور، لم تبدأ بعد
    RUNNING = "running"       # تعمل الآن
    COMPLETED = "completed"   # اكتملت بنجاح
    FAILED = "failed"         # فشلت
    CANCELLED = "cancelled"   # أُلغيت
    RETRYING = "retrying"     # تُعاد المحاولة


class TaskPriority(int, Enum):
    CRITICAL = 1
    HIGH = 2
    NORMAL = 3
    LOW = 4
    IDLE = 5


class TaskCategory(str, Enum):
    EVOLUTION = "evolution"       # self-evolution tasks
    SWARM = "swarm"               # swarm agent tasks
    MONEY = "money"               # money/revenue agent
    SHOPIFY = "shopify"           # shopify operations
    DEV = "dev"                   # dev loop tasks
    SKILL = "skill"               # skill execution
    HEALTH = "health"             # health/monitor checks
    SCHEDULED = "scheduled"       # cron/scheduler jobs
    MANUAL = "manual"             # user-triggered


class TaskItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    # Identity
    name: str                           # human-readable name
    description: str = ""               # what this task does
    category: TaskCategory
    priority: TaskPriority = TaskPriority.NORMAL

    # Ownership
    created_by: str                     # "scheduler", "user", "evolution_loop", etc.
    assigned_to: str = ""               # which agent/service is executing

    # Status
    status: TaskStatus = TaskStatus.PENDING
    progress_pct: int = 0               # 0-100
    progress_message: str = ""          # e.g. "Analyzing 3 of 10 files..."

    # AI Model Used
    ai_provider: str = ""               # e.g. "groq"
    ai_model: str = ""                  # e.g. "llama-3.3-70b-versatile"
    tokens_used: int = 0

    # Timing
    created_at: datetime = Field(default_factory=datetime.utcnow)
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    estimated_duration_sec: Optional[int] = None

    # Retry
    retry_count: int = 0
    max_retries: int = 3

    # Result
    result_summary: str = ""            # short human-readable result
    result_data: Optional[Dict] = None  # full result payload
    error_message: str = ""
    error_traceback: str = ""

    # Relations
    parent_task_id: Optional[str] = None    # if subtask
    child_task_ids: List[str] = []          # subtasks spawned
    tags: List[str] = []

    # Meta
    input_payload: Optional[Dict] = None
    metadata: Optional[Dict] = None

    def to_dict(self) -> dict:
        """Convert to MongoDB-safe dict, converting enums."""
        d = self.model_dump()
        d["status"] = self.status.value
        d["priority"] = self.priority.value
        d["category"] = self.category.value
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "TaskItem":
        """Reconstruct from MongoDB dict."""
        return cls(
            id=str(data.get("_id", data.get("id", ""))),
            name=data.get("name", ""),
            description=data.get("description", ""),
            category=TaskCategory(data.get("category", "manual")),
            priority=TaskPriority(data.get("priority", 3)),
            created_by=data.get("created_by", "system"),
            assigned_to=data.get("assigned_to", ""),
            status=TaskStatus(data.get("status", "pending")),
            progress_pct=data.get("progress_pct", 0),
            progress_message=data.get("progress_message", ""),
            ai_provider=data.get("ai_provider", ""),
            ai_model=data.get("ai_model", ""),
            tokens_used=data.get("tokens_used", 0),
            created_at=data.get("created_at", datetime.utcnow()),
            queued_at=data.get("queued_at"),
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
            estimated_duration_sec=data.get("estimated_duration_sec"),
            retry_count=data.get("retry_count", 0),
            max_retries=data.get("max_retries", 3),
            result_summary=data.get("result_summary", ""),
            result_data=data.get("result_data"),
            error_message=data.get("error_message", ""),
            error_traceback=data.get("error_traceback", ""),
            parent_task_id=data.get("parent_task_id"),
            child_task_ids=data.get("child_task_ids", []),
            tags=data.get("tags", []),
            input_payload=data.get("input_payload"),
            metadata=data.get("metadata"),
        )


class QueueSnapshot(BaseModel):
    """What the dashboard receives in real-time."""
    total_pending: int
    total_running: int
    total_completed_today: int
    total_failed_today: int
    tasks: List[TaskItem]
    queue_health: str  # "healthy" | "backed_up" | "stalled"
    avg_wait_time_sec: float
    avg_execution_time_sec: float
    last_updated: datetime = Field(default_factory=datetime.utcnow)


class QueueStats(BaseModel):
    """Aggregated statistics for the queue."""
    total_all_time: int = 0
    total_today: int = 0
    total_this_week: int = 0
    by_category: Dict[str, int] = {}
    by_status: Dict[str, int] = {}
    avg_completion_time_sec: float = 0.0
    avg_wait_time_sec: float = 0.0
    success_rate_pct: float = 100.0
    peak_queue_depth: int = 0
    total_tokens_used: int = 0
    last_updated: datetime = Field(default_factory=datetime.utcnow)