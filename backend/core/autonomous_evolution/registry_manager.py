"""
Registry Manager — Dual-Registry Memory System (MongoDB + Markdown Sync)
Manages EVOLUTION_IDEAS_REGISTRY.md and PROBLEMS_REGISTRY.md
This is the system's persistent memory — do not lose or corrupt these records.
"""
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class RegistryManager:
    """Manages idea and problem registries with MongoDB persistence and Markdown export."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.ideas_col = db["evolution_ideas_registry"]
        self.problems_col = db["problems_registry"]
        self.registry_dir = Path(".")

    # ===== IDEAS MANAGEMENT =====

    async def register_idea(self, idea: dict) -> str:
        """Register a new idea and return its ID."""
        try:
            count = await self.ideas_col.count_documents({})
            idea_id = f"IDEA-{count + 1:03d}"

            doc = {
                "id": idea_id,
                "title": idea.get("title", "Untitled"),
                "description": idea.get("description", ""),
                "source": idea.get("source", "autonomous_engine"),
                "status": "pending",
                "impact": idea.get("impact", "medium"),
                "feasibility": idea.get("feasibility", "medium"),
                "category": idea.get("category", "evolution"),
                "estimated_files": idea.get("estimated_files", []),
                "council_verdict": idea.get("council_verdict", {}),
                "created_at": datetime.now().isoformat(),
                "implemented_at": None,
                "files_changed": [],
                "outcome": None,
            }

            await self.ideas_col.insert_one(doc)
            await self._update_markdown("ideas")
            logger.info(f"📝 Registered idea: {idea_id} — {idea.get('title')}")
            return idea_id
        except Exception as e:
            logger.error(f"Failed to register idea: {e}")
            raise

    async def get_implemented_ideas(self, limit: int = 50) -> List[dict]:
        """Get all implemented or rejected ideas."""
        try:
            cursor = self.ideas_col.find(
                {"status": {"$in": ["implemented", "rejected"]}},
                {"_id": 0}
            ).sort("created_at", -1).limit(limit)
            return await cursor.to_list(length=limit)
        except Exception as e:
            logger.error(f"Failed to get implemented ideas: {e}")
            return []

    async def filter_duplicate_ideas(self, ideas: List[dict]) -> List[dict]:
        """Filter out duplicate ideas using keyword overlap detection."""
        try:
            existing = await self.ideas_col.find(
                {},
                {"_id": 0, "title": 1}
            ).to_list(None)
            existing_titles = [e.get("title", "").lower() for e in existing]

            filtered = []
            for idea in ideas:
                title_lower = idea.get("title", "").lower()
                keywords = set(title_lower.split())

                is_duplicate = False
                for existing_title in existing_titles:
                    existing_keywords = set(existing_title.split())
                    overlap = len(keywords & existing_keywords)
                    max_keys = max(len(keywords), len(existing_keywords), 1)
                    if overlap / max_keys > 0.6:  # 60% overlap = duplicate
                        is_duplicate = True
                        logger.info(f"🚫 Filtered duplicate idea: {idea.get('title')}")
                        break

                if not is_duplicate:
                    filtered.append(idea)

            return filtered
        except Exception as e:
            logger.error(f"Failed to filter duplicates: {e}")
            return ideas

    async def mark_idea_implemented(self, idea_id: str, files_changed: List[str], outcome: str):
        """Mark an idea as implemented."""
        try:
            await self.ideas_col.update_one(
                {"id": idea_id},
                {"$set": {
                    "status": "implemented",
                    "implemented_at": datetime.now().isoformat(),
                    "files_changed": files_changed,
                    "outcome": outcome
                }}
            )
            await self._update_markdown("ideas")
            logger.info(f"✅ Idea {idea_id} marked as implemented")
        except Exception as e:
            logger.error(f"Failed to mark idea implemented: {e}")

    async def mark_idea_rejected(self, idea_id: str, reason: str):
        """Mark an idea as rejected."""
        try:
            await self.ideas_col.update_one(
                {"id": idea_id},
                {"$set": {
                    "status": "rejected",
                    "outcome": reason
                }}
            )
            await self._update_markdown("ideas")
            logger.info(f"❌ Idea {idea_id} marked as rejected: {reason}")
        except Exception as e:
            logger.error(f"Failed to mark idea rejected: {e}")

    # ===== PROBLEMS MANAGEMENT =====

    async def register_problem(self, problem: dict) -> str:
        """Register a new problem and return its ID."""
        try:
            count = await self.problems_col.count_documents({})
            prob_id = f"PROB-{count + 1:03d}"

            doc = {
                "id": prob_id,
                "title": problem.get("title", "Untitled"),
                "description": problem.get("description", ""),
                "location": problem.get("location", "unknown"),
                "severity": problem.get("severity", "medium"),
                "root_cause": problem.get("root_cause", ""),
                "proposed_solution": problem.get("proposed_solution", ""),
                "category": problem.get("category", "reliability"),
                "status": "in_progress",
                "council_verdict": problem.get("council_verdict", {}),
                "created_at": datetime.now().isoformat(),
                "solved_at": None,
                "solution_applied": None,
                "files_changed": [],
                "verified": False,
            }

            await self.problems_col.insert_one(doc)
            await self._update_markdown("problems")
            logger.info(f"🔴 Registered problem: {prob_id} — {problem.get('title')}")
            return prob_id
        except Exception as e:
            logger.error(f"Failed to register problem: {e}")
            raise

    async def get_solved_problems(self, limit: int = 50) -> List[dict]:
        """Get all solved problems."""
        try:
            cursor = self.problems_col.find(
                {"status": "solved"},
                {"_id": 0}
            ).sort("solved_at", -1).limit(limit)
            return await cursor.to_list(length=limit)
        except Exception as e:
            logger.error(f"Failed to get solved problems: {e}")
            return []

    async def filter_known_problems(self, problems: List[dict]) -> List[dict]:
        """Filter out problems we've already seen."""
        try:
            known = await self.problems_col.find({}, {"_id": 0, "title": 1}).to_list(None)
            known_titles = [k.get("title", "").lower() for k in known]

            filtered = []
            for prob in problems:
                title_lower = prob.get("title", "").lower()
                keywords = set(title_lower.split())

                is_known = False
                for known_title in known_titles:
                    known_keywords = set(known_title.split())
                    overlap = len(keywords & known_keywords)
                    max_keys = max(len(keywords), len(known_keywords), 1)
                    if overlap / max_keys > 0.5:  # 50% overlap = known
                        is_known = True
                        logger.info(f"⏭️ Skipped known problem: {prob.get('title')}")
                        break

                if not is_known:
                    filtered.append(prob)

            return filtered
        except Exception as e:
            logger.error(f"Failed to filter known problems: {e}")
            return problems

    async def mark_problem_solved(self, prob_id: str, solution: str, files: List[str], verified: bool = False):
        """Mark a problem as solved."""
        try:
            await self.problems_col.update_one(
                {"id": prob_id},
                {"$set": {
                    "status": "solved",
                    "solved_at": datetime.now().isoformat(),
                    "solution_applied": solution,
                    "files_changed": files,
                    "verified": verified
                }}
            )
            await self._update_markdown("problems")
            logger.info(f"✅ Problem {prob_id} marked as solved")
        except Exception as e:
            logger.error(f"Failed to mark problem solved: {e}")

    # ===== STATS =====

    async def get_stats(self) -> dict:
        """Get registry statistics."""
        try:
            total_ideas = await self.ideas_col.count_documents({})
            impl_ideas = await self.ideas_col.count_documents({"status": "implemented"})
            total_probs = await self.problems_col.count_documents({})
            solved_probs = await self.problems_col.count_documents({"status": "solved"})

            return {
                "total_ideas": total_ideas,
                "implemented_ideas": impl_ideas,
                "total_problems": total_probs,
                "solved_problems": solved_probs,
                "idea_success_rate": (impl_ideas / max(total_ideas, 1)) * 100,
                "problem_resolution_rate": (solved_probs / max(total_probs, 1)) * 100,
            }
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            return {}

    # ===== MARKDOWN SYNC =====

    async def _update_markdown(self, registry_type: str):
        """Sync MongoDB to Markdown file."""
        try:
            if registry_type == "ideas":
                await self._sync_ideas_markdown()
            elif registry_type == "problems":
                await self._sync_problems_markdown()
        except Exception as e:
            logger.error(f"Failed to update markdown: {e}")

    async def _sync_ideas_markdown(self):
        """Sync ideas to EVOLUTION_IDEAS_REGISTRY.md"""
        try:
            docs = await self.ideas_col.find({}, {"_id": 0}).sort("created_at", -1).to_list(None)

            lines = [
                "# EVOLUTION IDEAS REGISTRY\n",
                "\n",
                "| ID | الفكرة | المصدر | الحالة | التأثير | قابلية التنفيذ | تاريخ الإضافة | تاريخ التنفيذ | الملفات المتأثرة | النتيجة |\n",
                "|--|----|-----|------|------|------|------|------|---|---|\n",
            ]

            for d in docs:
                impl_date = d.get("implemented_at", "—")
                if impl_date != "—":
                    impl_date = impl_date[:10]
                outcome = d.get("outcome", "—")
                if outcome and len(outcome) > 50:
                    outcome = outcome[:50] + "..."
                lines.append(
                    f"| {d.get('id')} | {d.get('title')} | {d.get('source')} | "
                    f"{d.get('status')} | {d.get('impact')} | {d.get('feasibility')} | "
                    f"{d.get('created_at', '')[:10]} | {impl_date} | "
                    f"{', '.join(d.get('estimated_files', [])[:3])} | {outcome} |\n"
                )

            Path("EVOLUTION_IDEAS_REGISTRY.md").write_text("".join(lines), encoding="utf-8")
            logger.debug("💾 Synced ideas to Markdown")
        except Exception as e:
            logger.error(f"Failed to sync ideas markdown: {e}")

    async def _sync_problems_markdown(self):
        """Sync problems to PROBLEMS_REGISTRY.md"""
        try:
            docs = await self.problems_col.find({}, {"_id": 0}).sort("created_at", -1).to_list(None)

            lines = [
                "# PROBLEMS REGISTRY\n",
                "\n",
                "| ID | المشكلة | التشخيص | الحل المنفذ | الملفات | تاريخ الاكتشاف | تاريخ الحل | حالة التحقق |\n",
                "|--|----|-----|-----|---|-----|------|----|\n",
            ]

            for d in docs:
                solved_date = d.get("solved_at", "—")
                if solved_date != "—":
                    solved_date = solved_date[:10]
                verified = "✅ verified" if d.get("verified") else "⏳ pending"
                diagnosis = d.get("root_cause", "")[:30]
                solution = d.get("solution_applied", "")[:30]
                lines.append(
                    f"| {d.get('id')} | {d.get('title')} | {diagnosis} | {solution} | "
                    f"{', '.join(d.get('files_changed', [])[:2])} | {d.get('created_at', '')[:10]} | "
                    f"{solved_date} | {verified} |\n"
                )

            Path("PROBLEMS_REGISTRY.md").write_text("".join(lines), encoding="utf-8")
            logger.debug("💾 Synced problems to Markdown")
        except Exception as e:
            logger.error(f"Failed to sync problems markdown: {e}")
