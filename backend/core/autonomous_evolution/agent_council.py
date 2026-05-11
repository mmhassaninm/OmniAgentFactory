"""
Agent Council — 3-Agent Voting System for Ideas and Problems
Roles: Critic (skeptical), Visionary (optimistic), Pragmatist (balanced)
Decision: Majority voting with moderator final call
Caching: ChromaDB-based semantic verdict caching (60-70% API call reduction)
"""
import asyncio
import json
import logging
from typing import Dict, Any

from .verdict_cache import VerdictCache

logger = logging.getLogger(__name__)

COUNCIL_ROLES = {
    "critic": {
        "name": "العقل الناقد (Critic)",
        "personality": "متشكك ومحافظ — يسأل: ما الذي يمكن أن يسوء؟",
        "focus": "المخاطر والتعقيد والتكاليف والآثار السلبية"
    },
    "visionary": {
        "name": "العقل المبدع (Visionary)",
        "personality": "متحمس ومبتكر — يرى الإمكانيات والفرص",
        "focus": "الفرص والقيمة المضافة والإبداع والأثر طويل الأجل"
    },
    "pragmatist": {
        "name": "العقل العملي (Pragmatist)",
        "personality": "واقعي ومنطقي — يوازن بين الطموح والواقع",
        "focus": "قابلية التنفيذ والموارد والجدول الزمني والأثر الفوري"
    }
}

AGENT_ROLE_PROMPT = """
أنت {role_name} في مجلس تقييم تقني للنظام الذاتي التطور.
{personality}
ركز على: {focus}

# الاقتراح المراد تقييمه
الفئة: {category}
العنوان: {title}
الوصف: {description}

# المهمة
قيّم هذا الاقتراح من منظورك. كن صريحاً وناقداً. أجب بـ JSON فقط:
{{
  "score": 0-10,
  "verdict": "approve|reject|modify",
  "key_points": ["نقطة 1", "نقطة 2"],
  "condition": "شرط الموافقة (إن وجد)"
}}
"""

MODERATOR_PROMPT = """
أنت مدير مجلس تقني. لديك آراء 3 مقيّمين حول اقتراح ما.

الاقتراح: {title}
النوع: {category}

آراء المجلس:
- الناقد: {critic_score}/10 ({critic_verdict})
- المبدع: {visionary_score}/10 ({visionary_verdict})
- العملي: {pragmatist_score}/10 ({pragmatist_verdict})

قرر القرار النهائي. أجب بـ JSON فقط:
{{
  "final_decision": "approve|reject|modify",
  "confidence": 0-100,
  "final_score": 0-10,
  "rationale": "سبب القرار"
}}
"""


