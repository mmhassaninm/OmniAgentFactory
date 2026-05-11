"""
Shopify Theme Factory — Agent 4: Liquid Developer
Writes all Liquid/HTML/CSS/JS code for the theme.
Now powered by Glimmer (Stiletto v5.0.1) design patterns as reference inspiration.
"""

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List

from core.model_router import call_model
from shopify.models import SharedContext
from shopify.utils import robust_parse_json

logger = logging.getLogger(__name__)

# ── Glimmer Reference Theme Integration ───────────────────────────────────────
# Path: backend/shopify/templates/Glimmer/
_HERE = Path(__file__).resolve()
GLIMMER_PATH = _HERE.parent.parent / "templates" / "Glimmer"

# Key sections from Glimmer to use as reference patterns
GLIMMER_REFERENCE_SECTIONS = [
    "image-hero.liquid",
    "countdown-banner.liquid",
    "complete-the-look.liquid",
    "featured-collection-grid.liquid",
    "collapsible-row-list.liquid",
    "image-compare.liquid",
    "gallery-carousel.liquid",
]


def _load_glimmer_patterns() -> str:
    """
    Load key sections from Glimmer theme as design pattern references.
    Returns a compact summary of patterns for injection into the system prompt.
    """
    patterns_text = ""
    sections_path = GLIMMER_PATH / "sections"

    if not sections_path.exists():
        logger.debug("Glimmer sections path not found — skipping inspiration load")
        return ""

    loaded = []
    for section_file in GLIMMER_REFERENCE_SECTIONS:
        path = sections_path / section_file
        if not path.exists():
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
            # Take first 40 lines as pattern preview
            preview = "\n".join(content.split("\n")[:40])
            loaded.append(f"### {section_file}\n```liquid\n{preview}\n```")
        except Exception as e:
            logger.debug(f"Could not load Glimmer section {section_file}: {e}")

    if loaded:
        section_list = "\n".join(f"- {s}" for s in GLIMMER_REFERENCE_SECTIONS if (sections_path / s).exists())
        patterns_text = (
            "\n\n# REFERENCE DESIGN PATTERNS (from Stiletto/Glimmer v5.0.1 — for inspiration ONLY, do NOT copy):\n"
            f"Available sections in Glimmer: {len(list(sections_path.glob('*.liquid')))} sections\n"
            f"Key reference sections loaded:\n{section_list}\n\n"
            "Study these patterns for: Liquid variable assignment style, overlay_opacity usage, "
            "responsive CSS class naming, animation classes, full-width handling, "
            "mobile-specific settings, and ARIA patterns.\n"
            "BLEND inspiration from multiple sections — never copy a single one verbatim.\n"
        )
        logger.info(f"[LiquidDeveloper] Loaded {len(loaded)} Glimmer reference patterns")

    return patterns_text


# Load Glimmer patterns once at module level (cached)
_GLIMMER_INSPIRATION = _load_glimmer_patterns()

SYSTEM_PROMPT = """
CRITICAL — OUTPUT FORMAT:
Return ONE valid JSON object. Keys = relative file paths. Values = file content.
The JSON must be parseable by Python's json.loads().
Write file content naturally — use real HTML quotes and real newlines.
Do NOT manually escape quotes or newlines in your file content.
The JSON serializer handles encoding automatically.
If you cannot fit all sections, write fewer but fully complete ones.
Never truncate a section mid-way.

You are a Senior Shopify Liquid Developer. Write production-ready Shopify OS 2.0 theme code.

Standards: OS 2.0 section architecture, complete {% schema %} blocks, Liquid filters (| money | image_url | escape | t), CSS custom properties, vanilla JS, lazy-load images, ARIA labels, mobile-first.

OUTPUT ONLY a valid JSON object mapping relative file paths to complete file content strings.
Example: {"sections/hero-banner.liquid": "<section>...</section>{% schema %}...{% endschema %}"}

Every section must have a complete {% schema %} with name, settings array, and presets array.
Write COMPLETE code — no placeholders, no TODOs.

CRITICAL RULE — SECTION SYNC (Bug 1A):
Every section "type" referenced in any template JSON MUST have a corresponding .liquid file in
the sections/ folder. Before finalizing output: verify every JSON section reference has a matching
.liquid file. If not — either create the .liquid file OR remove it from the JSON.
Never leave orphaned references.

SHOPIFY OS 2.0 IMAGE SYNTAX — MANDATORY:
NEVER use deprecated legacy image filters from old themes.
ALWAYS use: | image_url: width: 800   (standard)
            | image_url: width: 1200  (hero/banner)
            | image_url: width: 400   (thumbnails)
RIGHT:  {{ section.settings.image | image_url: width: 1200 | image_tag: loading: 'lazy', class: 'section__image', sizes: '(min-width: 1024px) 1200px, 100vw' }}

SECTION SCHEMA PRESETS — MANDATORY:
WRONG:  "presets": [{}]
RIGHT:  "presets": [{"name": "Hero Banner"}]
Every section MUST have at least one preset with a "name" field.

SCHEMA BLOCK — MANDATORY RULES:
The {% schema %} block must contain ONLY valid JSON — no Liquid tags,
no {% if %}, no {% for %}, no variables inside the schema block.
Schema content must be pure JSON that Shopify can parse directly.

WRONG:
{% schema %}{% if settings.menu != blank %}...{% endif %}{% endschema %}

RIGHT:
{% schema %}
{
  "name": "Header",
  "settings": [
    { "type": "link_list", "id": "menu", "label": "Navigation menu" }
  ],
  "presets": [{ "name": "Header" }]
}
{% endschema %}

MULTI-LANGUAGE — MANDATORY:
Never hardcode visible text. Always use translation keys:
WRONG: <h2>Welcome to our store</h2>
RIGHT: <h2>{{ 'sections.hero.heading' | t: default: section.settings.heading }}</h2>

RESPONSIVE CSS — MANDATORY (mobile-first with these exact breakpoints):
.section { padding: 40px 16px; }
@media (min-width: 768px) { .section { padding: 60px 40px; } }
@media (min-width: 1024px) { .section { padding: 80px 60px; } }
@media (min-width: 1440px) { .section { padding: 100px; max-width: var(--page-width); margin: 0 auto; } }

STANDARD SECTION SETTINGS — Add to EVERY section schema:
{"type": "select", "id": "color_scheme", "label": "Color scheme", "default": "light",
  "options": [{"value": "light", "label": "Light"}, {"value": "dark", "label": "Dark"}, {"value": "accent", "label": "Accent"}]},
{"type": "range", "id": "padding_top", "min": 0, "max": 100, "step": 4, "unit": "px", "label": "Top padding", "default": 60},
{"type": "range", "id": "padding_bottom", "min": 0, "max": 100, "step": 4, "unit": "px", "label": "Bottom padding", "default": 60},
{"type": "checkbox", "id": "hide_on_mobile", "label": "Hide on mobile", "default": false}

ACCESSIBILITY — MANDATORY:
- All images: alt="{{ section.settings.image.alt | escape | default: shop.name }}"
- All interactive elements: aria-label attributes
- Lazy loading: loading="lazy" for all images except hero (use loading="eager" for hero)
"""

