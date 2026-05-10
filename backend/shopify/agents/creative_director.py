"""
Shopify Theme Factory — Agent 2: Creative Director
Receives market research and creates a complete creative brief.
"""

import json
import logging
import re
from typing import Any, Dict

from core.model_router import call_model
from shopify.models import SharedContext
from shopify.utils import robust_parse_json

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are a Creative Director with 15 years of Shopify theme design experience.
You receive a market research report and create a complete Creative Brief for the chosen niche.

Your Creative Brief must be highly specific and immediately actionable for a developer.

Output ONLY valid JSON in this exact structure:
{
  "theme_name": "...",
  "tagline": "One sentence that sells the theme",
  "niche": "very specific niche e.g. luxury skincare DTC brands",
  "mood": ["clean", "premium", "editorial"],
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "background": "#hex",
    "text": "#hex"
  },
  "font_primary": "Google Font name for headings",
  "font_secondary": "Google Font name for body",
  "border_radius": "sharp | soft | rounded",
  "design_language": "minimal | bold | editorial | classic | luxury",
  "pages": ["index", "product", "collection", "about", "contact", "blog"],
  "sections_overview": ["hero-banner", "featured-collection", "testimonials", ...],
  "competitive_advantage": "What makes this theme beat the top 3 competitors",
  "recommended_price": 149,
  "target_customer": "Description of ideal store owner who buys this theme"
}

Rules:
- Theme name must be memorable, 1-2 words, not generic
- Colors must work well together and match the niche
- Font pairing must look professional on e-commerce sites
- All hex colors must be valid (e.g. #1A1A2E not just #black)
"""


class CreativeDirector:

    def __init__(self):
        pass

    async def run(self, context: SharedContext) -> Dict[str, Any]:
        logger.info("[CreativeDirector] Creating creative brief...")

        market_report = context.market_report or {}
        best = market_report.get("best_opportunity", {})

        user_content = f"""
Based on this market research, create a complete Creative Brief for the best opportunity.

BEST OPPORTUNITY:
{json.dumps(best, indent=2)}

FULL MARKET REPORT:
{json.dumps(market_report, indent=2)}

Create a Creative Brief that will result in a premium, highly sellable Shopify theme.
The theme name should be distinctive and memorable.
Output ONLY valid JSON — no markdown, no explanation.
"""

        text = await call_model(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_content},
            ],
            task_type="general",
            max_tokens=1500,
            temperature=0.7,
        )
        data = self._parse_json(text)

        summary = f"Theme: '{data.get('theme_name')}' | Niche: {data.get('niche')} | ${data.get('recommended_price')}"
        logger.info("[CreativeDirector] %s", summary)

        return {"status": "done", "summary": summary, "data": data}

    def _parse_json(self, text: str) -> dict:
        return robust_parse_json(text)
