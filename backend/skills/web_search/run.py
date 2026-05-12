"""
Web Search skill — searches the web using DuckDuckGo and returns a summary.
Entry point: search_web
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


def search_web(query: str, max_results: int = 5) -> dict[str, Any]:
    """
    Search the web using DuckDuckGo.

    Args:
        query: The search query string
        max_results: Maximum number of results to return (default 5)

    Returns:
        dict with keys: query, results (list of {title, url, snippet}), status
    """
    try:
        from duckduckgo_search import DDGS

        results: list[dict[str, str]] = []
        with DDGS() as ddgs:
            for i, r in enumerate(ddgs.text(query, max_results=max_results)):
                if i >= max_results:
                    break
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                })

        return {
            "query": query,
            "results": results,
            "count": len(results),
            "status": "ok",
        }
    except ImportError:
        logger.warning("[Skill web_search] duckduckgo_search not installed")
        return {
            "query": query,
            "results": [],
            "count": 0,
            "status": "error",
            "error": "duckduckgo_search library not available",
        }
    except Exception as e:
        logger.warning("[Skill web_search] Search failed: %s", e)
        return {
            "query": query,
            "results": [],
            "count": 0,
            "status": "error",
            "error": str(e)[:200],
        }