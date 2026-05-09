"""
Tiered Memory System — Direction 2 of Phase 5.

Three memory tiers:
  Tier 1 — Working memory:   current turn only, cleared after each response
  Tier 2 — Session memory:   facts auto-extracted within this Python process lifetime
  Tier 3 — Persistent memory: MongoDB collection (survives restarts), AES-256 encrypted

Facts are extracted from tool results using lightweight heuristics (no LLM call).
The /api/agent/memory endpoint exposes all three tiers.
"""
import re
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Tier 2: in-process session memory ────────────────────────────────────────
_session_facts: list[dict] = []       # [{"fact": str, "source": str, "ts": str}]
_MAX_SESSION_FACTS = 60

# ── Tier 1: single-turn working memory ───────────────────────────────────────
_working_memory: list[dict] = []      # cleared per response in TieredMemory instance


class TieredMemory:
    """
    Per-request memory manager.
    Tier 1 is instance-scoped (cleared each call).
    Tier 2 is module-level (shared across all requests in the session).
    Tier 3 reads/writes MongoDB asynchronously.
    """

    def __init__(self) -> None:
        self._working: list[dict] = []     # Tier 1

    # ── Tier 1 ──────────────────────────────────────────────────────────────

    def set_working(self, entries: list[dict]) -> None:
        self._working = entries

    def get_working(self) -> list[dict]:
        return list(self._working)

    # ── Tier 2 ──────────────────────────────────────────────────────────────

    @staticmethod
    def add_session_fact(fact: str, source: str = "tool_result") -> None:
        global _session_facts
        ts = datetime.now(timezone.utc).isoformat()
        # Deduplicate: skip if almost identical fact already exists
        if not any(f["fact"].lower() == fact.lower() for f in _session_facts):
            _session_facts.append({"fact": fact, "source": source, "ts": ts})
        if len(_session_facts) > _MAX_SESSION_FACTS:
            _session_facts = _session_facts[-_MAX_SESSION_FACTS:]

    @staticmethod
    def get_session_facts() -> list[dict]:
        return list(_session_facts)

    @staticmethod
    def clear_session() -> None:
        global _session_facts
        _session_facts = []

    # ── Tier 3 ──────────────────────────────────────────────────────────────

    @staticmethod
    async def save_persistent(fact: str, source: str = "agent", tags: list[str] | None = None) -> None:
        try:
            from models.database import db
            from services.encryption import encrypt
            await db.agent_memory.insert_one({
                "fact": encrypt(fact),
                "source": source,
                "tags": tags or [],
                "ts": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.warning("[tiered_memory] Tier 3 write failed: %s", e)

    @staticmethod
    async def get_persistent(limit: int = 50) -> list[dict]:
        try:
            from models.database import db
            from services.encryption import decrypt
            docs = await db.agent_memory.find().sort("ts", -1).limit(limit).to_list(length=limit)
            return [
                {"fact": decrypt(d.get("fact", "")), "source": d.get("source"), "tags": d.get("tags", []), "ts": d.get("ts")}
                for d in docs
            ]
        except Exception as e:
            logger.warning("[tiered_memory] Tier 3 read failed: %s", e)
            return []

    @staticmethod
    async def delete_persistent(fact_id: str) -> bool:
        try:
            from models.database import db
            from bson import ObjectId
            result = await db.agent_memory.delete_one({"_id": ObjectId(fact_id)})
            return result.deleted_count > 0
        except Exception:
            return False


# ── Fact extraction from tool results ────────────────────────────────────────

_FACT_PATTERNS = [
    # "X is Y" / "X are Y"
    re.compile(r'([A-Z][a-zA-Z\s]{2,30})\s+(?:is|are|was|were)\s+([a-zA-Z0-9\s,]{4,80})', re.MULTILINE),
    # Numbers with units
    re.compile(r'(\d[\d,\.]+\s*(?:km|kg|m|s|ms|MB|GB|TB|USD|EUR|%|°C|°F))', re.MULTILINE),
    # Dates
    re.compile(r'\b(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})\b'),
    # URLs
    re.compile(r'(https?://[^\s"\'<>]{10,120})'),
]


def extract_facts_from_text(text: str, source: str = "tool_result") -> list[str]:
    """
    Lightweight heuristic extraction — no LLM call.
    Returns a list of short fact strings.
    """
    facts: list[str] = []
    for pattern in _FACT_PATTERNS:
        for match in pattern.finditer(text):
            snippet = match.group(0).strip()
            if 8 < len(snippet) < 200:
                facts.append(snippet)
    # Deduplicate
    seen: set[str] = set()
    unique: list[str] = []
    for f in facts:
        key = f.lower()
        if key not in seen:
            seen.add(key)
            unique.append(f)
    return unique[:10]  # cap per tool call


def auto_extract_and_store(tool_name: str, tool_output: str) -> int:
    """
    Extract facts from a tool result and push them to Tier 2 session memory.
    Returns the number of facts stored.
    """
    facts = extract_facts_from_text(tool_output, source=f"tool:{tool_name}")
    for fact in facts:
        TieredMemory.add_session_fact(fact, source=f"tool:{tool_name}")
    return len(facts)


def format_memory_summary() -> str:
    """Return a compact markdown summary of current session facts for injection into prompts."""
    facts = TieredMemory.get_session_facts()
    if not facts:
        return ""
    lines = [f"- {f['fact']} _(via {f['source']})_" for f in facts[-15:]]
    return "**Session Memory:**\n" + "\n".join(lines)
