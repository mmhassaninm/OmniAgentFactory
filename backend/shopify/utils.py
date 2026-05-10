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
    Robustly extract and parse a JSON object or array from a string returned by an LLM.
    Handles:
    - Markdown code fences (```json ... ```)
    - Leading/trailing conversational text
    - Non-strict control characters (like literal newlines and tabs)
    - Trailing commas in objects/arrays
    """
    text = text.strip()

    # 1. Strip markdown code blocks if present
    m = re.search(r'```(?:json)?\s*([\s\S]+?)\s*```', text)
    if m:
        text = m.group(1).strip()

    # 2. Locate first JSON structural character and extract the inner substring
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

    # 3. Try standard parse first with strict=False
    try:
        return json.loads(text, strict=False)
    except Exception as e1:
        # 4. Strip trailing commas before closing braces/brackets
        cleaned_text = re.sub(r',\s*([\]}])', r'\1', text)
        try:
            return json.loads(cleaned_text, strict=False)
        except Exception as e2:
            logger.error("JSON parsing failed. Raw text length: %d. Snippet: %r", len(text), text[:500])
            raise e2
