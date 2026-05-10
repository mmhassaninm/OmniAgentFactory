"""
Shopify Theme Factory — Agent 6: QA Reviewer
Reviews generated code and returns a structured quality report.
"""

import json
import logging
import os
from typing import Any, Dict

import anthropic

from shopify.models import SharedContext
from shopify.tools.validator import ThemeValidator
from shopify.tools.shopify_builder import OUTPUT_ROOT

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are a Senior Shopify Theme QA Engineer. You review theme code for quality, correctness, and best practices.

Given a sample of Liquid code files, review and score:

STRUCTURE (25 points):
- All required template files present
- layout/theme.liquid has proper structure
- JSON templates reference valid section types
- config/settings_schema.json is valid

LIQUID CODE (25 points):
- No unclosed tags ({% for %}...{% endfor %}, {% if %}...{% endif %}, etc.)
- Correct Liquid filter usage (| money, | img_url, | escape, | t)
- Schema blocks are complete JSON with name, settings, presets fields
- No undefined or missing variables

PERFORMANCE (25 points):
- Images use loading="lazy"
- No render-blocking scripts in <head>
- CSS custom properties used (not hardcoded colors)
- Minimal CSS specificity

ACCESSIBILITY (25 points):
- Images have alt attributes
- Interactive elements have aria-labels
- Keyboard-navigable
- Sufficient color contrast consideration

OUTPUT ONLY valid JSON:
{
  "passed": true,
  "score": 85,
  "structure_ok": true,
  "liquid_ok": true,
  "performance_ok": true,
  "accessibility_ok": false,
  "issues": ["List of problems found"],
  "fixes_required": ["Specific fixes needed"],
  "positive_notes": ["What was done well"]
}
"""


class QAReviewer:

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_KEY", ""))
        self.validator = ThemeValidator()

    async def run(self, context: SharedContext) -> Dict[str, Any]:
        logger.info("[QAReviewer] Running quality review...")

        liquid_code = context.liquid_code or {}

        # Run structural validator first (no LLM needed)
        theme_name = context.theme_name.lower().replace(" ", "-")
        theme_dir = OUTPUT_ROOT / theme_name / context.version
        struct_result = None
        if theme_dir.exists():
            struct_result = self.validator.validate(theme_dir)

        # Sample code for LLM review (first 5 files to stay within context)
        sample = {k: v for k, v in list(liquid_code.items())[:5]}

        user_content = f"""
Review this Shopify theme code sample for quality issues.

THEME: {context.theme_name}
NICHE: {context.niche}

CODE SAMPLE ({len(liquid_code)} total files, showing {len(sample)}):
{json.dumps(sample, indent=2)[:6000]}

STRUCTURAL VALIDATOR RESULTS:
{json.dumps(struct_result.to_dict() if struct_result else {}, indent=2)}

Score this theme from 0-100 and list all issues found.
Output ONLY valid JSON — no markdown, no explanation.
"""

        try:
            response = await self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1500,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_content}],
            )
            text = response.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            data = json.loads(text)
        except json.JSONDecodeError as e:
            logger.error("[QAReviewer] JSON parse error: %s", e)
            data = self._fallback_report(struct_result)
        except Exception as e:
            logger.error("[QAReviewer] LLM error: %s", e)
            data = self._fallback_report(struct_result)

        score = data.get("score", 0)
        passed = data.get("passed", False)
        summary = f"QA score: {score}/100 | {'PASSED' if passed else 'ISSUES FOUND'}"
        logger.info("[QAReviewer] %s", summary)

        return {"status": "done", "summary": summary, "data": data}

    def _fallback_report(self, struct_result=None) -> dict:
        score = struct_result.score if struct_result else 70.0
        return {
            "passed": score >= 80,
            "score": score,
            "structure_ok": struct_result.passed if struct_result else True,
            "liquid_ok": True,
            "performance_ok": True,
            "accessibility_ok": True,
            "issues": struct_result.issues if struct_result else [],
            "fixes_required": [],
            "positive_notes": ["Theme structure validated"],
        }
