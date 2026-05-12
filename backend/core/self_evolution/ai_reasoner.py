"""
AI Reasoner

Takes codebase snapshot + Evolve_plan.md and calls LLM to:
1. Identify single highest-priority pending item in Evolve_plan.md
2. Produce implementation plan for that ONE item
3. Output file patches in strict JSON format
4. Validate JSON before returning
"""

import json
import logging
from typing import Dict, Any, Optional
import asyncio

logger = logging.getLogger(__name__)

class AIReasoner:
    def __init__(self, model_router=None, max_retries: int = 3):
        self.model_router = model_router
        self.max_retries = max_retries

    async def reason(self, codebase_snapshot: str, evolve_plan: str) -> Optional[Dict[str, Any]]:
        """
        Reason about improvements and generate patches.

        Returns:
            Dict with:
            - patches: List of patch operations
            - evolve_plan_update: Item ID, new status, completion note
        """
        if not self.model_router:
            logger.error("Model router not configured")
            return None

        prompt = self._build_prompt(codebase_snapshot, evolve_plan)

        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info("AI reasoning attempt %d/%d", attempt, self.max_retries)

                # Call the model router using whatever provider is configured
                messages = [
                    {
                        "role": "system",
                        "content": (
                            "You are an expert software architect. Analyze the codebase and generate file patches. "
                            "Output ONLY valid JSON with no preamble, no explanation, no markdown code fences. "
                            "If you cannot identify a valid improvement, respond with: {\"error\": \"reason\", \"patches\": []}"
                        )
                    },
                    {"role": "user", "content": prompt}
                ]

                # Use the project's configured model router
                response = await self.model_router.call_model(
                    messages,
                    task_type="self_evolution"
                )

                # Parse and validate JSON
                result = self._parse_and_validate(response)
                if result:
                    logger.info("✓ Valid patches generated: %d patches", len(result.get("patches", [])))
                    return result

                logger.warning("Attempt %d: Invalid JSON response", attempt)

            except Exception as e:
                logger.warning("Attempt %d failed: %s", attempt, e)

            # Wait before retry with exponential backoff
            if attempt < self.max_retries:
                await asyncio.sleep(2 ** attempt)

        logger.error("AI reasoning failed after %d attempts", self.max_retries)
        return None

    def _build_prompt(self, codebase_snapshot: str, evolve_plan: str) -> str:
        """Build the prompt for the LLM."""
        return f"""
You are analyzing a Python/JavaScript/TypeScript project to generate improvements.

CURRENT CODEBASE SNAPSHOT:
```
{codebase_snapshot[:50000]}  # Limit to prevent token overflow
```

EVOLUTION PLAN (What needs to be done):
```
{evolve_plan}
```

Your task:
1. Read the Evolve_plan.md and find the FIRST [ pending ] item (NOT [ in-progress ] or [ completed ])
2. Analyze the codebase to understand how to implement it
3. Generate a concrete implementation plan
4. Produce a list of file patches to implement this ONE item
5. Output ONLY valid JSON (no preamble, no explanation, no markdown fences)

Required JSON structure:
{{
  "item_id": "ITEM_XXX",
  "item_title": "Title from Evolve_plan.md",
  "implementation_plan": "Detailed plan for how to implement this item",
  "patches": [
    {{
      "file": "relative/path/to/file.py",
      "action": "replace_block",  // or "create_file", "delete_file", "append_to_file"
      "old_content": "Content to find and replace (for replace_block action)",
      "new_content": "New content to insert",
      "overwrite": false
    }}
  ],
  "evolve_plan_update": {{
    "item_id": "ITEM_XXX",
    "new_status": "completed",
    "completion_note": "Brief note on what was implemented"
  }}
}}

Rules:
- NEVER attempt to modify 'frontend/src/pages/Settings.tsx', 'PROJECT_INSTRUCTIONS.md', 'MODIFICATION_HISTORY.md', or 'AGENTS.md'. These files are strictly protected and excluded from autonomous self-evolution.
- For replace_block: old_content must be a unique string in the file
- For create_file: only set overwrite=true if file already exists and should be replaced
- For delete_file: no old_content or new_content needed
- All paths must be relative to project root
- Output ONLY the JSON block, nothing else
"""

    def _parse_and_validate(self, response: str) -> Optional[Dict[str, Any]]:
        """Parse and validate JSON response from LLM."""
        try:
            # Clean response: strip markdown code fences if present
            clean_response = response.strip()
            if clean_response.startswith("```json"):
                clean_response = clean_response[7:]
            if clean_response.endswith("```"):
                clean_response = clean_response[:-3]
            clean_response = clean_response.strip()

            # Parse JSON
            result = json.loads(clean_response)

            # Validate structure
            if not isinstance(result, dict):
                logger.error("Response is not a JSON object")
                return None

            # Check required fields
            if "patches" not in result:
                logger.error("Missing 'patches' field in response")
                return None

            if not isinstance(result["patches"], list):
                logger.error("'patches' field is not a list")
                return None

            # Validate each patch
            for i, patch in enumerate(result["patches"]):
                if not isinstance(patch, dict):
                    logger.error("Patch %d is not a dict", i)
                    return None

                if "file" not in patch or "action" not in patch:
                    logger.error("Patch %d missing 'file' or 'action'", i)
                    return None

                # Validate action
                valid_actions = ["replace_block", "create_file", "delete_file", "append_to_file"]
                if patch["action"] not in valid_actions:
                    logger.error("Patch %d has invalid action: %s", i, patch["action"])
                    return None

            logger.info("✓ JSON validation passed")
            return result

        except json.JSONDecodeError as e:
            logger.error("JSON decode error: %s", e)
            return None
        except Exception as e:
            logger.error("Unexpected error during validation: %s", e)
            return None


# Singleton instance
_reasoner = None

def get_ai_reasoner(model_router=None) -> AIReasoner:
    """Get or create AI reasoner singleton."""
    global _reasoner
    if _reasoner is None:
        _reasoner = AIReasoner(model_router)
    return _reasoner
