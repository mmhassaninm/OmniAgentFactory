from typing import Any, Dict, List


class ShortTermMemory:
    """Rolling short-term memory for a single agent session."""

    def __init__(self, max_entries: int = 20):
        self._entries: List[Dict[str, Any]] = []
        self._max = max_entries

    def add(self, role: str, content: str, meta: Dict[str, Any] | None = None) -> None:
        entry = {"role": role, "content": content}
        if meta:
            entry.update(meta)
        self._entries.append(entry)
        if len(self._entries) > self._max:
            # Keep the first (system) message and the most recent entries
            self._entries = self._entries[:1] + self._entries[-(self._max - 1):]

    def to_messages(self) -> List[Dict[str, str]]:
        return [{"role": e["role"], "content": e["content"]} for e in self._entries]

    def clear(self) -> None:
        self._entries.clear()

    def __len__(self) -> int:
        return len(self._entries)
