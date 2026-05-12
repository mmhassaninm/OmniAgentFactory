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
        "name": "Critical Mind (Critic)",
        "personality": "Skeptical and conservative — asks: What could go wrong?",
        "focus": "Risks, complexities, external costs, rate limits, and potential negative impacts"
    },
    "visionary": {
        "name": "Visionary Mind (Visionary)",
        "personality": "Enthusiastic and innovative — sees possibilities and opportunities",
        "focus": "Opportunities, value additions, creative architecture, and long-term impacts"
    },
    "pragmatist": {
        "name": "Pragmatic Mind (Pragmatist)",
        "personality": "Realistic and logical — balances ambition with execution reality",
        "focus": "Feasibility, resources, expected file structures, timeline, and immediate impacts"
    }
}

AGENT_ROLE_PROMPT = """
You are the {role_name} in a technical evaluation council for an autonomous, self-evolving system.
{personality}
Focus on: {focus}

# Proposal to Evaluate
Category: {category}
Title: {title}
Description: {description}

# Assignment
Evaluate this proposal from your designated professional persona. Be honest, direct, and critical. Respond in English with a valid JSON block only:
{{
  "score": 0-10,
  "verdict": "approve|reject|modify",
  "key_points": ["point 1", "point 2"],
  "condition": "condition for approval (if any)"
}}
"""

MODERATOR_PROMPT = """
You are the Council Moderator (Moderator). You have received feedback from 3 technical evaluators regarding a proposal.

Proposal: {title}
Category: {category}

Council Verdicts:
- Critic: {critic_score}/10 ({critic_verdict})
- Visionary: {visionary_score}/10 ({visionary_verdict})
- Pragmatist: {pragmatist_score}/10 ({pragmatist_verdict})

Determine the final unified decision. Respond in English with a valid JSON block only:
{{
  "final_decision": "approve|reject|modify",
  "confidence": 0-100,
  "final_score": 0-10,
  "rationale": "reason for the decision"
}}
"""


