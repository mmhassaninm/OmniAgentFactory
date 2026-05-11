"""
Shopify Theme Factory — Shopify Builder
Assembles agent outputs into a valid Shopify OS 2.0 theme directory and ZIP.
"""

import json as _json
import logging
import shutil
import zipfile
from pathlib import Path
from typing import Dict, Optional

from shopify.models import SharedContext, ThemePackage
from shopify.tools.validator import ThemeValidator
from shopify.tools.image_fetcher import ImageFetcher

logger = logging.getLogger(__name__)

BASE_SKELETON = Path(__file__).parent.parent / "templates" / "base_theme"
OUTPUT_ROOT = Path(__file__).parent.parent / "output" / "themes"


class ThemeValidationError(Exception):
    pass


class ShopifyBuilder:

    def __init__(self):
        self.validator = ThemeValidator()

    def _theme_dir(self, name: str, version: str) -> Path:
        safe_name = name.lower().replace(" ", "-")
        return OUTPUT_ROOT / safe_name / version

    def _validate_section_references(self, theme_dir, liquid_code: dict) -> list[str]:
        """
        Returns list of error strings for template JSONs referencing
        section .liquid files that don't exist.
        Parse template JSONs from theme_dir/templates/*.json
        Check each section "type" against generated_sections set.
        """
        errors: list[str] = []
        try:
            generated_sections = {
                p.replace("sections/", "").replace(".liquid", "")
                for p in liquid_code.keys()
                if p.startswith("sections/") and p.endswith(".liquid")
            }
            generated_sections.update({"announcement-bar", "header", "footer"})

            templates_dir = Path(theme_dir) / "templates"
            if not templates_dir.exists():
                return errors

            for tpl_file in templates_dir.rglob("*.json"):
                try:
                    data = _json.loads(tpl_file.read_text(encoding="utf-8"))
                    for section_key, section_cfg in data.get("sections", {}).items():
                        section_type = section_cfg.get("type", section_key)
                        if section_type not in generated_sections:
                            errors.append(
                                f"{tpl_file.name}: section '{section_type}' has no matching sections/{section_type}.liquid"
                            )
                except Exception as e:
                    errors.append(f"{tpl_file.name}: section-reference parse failed: {e}")
        except Exception as e:
            errors.append(f"Section-reference validation failed: {e}")
        return errors

    async def build_theme(self, context: SharedContext) -> ThemePackage:
        theme_dir = self._theme_dir(context.theme_name, context.version)

        # 1. Copy skeleton
        if theme_dir.exists():
            shutil.rmtree(theme_dir)
        shutil.copytree(BASE_SKELETON, theme_dir)
        logger.info("Copied skeleton to %s", theme_dir)

        # 2. Write all liquid/asset files from LiquidDeveloper agent
        liquid_code: Dict[str, str] = context.liquid_code or {}
        for rel_path, content in liquid_code.items():
            dest = theme_dir / rel_path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content, encoding="utf-8")
        logger.info("Wrote %d code files from Liquid Developer", len(liquid_code))

        # 2a. Dynamically build template JSONs from generated sections
        dynamic_templates = self._build_template_jsons(liquid_code)
        for tpl_rel_path, tpl_data in dynamic_templates.items():
            tpl_file = theme_dir / tpl_rel_path
            tpl_file.parent.mkdir(parents=True, exist_ok=True)
            tpl_file.write_text(
                _json.dumps(tpl_data, indent=2), encoding='utf-8'
            )
        logger.info("Built %d template JSONs from generated sections", len(dynamic_templates))

        # 2b. Fix orphaned section references in template JSONs (Bug 1B)
        generated_sections = {
            p.replace("sections/", "").replace(".liquid", "")
            for p in liquid_code.keys()
            if p.startswith("sections/") and p.endswith(".liquid")
        }
        generated_sections.update({"announcement-bar", "header", "footer"})

        templates_dir = theme_dir / "templates"
        if templates_dir.exists():
            for tpl_file in templates_dir.rglob("*.json"):
                try:
                    fixed = self._fix_orphaned_section_refs(
                        tpl_file.read_text(encoding="utf-8"), generated_sections
                    )
                    tpl_file.write_text(fixed, encoding="utf-8")
                except Exception as e:
                    logger.warning("Could not fix template %s: %s", tpl_file.name, e)

        # 3. Apply creative brief colors to settings_data.json
        if context.creative_brief:
            self._apply_creative_brief(theme_dir, context.creative_brief)

        # 4. Download demo images
        content_pkg = context.content_package or {}
        image_queries = content_pkg.get("image_queries", [])
        if image_queries:
            assets_dir = theme_dir / "assets"
            
            # Query MongoDB for decrypted unsplash key
            unsplash_key = ""
            try:
                from core.database import get_db
                from services.encryption import decrypt
                db = get_db()
                if db is not None:
                    settings_doc = await db.shopify_settings.find_one({"_id": "global"})
                    if settings_doc:
                        enc_key = settings_doc.get("unsplash_access_key", "")
                        if enc_key:
                            unsplash_key = decrypt(enc_key)
            except Exception as e:
                logger.warning("Failed to load Unsplash key from shopify_settings collection: %s", e)
                
            fetcher = ImageFetcher(assets_dir, unsplash_key=unsplash_key)
            fetcher.download_demo_images(image_queries)


        # 5. Validate
        result = self.validator.validate(theme_dir)
        if not result.passed:
            logger.warning(
                "Theme validation issues (score=%.0f): %s",
                result.score,
                result.issues,
            )

        # 5b. Enhanced Shopify OS 2.0 completeness validation (Part 3)
        try:
            completeness = self.validator.validate_theme_completeness(str(theme_dir))
            if not hasattr(context, "qa_errors"):
                context.qa_errors = []
            if not hasattr(context, "build_warnings"):
                context.build_warnings = []
            context.qa_errors.extend(completeness.get("errors", []))
            context.build_warnings.extend(completeness.get("warnings", []))

            for err in completeness.get("errors", []):
                logger.error("Theme completeness error: %s", err)
            for warn in completeness.get("warnings", []):
                logger.warning("Theme completeness warning: %s", warn)
        except Exception as e:
            logger.warning("Completeness validator failed (non-fatal): %s", e)

        # 6. Create ZIP
        zip_path = self._create_zip(theme_dir, context.theme_name, context.version)
        logger.info("Theme ZIP created: %s", zip_path)

        return ThemePackage(
            theme_id=context.theme_id,
            name=context.theme_name,
            niche=context.niche,
            version=context.version,
            zip_path=str(zip_path),
            sell_price=context.sell_price,
            qa_score=result.score,
            changelog=context.changelog,
        )

    def _fix_orphaned_section_refs(self, template_json_str: str, valid_sections: set) -> str:
        """
        Remove section entries from template JSON whose type has no .liquid file.
        Add safety check: if result has zero sections, keep at least 'header'
        and 'footer' to avoid empty templates.
        Return cleaned JSON string.
        """
        try:
            data = _json.loads(template_json_str)
            sections = data.get("sections", {})
            order = data.get("order", [])
            cleaned_sections = {}
            cleaned_order = []

            for section_id, section_cfg in sections.items():
                section_type = section_cfg.get("type", section_id)
                if section_type in valid_sections:
                    cleaned_sections[section_id] = section_cfg
                    if section_id in order:
                        cleaned_order.append(section_id)

            if not cleaned_sections:
                # Never return a template with zero sections.
                cleaned_sections = {
                    "header": {"type": "header"},
                    "footer": {"type": "footer"},
                }
                cleaned_order = ["header", "footer"]
            elif not cleaned_order:
                cleaned_order = list(cleaned_sections.keys())

            data["sections"] = cleaned_sections
            data["order"] = cleaned_order
            return _json.dumps(data, indent=2)
        except Exception:
            logger.warning("Failed to clean orphaned section refs; returning original template JSON")
        return template_json_str

    def _build_template_jsons(self, liquid_code: dict) -> dict[str, dict]:
        """
        Build template JSONs dynamically based on generated section files.
        Uses naming conventions to map sections to page templates.
        Returns {template_path: json_dict}. All templates include header and footer.
        """
        generated = {
            Path(p).stem
            for p in liquid_code.keys()
            if p.startswith('sections/') and p.endswith('.liquid')
        }
        always_present = {'announcement-bar', 'header', 'footer'}
        all_sections = generated | always_present

        def make_template(section_list: list) -> dict:
            sections_dict: dict = {}
            order: list = []
            if 'announcement-bar' in all_sections:
                sections_dict['announcement-bar'] = {'type': 'announcement-bar', 'disabled': False}
                order.append('announcement-bar')
            sections_dict['header'] = {'type': 'header'}
            order.append('header')
            for sec in section_list:
                if sec in all_sections and sec not in ('header', 'footer', 'announcement-bar'):
                    sections_dict[sec] = {'type': sec}
                    order.append(sec)
            sections_dict['footer'] = {'type': 'footer'}
            order.append('footer')
            return {'sections': sections_dict, 'order': order}

        PAGE_KEYWORDS = {
            'index.json':              ['hero-banner', 'featured-collection', 'features-list',
                                        'testimonials', 'newsletter', 'blog-posts'],
            'product.json':            ['product-hero', 'product-description', 'product-reviews',
                                        'related-products', 'product-recommendations'],
            'collection.json':         ['collection-hero', 'collection-grid',
                                        'collection-filter', 'filter-list'],
            'list-collections.json':   ['collections-hero', 'collections-grid', 'all-collections'],
            'blog.json':               ['blog-hero', 'blog-posts', 'blog-filter', 'blog-grid'],
            'article.json':            ['article-hero', 'article-content',
                                        'article-comments', 'article-related'],
            'page.json':               ['page-hero', 'page-content',
                                        'page-calls-to-action', 'about-hero'],
            'cart.json':               ['cart-hero', 'cart-items',
                                        'cart-total', 'cart-recommendations'],
            'search.json':             ['search-hero', 'search-results', 'search-grid'],
            '404.json':                ['error-hero', 'error-content', 'not-found'],
            'customers/login.json':    ['login-form', 'account-login'],
            'customers/register.json': ['register-form', 'account-register'],
        }

        result = {}
        for template_name, candidate_sections in PAGE_KEYWORDS.items():
            matched = [s for s in candidate_sections if s in all_sections]
            result[f'templates/{template_name}'] = make_template(matched)
        return result

    def _apply_creative_brief(self, theme_dir: Path, brief: dict, content_package: dict = None):
        """Inject color palette, fonts, border-radius, and content into settings_data.json."""
        settings_file = theme_dir / "config" / "settings_data.json"
        try:
            data = _json.loads(settings_file.read_text(encoding="utf-8"))
            current = data.get("current", {})

            # 1. Apply colors
            colors = brief.get("colors", {})
            if colors:
                current.update({
                    "color_primary": colors.get("primary", current.get("color_primary")),
                    "color_secondary": colors.get("secondary", current.get("color_secondary")),
                    "color_accent": colors.get("accent", current.get("color_accent")),
                    "color_background": colors.get("background", current.get("color_background")),
                    "color_text": colors.get("text", current.get("color_text")),
                    "color_button_bg": colors.get("primary", current.get("color_button_bg")),
                    "color_footer_bg": colors.get("primary", current.get("color_footer_bg")),
                })

            # 2. Apply typography
            if brief.get("font_primary"):
                font_id = brief["font_primary"].lower().replace(" ", "_") + "_n4"
                current["type_header_font"] = font_id
            if brief.get("font_secondary"):
                font_id = brief["font_secondary"].lower().replace(" ", "_") + "_n4"
                current["type_body_font"] = font_id

            # 3. Apply border radius by design style
            style = brief.get("border_radius", "sharp")
            br_map = {"sharp": 0, "soft": 8, "rounded": 16}
            br = br_map.get(style, 4)
            current["border_radius"] = br
            current["button_border_radius"] = br

            # 4. Apply content from content_package if provided
            if content_package:
                if content_package.get("hero_headline"):
                    current["hero_headline"] = content_package["hero_headline"]
                if content_package.get("hero_subheading"):
                    current["hero_subheading"] = content_package["hero_subheading"]
                if content_package.get("about_story"):
                    current["footer_about_text"] = content_package.get("about_story", "")[:300]
                if content_package.get("brand_tagline"):
                    current["brand_tagline"] = content_package.get("brand_tagline", "")

            data["current"] = current
            settings_file.write_text(_json.dumps(data, indent=2), encoding="utf-8")
        except Exception as e:
            logger.warning("Could not apply creative brief to settings_data.json: %s", e)

    def _create_zip(self, theme_dir: Path, name: str, version: str) -> Path:
        safe_name = name.lower().replace(" ", "-")
        zip_path = OUTPUT_ROOT / f"{safe_name}-{version}.zip"
        zip_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for file in theme_dir.rglob("*"):
                if file.is_file():
                    zf.write(file, file.relative_to(theme_dir))
        return zip_path

    def get_zip_path(self, name: str, version: str) -> Optional[Path]:
        safe_name = name.lower().replace(" ", "-")
        p = OUTPUT_ROOT / f"{safe_name}-{version}.zip"
        return p if p.exists() else None
