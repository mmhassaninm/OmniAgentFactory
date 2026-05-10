"""
Shopify Theme Factory — Utilities
Provides robust helper functions for JSON parsing and text cleanup.
"""

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


def robust_parse_json(text: str) -> Any:
    """
    Robustly extract and parse a JSON object or array from LLM output.
    Handles: markdown fences, leading text, trailing commas,
    truncated JSON (attempts recovery), unescaped control chars.
    """
    import json, re, logging
    logger = logging.getLogger(__name__)
    text = text.strip()

    # Step 1: strip markdown fences
    m = re.search(r'```(?:json)?\s*([\s\S]+?)\s*```', text)
    if m:
        text = m.group(1).strip()

    # Step 2: locate JSON start
    first_curly = text.find('{')
    first_bracket = text.find('[')
    start_idx = -1
    end_char = ''
    if first_curly != -1 and (first_bracket == -1 or first_curly < first_bracket):
        start_idx = first_curly
        end_char = '}'
    elif first_bracket != -1:
        start_idx = first_bracket
        end_char = ']'
    if start_idx != -1:
        end_idx = text.rfind(end_char)
        if end_idx != -1 and end_idx > start_idx:
            text = text[start_idx:end_idx + 1]

    # Step 3: try standard parse
    try:
        return json.loads(text, strict=False)
    except Exception:
        pass

    # Step 4: strip trailing commas
    cleaned = re.sub(r',\s*([\]}])', r'\1', text)
    try:
        return json.loads(cleaned, strict=False)
    except Exception:
        pass

    # Step 5: truncation recovery — find the last complete "key": "value" pair
    # and close the JSON object cleanly
    try:
        # Find all complete string-value pairs using regex
        # Pattern: "key": "value" where value has no unescaped quote
        pairs = {}
        pattern = r'"([^"\\]*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*[,}]'
        for match in re.finditer(pattern, text, re.DOTALL):
            key = match.group(1)
            value = match.group(2)
            pairs[key] = value
        if pairs:
            logger.warning(
                "JSON truncation recovery: extracted %d complete pairs from malformed output",
                len(pairs)
            )
            return pairs
    except Exception:
        pass

    # Step 6: last resort — log and raise
    logger.error(
        "JSON parsing failed after all recovery attempts. "
        "Text length: %d. Snippet: %r", len(text), text[:300]
    )
    raise ValueError(f"Could not parse JSON from LLM output (length={len(text)})")