BATCH_SIZE = 3


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

            # Inject Glimmer inspiration into system prompt for this batch
            enriched_system_prompt = SYSTEM_PROMPT + _GLIMMER_INSPIRATION

            batch_content = f"""Write Liquid code for {len(batch)} Shopify theme sections.

THEME: {brief_summary}

SECTIONS ({len(batch)}):
{json.dumps(batch, indent=2)}

Return ONLY a JSON object: keys = file paths (e.g. "sections/hero-banner.liquid"), values = complete Liquid file content.
No markdown fences. No explanation. Valid JSON only.
"""
            if hasattr(context, "evolution_lessons") and context.evolution_lessons:
                batch_content += context.evolution_lessons
            batch_files = {}
            try:
                text = await call_model(
                    messages=[
                        {"role": "system", "content": enriched_system_prompt},
                        {"role": "user",   "content": batch_content},
                    ],
                    task_type="general",
                    max_tokens=4000,
                    temperature=0.7,
                )
                if not text or not text.strip():
                    raise ValueError(f"Empty response for batch {batch_num}")
                batch_files = self._parse_json(text)
                if not isinstance(batch_files, dict) or len(batch_files) == 0:
                    raise ValueError(f"Empty or invalid batch result for batch {batch_num}")
            except Exception as e:
                logger.warning(
                    "[LiquidDeveloper] Batch %d failed: %s — falling back to per-section", batch_num, e
                )
                # Per-section fallback: write each section individually
                for section in batch:
                    section_files = await self._write_section_individually(
                        section, brief_summary, context
                    )
                    batch_files.update(section_files)
            all_files.update(batch_files)

        # Post-parse cleanup: unescape double-escaped content
        cleaned_files: Dict[str, str] = {}
        for path, content in all_files.items():
            if isinstance(content, str):
                if '\\"' in content:
                    content = content.replace('\\"', '"')
                if '\\n' in content:
                    content = content.replace('\\n', '\n')
                if '\\t' in content:
                    content = content.replace('\\t', '\t')
                if "\\'" in content:
                    content = content.replace("\\'", "'")
            cleaned_files[path] = content
        all_files = cleaned_files

        data = all_files
        file_count = len(data)
        summary = f"Wrote {file_count} theme files across {len(batches)} batches"
        logger.info("[LiquidDeveloper] %s", summary)

        # Store liquid_code directly (dict path→content)
        context.liquid_code = data
        return {"status": "done", "summary": summary, "data": data}

    async def _write_section_individually(
        self, section: dict, brief_summary: str, context: SharedContext
    ) -> dict:
        """
        Fallback: write a single section when batch parsing fails.
        Returns {file_path: content} or {} on failure.
        """
        try:
            prompt = f"""Write ONE Shopify OS 2.0 section file.

THEME: {brief_summary}
SECTION: {json.dumps(section, indent=2)}

Return ONLY a JSON object with ONE key (the file path) and ONE value
(the complete Liquid file content as a properly escaped JSON string).
Example: {{"sections/hero-banner.liquid": "<section>...</section>\\n{{% schema %}}...{{% endschema %}}"}}

CRITICAL: escape ALL newlines as \\n inside the JSON string value.
"""
            if hasattr(context, "evolution_lessons") and context.evolution_lessons:
                prompt += context.evolution_lessons
            text = await call_model(
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                task_type="general",
                max_tokens=2000,
                temperature=0.7,
            )
            result = self._parse_json(text)
            return result if isinstance(result, dict) else {}
        except Exception as e:
            logger.warning("[LiquidDeveloper] Individual section failed (%s): %s",
                           section.get("file_name", "?"), e)
            return {}

    def _parse_json(self, text: str) -> dict:
        parsed = robust_parse_json(text)
        if not isinstance(parsed, dict) or len(parsed) == 0:
            raise ValueError("Empty or invalid JSON object from LiquidDeveloper")
        return parsed
