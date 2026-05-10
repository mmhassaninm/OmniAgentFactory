"""
Shopify Theme Factory — Validator
Checks that a generated theme directory meets Shopify OS 2.0 requirements.
"""

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

REQUIRED_FILES = [
    "layout/theme.liquid",
    "layout/password.liquid",
    "templates/index.json",
    "templates/product.json",
    "templates/collection.json",
    "templates/list-collections.json",
    "templates/cart.json",
    "templates/blog.json",
    "templates/article.json",
    "templates/page.json",
    "templates/404.json",
    "templates/search.json",
    "templates/customers/login.json",
    "templates/customers/register.json",
    "config/settings_schema.json",
    "config/settings_data.json",
    "locales/en.default.json",
    "assets/theme.css",
    "assets/theme.js",
]

LIQUID_CLOSE_TAGS = {
    "if": "endif",
    "for": "endfor",
    "unless": "endunless",
    "case": "endcase",
    "form": "endform",
    "capture": "endcapture",
    "paginate": "endpaginate",
    "schema": "endschema",
    "style": "endstyle",
    "javascript": "endjavascript",
}


@dataclass
class ValidationResult:
    passed: bool = False
    missing_files: List[str] = field(default_factory=list)
    liquid_issues: List[str] = field(default_factory=list)
    json_issues: List[str] = field(default_factory=list)
    issues: List[str] = field(default_factory=list)
    file_count: int = 0
    score: float = 0.0

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "missing_files": self.missing_files,
            "liquid_issues": self.liquid_issues,
            "json_issues": self.json_issues,
            "issues": self.issues,
            "file_count": self.file_count,
            "score": self.score,
        }


class ThemeValidator:

    def validate(self, theme_dir: Path) -> ValidationResult:
        result = ValidationResult()

        # 1. Required files check
        for rel_path in REQUIRED_FILES:
            full = theme_dir / rel_path
            if not full.exists():
                result.missing_files.append(rel_path)

        # 2. Count all files
        result.file_count = sum(1 for _ in theme_dir.rglob("*") if _.is_file())

        # 3. JSON validity check for config + templates
        for json_file in list(theme_dir.glob("config/*.json")) + list(theme_dir.glob("templates/**/*.json")):
            try:
                with open(json_file, encoding="utf-8") as f:
                    json.load(f)
            except json.JSONDecodeError as e:
                result.json_issues.append(f"{json_file.name}: {e}")

        # 4. Basic Liquid tag balance check for all .liquid files
        for liquid_file in theme_dir.rglob("*.liquid"):
            issues = self._check_liquid_balance(liquid_file)
            result.liquid_issues.extend(issues)

        # 5. Build summary issues list
        if result.missing_files:
            result.issues.append(f"Missing {len(result.missing_files)} required files")
        if result.json_issues:
            result.issues.append(f"{len(result.json_issues)} JSON parse errors")
        if result.liquid_issues:
            result.issues.append(f"{len(result.liquid_issues)} Liquid tag issues")
        if result.file_count < 40:
            result.issues.append(f"Only {result.file_count} files — minimum is 40")

        # 6. Score (0-100)
        deductions = (
            len(result.missing_files) * 5
            + len(result.json_issues) * 3
            + len(result.liquid_issues) * 2
            + (10 if result.file_count < 40 else 0)
        )
        result.score = max(0.0, 100.0 - deductions)
        result.passed = (
            len(result.missing_files) == 0
            and len(result.json_issues) == 0
            and result.score >= 80
        )
        return result

    def _check_liquid_balance(self, path: Path) -> List[str]:
        issues = []
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
            open_counts: dict = {}
            close_counts: dict = {}
            for tag, close in LIQUID_CLOSE_TAGS.items():
                open_counts[tag] = text.count("{%") and text.lower().count(f"{{% {tag} ") + text.lower().count(f"{{%- {tag} ")
                close_counts[tag] = text.lower().count(f"{{% {close}") + text.lower().count(f"{{%- {close}")
            for tag in LIQUID_CLOSE_TAGS:
                o = open_counts[tag]
                c = close_counts[tag]
                if o != c and (o > 0 or c > 0):
                    issues.append(f"{path.name}: {tag}/{LIQUID_CLOSE_TAGS[tag]} mismatch ({o} open, {c} close)")
        except Exception:
            pass
        return issues
