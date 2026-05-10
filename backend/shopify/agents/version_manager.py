"""
Shopify Theme Factory — Agent 7: Version Manager
Handles semantic versioning and changelog generation for all themes.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import semver

from shopify.models import SharedContext

logger = logging.getLogger(__name__)

VERSION_RULES = {
    "major": ["complete redesign", "new architecture", "breaking change", "color scheme overhaul"],
    "minor": ["new section", "new page", "new feature", "new template", "performance improvement", "new snippet"],
    "patch": ["bug fix", "typo", "css tweak", "minor copy change", "accessibility fix", "small adjustment"],
}


class VersionManager:

    async def run(self, context: SharedContext, changes: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Determine version bump and generate changelog.
        On first run (version = v1.0.0), just confirms the initial version.
        On improvement runs, bumps version based on changes list.
        """
        logger.info("[VersionManager] Processing version: %s", context.version)

        current = context.version.lstrip("v") if context.version else "1.0.0"

        if context.version == "v1.0.0" and not changes:
            # Initial release
            new_version = "v1.0.0"
            changelog = self._initial_changelog(context)
            summary = f"Initial release: {new_version}"
        else:
            bump_type = self._determine_bump(changes or [])
            new_version = self._bump(current, bump_type)
            changelog = self._generate_changelog(current, new_version, changes or [], context)
            summary = f"Version bumped: v{current} → {new_version} ({bump_type})"

        logger.info("[VersionManager] %s", summary)
        return {
            "status": "done",
            "summary": summary,
            "version": new_version,
            "changelog": changelog,
            "data": {"version": new_version, "changelog": changelog},
        }

    def _determine_bump(self, changes: List[str]) -> str:
        changes_lower = [c.lower() for c in changes]
        for keyword in VERSION_RULES["major"]:
            if any(keyword in c for c in changes_lower):
                return "major"
        for keyword in VERSION_RULES["minor"]:
            if any(keyword in c for c in changes_lower):
                return "minor"
        return "patch"

    def _bump(self, current: str, bump_type: str) -> str:
        try:
            ver = semver.Version.parse(current)
            if bump_type == "major":
                return f"v{ver.bump_major()}"
            if bump_type == "minor":
                return f"v{ver.bump_minor()}"
            return f"v{ver.bump_patch()}"
        except Exception:
            return "v1.0.0"

    def _initial_changelog(self, context: SharedContext) -> str:
        brief = context.creative_brief or {}
        niche = context.niche or brief.get("niche", "e-commerce")
        lines = [
            f"# {context.theme_name} v1.0.0 — Initial Release",
            "",
            f"**Niche:** {niche}",
            f"**Price:** ${context.sell_price}",
            "",
            "## What's included",
            "- Complete Shopify OS 2.0 theme",
            "- All required page templates",
            "- Responsive design (mobile-first)",
            "- Customizable color scheme and typography",
            "- Performance optimized",
            "- Accessibility compliant",
        ]
        if brief.get("competitive_advantage"):
            lines += ["", "## Highlights", brief["competitive_advantage"]]
        return "\n".join(lines)

    def _generate_changelog(
        self, old_version: str, new_version: str, changes: List[str], context: SharedContext
    ) -> str:
        lines = [
            f"# {context.theme_name} {new_version}",
            f"",
            f"_Upgraded from v{old_version}_",
            "",
            "## Changes",
        ]
        for change in changes:
            lines.append(f"- {change}")
        return "\n".join(lines)

    @staticmethod
    def get_latest_version(versions: List[str]) -> str:
        """Return the highest semantic version from a list of version strings."""
        parsed = []
        for v in versions:
            try:
                parsed.append(semver.Version.parse(v.lstrip("v")))
            except Exception:
                pass
        if not parsed:
            return "v1.0.0"
        return "v" + str(max(parsed))
