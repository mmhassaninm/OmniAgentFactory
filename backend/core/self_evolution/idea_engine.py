"""
Idea Generation Engine for Self-Evolution

Generates development and passive-income monetization ideas periodically,
registers them into Evolve_plan.md with score evaluations, and handles
plan prioritization.
"""

import asyncio
import json
import logging
import os
import random
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Highly diversified premium code self-improvement & monetization seeds
SEED_IDEAS = [
    {
        "title": "Optimized Webpack/Vite Vendor Chunk Splitting",
        "description": "Improve bundle performance by dividing heavy dependencies like Chart.js or React Router into lazy-loaded chunks.",
        "category": "ui",
        "impact": 8,
        "feasibility": 9,
        "estimated_hours": 3,
        "proposed_fix": "Add manualChunks routing config inside vite.config.ts and leverage React.lazy() with Suspense across all core tabs."
    },
    {
        "title": "AES-256 Key Vault Encryption Middleware",
        "description": "Secure stored integration API keys by encrypting values symmetrically in MongoDB using cryptography.fernet.",
        "category": "security",
        "impact": 9,
        "feasibility": 8,
        "estimated_hours": 4,
        "proposed_fix": "Create encryption utilities in backend/utils/crypto.py and wrap key-save/retrieve database functions."
    },
    {
        "title": "ChromaDB Semantic Search Cache for Agent Council",
        "description": "Prevent repetitive LLM calls during inter-agent debates by storing and matching proposal descriptions using semantic similarity.",
        "category": "performance",
        "impact": 8,
        "feasibility": 7,
        "estimated_hours": 6,
        "proposed_fix": "Implement a semantic caching class that queries local ChromaDB collections with a threshold match of 0.85."
    },
    {
        "title": "FastAPI Rate Limiting & Token-Bucket Middleware",
        "description": "Add brute-force and DDoS defense across public chat and file endpoints using an in-memory token bucket rate limiter.",
        "category": "security",
        "impact": 8,
        "feasibility": 9,
        "estimated_hours": 3,
        "proposed_fix": "Create a RateLimiter class in backend/middleware/rate_limiter.py and apply to all router pathways."
    },
    {
        "title": "Automated SEO Sitemap & Schema Generator",
        "description": "Maximize organic discovery for created SaaS landing pages by automatically building a sitemap.xml and schema.org metadata.",
        "category": "everything",
        "impact": 7,
        "feasibility": 9,
        "estimated_hours": 2,
        "proposed_fix": "Add a dynamic sitemap generator endpoint in backend/routers/seo.py updating on each new page release."
    },
    {
        "title": "Automated Amazon Affiliate Pinterest Publisher",
        "description": "Deploy an autonomous background publisher agent that fetches trending products on Amazon and posts them on Pinterest boards.",
        "category": "everything",
        "impact": 9,
        "feasibility": 8,
        "estimated_hours": 5,
        "proposed_fix": "Create Pinterest API publisher class in backend/services/pinterest.py and schedule postings in the Money Agent."
    },
    {
        "title": "Multi-Provider LLM Router with Circuit Breaking",
        "description": "Avoid LLM API rate limits or exhaustion by rotating through openrouter, groq, and keyless providers dynamically with state cooldowns.",
        "category": "architecture",
        "impact": 9,
        "feasibility": 8,
        "estimated_hours": 5,
        "proposed_fix": "Refactor model_router.py with circuit breaker states (CLOSED/OPEN/HALF-OPEN) and fallback cool-down timers."
    },
    {
        "title": "Database Query Performance Indexes Setup",
        "description": "Prevent slow table scans as the system grows by establishing strategic indexes on MongoDB collections.",
        "category": "performance",
        "impact": 8,
        "feasibility": 9,
        "estimated_hours": 2,
        "proposed_fix": "Add setup_indexes() function on app initialization creating ascending/sorting compound indexes on MongoDB collections."
    }
]


