"""
Shopify Theme Factory — Shopify Builder
Assembles agent outputs into a valid Shopify OS 2.0 theme directory and ZIP.
"""

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

        # 3. Apply creative brief colors to settings_data.json
        if context.creative_brief:
            self._apply_creative_brief(theme_dir, context.creative_brief)

        # 4. Download demo images
        content_pkg = context.content_package or {}
        image_queries = content_pkg.get("image_queries", [])
        if image_queries:
            assets_dir = theme_dir / "assets"
            fetcher = ImageFetcher(assets_dir)
            fetcher.download_demo_images(image_queries)

        # 5. Validate
        result = self.validator.validate(theme_dir)
        if not result.passed:
            logger.warning(
                "Theme validation issues (score=%.0f): %s",
                result.score,
                result.issues,
            )

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

    def _apply_creative_brief(self, theme_dir: Path, brief: dict):
        """Inject color palette and font settings into settings_data.json."""
        import json
        settings_file = theme_dir / "config" / "settings_data.json"
        try:
            data = json.loads(settings_file.read_text(encoding="utf-8"))
            colors = brief.get("colors", {})
            if colors:
                current = data.get("current", {})
                current.update({
                    "color_primary": colors.get("primary", current.get("color_primary")),
                    "color_secondary": colors.get("secondary", current.get("color_secondary")),
                    "color_accent": colors.get("accent", current.get("color_accent")),
                    "color_background": colors.get("background", current.get("color_background")),
                    "color_text": colors.get("text", current.get("color_text")),
                })
                data["current"] = current
            settings_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
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
