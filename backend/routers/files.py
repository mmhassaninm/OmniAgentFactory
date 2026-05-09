"""
File explorer API endpoints
GET /api/files?path={path} - List directory contents
"""
import os
import pathlib
from fastapi import APIRouter, Query
from datetime import datetime

router = APIRouter(prefix="/api/files", tags=["files"])

@router.get("")
async def list_files(path: str = Query("")):
    """
    List files and directories in the specified path.
    Path is relative to project root.
    """
    try:
        # Prevent path traversal attacks
        if ".." in path:
            return {"error": "Invalid path"}

        # Get project root (parent of backend directory)
        project_root = pathlib.Path(__file__).parent.parent.parent
        target_path = project_root / path if path else project_root

        if not target_path.exists():
            return {"error": "Path not found"}

        if not target_path.is_dir():
            return {"error": "Path is not a directory"}

        files = []
        try:
            for item in sorted(target_path.iterdir()):
                stat = item.stat()
                files.append({
                    "name": item.name,
                    "type": "directory" if item.is_dir() else "file",
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "path": str(item.relative_to(project_root))
                })
        except PermissionError:
            return {"error": "Permission denied"}

        return files

    except Exception as e:
        return {"error": str(e)}