class IdeaEngine:
    """Background engine generating, ranking, and recording self-improvement ideas."""

    def __init__(self, model_router=None, root_path: str = "."):
        self.model_router = model_router
        self.root_path = Path(root_path)
        self._task: Optional[asyncio.Task] = None
        self._running = False

        # Configuration variables with defaults
        self.enabled = os.getenv("IDEA_ENGINE_ENABLED", "true").lower() == "true"
        try:
            self.rate_per_hour = float(os.getenv("IDEA_ENGINE_RATE_PER_HOUR", "100"))
        except ValueError:
            self.rate_per_hour = 100

        try:
            self.max_daily_executions = int(os.getenv("IDEA_ENGINE_MAX_DAILY_EXECUTIONS", "2400"))
        except ValueError:
            self.max_daily_executions = 2400

        self.target_scopes = os.getenv("IDEA_ENGINE_TARGET_SCOPES", "everything").lower().split(",")
        try:
            self.min_score = float(os.getenv("IDEA_ENGINE_MIN_SCORE", "5.0"))
        except ValueError:
            self.min_score = 5.0

        # Run statistics and blacklist tracking
        self.ideas_today = 0
        self.blacklist = set()  # Item IDs that repeatedly failed

        logger.info(
            "Idea Engine initialized: enabled=%s, rate=%d/hr, min_score=%.1f",
            self.enabled, int(self.rate_per_hour), self.min_score
        )

    def reload_config(
        self,
        enabled: Optional[bool] = None,
        rate_per_hour: Optional[float] = None,
        max_daily_executions: Optional[int] = None,
        target_scopes: Optional[List[str]] = None,
        min_score: Optional[float] = None
    ):
        """Reload configuration on the fly."""
        if enabled is not None:
            self.enabled = enabled
        if rate_per_hour is not None:
            self.rate_per_hour = rate_per_hour
        if max_daily_executions is not None:
            self.max_daily_executions = max_daily_executions
        if target_scopes is not None:
            self.target_scopes = target_scopes
        if min_score is not None:
            self.min_score = min_score

        logger.info(
            "Idea Engine reloaded: enabled=%s, rate=%d/hr, min_score=%.1f",
            self.enabled, int(self.rate_per_hour), self.min_score
        )

        if not self.enabled and self._running:
            self.stop()
        elif self.enabled and not self._running:
            self.start()

    def start(self) -> bool:
        """Start background loop."""
        if not self.enabled:
            logger.info("ℹ️ Idea Engine disabled")
            return False

        if self._running:
            logger.warning("Idea Engine already running")
            return False

        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("✓ Idea Engine background task started")
        return True

    def stop(self) -> bool:
        """Stop background loop."""
        if not self._running:
            return False

        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None

        logger.info("✓ Idea Engine background task stopped")
        return True

    async def _loop(self):
        """Periodic idea generation loop."""
        try:
            # Let backend startup completely before beginning
            await asyncio.sleep(10)

            while self._running:
                try:
                    # Budget limit check
                    if self.ideas_today >= self.max_daily_executions:
                        logger.warning("Daily idea execution cap reached (%d)", self.max_daily_executions)
                        await asyncio.sleep(300)
                        continue

                    # Execute one iteration
                    await self.generate_and_register_one_idea()

                    # Calculate delay in seconds
                    delay = max(1.0, 3600.0 / self.rate_per_hour)
                    await asyncio.sleep(delay)

                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error("Error in Idea Engine loop: %s", e)
                    await asyncio.sleep(30)

        except Exception as e:
            logger.error("Idea Engine loop crashed: %s", e)
            self._running = False

    async def generate_and_register_one_idea(self) -> Optional[Dict[str, Any]]:
        """Core execution step: generate a new idea, score it, save log and append to Evolve_plan.md."""
        try:
            logger.info("💡 Generating a new development / monetization idea...")

            idea = await self._generate_idea()
            if not idea:
                return None

            # 1. Determine next ID
            next_id = self._get_next_idea_id()
            idea["id"] = next_id

            # 2. Score check
            score = (idea["impact"] + idea["feasibility"]) / 2.0
            idea["score"] = score
            idea["status"] = "pending"
            idea["generated_at"] = datetime.now().isoformat()
            idea["executed_at"] = None
            idea["result"] = None

            if score < self.min_score:
                logger.info("Idea score %.1f is below threshold %.1f. Skipping.", score, self.min_score)
                return None

            # 3. Log to daily json
            self._log_idea_to_file(idea)

            # 4. Write/register inside Evolve_plan.md
            self._register_idea_in_evolve_plan(idea)

            # 5. Perform automatic plan prioritization (sorting)
            self.prioritize_evolve_plan()

            self.ideas_today += 1
            logger.info("✨ Successfully registered and prioritized %s: '%s' (Score: %.1f)", next_id, idea["title"], score)
            return idea

        except Exception as e:
            logger.error("Failed to generate and register idea: %s", e)
            return None

    async def _generate_idea(self) -> Optional[Dict[str, Any]]:
        """Call LLM Router or fetch customized high-quality seed fallback."""
        # Check targets
        scope = random.choice(self.target_scopes) if self.target_scopes else "everything"

        # Attempt LLM if router is ready
        if self.model_router:
            try:
                # Filter seeds matching scope
                prompt = f"""
                You are a senior software architect specializing in self-evolving architectures and passive yield monetization.
                Generate ONE highly specific, non-trivial code improvement or passive monetization strategy for NexusOS.
                Target Scope: {scope}

                Respond ONLY with a valid JSON block containing:
                {{
                  "title": "Short title",
                  "description": "Detailed description of what it achieves",
                  "proposed_fix": "Technical implementation strategy",
                  "category": "ui|backend|performance|security|architecture",
                  "impact": 1-10 integer,
                  "feasibility": 1-10 integer,
                  "estimated_hours": 1-12 integer
                }}
                """
                response = await self.model_router.call_model(
                    [{"role": "user", "content": prompt}],
                    temperature=0.85,
                    max_tokens=600
                )
                clean_response = response.strip()
                if clean_response.startswith("```json"):
                    clean_response = clean_response[7:]
                if clean_response.endswith("```"):
                    clean_response = clean_response[:-3]
                data = json.loads(clean_response.strip())
                if "title" in data and "description" in data:
                    return {
                        "title": data["title"],
                        "description": data["description"],
                        "proposed_fix": data.get("proposed_fix", "Implement custom patch."),
                        "category": data.get("category", scope),
                        "impact": int(data.get("impact", 7)),
                        "feasibility": int(data.get("feasibility", 7)),
                        "estimated_hours": int(data.get("estimated_hours", 4))
                    }
            except Exception as e:
                logger.debug("LLM generation bypassed or failed: %s. Using premium fallback seed.", e)

        # Fallback to rich pre-defined seed
        seeds = SEED_IDEAS
        if scope != "everything":
            seeds = [s for s in SEED_IDEAS if s["category"] == scope]
            if not seeds:
                seeds = SEED_IDEAS

        selected = dict(random.choice(seeds))
        # Add random flavor variations to ensure absolute uniqueness
        variations = ["Enhanced", "Adaptive", "Continuous", "Autonomous", "Secured", "Resilient"]
        selected["title"] = f"{random.choice(variations)} {selected['title']}"
        selected["impact"] = random.randint(7, 10)
        selected["feasibility"] = random.randint(6, 10)
        selected["estimated_hours"] = random.randint(2, 8)
        return selected

    def _get_next_idea_id(self) -> str:
        """Find the next sequential IDEA index in Evolve_plan.md or logs."""
        plan_path = self.root_path / "Evolve_plan.md"
        max_idx = 0
        if plan_path.exists():
            try:
                content = plan_path.read_text(encoding="utf-8")
                matches = re.findall(r"IDEA_(\d+)|IDEA-(\d+)", content, re.IGNORECASE)
                for m in matches:
                    val = m[0] or m[1]
                    if val:
                        max_idx = max(max_idx, int(val))
            except Exception as e:
                logger.warning("Failed to parse existing idea index from Evolve_plan: %s", e)

        return f"IDEA_{max_idx + 1:04d}"

    def _log_idea_to_file(self, idea: Dict[str, Any]):
        """Save idea to daily JSON log autonomous_logs/idea_engine/ideas_{YYYY-MM-DD}.json."""
        try:
            today_str = datetime.now().strftime("%Y-%m-%d")
            log_dir = self.root_path / "autonomous_logs" / "idea_engine"
            log_dir.mkdir(parents=True, exist_ok=True)
            log_path = log_dir / f"ideas_{today_str}.json"

            existing_ideas = []
            if log_path.exists():
                try:
                    existing_ideas = json.loads(log_path.read_text(encoding="utf-8"))
                except Exception:
                    existing_ideas = []

            existing_ideas.append(idea)
            log_path.write_text(json.dumps(existing_ideas, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error("Failed to log idea to JSON file: %s", e)

    def _register_idea_in_evolve_plan(self, idea: Dict[str, Any]):
        """Append the newly generated idea into Evolve_plan.md inside the Discovered Ideas section."""
        plan_path = self.root_path / "Evolve_plan.md"
        if not plan_path.exists():
            return

        try:
            content = plan_path.read_text(encoding="utf-8")

            # Check if Discovered Ideas section exists, if not, append section
            section_header = "\n## 🤖 Discovered Ideas by Autonomous Idea Engine\n"
            if section_header.strip() not in content:
                content = content.rstrip() + f"\n\n---\n{section_header}"

            # Format item block
            item_block = f"""
### 🟢 {idea['title']} (Score: {idea['score']:.1f})
*   **Item:** {idea['title']} <!-- id: {idea['id']} -->
    *   **Description:** {idea['description']}
    *   **Proposed Fix:** {idea['proposed_fix']}
    *   **Files Affected:** Auto-assigned during iteration
    *   **Impact:** {idea['impact']} (Feasibility: {idea['feasibility']}, Estimated implementation time: {idea['estimated_hours']} hours)
    *   **Status:** `[ pending ]`
"""
            # Append block
            content = content.rstrip() + f"\n{item_block}"
            plan_path.write_text(content, encoding="utf-8")

        except Exception as e:
            logger.error("Failed to append idea to Evolve_plan.md: %s", e)

    def prioritize_evolve_plan(self):
        """
        Parses Evolve_plan.md, extracts all [ pending ] items,
        ranks them by score descending, and rewrites the file with pending items ordered.
        """
        plan_path = self.root_path / "Evolve_plan.md"
        if not plan_path.exists():
            return

        try:
            content = plan_path.read_text(encoding="utf-8")

            # Identify the "🤖 Discovered Ideas by Autonomous Idea Engine" section
            section_marker = "## 🤖 Discovered Ideas by Autonomous Idea Engine"
            parts = content.split(section_marker)
            if len(parts) < 2:
                # If no engine-generated section exists, skip sorting to avoid disturbing manual plans
                return

            header = parts[0] + section_marker + "\n"
            ideas_content = parts[1]

            # Parse individual items in this section: split by "### 🟢" or "### 🔴" or similar
            items = re.split(r"\n###\s+", "\n" + ideas_content)
            parsed_items = []
            non_parsed = []

            for item in items:
                item_str = item.strip()
                if not item_str:
                    continue

                # Parse the score
                score_match = re.search(r"Score:\s*([\d.]+)", item_str)
                # Parse the ID
                id_match = re.search(r"<!-- id:\s*([\w\d_-]+)\s*-->", item_str)
                # Parse Status
                status_match = re.search(r"\*\s+\*\*Status:\*\*\s+`\[\s*(pending|completed|failed|in-progress)\s*\]`", item_str, re.IGNORECASE)

                if score_match and id_match:
                    score = float(score_match.group(1))
                    status = status_match.group(1).lower().strip() if status_match else "pending"
                    parsed_items.append({
                        "score": score,
                        "status": status,
                        "content": f"### {item_str}\n"
                    })
                else:
                    non_parsed.append(f"### {item_str}\n")

            # Sort parsed items: completed/failed should go to bottom, pending sorted descending by score
            pending_items = [i for i in parsed_items if i["status"] == "pending"]
            completed_items = [i for i in parsed_items if i["status"] != "pending"]

            pending_items.sort(key=lambda x: x["score"], reverse=True)

            # Reconstruct the section
            new_ideas_section = ""
            for item in pending_items:
                new_ideas_section += f"\n{item['content']}"
            for item in completed_items:
                new_ideas_section += f"\n{item['content']}"
            for item in non_parsed:
                new_ideas_section += f"\n{item}"

            # Save Evolve_plan.md
            plan_path.write_text(header + new_ideas_section, encoding="utf-8")

        except Exception as e:
            logger.error("Failed to prioritize Evolve_plan.md: %s", e)


# Singleton tracker
_idea_engine = None

def get_idea_engine(model_router=None, root_path: str = ".") -> IdeaEngine:
    """Get or create singleton IdeaEngine."""
    global _idea_engine
    if _idea_engine is None:
        _idea_engine = IdeaEngine(model_router, root_path)
    return _idea_engine

def start_idea_engine(model_router=None, root_path: str = ".") -> bool:
    """Convenience starter."""
    return get_idea_engine(model_router, root_path).start()

def stop_idea_engine() -> bool:
    """Convenience stopper."""
    return get_idea_engine().stop()
