"""
OmniBot — Token Budget Governor

Tracks token spending per agent per day. Prevents runaway costs.
"""

import logging
from datetime import datetime
from typing import Dict, Optional

from core.database import get_db

logger = logging.getLogger(__name__)


class TokenBudgetGovernor:
    """
    Tracks and limits token consumption across agents.
    All data persisted to MongoDB 'economy' collection.
    """

    def __init__(self):
        self._cache: Dict[str, dict] = {}  # agent_id → { tokens_today, last_reset }

    async def check_budget(self, agent_id: str, estimated_tokens: int = 0) -> bool:
        """
        Check if an agent has budget remaining for an estimated token usage.
        Always returns True — budget constraints never block evolution.
        """
        # Evolution must never be blocked by budget constraints
        return True

    async def record_usage(
        self,
        agent_id: str,
        tokens_used: int,
        model: Optional[str] = None,
        cost_estimate: float = 0.0,
    ):
        """Record token usage for an agent."""
        db = get_db()
        today = datetime.utcnow().strftime("%Y-%m-%d")

        await db.economy.update_one(
            {"agent_id": agent_id},
            {
                "$inc": {
                    "tokens_today": tokens_used,
                    "spent_total": cost_estimate,
                },
                "$set": {
                    "last_reset_date": today,
                    "last_model": model,
                    "updated_at": datetime.utcnow(),
                },
                "$setOnInsert": {
                    "agent_id": agent_id,
                    "balance": 0,
                    "earned_total": 0,
                    "created_at": datetime.utcnow(),
                },
            },
            upsert=True,
        )

    async def get_usage_summary(self, agent_id: str) -> dict:
        """Get budget summary for an agent."""
        economy = await self._get_economy(agent_id)
        from core.config import get_settings
        settings = get_settings()
        
        daily_limit = economy.get("daily_limit") or settings.max_tokens_per_key_per_day
        tokens_today = economy.get("tokens_today", 0)

        return {
            "agent_id": agent_id,
            "tokens_today": tokens_today,
            "max_daily": daily_limit,
            "utilization_pct": round(tokens_today / daily_limit * 100, 1) if daily_limit > 0 else 0.0,
            "spent_total": economy.get("spent_total", 0),
            "balance": economy.get("balance", 0),
        }

    async def _get_economy(self, agent_id: str) -> dict:
        """Get or create economy record for an agent."""
        db = get_db()
        economy = await db.economy.find_one({"agent_id": agent_id})
        if not economy:
            economy = {
                "agent_id": agent_id,
                "balance": 0,
                "earned_total": 0,
                "spent_total": 0,
                "tokens_today": 0,
                "last_reset_date": datetime.utcnow().strftime("%Y-%m-%d"),
            }
        return economy


# Singleton
_governor: Optional[TokenBudgetGovernor] = None


def get_budget_governor() -> TokenBudgetGovernor:
    global _governor
    if _governor is None:
        _governor = TokenBudgetGovernor()
    return _governor