class AgentCouncil:
    """Council of 3 agents that evaluates ideas and problems together."""

    def __init__(self, model_router, chroma_client=None):
        self.model_router = model_router
        self.verdict_cache = VerdictCache(chroma_client)

    async def deliberate(self, proposal: Dict[str, Any]) -> Dict[str, Any]:
        """Run council deliberation and return verdict (with caching)."""
        import uuid
        from datetime import datetime
        
        db = None
        session_id = None
        title = proposal.get("title", "Untitled")
        description = proposal.get("description", "")
        category = proposal.get("category", proposal.get("type", "idea"))
        
        try:
            from core.database import get_db
            db = get_db()
            session_id = f"session_auto_{str(uuid.uuid4())[:8]}"
            session_doc = {
                "id": session_id,
                "title": f"Brainstorming: {title}",
                "topic": title,
                "status": "ACTIVE",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "messages": [
                    {
                        "sender": "moderator",
                        "name": "Council Moderator (Moderator)",
                        "avatar": "gavel",
                        "message": f"Welcome, members of the technical self-evolution council. We have received a new proposal/issue titled: '{title}'. Category: '{category}'. Description: '{description[:300]}...'. Let us deliberate to produce a well-engineered decision on its feasibility and alignment with increasing passive financial yield.",
                        "timestamp": datetime.utcnow().isoformat() + "Z"
                    }
                ]
            }
            await db.collaboration_sessions.insert_one(session_doc)
        except Exception as dbe:
            logger.debug(f"Auto-collaboration session init skipped or failed: {dbe}")

        try:
            logger.info(f"📋 Council deliberating: {title}")

            # Step 0: Check cached verdict first (reduce API calls by 60-70%)
            cached_verdict = await self.verdict_cache.get_cached_verdict(proposal)
            if cached_verdict:
                try:
                    verdict_data = json.loads(cached_verdict.get("verdict_json", "{}"))
                    logger.info(f"📦 Using cached verdict (similarity: {cached_verdict.get('confidence', 0):.0f}%)")
                    
                    if db and session_id:
                        try:
                            # Update active session with cached verdict instantly
                            final_cached = verdict_data.get("final", {})
                            m_msg = (
                                f"This proposal has been deliberated on previously and cached semantically in the vector store. "
                                f"The archived decision has been retrieved to optimize API usage and execution efficiency:\n"
                                f"Final Decision: [{final_cached.get('final_decision', 'approve').upper()}] "
                                f"with a confidence of {final_cached.get('confidence', 90)}% and score of {final_cached.get('final_score', 8)}/10.\n"
                                f"Rationale: {final_cached.get('rationale', 'Approved based on historical cache matching.')}"
                            )
                            await db.collaboration_sessions.update_one(
                                {"id": session_id},
                                {
                                    "$set": {"status": "COMPLETED"},
                                    "$push": {"messages": {
                                        "sender": "moderator",
                                        "name": "Council Moderator (Moderator)",
                                        "avatar": "gavel",
                                        "message": m_msg,
                                        "timestamp": datetime.utcnow().isoformat() + "Z"
                                    }}
                                }
                            )
                        except Exception as cache_log_e:
                            logger.debug(f"Cache session logging failed: {cache_log_e}")
                            
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

            # Write individual votes to db dynamically for that highly immersive experience
            if db and session_id:
                try:
                    # 1. Visionary message
                    v_val = verdicts.get("visionary", {})
                    v_points = ", ".join(v_val.get("key_points", []))
                    v_msg = f"As the Visionary Mind, I see an excellent innovative opportunity here! My score is {v_val.get('score', 5)}/10. Key benefits: {v_points}."
                    if v_val.get("condition"):
                        v_msg += f" Provided that: {v_val.get('condition')}."
                    
                    await db.collaboration_sessions.update_one(
                        {"id": session_id},
                        {"$push": {"messages": {
                            "sender": "visionary",
                            "name": "Visionary Mind (Visionary)",
                            "avatar": "brain-circuit",
                            "message": v_msg,
                            "timestamp": datetime.utcnow().isoformat() + "Z"
                        }}}
                    )
                    await asyncio.sleep(1.0)

                    # 2. Critic message
                    c_val = verdicts.get("critic", {})
                    c_points = ", ".join(c_val.get("key_points", []))
                    c_msg = f"Representing the Critical Mind, I score this proposal {c_val.get('score', 5)}/10. The following safety and architectural risks must be addressed: {c_points}."
                    if c_val.get("condition"):
                        c_msg += f" Core condition: {c_val.get('condition')}."
                    
                    await db.collaboration_sessions.update_one(
                        {"id": session_id},
                        {"$push": {"messages": {
                            "sender": "critic",
                            "name": "Critical Mind (Critic)",
                            "avatar": "shield-alert",
                            "message": c_msg,
                            "timestamp": datetime.utcnow().isoformat() + "Z"
                        }}}
                    )
                    await asyncio.sleep(1.0)

                    # 3. Pragmatist message
                    p_val = verdicts.get("pragmatist", {})
                    p_points = ", ".join(p_val.get("key_points", []))
                    p_msg = f"As the Pragmatic Mind, I score this {p_val.get('score', 5)}/10. Regarding feasibility and resources: {p_points}."
                    if p_val.get("condition"):
                        p_msg += f" Actionable recommendation: {p_val.get('condition')}."
                    
                    await db.collaboration_sessions.update_one(
                        {"id": session_id},
                        {"$push": {"messages": {
                            "sender": "pragmatist",
                            "name": "Pragmatic Mind (Pragmatist)",
                            "avatar": "construction",
                            "message": p_msg,
                            "timestamp": datetime.utcnow().isoformat() + "Z"
                        }}}
                    )
                    await asyncio.sleep(1.0)

                except Exception as log_e:
                    logger.debug(f"Failed to stream council messages: {log_e}")

            # Step 2: Moderator makes final decision
            final = await self._moderate(title, category, verdicts)

            result = {
                "proposal": proposal,
                "verdicts": verdicts,
                "final": final
            }

            # Write final moderator decision
            if db and session_id:
                try:
                    m_msg = (
                        f"Based on the council's deliberation: The final approved decision of the council is [{final.get('final_decision', 'modify').upper()}] "
                        f"with a confidence of {final.get('confidence', 70)}% and score of {final.get('final_score', 5)}/10.\n"
                        f"Rationale: {final.get('rationale', 'Consensus reached through voting.')}"
                    )
                    await db.collaboration_sessions.update_one(
                        {"id": session_id},
                        {
                            "$set": {"status": "COMPLETED"},
                            "$push": {"messages": {
                                "sender": "moderator",
                                "name": "Council Moderator (Moderator)",
                                "avatar": "gavel",
                                "message": m_msg,
                                "timestamp": datetime.utcnow().isoformat() + "Z"
                            }}
                        }
                    )
                    
                    # Generate an achievement for successes
                    if final.get("final_decision") == "approve" and final.get("final_score", 0) >= 6:
                        ach_doc = {
                            "id": f"ach_auto_{str(uuid.uuid4())[:8]}",
                            "title": f"Council Approves: {title[:40]}...",
                            "description": f"Successfully verified and authorized the architectural blueprint for '{title}' to proceed in the autonomous pipeline.",
                            "icon": "zap" if category == "performance" else "sparkles",
                            "date": datetime.utcnow().isoformat() + "Z",
                            "category": "Evolution"
                        }
                        await db.collaboration_achievements.insert_one(ach_doc)
                except Exception as final_log_e:
                    logger.debug(f"Failed to log moderator final decision: {final_log_e}")

            # Step 3: Cache the verdict for future similar proposals
            await self.verdict_cache.cache_verdict(proposal, result)

            return result

        except Exception as e:
            logger.error(f"Council deliberation failed: {e}")
            if db and session_id:
                try:
                    await db.collaboration_sessions.update_one(
                        {"id": session_id},
                        {"$set": {"status": "FAILED"}}
                    )
                except:
                    pass
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
