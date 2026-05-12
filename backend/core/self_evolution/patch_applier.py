"""
Patch Applier

Applies file patches to filesystem with:
- Action support: replace_block, create_file, delete_file, append_to_file
- File backup before modifications
- Evolve_plan.md status updates
- Error handling and graceful skipping
"""

import logging
import shutil
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

class PatchApplier:
    def __init__(self, root_path: str = "."):
        self.root_path = Path(root_path)

    def apply_patches(self, patches: List[Dict[str, Any]], iteration: int) -> Dict[str, Any]:
        """
        Apply patches to files.

        Returns:
            {
              "patches_applied": N,
              "patches_skipped": M,
              "files_modified": [list of relative paths],
              "errors": [list of error messages]
            }
        """
        result = {
            "patches_applied": 0,
            "patches_skipped": 0,
            "files_modified": [],
            "errors": []
        }

        # Create backup directory for this iteration
        backup_dir = self.root_path / "autonomous_logs" / f"backups" / f"iter_{iteration}"
        backup_dir.mkdir(parents=True, exist_ok=True)

        for i, patch in enumerate(patches):
            try:
                # Check for file exclusion to prevent autonomous regressions in critical files
                rel_file_path = Path(patch["file"]).as_posix().strip("./")
                excluded_files = {
                    "frontend/src/pages/Settings.tsx",
                    "PROJECT_INSTRUCTIONS.md",
                    "MODIFICATION_HISTORY.md",
                    "AGENTS.md",
                }
                if rel_file_path in excluded_files:
                    logger.warning("Patch %d skipped: file '%s' is protected/excluded from autonomous modification.", i + 1, rel_file_path)
                    result["patches_skipped"] += 1
                    result["errors"].append(f"Patch {i}: File '{rel_file_path}' is protected and excluded from autonomous modification.")
                    continue

                file_path = self.root_path / patch["file"]
                action = patch["action"]

                logger.info("Applying patch %d: %s action on %s", i + 1, action, file_path)

                # Back up existing file if it exists
                if file_path.exists():
                    backup_path = backup_dir / file_path.relative_to(self.root_path)
                    backup_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(file_path, backup_path)
                    logger.debug("Backed up to %s", backup_path)

                # Apply patch
                if action == "replace_block":
                    if not self._replace_block(file_path, patch["old_content"], patch["new_content"]):
                        result["patches_skipped"] += 1
                        result["errors"].append(f"Patch {i}: Could not find old_content in {file_path}")
                        continue

                elif action == "create_file":
                    if file_path.exists() and not patch.get("overwrite", False):
                        result["patches_skipped"] += 1
                        result["errors"].append(f"Patch {i}: File {file_path} already exists (overwrite=false)")
                        continue
                    self._create_file(file_path, patch["new_content"])

                elif action == "delete_file":
                    if file_path.exists():
                        file_path.unlink()
                    else:
                        logger.warning("File to delete does not exist: %s", file_path)

                elif action == "append_to_file":
                    self._append_to_file(file_path, patch["new_content"])

                else:
                    result["patches_skipped"] += 1
                    result["errors"].append(f"Patch {i}: Unknown action {action}")
                    continue

                result["patches_applied"] += 1
                result["files_modified"].append(str(file_path.relative_to(self.root_path)))
                logger.info("✓ Patch %d applied successfully", i + 1)

            except Exception as e:
                logger.error("Patch %d failed: %s", i + 1, e)
                result["patches_skipped"] += 1
                result["errors"].append(f"Patch {i}: {str(e)}")

        logger.info(
            "Patching complete: %d applied, %d skipped, %d files modified",
            result["patches_applied"], result["patches_skipped"], len(result["files_modified"])
        )

        # Update Evolve_plan.md if specified
        if "evolve_plan_update" in patches[0] if patches else False:
            try:
                update = patches[0]["evolve_plan_update"]
                self._update_evolve_plan(update)
            except Exception as e:
                logger.error("Failed to update Evolve_plan.md: %s", e)
                result["errors"].append(f"Evolve_plan update failed: {str(e)}")

        return result

    def _replace_block(self, file_path: Path, old_content: str, new_content: str) -> bool:
        """Replace a block of content in a file."""
        if not file_path.exists():
            logger.warning("File does not exist: %s", file_path)
            return False

        try:
            content = file_path.read_text(encoding="utf-8")

            # Check if old_content exists (exactly)
            if old_content not in content:
                logger.error("old_content not found in %s", file_path)
                return False

            # Replace
            new_file_content = content.replace(old_content, new_content, 1)  # Replace first occurrence only
            file_path.write_text(new_file_content, encoding="utf-8")
            return True

        except Exception as e:
            logger.error("Failed to replace block in %s: %s", file_path, e)
            return False

    def _create_file(self, file_path: Path, content: str) -> bool:
        """Create a new file."""
        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content, encoding="utf-8")
            logger.info("Created file: %s", file_path)
            return True
        except Exception as e:
            logger.error("Failed to create file %s: %s", file_path, e)
            return False

    def _append_to_file(self, file_path: Path, content: str) -> bool:
        """Append content to a file."""
        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "a", encoding="utf-8") as f:
                f.write(content)
            logger.info("Appended to file: %s", file_path)
            return True
        except Exception as e:
            logger.error("Failed to append to file %s: %s", file_path, e)
            return False

    def _update_evolve_plan(self, update: Dict[str, Any]) -> bool:
        """Update Evolve_plan.md with new status."""
        evolve_plan = self.root_path / "Evolve_plan.md"
        if not evolve_plan.exists():
            logger.warning("Evolve_plan.md not found")
            return False

        try:
            content = evolve_plan.read_text(encoding="utf-8")

            # Find the item by ID
            item_id = update.get("item_id")
            old_status = "[ pending ]"
            new_status = f"[ {update.get('new_status', 'completed')} ]"

            # Find and replace the status for this item
            import re
            pattern = f"(<!-- id: {item_id} -->.*?)\\[ [^\\]]+\\s\\]"
            replacement = f"\\1{new_status}"

            new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

            if new_content == content:
                logger.warning("Could not find item %s in Evolve_plan.md", item_id)
                return False

            evolve_plan.write_text(new_content, encoding="utf-8")
            logger.info("✓ Updated Evolve_plan.md: %s → %s", item_id, new_status)
            return True

        except Exception as e:
            logger.error("Failed to update Evolve_plan.md: %s", e)
            return False


# Singleton instance
_applier = None

def get_patch_applier(root_path: str = ".") -> PatchApplier:
    """Get or create patch applier singleton."""
    global _applier
    if _applier is None:
        _applier = PatchApplier(root_path)
    return _applier
