"""
Codebase Reader

Reads entire project codebase into structured representation with:
- Configurable ignore list (.git/, node_modules/, __pycache__, *.zip, *.log)
- Token budgeting to stay within AI context limits
- File prioritization (Evolve_plan.md → core → API → services → frontend → other)
"""

import logging
from pathlib import Path
from typing import List, Optional, Tuple
import os

logger = logging.getLogger(__name__)

class CodebaseReader:
    def __init__(
        self,
        root_path: str = ".",
        ignore_patterns: Optional[List[str]] = None,
        max_tokens: int = 80000
    ):
        self.root_path = Path(root_path)
        self.max_tokens = max_tokens

        # Default ignore patterns
        if ignore_patterns is None:
            self.ignore_patterns = [
                ".git", "node_modules", "__pycache__", ".pytest_cache",
                ".venv", "venv", ".env", ".env.local", ".env.*.local",
                "*.log", "*.zip", "*.pyc", ".DS_Store", ".vibelab_drafts",
                "dist", "build", "*.egg-info", ".next", "out",
                "chroma_db", "autonomous_logs", "frontend/public"
            ]
        else:
            self.ignore_patterns = ignore_patterns

    def _should_ignore(self, path: Path) -> bool:
        """Check if path should be ignored."""
        path_str = str(path.relative_to(self.root_path))

        for pattern in self.ignore_patterns:
            if pattern in path_str or path_str.endswith(pattern):
                return True

        # Ignore common non-code files
        if path.suffix in [".log", ".txt", ".md", ".json"] and "Evolve_plan" not in path.name:
            return True

        return False

    def _estimate_tokens(self, text: str) -> int:
        """Rough token estimate: ~4 characters per token."""
        return len(text) // 4

    def _get_file_priority(self, path: Path) -> Tuple[int, str]:
        """Return priority (lower = higher priority) and category."""
        path_str = str(path.relative_to(self.root_path))

        # Tier 0: Evolve_plan.md
        if "Evolve_plan" in path.name:
            return (0, "evolve_plan")

        # Tier 1: Core autonomous evolution
        if "self_evolution" in path_str or "autonomous_evolution" in path_str:
            return (1, "evolution_core")

        # Tier 2: Core systems (database, config, model_router, factory)
        if "core/" in path_str and any(x in path_str for x in ["database", "config", "model_router", "factory"]):
            return (2, "core_systems")

        # Tier 3: API/routers
        if "api/" in path_str or "routers/" in path_str:
            return (3, "api_routers")

        # Tier 4: Services/tools
        if "services/" in path_str or "tools/" in path_str:
            return (4, "services")

        # Tier 5: Agent code
        if "agent" in path_str or "agents/" in path_str:
            return (5, "agents")

        # Tier 6: Frontend
        if "frontend/" in path_str:
            return (6, "frontend")

        # Tier 7: Everything else
        return (7, "other")

    def read_codebase(self, max_tokens: Optional[int] = None) -> str:
        """Read entire codebase respecting token budget and prioritization."""
        if max_tokens is None:
            max_tokens = self.max_tokens

        # Collect all code files with priority
        files_with_priority = []

        for ext in ["*.py", "*.tsx", "*.ts", "*.js", "*.jsx", "*.sql", "*.yml", "*.yaml"]:
            for path in self.root_path.rglob(ext):
                if not self._should_ignore(path):
                    priority = self._get_file_priority(path)
                    files_with_priority.append((priority, path))

        # Sort by priority
        files_with_priority.sort(key=lambda x: (x[0][0], x[1].name))

        # Read files in priority order, respecting token budget
        result = []
        tokens_used = 0

        for (priority, category), path in files_with_priority:
            try:
                content = path.read_text(encoding="utf-8", errors="ignore")
                file_tokens = self._estimate_tokens(content)

                # Check if adding this file exceeds budget
                if tokens_used + file_tokens > max_tokens:
                    logger.info(
                        "Token budget reached (%d/%d tokens). Stopped at %s",
                        tokens_used, max_tokens, path.relative_to(self.root_path)
                    )
                    break

                # Add file separator and content
                result.append(f"\n{'='*80}\nFILE: {path.relative_to(self.root_path)}\nCATEGORY: {category}\n{'='*80}\n")
                result.append(content)
                tokens_used += file_tokens

                logger.debug("Read %s (%d tokens, total: %d)", path.name, file_tokens, tokens_used)

            except Exception as e:
                logger.warning("Failed to read %s: %s", path.name, e)
                continue

        logger.info("Codebase snapshot: %d files, %d tokens", len(result) // 2, tokens_used)
        return "".join(result)


# Singleton instance
_reader = None

def get_codebase_reader(
    root_path: str = ".",
    max_tokens: int = 80000
) -> CodebaseReader:
    """Get or create codebase reader singleton."""
    global _reader
    if _reader is None:
        _reader = CodebaseReader(root_path, max_tokens=max_tokens)
    return _reader
