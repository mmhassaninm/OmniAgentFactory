"""
Shopify Theme Factory — Agent 3: UX Designer
Plans every page's section structure and schema.
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
You are a Senior UX Architect specializing in Shopify OS 2.0 themes and conversion rate optimization.

Given a Creative Brief, produce a complete UX Blueprint defining every section for every page.

For EACH section, specify:
- file_name: Liquid file name (e.g., "hero-banner.liquid")
- purpose: One sentence describing what this section does
- settings: Array of schema setting objects [{type, id, label, default}]
- blocks: Array of block type objects [{type, name, settings: [...]}] (for repeatable elements)
- responsive_notes: How layout changes on mobile

REQUIRED PAGES (include exactly these 10 pages):
index, product, collection, list-collections, cart, blog, article, page, search, 404

REQUIRED GLOBAL SECTIONS (included in every page via layout/theme.liquid):
header, footer, announcement-bar

SECTION COUNT: 6 to 9 sections per page (never fewer than 5, never more than 10)

SECTION SCHEMA RULES — MANDATORY:
1. Every text field = type "text" or "richtext" with translatable: true
2. Images = type "image_picker"
3. Repeatable items (testimonials, FAQs, product lists) = BLOCKS not settings
4. Every section must have a color_scheme select setting (light/dark/accent)
5. Every section must have padding_top and padding_bottom range settings (0-100px)
6. Every section must have a hide_on_mobile checkbox
7. preset "name" is ALWAYS set

BLOCKS example for testimonials:
{
  "type": "testimonial",
  "name": "Testimonial",
  "settings": [
    {"type": "image_picker", "id": "author_image", "label": "Author photo"},
    {"type": "text", "id": "author_name", "label": "Author name"},
    {"type": "range", "id": "rating", "min": 1, "max": 5, "step": 1, "label": "Rating", "default": 5},
    {"type": "textarea", "id": "text", "label": "Testimonial text"}
  ]
}

OUTPUT ONLY valid JSON:
{
  "pages": [
    {
      "template": "index",
      "sections": [
        {
          "file_name": "hero-banner.liquid",
          "purpose": "Full-width hero with image, headline, CTA",
          "settings": [
            {"type": "image_picker", "id": "image", "label": "Background image"},
            {"type": "text", "id": "heading", "label": "Heading", "default": "Welcome"},
            {"type": "text", "id": "subheading", "label": "Subheading", "default": ""},
            {"type": "text", "id": "cta_label", "label": "Button label", "default": "Shop Now"},
            {"type": "url", "id": "cta_url", "label": "Button URL"},
            {"type": "select", "id": "color_scheme", "label": "Color scheme", "default": "light", "options": [{"value": "light", "label": "Light"}, {"value": "dark", "label": "Dark"}]},
            {"type": "range", "id": "padding_top", "min": 0, "max": 100, "step": 4, "unit": "px", "label": "Top padding", "default": 60},
            {"type": "range", "id": "padding_bottom", "min": 0, "max": 100, "step": 4, "unit": "px", "label": "Bottom padding", "default": 60},
            {"type": "checkbox", "id": "hide_on_mobile", "label": "Hide on mobile", "default": false}
          ],
          "blocks": [],
          "responsive_notes": "Stack vertically on mobile, reduce hero height to 60vh"
        }
      ]
    }
  ],
  "global_sections": [
    {
      "file_name": "header.liquid",
      "purpose": "Sticky navigation with logo, menu, search, cart icon, and mobile hamburger",
      "settings": [
        {"type": "image_picker", "id": "logo", "label": "Logo"},
        {"type": "range", "id": "logo_width", "min": 80, "max": 300, "step": 10, "unit": "px", "label": "Logo width", "default": 150},
        {"type": "link_list", "id": "menu", "label": "Navigation menu", "default": "main-menu"}
      ],
      "blocks": [],
      "responsive_notes": "Collapse menu to hamburger on mobile"
    }
  ]
}

Return ONLY a valid JSON object. No markdown. No explanation. Start your response with { and end with }
"""


class UXDesigner:

    def __init__(self):
        pass

    async def run(self, context: SharedContext) -> Dict[str, Any]:
        logger.info("[UXDesigner] Planning UX blueprint...")

        brief = context.creative_brief or {}

        # Strip down the brief
        stripped_brief = {
            "theme_name": brief.get("theme_name", ""),
            "niche": brief.get("niche", ""),
            "colors": brief.get("colors", {}),
            "font_primary": brief.get("font_primary", ""),
            "price_range": brief.get("recommended_price", "") or brief.get("price_range", "")
        }

        user_content = f"""
Create a complete UX Blueprint for this Shopify theme.

CREATIVE BRIEF:
{json.dumps(stripped_brief, indent=2)}

Design 6-9 sections for all 10 required pages (index, product, collection, list-collections, cart, blog, article, page, search, 404) and the 3 global sections (header, footer, announcement-bar). Make them conversion-optimized for the {stripped_brief.get('niche', 'e-commerce')} niche.
Return ONLY a valid JSON object. No markdown. No explanation. Start your response with {{ and end with }}
"""

        text = await call_model(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_content},
            ],
            task_type="general",
            max_tokens=3000,
            temperature=0.7,
        )
        data = self._parse_json(text)

        page_count = len(data.get("pages", []))
        section_count = sum(len(p.get("sections", [])) for p in data.get("pages", []))
        summary = f"Planned {page_count} pages with {section_count} sections total"
        logger.info("[UXDesigner] %s", summary)

        return {"status": "done", "summary": summary, "data": data}

    def _parse_json(self, text: str) -> dict:
        return robust_parse_json(text)
