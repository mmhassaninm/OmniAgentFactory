"""
Omni Commander — Browser Executor

Leverages the core BrowserAgent singleton to carry out asynchronous headless web actions.
Handles navigation, screenshot capture, text extraction, scraping, and Google searches.
"""

from typing import Dict, Any
from core.browser_agent import get_browser_agent


async def execute_browser_action(params: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a web browsing task."""
    action = params.get("action", "")
    url = params.get("url", "")
    query = params.get("query", "")
    
    agent = get_browser_agent()
    
    try:
        if action == "search_google":
            if not query:
                return {"success": False, "error": "Search query parameter is missing."}
            res = await agent.search_google(query)
            if res.get("status") == "ok":
                return {
                    "success": True,
                    "query": query,
                    "results": res.get("results", []),
                    "count": res.get("count", 0)
                }
            return {"success": False, "error": res.get("error", "Failed to search Google")}
            
        elif action == "scrape_page":
            if not url:
                return {"success": False, "error": "URL parameter is missing."}
            res = await agent.scroll_and_read(url)
            if res.get("status") == "ok":
                return {
                    "success": True,
                    "url": url,
                    "content": res.get("content", ""),
                    "length": res.get("length", 0)
                }
            return {"success": False, "error": res.get("error", "Failed to scrape web page")}
            
        elif action == "take_screenshot":
            # Optional navigation before capture
            if url:
                nav_res = await agent.navigate(url)
                if nav_res.get("status") != "ok":
                    return {"success": False, "error": f"Failed to navigate to {url} before screenshot: {nav_res.get('error')}"}
            
            res = await agent.screenshot()
            if res.get("status") == "ok":
                return {
                    "success": True,
                    "screenshot_base64": res.get("screenshot_base64"),
                    "size": res.get("size")
                }
            return {"success": False, "error": res.get("error", "Failed to capture screenshot")}
            
        elif action == "extract_text":
            if not url:
                return {"success": False, "error": "URL parameter is missing."}
            selector = params.get("selector", "body")
            
            # Navigate first
            nav_res = await agent.navigate(url)
            if nav_res.get("status") != "ok":
                 return {"success": False, "error": f"Failed to navigate to {url}: {nav_res.get('error')}"}
                 
            res = await agent.extract_text(selector)
            if res.get("status") == "ok":
                return {
                    "success": True,
                    "url": url,
                    "selector": selector,
                    "texts": res.get("texts", []),
                    "count": res.get("count", 0)
                }
            return {"success": False, "error": res.get("error", "Failed to extract elements text")}
            
        else:
            return {"success": False, "error": f"Unknown browser action: {action}"}
            
    except Exception as e:
        return {"success": False, "error": str(e)}
