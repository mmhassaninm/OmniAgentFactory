from pydantic import BaseModel, Field
from typing import Dict, Optional
from models.database import db


class ProviderConfig(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    default_model: Optional[str] = None
    enabled: bool = True


class CustomProviderConfig(BaseModel):
    """User-added OpenAI-compatible provider (e.g. Ollama, local vLLM, custom proxy)."""
    display_name: str
    base_url: str
    api_key: Optional[str] = None
    enabled: bool = True


class SettingsModel(BaseModel):
    proactiveBackgroundProcessing: bool = True
    active_provider: str = "lm_studio"
    provider_configs: Dict[str, ProviderConfig] = Field(default_factory=dict)
    custom_providers: Dict[str, CustomProviderConfig] = Field(default_factory=dict)


async def get_settings() -> SettingsModel:
    """Retrieves system settings from MongoDB or returns defaults."""
    doc = await db.settings.find_one({"_id": "system_settings"})
    if not doc:
        default_settings = SettingsModel()
        await db.settings.insert_one({"_id": "system_settings", **default_settings.model_dump()})
        return default_settings
    # Strip the MongoDB _id before passing to Pydantic
    doc.pop("_id", None)
    try:
        return SettingsModel(**doc)
    except Exception:
        return SettingsModel()


async def update_settings(updates: dict) -> SettingsModel:
    """Updates system settings in MongoDB."""
    await db.settings.update_one(
        {"_id": "system_settings"},
        {"$set": updates},
        upsert=True
    )
    return await get_settings()
