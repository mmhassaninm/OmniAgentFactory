"""
Shopify Theme Factory — Agent 4: Liquid Developer
Writes all Liquid/HTML/CSS/JS code for the theme.
"""

import json
import logging
import re
from typing import Any, Dict

from core.model_router import call_model
from shopify.models import SharedContext

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are a Senior Shopify Liquid Developer. Write production-ready Shopify OS 2.0 theme code.

Standards: OS 2.0 section architecture, complete {% schema %} blocks, Liquid filters (| money | img_url | escape | t), CSS custom properties, vanilla JS, lazy-load images, ARIA labels, mobile-first.

OUTPUT ONLY a valid JSON object mapping relative file paths to complete file content strings.
Example: {"sections/hero-banner.liquid": "<section>...</section>{% schema %}...{% endschema %}"}

Every section must have a complete {% schema %} with name, settings array, and presets array.
Write COMPLETE code — no placeholders, no TODOs.
"""

BATCH_SIZE = 5


class LiquidDeveloper:

    def __init__(self):
        pass

    async def run(self, context: SharedContext) -> Dict[str, Any]:
        logger.info("[LiquidDeveloper] Writing theme code...")

        brief = context.creative_brief or {}
        blueprint = context.ux_blueprint or {}

        # Build the list of sections to write from the blueprint
        all_sections = []
        for page in blueprint.get("pages", []):
            all_sections.extend(page.get("sections", []))
        all_sections.extend(blueprint.get("global_sections", []))

        # Deduplicate by file_name
        seen = set()
        unique_sections = []
        for s in all_sections:
            fn = s.get("file_name", "")
            if fn and fn not in seen:
                seen.add(fn)
                unique_sections.append(s)

        brief_summary = (
            f"Theme: {brief.get('theme_name', 'MyTheme')} | "
            f"Niche: {brief.get('niche', 'e-commerce')} | "
            f"Design: {brief.get('design_language', 'minimal')} | "
            f"Colors: primary={brief.get('colors', {}).get('primary', '#000')} "
            f"bg={brief.get('colors', {}).get('background', '#fff')} | "
            f"Fonts: {brief.get('font_primary', 'Inter')} / {brief.get('font_secondary', 'Inter')}"
        )

        if not unique_sections:
            logger.warning("[LiquidDeveloper] No sections in blueprint — skipping code generation")
            context.liquid_code = {}
            return {"status": "done", "summary": "No sections to write (empty blueprint)", "data": {}}

        batches = [
            unique_sections[i:i + BATCH_SIZE]
            for i in range(0, len(unique_sections), BATCH_SIZE)
        ]

        all_files: Dict[str, str] = {}
        for batch_num, batch in enumerate(batches, 1):
            logger.info("[LiquidDeveloper] Batch %d/%d — %d sections", batch_num, len(batches), len(batch))

            batch_content = f"""Write Liquid code for {len(batch)} Shopify theme sections.

THEME: {brief_summary}

SECTIONS ({len(batch)}):
{json.dumps(batch, indent=2)}

Return ONLY a JSON object: keys = file paths (e.g. "sections/hero-banner.liquid"), values = complete Liquid file content.
No markdown fences. No explanation. Valid JSON only.
"""
            text = await call_model(
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": batch_content},
                ],
                task_type="general",
                max_tokens=6000,
                temperature=0.7,
            )
            if not text or not text.strip():
                raise ValueError(
                    f"Empty model response for batch {batch_num}/{len(batches)}"
                )
            batch_files = self._parse_json(text)
            if not isinstance(batch_files, dict):
                raise ValueError(
                    f"Expected JSON object for batch {batch_num}, got {type(batch_files).__name__}"
                )
            all_files.update(batch_files)

        data = all_files
        file_count = len(data)
        summary = f"Wrote {file_count} theme files across {len(batches)} batches"
        logger.info("[LiquidDeveloper] %s", summary)

        # Store liquid_code directly (dict path→content)
        context.liquid_code = data
        return {"status": "done", "summary": summary, "data": data}

    def _parse_json(self, text: str) -> dict:
        text = text.strip()
        m = re.search(r'```(?:json)?\s*([\s\S]+?)\s*```', text)
        if m:
            text = m.group(1).strip()
        return json.loads(text)
