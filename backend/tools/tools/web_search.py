from typing import Optional

def web_search(query: str, max_results: int = 5) -> str:
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        if not results:
            return "No results found for: " + query
        parts = []
        for r in results:
            parts.append(f"**{r.get('title', 'No title')}**\n{r.get('href', '')}\n{r.get('body', '')}")
        return "\n\n---\n\n".join(parts)
    except ImportError:
        return "duckduckgo-search package not installed. Run: pip install duckduckgo-search"
    except Exception as e:
        return f"Search error: {e}"
