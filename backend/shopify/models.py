"""
Shopify Theme Factory — Data models for the agent pipeline.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ── Pipeline context ─────────────────────────────────────────────────────────

class SharedContext:
    """Mutable context object passed through the swarm pipeline."""

    def __init__(self):
        self.theme_id: str = ""
        self.theme_name: str = ""
        self.version: str = "v1.0.0"
        self.niche: str = ""
        self.sell_price: float = 99.0

        self.market_report: Optional[Dict[str, Any]] = None
        self.creative_brief: Optional[Dict[str, Any]] = None
        self.ux_blueprint: Optional[Dict[str, Any]] = None
        self.liquid_code: Optional[Dict[str, str]] = None   # path → content
        self.content_package: Optional[Dict[str, Any]] = None
        self.qa_report: Optional[Dict[str, Any]] = None
        self.zip_path: Optional[str] = None
        self.changelog: str = ""
        self.qa_errors: list = []
        self.build_warnings: list = []
        self.evolution_lessons: str = ""

    def update(self, agent_name: str, result: dict):
        mapping = {
            "market_researcher": "market_report",
            "creative_director": "creative_brief",
            "ux_designer": "ux_blueprint",
            "liquid_developer": "liquid_code",
            "content_writer": "content_package",
            "qa_reviewer": "qa_report",
        }
        field = mapping.get(agent_name)
        if field:
            setattr(self, field, result.get("data"))
        if agent_name == "creative_director" and result.get("data"):
            brief = result["data"]
            self.theme_name = brief.get("theme_name", self.theme_name)
            self.niche = brief.get("niche", self.niche)
            self.sell_price = float(brief.get("recommended_price", self.sell_price))
        if agent_name == "shopify_builder" and result.get("zip_path"):
            self.zip_path = result["zip_path"]
        if agent_name == "version_manager" and result.get("version"):
            self.version = result["version"]
            self.changelog = result.get("changelog", "")


# ── Pydantic models ───────────────────────────────────────────────────────────

class NicheOpportunity(BaseModel):
    niche: str
    market_score: float = Field(ge=0, le=10)
    competition_level: str
    recommended_price: float
    key_features: List[str] = []
    top_competitors: List[str] = []


class MarketReport(BaseModel):
    opportunities: List[NicheOpportunity] = []
    best_opportunity: Optional[NicheOpportunity] = None
    research_date: datetime = Field(default_factory=datetime.utcnow)
    raw_data: Dict[str, Any] = {}


class ColorPalette(BaseModel):
    primary: str = "#000000"
    secondary: str = "#333333"
    accent: str = "#0066CC"
    background: str = "#FFFFFF"
    text: str = "#111111"


class CreativeBrief(BaseModel):
    theme_name: str
    tagline: str
    niche: str
    mood: List[str] = []
    colors: ColorPalette = Field(default_factory=ColorPalette)
    font_primary: str = "Inter"
    font_secondary: str = "Inter"
    border_radius: str = "soft"
    design_language: str = "minimal"
    pages: List[str] = []
    competitive_advantage: str = ""
    recommended_price: float = 99.0


class SectionSchema(BaseModel):
    file_name: str
    purpose: str
    settings: List[Dict[str, Any]] = []
    blocks: List[Dict[str, Any]] = []
    responsive_notes: str = ""


class PageBlueprint(BaseModel):
    template: str
    sections: List[SectionSchema] = []


class UXBlueprint(BaseModel):
    pages: List[PageBlueprint] = []
    global_sections: List[SectionSchema] = []
    component_notes: str = ""


class ProductDemo(BaseModel):
    name: str
    short_description: str
    long_description: str
    price: float
    compare_at_price: float
    tags: List[str] = []
    image_query: str


class ContentPackage(BaseModel):
    hero_headline: str = ""
    hero_subheading: str = ""
    hero_cta: str = "Shop Now"
    features: List[Dict[str, str]] = []
    products: List[ProductDemo] = []
    testimonials: List[Dict[str, Any]] = []
    about_story: str = ""
    blog_posts: List[Dict[str, str]] = []
    image_queries: List[str] = []


class QAReport(BaseModel):
    passed: bool = False
    score: float = Field(default=0.0, ge=0, le=100)
    issues: List[str] = []
    fixes_required: List[str] = []
    structure_ok: bool = False
    liquid_ok: bool = False
    performance_ok: bool = False
    accessibility_ok: bool = False


class ThemePackage(BaseModel):
    theme_id: str
    name: str
    niche: str
    version: str
    zip_path: str
    sell_price: float
    qa_score: float
    created_at: datetime = Field(default_factory=datetime.utcnow)
    changelog: str = ""


# ── MongoDB helpers ───────────────────────────────────────────────────────────

async def save_theme(db, context: SharedContext, zip_path: str, qa_score: float):
    """Upsert theme document and insert a version record."""
    import uuid
    if not context.theme_id:
        context.theme_id = str(uuid.uuid4())

    theme_doc = {
        "_id": context.theme_id,
        "name": context.theme_name,
        "niche": context.niche,
        "current_version": context.version,
        "sell_price": context.sell_price,
        "creative_brief": context.creative_brief,
        "updated_at": datetime.utcnow(),
    }
    try:
        await db.shopify_themes.update_one(
            {"_id": context.theme_id},
            {"$set": theme_doc, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True,
        )

        version_doc = {
            "_id": f"{context.theme_id}:{context.version}",
            "theme_id": context.theme_id,
            "version": context.version,
            "zip_path": zip_path,
            "changelog": context.changelog,
            "qa_score": qa_score,
            "created_at": datetime.utcnow(),
        }
        await db.shopify_versions.update_one(
            {"_id": version_doc["_id"]},
            {"$set": version_doc},
            upsert=True,
        )
    except Exception as e:
        logger.error("Failed to save theme to MongoDB: %s", e)


async def get_all_themes(db) -> List[dict]:
    """Return all theme documents with their latest version info."""
    try:
        cursor = db.shopify_themes.find({})
        themes = await cursor.to_list(length=200)
        # Detach MongoDB _id for JSON serialisation
        for t in themes:
            t["id"] = t.pop("_id", t.get("id", ""))
            if "created_at" in t:
                t["created_at"] = t["created_at"].isoformat()
            if "updated_at" in t:
                t["updated_at"] = t["updated_at"].isoformat()
        return themes
    except Exception as e:
        logger.error("Failed to fetch themes: %s", e)
        return []


async def get_theme_versions(db, theme_id: str) -> List[dict]:
    """Return all version records for a theme, newest first."""
    try:
        cursor = db.shopify_versions.find({"theme_id": theme_id}).sort("created_at", -1)
        versions = await cursor.to_list(length=50)
        for v in versions:
            v["id"] = v.pop("_id", "")
            if "created_at" in v:
                v["created_at"] = v["created_at"].isoformat()
        return versions
    except Exception as e:
        logger.error("Failed to fetch versions for %s: %s", theme_id, e)
        return []


async def save_market_research(db, report: dict):
    try:
        await db.shopify_market_research.insert_one({
            **report,
            "created_at": datetime.utcnow(),
        })
    except Exception as e:
        logger.error("Failed to save market research: %s", e)


async def get_latest_market_research(db) -> Optional[dict]:
    try:
        doc = await db.shopify_market_research.find_one(
            {}, sort=[("created_at", -1)]
        )
        if doc:
            doc["id"] = str(doc.pop("_id", ""))
            if "created_at" in doc:
                doc["created_at"] = doc["created_at"].isoformat()
        return doc
    except Exception as e:
        logger.error("Failed to fetch market research: %s", e)
        return None
