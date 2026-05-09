from fastapi import APIRouter, HTTPException
from models.settings import get_settings, update_settings, SettingsModel

router = APIRouter()

@router.get("")
@router.get("/")
async def fetch_settings():
    """Returns the current system settings."""
    return await get_settings()

@router.patch("")
@router.patch("/")
async def patch_settings(updates: dict):
    """Updates specific system settings."""
    try:
        updated = await update_settings(updates)
        return updated
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