class AgentCouncil:
    """Council of 3 agents that evaluates ideas and problems together."""

    def __init__(self, model_router, chroma_client=None):
        self.model_router = model_router
        self.verdict_cache = VerdictCache(chroma_client)

    async def deliberate(self, proposal: Dict[str, Any]) -> Dict[str, Any]:
        """Run council deliberation and return verdict (with caching)."""
        try:
            title = proposal.get("title", "Untitled")
            description = proposal.get("description", "")
            category = proposal.get("category", proposal.get("type", "idea"))

            logger.info(f"📋 Council deliberating: {title}")

            # Step 0: Check cached verdict first (reduce API calls by 60-70%)
            cached_verdict = await self.verdict_cache.get_cached_verdict(proposal)
            if cached_verdict:
                try:
                    verdict_data = json.loads(cached_verdict.get("verdict_json", "{}"))
                    logger.info(f"📦 Using cached verdict (similarity: {cached_verdict.get('confidence', 0):.0f}%)")
                    return verdict_data
                except Exception as e:
                    logger.debug(f"Cached verdict parsing failed: {e}")

            # Step 1: Each member evaluates independently
            verdicts = {}
            tasks = []

            for role_key, role_info in COUNCIL_ROLES.items():
                prompt = AGENT_ROLE_PROMPT.format(
                    role_name=role_info["name"],
                    personality=role_info["personality"],
                    focus=role_info["focus"],
                    category=category,
                    title=title,
                    description=description[:500]
                )
                tasks.append(self._get_verdict(prompt, role_key))

            results = await asyncio.gather(*tasks, return_exceptions=True)

            for i, (role_key, _) in enumerate(COUNCIL_ROLES.items()):
                if isinstance(results[i], Exception):
                    logger.warning(f"Council member {role_key} error: {results[i]}")
                    verdicts[role_key] = {"score": 5, "verdict": "modify", "key_points": []}
                else:
                    verdicts[role_key] = results[i]

            # Step 2: Moderator makes final decision
            final = await self._moderate(title, category, verdicts)

            result = {
                "proposal": proposal,
                "verdicts": verdicts,
                "final": final
            }

            # Step 3: Cache the verdict for future similar proposals
            await self.verdict_cache.cache_verdict(proposal, result)

            return result

        except Exception as e:
            logger.error(f"Council deliberation failed: {e}")
            return {
                "proposal": proposal,
                "verdicts": {},
                "final": {
                    "final_decision": "modify",
                    "confidence": 30,
                    "final_score": 5,
                    "rationale": f"Deliberation error: {str(e)[:100]}"
                }
            }

    async def _get_verdict(self, prompt: str, role: str) -> Dict[str, Any]:
        """Get a single council member's verdict."""
        try:
            response = await self.model_router.call_model(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.5,
                max_tokens=300
            )

            # Try to parse JSON
            try:
                return json.loads(response)
            except json.JSONDecodeError:
                # Fallback if JSON parsing fails
                logger.warning(f"Council member {role} returned invalid JSON: {response[:100]}")
                return {
                    "score": 5,
                    "verdict": "modify",
                    "key_points": [response[:100]],
                    "condition": "Review manually"
                }
        except Exception as e:
            logger.error(f"Council member {role} failed: {e}")
            return {
                "score": 5,
                "verdict": "modify",
                "key_points": [str(e)[:100]],
                "condition": "Automatic fallback"
            }

    async def _moderate(self, title: str, category: str, verdicts: Dict[str, Any]) -> Dict[str, Any]:
        """Moderator makes final decision based on council votes."""
        try:
            # Calculate simple statistics from verdicts
            scores = [v.get("score", 5) for v in verdicts.values()]
            avg_score = sum(scores) / len(scores) if scores else 5
            verdicts_list = [v.get("verdict", "modify") for v in verdicts.values()]

            # Voting logic
            approve_count = verdicts_list.count("approve")
            reject_count = verdicts_list.count("reject")
            modify_count = verdicts_list.count("modify")

            # Decide
            if approve_count >= 2:
                final_decision = "approve"
                confidence = 85 if approve_count == 3 else 70
            elif reject_count >= 2:
                final_decision = "reject"
                confidence = 85 if reject_count == 3 else 70
            else:
                final_decision = "modify"
                confidence = 60

            # Optional: Use moderator LLM for nuanced decision
            # For now, use simple voting
            prompt = MODERATOR_PROMPT.format(
                title=title,
                category=category,
                critic_score=verdicts.get("critic", {}).get("score", 5),
                critic_verdict=verdicts.get("critic", {}).get("verdict", "modify"),
                visionary_score=verdicts.get("visionary", {}).get("score", 5),
                visionary_verdict=verdicts.get("visionary", {}).get("verdict", "modify"),
                pragmatist_score=verdicts.get("pragmatist", {}).get("score", 5),
                pragmatist_verdict=verdicts.get("pragmatist", {}).get("verdict", "modify")
            )

            try:
                moderator_response = await self.model_router.call_model(
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    max_tokens=200
                )
                moderator_verdict = json.loads(moderator_response)
                logger.info(f"⚖️ Moderator verdict: {moderator_verdict.get('final_decision')}")
                return moderator_verdict
            except Exception as e:
                logger.warning(f"Moderator LLM failed, using vote: {e}")
                return {
                    "final_decision": final_decision,
                    "confidence": confidence,
                    "final_score": avg_score,
                    "rationale": f"Vote-based: {approve_count} approve, {reject_count} reject, {modify_count} modify"
                }

        except Exception as e:
            logger.error(f"Moderation failed: {e}")
            return {
                "final_decision": "modify",
                "confidence": 30,
                "final_score": 5,
                "rationale": f"Moderation error: {str(e)[:50]}"
            }
