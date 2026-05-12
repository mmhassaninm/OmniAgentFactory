"""
Skill Gap Detector — analyzes failed agent tasks and identifies missing skills.
Triggers automatic skill creation when a task fails due to missing capabilities.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from core.database import get_db

logger = logging.getLogger(__name__)

# Known skill names for deduplication
BUILT_IN_SKILLS = {"web_search", "file_manager", "shopify_ops", "paypal_tracker", "code_runner"}


class SkillGapDetector:
    """
    Analyzes failed tasks and detects skill gaps.
    Logs gaps to MongoDB and prevents duplicate logging.
    """

    async def analyze_failure(self, task: str, failure_reason: str, user_id: str = "system") -> Optional[dict[str, Any]]:
        """
        Analyze a task failure to detect if it's caused by a missing skill.

        Args:
            task: The task that failed
            failure_reason: The error or failure reason
            user_id: User who submitted the task

        Returns:
            Skill gap entry if detected, None otherwise
        """
        # Check if the failure indicates a missing skill
        gap = self._detect_gap(task, failure_reason)
        if not gap:
            return None

        # Deduplicate
        db = get_db()
        existing = await db.skill_gaps.find_one({
            "task_type": gap["task_type"],
            "status": {"$in": ["open", "in_progress"]},
        })
        if existing:
            logger.info("[SkillGapDetector] Gap already logged for task type: %s", gap["task_type"])
            return None

        # Log to MongoDB
        gap["user_id"] = user_id
        gap["created_at"] = datetime.now(timezone.utc).isoformat()
        gap["status"] = "open"
        await db.skill_gaps.insert_one(gap)
        logger.info("[SkillGapDetector] New skill gap detected: %s", gap["skill_name"])
        return gap

    def _detect_gap(self, task: str, failure_reason: str) -> Optional[dict[str, Any]]:
        """
        Detect if the failure matches a known gap pattern.
        Returns gap info or None.
        """
        task_lower = task.lower()
        failure_lower = failure_reason.lower()

        # Pattern: web search failed
        if any(w in task_lower for w in ["search", "find", "look up", "google", "research"]):
            if "no skill" in failure_lower or "not found" in failure_lower:
                return {
                    "task_type": "web_search",
                    "skill_name": "web_search",
                    "description": "Web search capability needed",
                    "trigger": task[:200],
                }

        # Pattern: file operations
        if any(w in task_lower for w in ["read file", "write file", "save", "create file"]):
            if "no skill" in failure_lower or "cannot" in failure_lower:
                return {
                    "task_type": "file_operations",
                    "skill_name": "file_manager",
                    "description": "File read/write capability needed",
                    "trigger": task[:200],
                }

        # Pattern: Shopify operations
        if any(w in task_lower for w in ["shopify", "product", "store", "order"]):
            if "no skill" in failure_lower or "cannot access" in failure_lower:
                return {
                    "task_type": "shopify_ops",
                    "skill_name": "shopify_ops",
                    "description": "Shopify API operations needed",
                    "trigger": task[:200],
                }

        # Pattern: payment / revenue
        if any(w in task_lower for w in ["paypal", "payment", "revenue", "earnings", "balance"]):
            if "no skill" in failure_lower or "cannot connect" in failure_lower:
                return {
                    "task_type": "payment_tracking",
                    "skill_name": "paypal_tracker",
                    "description": "Payment/income tracking needed",
                    "trigger": task[:200],
                }

        # Generic: no skill available
        if "no skill" in failure_lower or "no tool" in failure_lower:
            return {
                "task_type": "generic",
                "skill_name": f"auto_skill_{datetime.now(timezone.utc).timestamp():.0f}",
                "description": f"Missing skill for: {task[:100]}",
                "trigger": task[:200],
            }

        return None

    async def get_open_gaps(self, limit: int = 10) -> list[dict[str, Any]]:
        """Get unresolved skill gaps, ordered by most recent."""
        db = get_db()
        gaps = await db.skill_gaps.find({"status": "open"}).sort("created_at", -1).to_list(limit)
        for g in gaps:
            g["_id"] = str(g["_id"])
        return gaps

    async def mark_resolved(self, gap_id: str) -> None:
        """Mark a skill gap as resolved."""
        from bson.objectid import ObjectId
        db = get_db()
        await db.skill_gaps.update_one(
            {"_id": ObjectId(gap_id)},
            {"$set": {"status": "resolved", "resolved_at": datetime.now(timezone.utc).isoformat()}},
        )


# Singleton
_gap_instance: Optional[SkillGapDetector] = None


def get_skill_gap_detector() -> SkillGapDetector:
    """Get or create the singleton SkillGapDetector."""
    global _gap_instance
    if _gap_instance is None:
        _gap_instance = SkillGapDetector()
    return _gap_instance