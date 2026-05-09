import os
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class ObsidianTool:
    def __init__(self):
        vault_path = os.environ.get("OBSIDIAN_VAULT_PATH")
        if vault_path:
            self.vault_path = Path(vault_path)
        else:
            self.vault_path = Path.home() / "Documents" / "Obsidian_Vault"
            
        self.vault_path.mkdir(parents=True, exist_ok=True)

    def _get_path(self, title):
        safe_title = title if title.endswith('.md') else f"{title}.md"
        safe_title = safe_title.replace("../", "").replace("..\\", "")
        return self.vault_path / safe_title

    def execute(self, action: str, title: str = None, content: str = None, query: str = None) -> str:
        try:
            if action == 'listNotes':
                notes = [f.stem for f in self.vault_path.glob("*.md")]
                return json.dumps({"notes": notes, "total": len(notes)})
            elif action == 'readNote':
                p = self._get_path(title)
                if not p.exists(): return f"Note not found: {title}"
                return p.read_text(encoding="utf-8")
            elif action == 'createNote':
                p = self._get_path(title)
                if p.exists(): return f"Note already exists: {title}"
                p.write_text(content or "", encoding="utf-8")
                return f"Note '{title}' created."
            elif action == 'appendNote':
                p = self._get_path(title)
                if not p.exists():
                    p.write_text(content or "", encoding="utf-8")
                else:
                    with open(p, "a", encoding="utf-8") as f:
                        f.write(f"\n\n{content}")
                return f"Appended to '{title}'."
            elif action == 'searchNotes':
                results = []
                for p in self.vault_path.glob("*.md"):
                    if query.lower() in p.read_text(encoding="utf-8").lower():
                        results.append({"title": p.stem, "matches": "Found in content"})
                return json.dumps({"matches": results, "total": len(results)})
            else:
                return f"Unsupported Obsidian action: {action}"
        except Exception as e:
            logger.error(f"ObsidianTool execution failed: {e}")
            return f"Error: {str(e)}"

_obsidian_tool = ObsidianTool()

def dispatch_obsidian(kwargs: dict) -> str:
    return _obsidian_tool.execute(**kwargs)
