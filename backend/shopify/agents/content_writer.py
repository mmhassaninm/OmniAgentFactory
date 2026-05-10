"""
Shopify Theme Factory — Agent 5: Content Writer
Writes all placeholder copy and image queries for the theme demo.
"""

import json
import logging
import os
from typing import Any, Dict

import anthropic

from shopify.models import SharedContext

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are a Senior E-commerce Copywriter and Content Strategist specializing in Shopify themes.
You write compelling demo content that makes themes look ready to sell on day one.

Given a niche and creative brief, produce complete demo content.

OUTPUT ONLY valid JSON:
{
  "hero_headline": "Bold, attention-grabbing headline (max 8 words)",
  "hero_subheading": "Supporting sentence (max 15 words)",
  "hero_cta": "Button text (2-4 words)",
  "features": [
    {"icon": "lucide-icon-name", "title": "Feature title", "description": "One sentence"}
  ],
  "products": [
    {
      "name": "Product name",
      "short_description": "For collection grid (20 words max)",
      "long_description": "For product page (100-150 words)",
      "price": 49.00,
      "compare_at_price": 69.00,
      "tags": ["tag1", "tag2"],
      "image_query": "Unsplash search query for product image"
    }
  ],
  "testimonials": [
    {
      "author": "First Last",
      "location": "City, Country",
      "rating": 5,
      "text": "Authentic review text (30-50 words)",
      "image_query": "portrait of person smiling"
    }
  ],
  "about_story": "Brand story paragraph (150-200 words)",
  "blog_posts": [
    {
      "title": "Blog post title",
      "excerpt": "First paragraph (50 words)",
      "image_query": "Search term for blog header image"
    }
  ],
  "image_queries": ["List of all unique Unsplash search queries needed for the theme demo"]
}

Rules:
- Create 8 demo products appropriate to the niche
- Create 4 testimonials with realistic names
- Create 3 blog posts
- All copy must feel premium, not generic
- Price points must be realistic for the niche
- image_queries should be specific enough for good Unsplash results
"""


class ContentWriter:

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_KEY", ""))

    async def run(self, context: SharedContext) -> Dict[str, Any]:
        logger.info("[ContentWriter] Writing theme content...")

        brief = context.creative_brief or {}
        niche = brief.get("niche", "e-commerce")

        user_content = f"""
Write complete demo content for this Shopify theme.

THEME DETAILS:
Name: {brief.get('theme_name', 'MyTheme')}
Niche: {niche}
Tagline: {brief.get('tagline', '')}
Target customer: {brief.get('target_customer', 'online shoppers')}
Mood: {', '.join(brief.get('mood', ['clean', 'premium']))}

Create demo content that showcases this theme beautifully.
All content must feel authentic and premium for the {niche} niche.
Output ONLY valid JSON — no markdown, no explanation.
"""

        try:
            response = await self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=3000,
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
            logger.error("[ContentWriter] JSON parse error: %s", e)
            data = self._fallback_content(brief)
        except Exception as e:
            logger.error("[ContentWriter] LLM error: %s", e)
            data = self._fallback_content(brief)

        product_count = len(data.get("products", []))
        image_count = len(data.get("image_queries", []))
        summary = f"Wrote content: {product_count} products, {image_count} images queued"
        logger.info("[ContentWriter] %s", summary)

        return {"status": "done", "summary": summary, "data": data}

    def _fallback_content(self, brief: dict) -> dict:
        niche = brief.get("niche", "e-commerce")
        return {
            "hero_headline": "Elevate Your Everyday",
            "hero_subheading": "Discover our curated collection of premium products",
            "hero_cta": "Shop Now",
            "features": [
                {"icon": "truck", "title": "Free Shipping", "description": "On all orders over $50 worldwide."},
                {"icon": "shield", "title": "Secure Payments", "description": "Your payment information is always protected."},
                {"icon": "refresh-cw", "title": "Easy Returns", "description": "30-day hassle-free return policy."},
            ],
            "products": [
                {"name": f"Premium {niche.split()[0].title()} Essential", "short_description": "Your daily essential, elevated.", "long_description": "Experience the difference that quality makes.", "price": 49.00, "compare_at_price": 69.00, "tags": ["bestseller"], "image_query": f"{niche} product white background"}
                for _ in range(4)
            ],
            "testimonials": [
                {"author": "Sarah M.", "location": "New York, USA", "rating": 5, "text": "Absolutely love this product. It's changed my daily routine completely.", "image_query": "woman smiling portrait"},
            ],
            "about_story": f"We believe in the power of quality products crafted for the modern lifestyle.",
            "blog_posts": [
                {"title": f"The Ultimate Guide to {niche.title()}", "excerpt": "Everything you need to know to get started.", "image_query": f"{niche} lifestyle photo"},
            ],
            "image_queries": [f"{niche} hero lifestyle", f"{niche} product shot", "happy customer portrait"],
        }
