"""
OmniBot — Factory Mirror (Phase 2: Self-Awareness Layer)

The factory answers questions about itself:
  - Which agent improved the most in the last 24 hours?
  - Which evolution strategy is working best right now?
  - Is the factory getting better at making agents over time?
  - What is the most common failure pattern across all agents?
  - If forced to shut down in 10 minutes, which agents should be saved?

Results cached in MongoDB for 30 minutes.
Exposed via GET /api/factory/mirror.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from core.model_router import call_model

logger = logging.getLogger(__name__)

CACHE_TTL_MINUTES = 30


class FactoryMirror:
    """
    Generates LLM-powered self-awareness insights about the factory's state.
    All methods cache their results in MongoDB to avoid redundant LLM calls.
    """

    async def get_mirror(self, db) -> dict:
        """
        Return all 5 self-awareness insights, using cache when available.
        Cache TTL = 30 minutes.
        """
        cached = await db.factory_mirror_cache.find_one({"_id": "mirror_snapshot"})
        if cached:
            age = datetime.utcnow() - cached.get("generated_at", datetime.min)
            if age < timedelta(minutes=CACHE_TTL_MINUTES):
                return cached.get("insights", {})

        insights = await self._generate_all_insights(db)

        await db.factory_mirror_cache.update_one(
            {"_id": "mirror_snapshot"},
            {"$set": {"insights": insights, "generated_at": datetime.utcnow()}},
            upsert=True,
        )

        return insights

    async def _generate_all_insights(self, db) -> dict:
        """Generate all 5 insight answers using LLM + MongoDB stats."""
        stats = await self._gather_factory_stats(db)

        results = {}
        questions = [
            ("top_improver", "Which agent improved the most in the last 24 hours?"),
            ("best_strategy", "Which evolution strategy is working best right now?"),
            ("factory_trajectory", "Is the factory getting better at making agents over time?"),
            ("common_failure", "What is the most common failure pattern across all agents?"),
            ("save_priority", "If forced to shut down in 10 minutes, which agents should be saved first and why?"),
        ]

        for key, question in questions:
            try:
                answer = await self._ask_mirror_question(question, stats)
                results[key] = {
                    "question": question,
                    "answer": answer,
                    "generated_at": datetime.utcnow().isoformat(),
                }
            except Exception as e:
                logger.debug("[MIRROR] Failed to answer '%s': %s", question, e)
                results[key] = {
                    "question": question,
                    "answer": "Insufficient data to answer this question yet.",
                    "generated_at": datetime.utcnow().isoformat(),
                }

        return results

    async def _ask_mirror_question(self, question: str, stats: dict) -> str:
        """Ask the LLM a self-awareness question using factory stats as context."""
        messages = [
            {
                "role": "system",
                "content": (
                    "You are the self-awareness module of an AI agent factory. "
                    "You analyze factory statistics and provide concise, insightful answers. "
                    "Keep answers to 2-3 sentences. Be specific — cite agent names, scores, or numbers where available."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Factory Statistics:\n{_format_stats(stats)}\n\n"
                    f"Question: {question}"
                ),
            },
        ]

        return await call_model(messages, task_type="fast")

    async def _gather_factory_stats(self, db) -> dict:
        """Collect raw statistics from MongoDB to feed into the mirror questions."""
        stats = {}
        now = datetime.utcnow()
        yesterday = now - timedelta(hours=24)

        try:
            # All active agents
            agents = await db.agents.find(
                {"status": {"$nin": ["extinct", "ghost"]}},
            ).sort("score", -1).to_list(50)
            stats["agents"] = [
                {
                    "id": a.get("id", "")[:8],
                    "name": a.get("name", "?"),
                    "score": round(a.get("score", 0), 3),
                    "version": a.get("version", 0),
                    "status": a.get("status", "?"),
                }
                for a in agents
            ]
        except Exception:
            stats["agents"] = []

        try:
            # Score improvements in last 24 hours via snapshots
            recent_snaps = await db.snapshots.find(
                {"committed_at": {"$gte": yesterday}},
            ).sort("committed_at", -1).to_list(100)
            improvement_map: dict[str, float] = {}
            for snap in recent_snaps:
                aid = snap.get("agent_id", "")[:8]
                delta = snap.get("performance_score", 0) - snap.get("previous_score", 0)
                improvement_map[aid] = improvement_map.get(aid, 0) + delta
            stats["improvements_24h"] = sorted(
                [{"agent_id": k, "delta": round(v, 4)} for k, v in improvement_map.items()],
                key=lambda x: x["delta"], reverse=True,
            )[:5]
        except Exception:
            stats["improvements_24h"] = []

        try:
            # Autopsy failure modes (most common)
            pipeline = [
                {"$group": {"_id": "$failure_mode", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 5},
            ]
            failure_modes = await db.prompt_autopsies.aggregate(pipeline).to_list(5)
            stats["failure_modes"] = [{"mode": r["_id"], "count": r["count"]} for r in failure_modes]
        except Exception:
            stats["failure_modes"] = []

        try:
            # Factory meta scores (if meta_improver is running)
            meta_scores = await db.factory_meta_scores.find().sort("timestamp", -1).limit(10).to_list(10)
            if meta_scores:
                avg_improvement = sum(m.get("avg_improvement_rate", 0) for m in meta_scores) / len(meta_scores)
                stats["factory_meta_trend"] = {
                    "recent_avg_improvement": round(avg_improvement, 5),
                    "data_points": len(meta_scores),
                }
        except Exception:
            stats["factory_meta_trend"] = {}

        try:
            # ROI rankings
            from core.roi_tracker import get_factory_roi_rankings
            stats["roi_rankings"] = await get_factory_roi_rankings(db, limit=5)
        except Exception:
            stats["roi_rankings"] = []

        try:
            stats["total_agents"] = await db.agents.count_documents({})
            stats["active_evolutions"] = await db.agents.count_documents({"status": "evolving"})
            stats["ghost_agents"] = await db.agents.count_documents({"status": "ghost"})
        except Exception:
            stats["total_agents"] = 0
            stats["active_evolutions"] = 0
            stats["ghost_agents"] = 0

        return stats


def _format_stats(stats: dict) -> str:
    """Convert stats dict to a readable text block for the LLM prompt."""
    lines = []

    agents = stats.get("agents", [])
    if agents:
        lines.append(f"Agents (top by score):")
        for a in agents[:10]:
            lines.append(f"  {a['name']} (id={a['id']}) score={a['score']} v{a['version']} [{a['status']}]")

    improvements = stats.get("improvements_24h", [])
    if improvements:
        lines.append(f"Top improvements in 24h:")
        for i in improvements:
            lines.append(f"  Agent {i['agent_id']}: +{i['delta']}")

    failure_modes = stats.get("failure_modes", [])
    if failure_modes:
        lines.append(f"Most common failure modes:")
        for f in failure_modes:
            lines.append(f"  {f['mode']}: {f['count']} occurrences")

    roi = stats.get("roi_rankings", [])
    if roi:
        lines.append(f"Top ROI agents:")
        for r in roi:
            lines.append(f"  {r['agent_id']}: ROI={r['avg_roi']:.4f} over {r['cycles']} cycles")

    meta = stats.get("factory_meta_trend", {})
    if meta:
        lines.append(f"Factory meta trend: avg_improvement={meta.get('recent_avg_improvement', 0):.5f} over {meta.get('data_points', 0)} samples")

    lines.append(f"Total agents: {stats.get('total_agents', 0)}, Active: {stats.get('active_evolutions', 0)}, Ghosts: {stats.get('ghost_agents', 0)}")

    return "\n".join(lines) if lines else "No factory data available yet."


# ── Singleton ────────────────────────────────────────────────────────────────

_mirror: Optional[FactoryMirror] = None


def get_factory_mirror() -> FactoryMirror:
    global _mirror
    if _mirror is None:
        _mirror = FactoryMirror()
    return _mirror
