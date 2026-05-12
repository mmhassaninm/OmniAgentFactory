"""
Prompt Sanitizer — scans incoming messages for prompt injection patterns.
Blocks known jailbreak patterns and logs security events to MongoDB.
"""

import logging
import re
from typing import Optional

from core.database import get_db

logger = logging.getLogger(__name__)

# Patterns that indicate prompt injection attempts
INJECTION_PATTERNS: list[tuple[str, str]] = [
    (r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|directives)", "ignore_previous_instructions"),
    (r"system\s*:\s*(set|overwrite|reset)", "system_override"),
    (r"you\s+are\s+now\s+", "new_persona"),
    (r"disregard\s+(all\s+)?(previous|prior)\s+(instructions|prompts)", "disregard"),
    (r"jailbreak", "jailbreak_reference"),
    (r"new\s+persona", "new_persona"),
    (r"\[INST\]", "llama_inst"),
    (r"###\s*Human\s*:", "human_prefix"),
    (r"###\s*Assistant\s*:", "assistant_prefix"),
    (r"<\|im_start\|>", "chatml_start"),
    (r"<\|im_end\|>", "chatml_end"),
    (r"pretend\s+(to\s+)?be\s+", "pretend_persona"),
    (r"act\s+as\s+(if\s+)?(though\s+)?(you\s+are\s+)?", "act_as"),
    (r"forget\s+(all\s+)?(previous|prior)\s+(instructions|prompts)", "forget_instructions"),
    (r"override\s+(mode|protocol|system)", "override_attempt"),
    (r"DAN\b", "dan_mode"),
    (r"do\s+(not\s+)?anything\s+(you\s+)?(want|like|wish)", "do_anything"),
    (r"hypothetical\s+(scenario|situation)\s+.*(above|override|ignore)", "hypothetical_jailbreak"),
]


class PromptSanitizer:
    """
    Scans incoming messages for prompt injection patterns.
    """

    async def sanitize(self, message: str, channel: str = "", user_id: str = "") -> tuple[bool, Optional[str]]:
        """
        Sanitize a message. Returns (is_safe, reason).

        Args:
            message: The incoming message text
            channel: Originating channel name
            user_id: User identifier

        Returns:
            Tuple of (is_safe: bool, reason: str or None if safe)
        """
        message_lower = message.lower().strip()

        for pattern, pattern_name in INJECTION_PATTERNS:
            if re.search(pattern, message_lower, re.IGNORECASE):
                logger.warning("[Sanitizer] Blocked %s from %s on %s: pattern=%s",
                              user_id, channel, pattern_name)
                await self._log_security_event(
                    event_type="prompt_injection_blocked",
                    channel=channel,
                    user_id=user_id,
                    message=message[:200],
                    reason=pattern_name,
                )
                return False, f"Message blocked: detected injection pattern '{pattern_name}'"

        return True, None

    async def _log_security_event(self, event_type: str, channel: str, user_id: str, message: str, reason: str) -> None:
        """Log a security event to MongoDB."""
        try:
            from datetime import datetime, timezone
            db = get_db()
            await db.security_events.insert_one({
                "event_type": event_type,
                "channel": channel,
                "user_id": user_id,
                "message": message,
                "reason": reason,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.warning("[Sanitizer] Failed to log security event: %s", e)


# Singleton
_sanitizer_instance: Optional[PromptSanitizer] = None


def get_prompt_sanitizer() -> PromptSanitizer:
    """Get or create the singleton PromptSanitizer."""
    global _sanitizer_instance
    if _sanitizer_instance is None:
        _sanitizer_instance = PromptSanitizer()
    return _sanitizer_instance