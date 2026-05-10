"""
Shopify Theme Factory — Agent 4: Liquid Developer
Writes all Liquid/HTML/CSS/JS code for the theme.
"""

import json
import logging
import os
from typing import Any, Dict

import anthropic

from shopify.models import SharedContext

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are a Senior Shopify Liquid Developer. You write production-ready Shopify OS 2.0 theme code.

TECHNICAL STANDARDS:
- Shopify Online Store 2.0 (section-based architecture, JSON templates)
- Every section file MUST have a complete valid {% schema %} block
- Use Liquid filters correctly: | money, | img_url: width: 600, | link_to, | escape, | t
- CSS: Use CSS custom properties (--color-primary, etc.) from the theme.css skeleton
- JavaScript: Vanilla JS only — no jQuery
- Performance: lazy load images (loading="lazy"), defer JS
- Accessibility: ARIA labels on buttons/icons, alt attributes on images, keyboard navigation
- Mobile-first responsive design
- Use {% liquid %} tag for multi-line Liquid logic

Given a UX Blueprint and Creative Brief, write complete code for ALL section files.

OUTPUT ONLY valid JSON — a flat object mapping relative file paths to complete file content:
{
  "sections/hero-banner.liquid": "{% comment %}...{% endcomment %}\n<section ...",
  "sections/featured-collection.liquid": "...",
  "sections/header.liquid": "...",
  "sections/footer.liquid": "...",
  "sections/announcement-bar.liquid": "...",
  "snippets/product-card.liquid": "...",
  "snippets/breadcrumbs.liquid": "..."
}

Rules:
- Write COMPLETE code. No placeholders. No "// TODO". Full working Liquid code.
- Every section must have a properly structured {% schema %} with name, settings, presets
- Section CSS goes inside {% style %}...{% endstyle %} blocks within the section file
- Include ARIA roles, labels, and skip links where appropriate
- Use {{ 'key' | t }} for all user-visible text strings
"""


class LiquidDeveloper:

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_KEY", ""))

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

        user_content = f"""
Write complete Liquid code for all sections in this Shopify theme.

CREATIVE BRIEF:
Theme: {brief.get('theme_name', 'MyTheme')}
Niche: {brief.get('niche', 'e-commerce')}
Colors: {json.dumps(brief.get('colors', {}), indent=2)}
Fonts: heading={brief.get('font_primary', 'Inter')}, body={brief.get('font_secondary', 'Inter')}
Design language: {brief.get('design_language', 'minimal')}

SECTIONS TO WRITE ({len(unique_sections)} total):
{json.dumps(unique_sections, indent=2)}

Write ALL sections. Each must be complete, production-ready Liquid code.
Return a JSON object where keys are file paths (e.g. "sections/hero-banner.liquid")
and values are the complete file content as a string.
Output ONLY valid JSON — no markdown fences, no explanation.
"""

        try:
            response = await self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=8000,
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
            logger.error("[LiquidDeveloper] JSON parse error: %s", e)
            data = self._minimal_fallback(brief)
        except Exception as e:
            logger.error("[LiquidDeveloper] LLM error: %s", e)
            data = self._minimal_fallback(brief)

        file_count = len(data)
        summary = f"Wrote {file_count} theme files"
        logger.info("[LiquidDeveloper] %s", summary)

        # Store liquid_code directly (dict path→content)
        context.liquid_code = data
        return {"status": "done", "summary": summary, "data": data}

    def _minimal_fallback(self, brief: dict) -> dict:
        name = brief.get("theme_name", "Generated Theme")
        primary = brief.get("colors", {}).get("primary", "#000")
        return {
            "sections/hero-banner.liquid": f"""<section class="hero" style="background: {primary}">
  <div class="page-width hero__content">
    <h1 class="hero__title">{{{{ section.settings.heading }}}}</h1>
    <p class="hero__subtitle">{{{{ section.settings.subheading }}}}</p>
    <a href="{{{{ section.settings.cta_url }}}}" class="btn btn-primary">{{{{ section.settings.cta_label }}}}</a>
  </div>
