"""
Media API endpoints
GET /api/media/gallery - Get image gallery
GET /api/media/playlist - Get media playlist
GET /api/media/stream?file={path} - Stream media file
"""
import os
import pathlib
from fastapi import APIRouter, Query
from datetime import datetime

router = APIRouter(prefix="/api/media", tags=["media"])

SUPPORTED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
SUPPORTED_AUDIO_EXTENSIONS = {'.mp3', '.wav', '.ogg', '.m4a', '.flac'}
SUPPORTED_VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mkv', '.mov', '.webm'}

def get_media_folders():
    """Get path to media folders"""
    project_root = pathlib.Path(__file__).parent.parent.parent
    return {
        'exports': project_root / 'backend' / 'logs' / 'exports',
        'media': project_root / 'backend' / 'media' if (project_root / 'backend' / 'media').exists() else None,
    }

@router.get("/gallery")
async def get_gallery():
    """Get image gallery from exports folder"""
    try:
        media_dirs = get_media_folders()
        exports_dir = media_dirs['exports']

        images = []

        if exports_dir and exports_dir.exists():
            for item in sorted(exports_dir.rglob('*'), key=lambda p: p.stat().st_mtime, reverse=True):
                if item.is_file() and item.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS:
                    stat = item.stat()
                    images.append({
                        "path": str(item),
                        "name": item.name,
                        "thumbnail": f"/api/media/stream?file={str(item)}",
                        "date": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "agent": "export" if "export" in str(item) else None
                    })

        return images

    except Exception as e:
        return {"error": str(e)}

@router.get("/playlist")
async def get_playlist():
    """Get media playlist"""
    try:
        media_dirs = get_media_folders()
        playlist = []

        for ext_set, dir_type in [
            (SUPPORTED_AUDIO_EXTENSIONS, 'audio'),
            (SUPPORTED_VIDEO_EXTENSIONS, 'video'),
        ]:
            media_dir = media_dirs.get('media')
            if media_dir and media_dir.exists():
                for item in sorted(media_dir.rglob('*'), key=lambda p: p.stat().st_mtime, reverse=True):
                    if item.is_file() and item.suffix.lower() in ext_set:
                        playlist.append({
                            "path": f"/api/media/stream?file={str(item)}",
                            "name": item.name,
                            "duration": 180,  # Default 3 minutes
                            "type": dir_type
                        })

        return playlist

    except Exception as e:
        return {"error": str(e)}

from fastapi.responses import FileResponse

@router.get("/stream")
async def stream_media(file: str = Query(...)):
    """Stream media file"""
    try:
        file_path = pathlib.Path(file)

        # Security check
        if ".." in str(file_path):
            return {"error": "Invalid path"}

        if not file_path.exists():
            return {"error": "File not found"}

        # Return standard FastAPI file response
        return FileResponse(file_path)

    except Exception as e:
        return {"error": str(e)}
