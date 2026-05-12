"""
Omni Commander — File System Executor

Performs read, write, search, listing, and deletion inside the designated workspace.
All paths are securely normalized and bound relative to the project workspace root.
"""

import os
import shutil
import re
from typing import Dict, Any

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))


def normalize_path(rel_path: str) -> str:
    """Safely resolve a relative workspace path and ensure it stays inside workspace root."""
    # Strip leading slashes/backslashes or drive letters to prevent escaping
    cleaned = rel_path.lstrip("/\\")
    cleaned = re.sub(r"^[a-zA-Z]:", "", cleaned)
    
    # Resolve absolute path
    abs_path = os.path.abspath(os.path.join(WORKSPACE_ROOT, cleaned))
    
    # Prevent traversal attacks outside of WORKSPACE_ROOT
    if not abs_path.startswith(WORKSPACE_ROOT):
         raise PermissionError("Directory traversal detected! Operations are bound to the workspace root.")
    
    return abs_path


async def execute_file_action(params: Dict[str, Any]) -> Dict[str, Any]:
    """Route and execute a specific file system task."""
    action = params.get("action", "")
    path_param = params.get("path", ".")
    
    try:
        target_path = normalize_path(path_param)
        
        if action == "read_file":
            if not os.path.isfile(target_path):
                return {"success": False, "error": f"File does not exist: {path_param}"}
            
            with open(target_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            return {
                "success": True,
                "content": content,
                "size_bytes": len(content),
                "path": path_param
            }
            
        elif action == "write_file":
            content = params.get("content", "")
            # Ensure parent directories exist
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            
            with open(target_path, "w", encoding="utf-8") as f:
                f.write(content)
            return {
                "success": True,
                "message": f"Successfully wrote {len(content)} characters to {path_param}",
                "path": path_param
            }
            
        elif action == "list_dir":
            if not os.path.isdir(target_path):
                return {"success": False, "error": f"Directory does not exist: {path_param}"}
                
            entries = os.listdir(target_path)
            contents = []
            for entry in entries:
                entry_path = os.path.join(target_path, entry)
                is_dir = os.path.isdir(entry_path)
                contents.append({
                    "name": entry,
                    "is_directory": is_dir,
                    "size_bytes": os.path.getsize(entry_path) if not is_dir else 0
                })
            return {
                "success": True,
                "contents": contents,
                "path": path_param
            }
            
        elif action == "delete_file":
            if not os.path.isfile(target_path):
                return {"success": False, "error": f"File not found: {path_param}"}
                
            os.remove(target_path)
            return {
                "success": True,
                "message": f"Successfully deleted file: {path_param}",
                "path": path_param
            }
            
        elif action == "search_files":
            query = params.get("query", "")
            if not query:
                return {"success": False, "error": "Search query parameter is missing."}
                
            results = []
            # Scan files recursively
            for root, dirs, files in os.walk(target_path):
                # Ignore hidden directories (like .git, .pycache)
                dirs[:] = [d for d in dirs if not d.startswith(".")]
                
                for file in files:
                    file_path = os.path.join(root, file)
                    rel_file_path = os.path.relpath(file_path, WORKSPACE_ROOT)
                    
                    try:
                        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                            for idx, line in enumerate(f, 1):
                                if query in line:
                                    results.append({
                                        "file": rel_file_path,
                                        "line_number": idx,
                                        "line_content": line.strip()
                                    })
                                    if len(results) >= 50: # Cap at 50 results
                                        break
                    except Exception:
                        continue
                    if len(results) >= 50:
                        break
                if len(results) >= 50:
                    break
                    
            return {
                "success": True,
                "query": query,
                "matches": results,
                "match_count": len(results)
            }
            
        else:
            return {"success": False, "error": f"Unknown file action: {action}"}
            
    except Exception as e:
        return {"success": False, "error": str(e)}
