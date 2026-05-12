"""
File explorer API endpoints
GET /api/files - List directory contents
GET /api/files/read - Read file contents safely
POST /api/files/write - Write/create file safely
DELETE /api/files/delete - Delete file safely
"""
import os
import pathlib
from fastapi import APIRouter, Query, HTTPException
from utils.error_response import validation_error, forbidden_error, not_found_error, http_exception
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/api/files", tags=["files"])

class WriteFileRequest(BaseModel):
    path: str
    content: str
    overwrite: bool = True

def get_project_root() -> pathlib.Path:
    """Resolve project root dynamically at runtime to prevent hardcoded absolute paths."""
    return pathlib.Path(__file__).resolve().parent.parent.parent

def validate_safe_path(project_root: pathlib.Path, relative_path: str) -> pathlib.Path:
    """
    Ensure the path is safe, exists/resolves within the project root,
    and prevents directory traversal attacks.
    """
    if ".." in relative_path or relative_path.startswith("/") or relative_path.startswith("\\"):
        raise validation_error("Invalid path structure")
        
    # Combine and resolve absolute paths
    abs_root = project_root.resolve()
    target_path = (abs_root / relative_path).resolve()
    
    # Path traversal guard: target_path must be inside or equal to abs_root
    if abs_root not in target_path.parents and abs_root != target_path:
         raise forbidden_error("Access denied: Path traversal detected")
         
    return target_path

@router.get("")
async def list_files(path: str = Query("")):
    """
    List files and directories in the specified path.
    Path is relative to project root.
    """
    try:
        project_root = get_project_root()
        target_path = validate_safe_path(project_root, path) if path else project_root

        if not target_path.exists():
            raise not_found_error("Path", path)

        if not target_path.is_dir():
            raise validation_error("Path is not a directory")

        files = []
        try:
            for item in sorted(target_path.iterdir()):
                stat = item.stat()
                files.append({
                    "name": item.name,
                    "type": "directory" if item.is_dir() else "file",
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "path": str(item.relative_to(project_root)).replace("\\", "/")
                })
        except PermissionError:
            raise forbidden_error("Permission denied")

        return files

    except HTTPException:
        raise
    except Exception as e:
        raise http_exception(str(e))

@router.get("/read")
async def read_file_content(path: str = Query(...)):
    """
    Read file content safely from the specified relative path.
    """
    try:
        project_root = get_project_root()
        target_path = validate_safe_path(project_root, path)
        
        if not target_path.exists() or not target_path.is_file():
            raise not_found_error("File", path)
            
        try:
            content = target_path.read_text(encoding="utf-8")
            return {"path": path, "content": content}
        except Exception as e:
            raise http_exception(f"Failed to read file: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise http_exception(str(e))

@router.post("/write")
async def write_file_content(req: WriteFileRequest):
    """
    Create or update file content safely at the specified relative path.
    """
    try:
        project_root = get_project_root()
        target_path = validate_safe_path(project_root, req.path)
        
        if target_path.exists() and not req.overwrite:
            raise validation_error("File already exists and overwrite is disabled")
            
        # Create parent directories dynamically if they do not exist
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            target_path.write_text(req.content, encoding="utf-8")
            return {"status": "success", "path": req.path, "bytes_written": len(req.content)}
        except Exception as e:
            raise http_exception(f"Failed to write file: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise http_exception(str(e))

@router.delete("/delete")
async def delete_file(path: str = Query(...)):
    """
    Delete a file safely at the specified relative path.
    """
    try:
        project_root = get_project_root()
        target_path = validate_safe_path(project_root, path)
        
        if not target_path.exists() or not target_path.is_file():
            raise not_found_error("File", path)
            
        try:
            target_path.unlink()
            return {"status": "success", "message": f"Deleted file: {path}"}
        except Exception as e:
            raise http_exception(f"Failed to delete file: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise http_exception(str(e))