</section>
{{% schema %}}
{{"name": "Hero Banner", "settings": [{{"type": "text", "id": "heading", "label": "Heading", "default": "Welcome to {name}"}}, {{"type": "text", "id": "subheading", "label": "Subheading", "default": "Discover our collection"}}, {{"type": "text", "id": "cta_label", "label": "Button", "default": "Shop Now"}}, {{"type": "url", "id": "cta_url", "label": "Button URL"}}], "presets": [{{"name": "Hero Banner"}}]}}
{{% endschema %}}""",
            "sections/header.liquid": """<header class="site-header" role="banner">
  <div class="page-width site-header__inner">
    <a href="{{ routes.root_url }}" class="site-header__logo">{{ shop.name }}</a>
    <nav aria-label="Main navigation">
      <ul class="site-nav">
        {% for link in linklists[section.settings.menu].links %}
          <li><a href="{{ link.url }}">{{ link.title }}</a></li>
        {% endfor %}
      </ul>
    </nav>
    <div class="site-header__icons">
      <a href="{{ routes.cart_url }}" aria-label="Cart ({{ cart.item_count }} items)">
        {% render 'icon-cart' %}
        <span data-cart-count>{{ cart.item_count }}</span>
      </a>
    </div>
  </div>
</header>
{% schema %}
{"name": "Header", "settings": [{"type": "link_list", "id": "menu", "label": "Navigation menu", "default": "main-menu"}], "presets": []}
{% endschema %}""",
            "sections/footer.liquid": """<footer class="site-footer" role="contentinfo">
  <div class="page-width">
    <p>&copy; {{ 'now' | date: '%Y' }} {{ shop.name }}</p>
  </div>
</footer>
{% schema %}
{"name": "Footer", "settings": [], "presets": []}
{% endschema %}""",
            "sections/announcement-bar.liquid": """{% if section.settings.text != blank %}
<div class="announcement-bar" role="complementary">
  <p>{{ section.settings.text | escape }}</p>
</div>
{% endif %}
{% schema %}
{"name": "Announcement bar", "settings": [{"type": "text", "id": "text", "label": "Announcement text", "default": "Free shipping on orders over $50"}], "presets": [{"name": "Announcement bar"}]}
{% endschema %}""",
            "sections/main-product.liquid": """<section class="product-page section">
  <div class="page-width">
    <div class="product-grid">
      <div class="product__media">
        {% if product.featured_image %}
          {{ product.featured_image | image_url: width: 800 | image_tag: loading: 'lazy', alt: product.featured_image.alt }}
        {% endif %}
      </div>
      <div class="product__info">
        <h1 class="product__title">{{ product.title }}</h1>
        {% render 'price', product: product, show_badges: true %}
        {{ product.description }}
        <form action="{{ routes.cart_add_url }}" method="post">
          <input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">
          <button type="submit" class="btn btn-primary" {% unless product.available %}disabled{% endunless %}>
            {% if product.available %}{{ 'products.product.add_to_cart' | t }}{% else %}{{ 'products.product.sold_out' | t }}{% endif %}
          </button>
        </form>
      </div>
    </div>
  </div>
</section>
{% schema %}
{"name": "Product", "settings": [], "presets": []}
{% endschema %}""",
            "sections/main-collection.liquid": """<section class="collection-page section">
  <div class="page-width">
    <h1>{{ collection.title }}</h1>
    <div class="product-grid">
      {% for product in collection.products %}
        {% render 'product-card', product: product %}
      {% endfor %}
    </div>
    {% paginate collection.products by 24 %}
      {% render 'pagination', paginate: paginate %}
    {% endpaginate %}
  </div>
</section>
{% schema %}
{"name": "Collection", "settings": [], "presets": []}
{% endschema %}""",
            "snippets/product-card.liquid": """<article class="product-card">
  <a href="{{ product.url }}">
    <div class="product-card__image-wrapper">
      {% if product.featured_image %}
        {{ product.featured_image | image_url: width: 600 | image_tag: class: 'product-card__image', loading: 'lazy', alt: product.featured_image.alt }}
      {% endif %}
    </div>
    <div class="product-card__info">
      <h3 class="product-card__title">{{ product.title }}</h3>
      {% render 'price', product: product %}
    </div>
  </a>
</article>""",
        }
