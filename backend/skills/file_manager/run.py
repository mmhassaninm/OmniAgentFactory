"""
File Manager skill — safely read, write, and list files.
Protected against path traversal attacks.
Entry points: read_file, write_file, list_files
"""

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Restrict file operations to the project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent  # backend/skills/*/run.py -> project root


def _safe_path(relative_path: str) -> Path:
    """Resolve a path safely, preventing traversal outside the project root."""
    target = (PROJECT_ROOT / relative_path).resolve()
    if not str(target).startswith(str(PROJECT_ROOT)):
        raise PermissionError(f"Path traversal blocked: {relative_path}")
    return target


def read_file(path: str) -> dict[str, Any]:
    """
    Read a file safely.

    Args:
        path: Relative path from project root (e.g., "README.md")

    Returns:
        dict with keys: path, content, size, status
    """
    try:
        target = _safe_path(path)
        if not target.exists():
            return {"status": "error", "error": f"File not found: {path}"}
        if not target.is_file():
            return {"status": "error", "error": f"Not a file: {path}"}
        content = target.read_text(encoding="utf-8")
        return {
            "status": "ok",
            "path": path,
            "content": content,
            "size": len(content),
        }
    except PermissionError as e:
        return {"status": "error", "error": str(e)}
    except Exception as e:
        logger.warning("[Skill file_manager] read_file error: %s", e)
        return {"status": "error", "error": str(e)[:200]}


def write_file(path: str, content: str) -> dict[str, Any]:
    """
    Write content to a file safely.

    Args:
        path: Relative path from project root
        content: Text content to write

    Returns:
        dict with keys: path, size, status
    """
    try:
        target = _safe_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return {
            "status": "ok",
            "path": path,
            "size": len(content),
        }
    except PermissionError as e:
        return {"status": "error", "error": str(e)}
    except Exception as e:
        logger.warning("[Skill file_manager] write_file error: %s", e)
        return {"status": "error", "error": str(e)[:200]}


def list_files(path: str = ".") -> dict[str, Any]:
    """
    List files and directories at a relative path.

    Args:
        path: Relative directory path from project root

    Returns:
        dict with keys: path, entries (list of {name, type, size}), status
    """
    try:
        target = _safe_path(path)
        if not target.exists():
            return {"status": "error", "error": f"Path not found: {path}"}
        if not target.is_dir():
            return {"status": "error", "error": f"Not a directory: {path}"}

        entries: list[dict[str, Any]] = []
        for entry in sorted(target.iterdir()):
            try:
                stat = entry.stat()
                entries.append({
                    "name": entry.name,
                    "type": "directory" if entry.is_dir() else "file",
                    "size": stat.st_size if entry.is_file() else 0,
                })
            except OSError:
                continue

        return {
            "status": "ok",
            "path": path,
            "entries": entries,
            "count": len(entries),
        }
    except PermissionError as e:
        return {"status": "error", "error": str(e)}
    except Exception as e:
        logger.warning("[Skill file_manager] list_files error: %s", e)
        return {"status": "error", "error": str(e)[:200]}