"""
Shopify Theme Factory — Agent 2: Creative Director
Receives market research and creates a complete creative brief.
"""

import json
import logging
import os
from typing import Any, Dict

import anthropic

from shopify.models import SharedContext

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
        self.client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_KEY", ""))

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
            logger.error("[CreativeDirector] JSON parse error: %s", e)
            data = self._fallback_brief(best)
        except Exception as e:
            logger.error("[CreativeDirector] LLM error: %s", e)
            data = self._fallback_brief(best)

        summary = f"Theme: '{data.get('theme_name')}' | Niche: {data.get('niche')} | ${data.get('recommended_price')}"
        logger.info("[CreativeDirector] %s", summary)

        return {"status": "done", "summary": summary, "data": data}

    def _fallback_brief(self, best: dict) -> dict:
        return {
            "theme_name": "Lumière",
            "tagline": "Where luxury meets conversion.",
            "niche": best.get("niche", "luxury beauty & skincare"),
            "mood": ["clean", "premium", "minimal"],
            "colors": {
                "primary": "#1A1A2E",
                "secondary": "#16213E",
                "accent": "#C9A86C",
                "background": "#FAFAFA",
                "text": "#1A1A2E",
            },
            "font_primary": "Cormorant Garamond",
            "font_secondary": "Inter",
            "border_radius": "soft",
            "design_language": "luxury",
            "pages": ["index", "product", "collection", "list-collections", "about", "contact", "blog", "article", "cart", "404", "search"],
            "sections_overview": ["hero-banner", "featured-collection", "features-list", "testimonials", "newsletter", "instagram-feed"],
            "competitive_advantage": "Combines editorial photography layouts with high-converting product pages optimized for AOV and LTV.",
            "recommended_price": best.get("recommended_price", 149),
            "target_customer": "DTC beauty brands seeking a premium, editorial-feel storefront.",
        }
