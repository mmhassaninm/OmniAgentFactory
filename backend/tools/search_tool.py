import json
import logging
from duckduckgo_search import DDGS

logger = logging.getLogger(__name__)

class SearchTool:
    def __init__(self):
        pass

    def execute(self, query: str) -> str:
        try:
            logger.info(f"Executing search for: {query}")
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=3))
            
            if not results:
                return "STRICT_NO_DATA"
            
            output = ""
            for res in results:
                output += f"\n--- Source: ({res.get('href')}) ---\n{res.get('body')}\n"
                
            return output
        except Exception as e:
            logger.error(f"SearchTool execution failed: {e}")
            return f"Error: {str(e)}"

_search_tool = SearchTool()

def dispatch_search(kwargs: dict) -> str:
    return _search_tool.execute(kwargs.get("query", ""))
