"""
Shopify Theme Factory — Agent 1: Market Researcher
Researches trending themes, niches, and opportunities in the Shopify marketplace.
"""

import json
import logging
import re
from typing import Any, Dict

from core.model_router import call_model
from shopify.models import SharedContext
from shopify.tools.market_scraper import MarketScraper

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are a Senior Market Research Analyst specializing in Shopify themes.
Your job is to analyze the Shopify theme marketplace and identify the best opportunities.

Given raw market data (scraped themes, web search insights), identify:

1. TOP SELLING NICHES right now (fashion, electronics, food, beauty, jewelry, home decor, etc.)
2. PRICE POINTS of top sellers ($49, $79, $99, $149, $199)
3. FEATURE GAPS — what themes are missing that buyers want
4. DESIGN TRENDS — what visual styles are trending (minimalist, dark mode, bold typography, editorial)
5. COMPETITION LEVEL — how saturated is each niche

For each niche opportunity, provide:
- niche: string (e.g., "luxury skincare DTC")
- market_score: float 1-10 (demand)
- competition_level: "low" | "medium" | "high"
- recommended_price: float (USD)
- key_features: list of 4-5 differentiating features
- top_competitors: list of 2-3 competitor theme names

Also pick the single BEST opportunity based on:
- High market_score + low/medium competition = best ROI

Output ONLY valid JSON in this exact structure:
{
  "opportunities": [
    {
      "niche": "...",
      "market_score": 8.5,
      "competition_level": "medium",
      "recommended_price": 149,
      "key_features": ["...", "..."],
      "top_competitors": ["...", "..."]
    }
  ],
  "best_opportunity": { ... same structure as above ... },
  "market_summary": "One paragraph summary of current Shopify theme market state"
}
"""


class MarketResearcher:

    def __init__(self):
        self.scraper = MarketScraper()

    async def run(self, context: SharedContext) -> Dict[str, Any]:
        logger.info("[MarketResearcher] Starting market research...")

        # Gather raw data from scrapers
        try:
            raw_data = await self.scraper.gather_all()
        except Exception as e:
            logger.warning("[MarketResearcher] Scraper error: %s", e)
            raw_data = {"themeforest_trending": [], "shopify_store": [], "web_insights": []}

        user_content = f"""
Analyze the following Shopify theme market data and identify the best opportunities.

ThemeForest trending themes ({len(raw_data.get('themeforest_trending', []))} found):
{json.dumps(raw_data.get('themeforest_trending', [])[:10], indent=2)}

Shopify Theme Store data ({len(raw_data.get('shopify_store', []))} found):
{json.dumps(raw_data.get('shopify_store', [])[:10], indent=2)}

Web search insights:
{chr(10).join(raw_data.get('web_insights', [])[:3])}

Based on this data, identify the top 5 niche opportunities and the single best one to build next.
Output ONLY valid JSON — no markdown, no explanation.
"""

        text = await call_model(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_content},
            ],
            task_type="general",
            max_tokens=2000,
            temperature=0.7,
        )
        if not text or not text.strip():
            raise ValueError("Empty response from model in MarketResearcher")
        data = self._parse_json(text)
        if not isinstance(data, dict):
            raise ValueError(
                f"Expected JSON object from LLM, got {type(data).__name__}: {repr(text[:100])}"
            )

        best = data.get("best_opportunity", {})
        summary = (
            f"Found {len(data.get('opportunities', []))} opportunities. "
            f"Best: {best.get('niche', 'unknown')} @ ${best.get('recommended_price', 99)}"
        )
        logger.info("[MarketResearcher] %s", summary)

        return {"status": "done", "summary": summary, "data": data}

    def _parse_json(self, text: str) -> dict:
        text = text.strip()
        m = re.search(r'```(?:json)?\s*([\s\S]+?)\s*```', text)
        if m:
            text = m.group(1).strip()
        return json.loads(text)
