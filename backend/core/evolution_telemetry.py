"""
Evolution engine telemetry and performance tracking.
Monitors self-evolution cycles and reports on system improvement metrics.
"""

import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict

logger = logging.getLogger(__name__)


class EvolutionTelemetry:
    """Track evolution cycle metrics and performance."""

    def __init__(self):
        self.cycles: List[Dict[str, Any]] = []
        self.agent_improvements: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {
                "total_improvements": 0,
                "successful_cycles": 0,
                "failed_cycles": 0,
                "rollback_count": 0,
                "avg_cycle_time_sec": 0,
                "improvement_direction": "unknown",
            }
        )
        self.total_tokens_consumed = 0
        self.total_patches_applied = 0
        self.start_time = datetime.utcnow()

    def record_cycle(
        self,
        cycle_num: int,
        agent_id: str,
        success: bool,
        duration_seconds: float,
        tokens_consumed: int = 0,
        patches_applied: int = 0,
        improvement_direction: str = "unknown",
        error: Optional[str] = None,
    ):
        """Record a completed evolution cycle."""
        entry = {
            "cycle": cycle_num,
            "agent_id": agent_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "success": success,
            "duration_seconds": duration_seconds,
            "tokens_consumed": tokens_consumed,
            "patches_applied": patches_applied,
            "improvement_direction": improvement_direction,
            "error": error,
        }

        self.cycles.append(entry)
        self.total_tokens_consumed += tokens_consumed
        self.total_patches_applied += patches_applied

        # Update agent metrics
        agent_stats = self.agent_improvements[agent_id]
        if success:
            agent_stats["successful_cycles"] += 1
            agent_stats["total_improvements"] += patches_applied
            agent_stats["improvement_direction"] = improvement_direction
        else:
            agent_stats["failed_cycles"] += 1
            if error and "rollback" in error.lower():
                agent_stats["rollback_count"] += 1

        # Update average cycle time
        agent_cycles = [
            c["duration_seconds"]
            for c in self.cycles
            if c["agent_id"] == agent_id
        ]
        if agent_cycles:
            agent_stats["avg_cycle_time_sec"] = sum(agent_cycles) / len(agent_cycles)

    def get_agent_metrics(self, agent_id: str) -> Dict[str, Any]:
        """Get metrics for a specific agent."""
        stats = self.agent_improvements.get(agent_id, {})
        cycles = [c for c in self.cycles if c["agent_id"] == agent_id]

        success_rate = (
            (stats["successful_cycles"] / len(cycles) * 100)
            if cycles
            else 0
        )

        return {
            "agent_id": agent_id,
            "total_cycles": len(cycles),
            "successful_cycles": stats["successful_cycles"],
            "failed_cycles": stats["failed_cycles"],
            "rollback_count": stats["rollback_count"],
            "total_improvements": stats["total_improvements"],
            "success_rate_pct": round(success_rate, 1),
            "avg_cycle_time_sec": round(stats["avg_cycle_time_sec"], 2),
            "last_improvement_direction": stats["improvement_direction"],
        }

    def get_system_metrics(self) -> Dict[str, Any]:
        """Get overall system evolution metrics."""
        uptime = datetime.utcnow() - self.start_time
        total_agents = len(self.agent_improvements)
        total_cycles = len(self.cycles)
        successful_cycles = sum(1 for c in self.cycles if c["success"])

        success_rate = (
            (successful_cycles / total_cycles * 100) if total_cycles > 0 else 0
        )

        avg_cycle_time = (
            sum(c["duration_seconds"] for c in self.cycles) / total_cycles
            if total_cycles > 0
            else 0
        )

        return {
            "uptime_seconds": int(uptime.total_seconds()),
            "total_agents": total_agents,
            "total_cycles": total_cycles,
            "successful_cycles": successful_cycles,
            "failed_cycles": total_cycles - successful_cycles,
            "success_rate_pct": round(success_rate, 1),
            "avg_cycle_time_sec": round(avg_cycle_time, 2),
            "total_tokens_consumed": self.total_tokens_consumed,
            "total_patches_applied": self.total_patches_applied,
            "tokens_per_improvement": (
                self.total_tokens_consumed / self.total_patches_applied
                if self.total_patches_applied > 0
                else 0
            ),
        }

    def get_improvement_trend(self, agent_id: str, window_size: int = 10) -> Dict[str, Any]:
        """Get improvement trend for agent (recent cycles)."""
        agent_cycles = [
            c for c in self.cycles[-window_size:] if c["agent_id"] == agent_id
        ]

        if not agent_cycles:
            return {"trend": "no_data", "cycles_analyzed": 0}

        improvements = [c["patches_applied"] for c in agent_cycles]
        success_count = sum(1 for c in agent_cycles if c["success"])

        trend = "improving"
        if len(improvements) > 1:
            recent = sum(improvements[-3:]) / 3 if len(improvements) >= 3 else improvements[-1]
            older = sum(improvements[:-3]) / (len(improvements) - 3) if len(improvements) > 3 else improvements[0]
            if recent < older * 0.8:
                trend = "degrading"
            elif recent > older * 1.2:
                trend = "improving"
            else:
                trend = "stable"

        return {
            "agent_id": agent_id,
            "trend": trend,
            "cycles_analyzed": len(agent_cycles),
            "recent_improvements": improvements[-3:],
            "success_rate_pct": (success_count / len(agent_cycles) * 100),
            "avg_improvements_per_cycle": (
                sum(improvements) / len(improvements) if improvements else 0
            ),
        }

    def get_recent_cycles(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent evolution cycles."""
        return self.cycles[-limit:]

    def export_summary(self) -> str:
        """Export telemetry as markdown summary."""
        metrics = self.get_system_metrics()

        summary = [
            "# Evolution Telemetry Summary",
            "",
            f"**Uptime:** {metrics['uptime_seconds']}s",
            f"**Total Agents:** {metrics['total_agents']}",
            f"**Total Cycles:** {metrics['total_cycles']}",
            f"**Success Rate:** {metrics['success_rate_pct']}%",
            f"**Avg Cycle Time:** {metrics['avg_cycle_time_sec']}s",
            f"**Total Improvements:** {metrics['total_patches_applied']}",
            f"**Tokens Consumed:** {metrics['total_tokens_consumed']}",
            "",
            "## By Agent",
            "",
        ]

        for agent_id, stats in sorted(self.agent_improvements.items()):
            agent_metrics = self.get_agent_metrics(agent_id)
            summary.append(f"### {agent_id}")
            summary.append(f"- Cycles: {agent_metrics['total_cycles']}")
            summary.append(f"- Success Rate: {agent_metrics['success_rate_pct']}%")
            summary.append(f"- Improvements: {agent_metrics['total_improvements']}")
            summary.append(f"- Avg Time: {agent_metrics['avg_cycle_time_sec']}s")
            summary.append("")

        return "\n".join(summary)


# Global telemetry instance
_telemetry = EvolutionTelemetry()


def get_telemetry() -> EvolutionTelemetry:
    """Get the global telemetry instance."""
    return _telemetry


def record_evolution_cycle(
    cycle_num: int,
    agent_id: str,
    success: bool,
    duration_seconds: float,
    tokens_consumed: int = 0,
    patches_applied: int = 0,
    improvement_direction: str = "unknown",
    error: Optional[str] = None,
):
    """Record an evolution cycle to telemetry."""
    _telemetry.record_cycle(
        cycle_num,
        agent_id,
        success,
        duration_seconds,
        tokens_consumed,
        patches_applied,
        improvement_direction,
        error,
    )
