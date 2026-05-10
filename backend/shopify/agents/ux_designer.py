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

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are a Senior UX Architect specializing in Shopify themes and conversion rate optimization.

Given a Creative Brief, produce a complete UX Blueprint defining every section for every page.

For EACH section, specify:
- file_name: Liquid file name (e.g., "hero-banner.liquid")
- purpose: One sentence describing what this section does
- settings: Array of schema setting objects [{type, id, label, default}]
- blocks: Array of block type objects [{type, name, settings: [...]}] (for repeatable elements)
- responsive_notes: How layout changes on mobile

REQUIRED PAGES (include all):
index, product, collection, list-collections, cart, blog, article, page, 404, search, customers/login, customers/register

REQUIRED GLOBAL SECTIONS (included in every page via layout/theme.liquid):
header, footer, announcement-bar

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
            {"type": "url", "id": "cta_url", "label": "Button URL"}
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
      "purpose": "Sticky navigation with logo, menu, search, and cart icon",
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

Be thorough — include at least 5 sections for the homepage, 8+ sections total across all templates.
"""


class UXDesigner:

    def __init__(self):
        pass

    async def run(self, context: SharedContext) -> Dict[str, Any]:
        logger.info("[UXDesigner] Planning UX blueprint...")

        brief = context.creative_brief or {}

        user_content = f"""
Create a complete UX Blueprint for this Shopify theme.

CREATIVE BRIEF:
{json.dumps(brief, indent=2)}

Design all sections for all required pages. Make them conversion-optimized for the {brief.get('niche', 'e-commerce')} niche.
Output ONLY valid JSON — no markdown, no explanation.
"""

        text = await call_model(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_content},
            ],
            task_type="general",
            max_tokens=4000,
            temperature=0.7,
        )
        data = self._parse_json(text)

        page_count = len(data.get("pages", []))
        section_count = sum(len(p.get("sections", [])) for p in data.get("pages", []))
        summary = f"Planned {page_count} pages with {section_count} sections total"
        logger.info("[UXDesigner] %s", summary)

        return {"status": "done", "summary": summary, "data": data}

    def _parse_json(self, text: str) -> dict:
        text = text.strip()
        m = re.search(r'```(?:json)?\s*([\s\S]+?)\s*```', text)
        if m:
            text = m.group(1).strip()
        return json.loads(text)
