"""
OmniAgentFactory — Task Factory

Pre-built task constructors for all system categories.
Simplifies creating TaskItem objects for enqueuing.
"""

from datetime import datetime
from models.task_queue import (
    TaskItem, TaskCategory, TaskPriority
)


def make_evolution_task(
    name: str = "",
    description: str = "",
    priority: TaskPriority = TaskPriority.NORMAL,
    **kwargs
) -> TaskItem:
    """Create a task for the evolution system."""
    return TaskItem(
        name=name or f"Evolution Cycle #{datetime.utcnow().strftime('%H%M%S')}",
        description=description or "Run autonomous evolution cycle",
        category=TaskCategory.EVOLUTION,
        priority=priority,
        created_by="evolution_loop",
        assigned_to="evolution_loop",
        **kwargs,
    )


def make_swarm_task(
    swarm_agent: str,
    goal: str,
    priority: TaskPriority = TaskPriority.NORMAL,
    **kwargs
) -> TaskItem:
    """Create a task for a swarm agent."""
    return TaskItem(
        name=f"Swarm: {swarm_agent} — {goal[:50]}",
        description=goal,
        category=TaskCategory.SWARM,
        priority=priority,
        created_by="swarm_orchestrator",
        assigned_to=f"swarm_{swarm_agent}",
        tags=[swarm_agent],
        **kwargs,
    )


def make_shopify_task(
    operation: str,
    payload: dict = None,
    priority: TaskPriority = TaskPriority.HIGH,
    **kwargs
) -> TaskItem:
    """Create a task for Shopify operations."""
    return TaskItem(
        name=f"Shopify: {operation}",
        description=f"Shopify operation: {operation}",
        category=TaskCategory.SHOPIFY,
        priority=priority,
        created_by="shopify_service",
        assigned_to="shopify_service",
        input_payload=payload or {},
        **kwargs,
    )


def make_health_check_task(
    priority: TaskPriority = TaskPriority.IDLE,
    **kwargs
) -> TaskItem:
    """Create a health check task."""
    return TaskItem(
        name=f"Health Check #{datetime.utcnow().strftime('%H:%M')}",
        description="Run system health checks on all AI providers",
        category=TaskCategory.HEALTH,
        priority=priority,
        created_by="ai_health_monitor",
        assigned_to="ai_health_monitor",
        **kwargs,
    )


def make_skill_task(
    skill_name: str,
    inputs: dict = None,
    priority: TaskPriority = TaskPriority.NORMAL,
    **kwargs
) -> TaskItem:
    """Create a task for skill execution."""
    return TaskItem(
        name=f"Skill: {skill_name}",
        description=f"Execute skill: {skill_name}",
        category=TaskCategory.SKILL,
        priority=priority,
        created_by="skill_executor",
        assigned_to="skill_executor",
        input_payload=inputs or {},
        tags=[skill_name],
        **kwargs,
    )


def make_money_task(
    action: str,
    priority: TaskPriority = TaskPriority.NORMAL,
    **kwargs
) -> TaskItem:
    """Create a task for the money/revenue agent."""
    return TaskItem(
        name=f"Money Agent: {action}",
        description=f"Money agent action: {action}",
        category=TaskCategory.MONEY,
        priority=priority,
        created_by="money_agent",
        assigned_to="money_agent",
        **kwargs,
    )


def make_dev_task(
    description: str,
    priority: TaskPriority = TaskPriority.NORMAL,
    **kwargs
) -> TaskItem:
    """Create a task for the dev loop."""
    return TaskItem(
        name=f"Dev: {description[:50]}",
        description=description,
        category=TaskCategory.DEV,
        priority=priority,
        created_by="dev_loop",
        assigned_to="dev_loop",
        **kwargs,
    )


def make_scheduled_task(
    job_name: str,
    description: str = "",
    priority: TaskPriority = TaskPriority.NORMAL,
    **kwargs
) -> TaskItem:
    """Create a task for a scheduled job."""
    return TaskItem(
        name=f"Scheduled: {job_name}",
        description=description or f"Scheduled job: {job_name}",
        category=TaskCategory.SCHEDULED,
        priority=priority,
        created_by="scheduler",
        assigned_to="scheduler",
        **kwargs,
    )


def make_manual_task(
    task_name: str,
    description: str = "",
    tools: list = None,
    priority: TaskPriority = TaskPriority.NORMAL,
    **kwargs
) -> TaskItem:
    """Create a user-triggered task."""
    return TaskItem(
        name=task_name,
        description=description or task_name,
        category=TaskCategory.MANUAL,
        priority=priority,
        created_by="user",
        assigned_to="agent_loop",
        tags=tools or [],
        **kwargs,
    )