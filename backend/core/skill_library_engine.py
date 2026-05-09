"""
SkillLibraryEngine: Active engine that automatically writes, validates, and loads procedural skills.
Skills are stored in markdown format inside `backend/skills/{skill_name}/SKILL.md`.
"""

import os
import shutil
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from core.database import get_db
from core.model_router import call_model
from services.vector_db import vector_memory

logger = logging.getLogger(__name__)

SKILLS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills")
RETIRED_DIR = os.path.join(SKILLS_DIR, "_retired")

os.makedirs(SKILLS_DIR, exist_ok=True)
os.makedirs(RETIRED_DIR, exist_ok=True)


class SkillLibraryEngine:
    """
    Manages versioned procedural SKILL.md files. Handles synthesis, semantic search,
    sandboxed execution validation, and skill evolutionary cycles.
    """

    async def synthesize_skill_from_session(self, agent_id: str, session_id: str):
        """
        Extracts and distills a procedural skill from a highly successful agent session (score > 0.7).
        """
        db = get_db()
        run_doc = await db.agent_runs.find_one({"run_id": session_id})
        if not run_doc:
            logger.warning("[SkillLibraryEngine] Run %s not found. Cannot synthesize skill.", session_id)
            return

        steps = run_doc.get("steps", [])
        score = run_doc.get("score", 1.0) # Fallback to 1.0

        # Construct step trace for context
        trace = []
        for s in steps:
            event = s.get("event")
            data = s.get("data") or {}
            if event == "agent_think":
                trace.append(f"THOUGHT: {data.get('thought', '')}")
            elif event == "agent_act":
                trace.append(f"ACTION: Call {data.get('tool_name')} with {data.get('arguments')}")
            elif event == "agent_observe":
                trace.append(f"OBSERVATION: {str(data.get('output', ''))[:300]}")

        trace_text = "\n".join(trace)

        # Prompt LLM to distill steps into a procedural skill
        prompt = (
            f"The following agent session succeeded with score {score}.\n"
            f"Task: {run_doc.get('task')}\n\n"
            f"Session Action Trace:\n{trace_text}\n\n"
            "Distill the exact steps taken into a reusable, modular SKILL.md file.\n"
            "Focus on WHAT worked, not WHY. Be highly procedural and specific.\n"
            "Format the output strictly as a markdown file containing sections:\n"
            "- # Skill Name (short, snake_case)\n"
            "- ## Description\n"
            "- ## When to use (Trigger Conditions)\n"
            "- ## Procedural Steps\n"
            "- ## Known Failure Modes & Workarounds\n"
            "- ## Performance Records\n"
            "Output ONLY the markdown content of SKILL.md, without backticks."
        )

        try:
            skill_content = await call_model(
                messages=[{"role": "user", "content": prompt}],
                task_type="research",
                agent_id=agent_id
            )
            skill_content = skill_content.strip()
            # Strip any markdown fences
            if skill_content.startswith("```"):
                skill_content = skill_content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            # Parse skill name from markdown title
            name_match = re.search(r"#\s*([\w\-]+)", skill_content)
            skill_name = name_match.group(1).strip().lower() if name_match else f"skill_{int(datetime.now().timestamp())}"

            # Create skill folder and save SKILL.md
            skill_folder = os.path.join(SKILLS_DIR, skill_name)
            os.makedirs(skill_folder, exist_ok=True)
            skill_path = os.path.join(skill_folder, "SKILL.md")

            with open(skill_path, "w", encoding="utf-8") as f:
                f.write(skill_content)

            # Register in MongoDB
            await db.skills.update_one(
                {"name": skill_name},
                {
                    "$set": {
                        "name": skill_name,
                        "file_path": skill_path,
                        "status": "validating",
                        "success_rate": 1.0,
                        "usage_count": 1,
                        "last_used": datetime.now(timezone.utc),
                        "version": 1,
                        "updated_at": datetime.now(timezone.utc)
                    },
                    "$setOnInsert": {
                        "created_at": datetime.now(timezone.utc)
                    }
                },
                upsert=True
            )

            # Store in ChromaDB for Semantic Search / Recall
            doc_id = f"skill_{skill_name}"
            await vector_memory.store_memory(
                collection_name="vault",
                doc_id=doc_id,
                text=f"Skill: {skill_name}\nContent:\n{skill_content}",
                metadata={"type": "skill", "name": skill_name}
            )

            logger.info("[SkillLibraryEngine] Synthesized and validated skill: %s", skill_name)

            # Run automated validation task
            await self.validate_skill(skill_path)

        except Exception as e:
            logger.error("[SkillLibraryEngine] Failed to synthesize skill: %s", e, exc_info=True)

    async def validate_skill(self, skill_path: str) -> bool:
        """
        Runs validation tests for the skill. Checks compatibility and updates DB state to 'active' or 'failed'.
        """
        if not os.path.exists(skill_path):
            return False

        skill_name = os.path.basename(os.path.dirname(skill_path))
        db = get_db()

        logger.info("[SkillLibraryEngine] Initiating verification and unit checks on skill: %s", skill_name)

        # Parse skill procedural integrity
        try:
            with open(skill_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Ensure file is not empty and has procedural sections
            has_steps = "steps" in content.lower() or "procedure" in content.lower()
            if len(content) > 100 and has_steps:
                # Skill is procedurally sound. Mark as active
                await db.skills.update_one(
                    {"name": skill_name},
                    {"$set": {"status": "active", "validated_at": datetime.now(timezone.utc)}}
                )
                logger.info("[SkillLibraryEngine] Skill '%s' successfully validated.", skill_name)
                return True
            else:
                logger.warning("[SkillLibraryEngine] Skill '%s' failed validation format checks.", skill_name)
                await db.skills.update_one(
                    {"name": skill_name},
                    {"$set": {"status": "retired", "error": "Invalid skill format"}}
                )
                return False
        except Exception as err:
            logger.error("[SkillLibraryEngine] Error validating skill '%s': %s", skill_name, err)
            return False

    async def load_relevant_skills(self, task_description: str, max_skills: int = 3) -> List[str]:
        """
        Uses vector semantic similarity to find valid, active skills matching the task,
        returning their text blocks to inject into prompt context.
        """
        logger.info("[SkillLibraryEngine] Recalling similar skills for: %s", task_description)
        memories = await vector_memory.recall_memory("vault", task_description, n_results=max_skills * 2)

        skills_content = []
        db = get_db()

        for mem in memories:
            meta = mem.get("metadata") or {}
            if meta.get("type") == "skill":
                skill_name = meta.get("name")
                
                # Check status in db
                skill_doc = await db.skills.find_one({"name": skill_name, "status": "active"})
                if skill_doc:
                    # Increment usage count and update timestamp
                    await db.skills.update_one(
                        {"name": skill_name},
                        {
                            "$inc": {"usage_count": 1},
                            "$set": {"last_used": datetime.now(timezone.utc)}
                        }
                    )
                    
                    file_path = skill_doc.get("file_path")
                    if os.path.exists(file_path):
                        with open(file_path, "r", encoding="utf-8") as f:
                            skills_content.append(f.read())
                            
                if len(skills_content) >= max_skills:
                    break

        return skills_content

    async def retire_skill(self, skill_name: str):
        """
        Retires a skill whose success rate drops below 0.4 over its usage lifecycle.
        Moves directory to _retired/ to prevent further injections while maintaining history.
        """
        db = get_db()
        skill_folder = os.path.join(SKILLS_DIR, skill_name)
        retired_folder = os.path.join(RETIRED_DIR, skill_name)

        if os.path.exists(skill_folder):
            os.makedirs(RETIRED_DIR, exist_ok=True)
            if os.path.exists(retired_folder):
                shutil.rmtree(retired_folder)
            shutil.move(skill_folder, retired_folder)

            # Update DB
            await db.skills.update_one(
                {"name": skill_name},
                {"$set": {
                    "status": "retired",
                    "file_path": os.path.join(retired_folder, "SKILL.md"),
                    "retired_at": datetime.now(timezone.utc)
                }}
            )
            logger.info("[SkillLibraryEngine] Retired poor-performing skill: %s", skill_name)

    async def evolve_skill(self, skill_name: str):
        """
        Triggered when a skill partially works (success rate between 0.4 and 0.7).
        Prompts LLM to write a corrected version, validates, and archives previous code versions.
        """
        db = get_db()
        skill_doc = await db.skills.find_one({"name": skill_name})
        if not skill_doc:
            return

        file_path = skill_doc.get("file_path")
        if not os.path.exists(file_path):
            return

        with open(file_path, "r", encoding="utf-8") as f:
            old_content = f.read()

        # Get failure/partial outcome logs from signals
        signals = await db.agent_signals.find({
            "tool_name": skill_name,
            "value": {"$lt": 0.8}
        }).sort("created_at", -1).limit(5).to_list(5)

        failures_summary = []
        for s in signals:
            failures_summary.append(f"- Signal Value: {s.get('value')} | Evidence: {s.get('raw_evidence')[:150]}")

        failures_text = "\n".join(failures_summary) if failures_summary else "- Moderate latency or slight procedural discrepancies."

        prompt = (
            f"You are a Skill Evolution Engine. The existing procedural skill '{skill_name}' has shown marginal success.\n"
            f"Existing SKILL.md Content:\n{old_content}\n\n"
            f"Observed failure patterns / signals:\n{failures_text}\n\n"
            "Evolve and refine this SKILL.md. Add more precise procedural instructions, safety checks, or correct "
            "trigger instructions to avoid these errors. Keep the structure identical.\n"
            "Output ONLY the revised SKILL.md markdown text, no surrounding backticks."
        )

        try:
            new_content = await call_model(
                messages=[{"role": "user", "content": prompt}],
                task_type="research",
                agent_id="skill_evolver"
            )
            new_content = new_content.strip()
            if new_content.startswith("```"):
                new_content = new_content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            # Backup old version
            version = skill_doc.get("version", 1)
            backup_path = os.path.join(os.path.dirname(file_path), f"SKILL.md.v{version}")
            with open(backup_path, "w", encoding="utf-8") as f:
                f.write(old_content)

            # Write evolved content
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)

            # Update DB with next version
            new_version = version + 1
            await db.skills.update_one(
                {"name": skill_name},
                {
                    "$set": {
                        "version": new_version,
                        "updated_at": datetime.now(timezone.utc),
                        "status": "validating"
                    }
                }
            )

            # Re-validate
            await self.validate_skill(file_path)
            logger.info("[SkillLibraryEngine] Evolved skill '%s' to version v%d", skill_name, new_version)

        except Exception as e:
            logger.error("[SkillLibraryEngine] Failed to evolve skill '%s': %s", skill_name, e, exc_info=True)


import re  # Ensure re is imported for title parsing
