"""
Conversational Rule Extractor
Analyzes user messages and extracts actionable rules/instructions
to feed into the next evolution cycle.
"""

from datetime import datetime
import uuid
import json
import re
import logging
from core.model_router import route_completion

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """
You are an instruction parser. Analyze the user message below and extract 
any explicit or implicit rules, constraints, or behavioral changes the user 
wants applied to the AI agent.

User message: "{message}"

Extract ONLY concrete, actionable rules. Ignore greetings or vague statements.

Return JSON only, no explanation:
{{
  "rules": [
    {{
      "rule": "clear description of the rule",
      "category": "behavior|ui|code|prompt|constraint",
      "priority": "high|medium|low"
    }}
  ],
  "has_rules": true/false
}}

Categories:
- behavior: how the agent talks, language, tone, dialect
- ui: frontend changes (RTL, colors, layout, fonts)
- code: specific code changes requested
- prompt: changes to system prompt or agent instructions
- constraint: things the agent must never do

If no actionable rules found, return: {{"rules": [], "has_rules": false}}
"""

async def extract_rules_from_message(
    agent_id: str,
    user_message: str,
    db  # MongoDB database instance
) -> list[dict]:
    """
    Background task: analyze user message, extract rules, save to agent.
    Uses the fastest available model via route_completion.
    Never blocks the chat response.
    """
    try:
        # Use fast/cheap model for extraction
        messages = [
            {"role": "user", "content": EXTRACTION_PROMPT.format(message=user_message)}
        ]
        
        # Use route_completion
        response = await route_completion(
            messages=messages,
            max_tokens=500,
            temperature=0.1,  # low temp for consistent parsing
        )
        
        # Extract content from LiteLLM response object
        if hasattr(response, "choices") and response.choices:
            content = response.choices[0].message.content or ""
        elif isinstance(response, dict) and "choices" in response:
            content = response["choices"][0]["message"]["content"] or ""
        else:
            content = str(response)

        content = content.strip()
        
        # Strip markdown code blocks if present
        content = re.sub(r'```json|```', '', content).strip()
        parsed = json.loads(content)
        
        if not parsed.get("has_rules") or not parsed.get("rules"):
            return []
        
        # Build rule objects
        rules = []
        for r in parsed["rules"]:
            rule_obj = {
                "id": str(uuid.uuid4()),
                "rule": r["rule"],
                "category": r.get("category", "behavior"),
                "priority": r.get("priority", "medium"),
                "source_message": user_message[:500],
                "extracted_at": datetime.now(),
                "applied_cycles": 0,
                "status": "pending"
            }
            rules.append(rule_obj)
        
        # Save to agent in MongoDB
        if rules:
            await db.agents.update_one(
                {"id": agent_id},
                {
                    "$push": {
                        "learned_rules": {"$each": rules},
                        "user_feedback_log": {
                            "message": user_message[:200],
                            "timestamp": datetime.now(),
                            "rules_extracted": len(rules)
                        }
                    }
                }
            )
            
            logger.info(f"[RULES] Extracted {len(rules)} rules from message for agent {agent_id}")
        
        return rules
        
    except Exception as e:
        logger.warning(f"[RULES] Extraction failed: {e}")
        return []
