"""
Autonomous Browser Agent — gives OmniBot eyes and hands on the web.
Uses Playwright (async) for browser automation with queued task execution.

Actions:
  navigate(url) → page title + content summary
  click(selector_or_text) → bool
  fill_form(fields) → bool
  extract_text(selector) → str
  screenshot() → base64 str
  search_google(query) → list[dict]
  scroll_and_read(url) → full page text
"""

import asyncio
import base64
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Lazy import — degrades gracefully if playwright is not installed
try:
    from playwright.async_api import async_playwright, Page, Browser

    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    async_playwright = None  # type: ignore
    Page = None  # type: ignore
    Browser = None  # type: ignore


class BrowserAgent:
    """
    Browser automation agent with queued task execution.
    Only one browser session runs at a time.
    """

    def __init__(self, headless: bool = True) -> None:
        self.headless: bool = headless
        self._browser: Any = None
        self._page: Any = None
        self._lock: asyncio.Lock = asyncio.Lock()
        self._enabled: bool = PLAYWRIGHT_AVAILABLE

    async def _ensure_browser(self) -> Any:
        """Ensure browser is launched and return the current page."""
        if not self._enabled:
            raise RuntimeError("Playwright is not installed. Run: playwright install chromium")
        if self._browser is None:
            p = await async_playwright().__aenter__()
            self._browser = await p.chromium.launch(headless=self.headless)
            self._page = await self._browser.new_page()
            logger.info("[BrowserAgent] Browser launched (headless=%s)", self.headless)
        return self._page

    async def navigate(self, url: str) -> dict[str, Any]:
        """Navigate to a URL and return page title + content summary."""
        async with self._lock:
            try:
                page = await self._ensure_browser()
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                title = await page.title()
                content = await page.evaluate("document.body.innerText")
                summary = content[:1000] if content else ""
                return {"status": "ok", "title": title, "content_summary": summary, "url": url}
            except Exception as e:
                logger.warning("[BrowserAgent] navigate error: %s", e)
                return {"status": "error", "error": str(e)[:200]}

    async def click(self, selector_or_text: str) -> dict[str, Any]:
        """Click an element by selector or visible text."""
        async with self._lock:
            try:
                page = await self._ensure_browser()
                # Try as selector first
                try:
                    await page.click(selector_or_text, timeout=5000)
                    return {"status": "ok", "action": "click", "target": selector_or_text}
                except Exception:
                    # Try by text
                    await page.click(f"text={selector_or_text}", timeout=5000)
                    return {"status": "ok", "action": "click", "target": selector_or_text}
            except Exception as e:
                return {"status": "error", "error": str(e)[:200]}

    async def fill_form(self, fields: dict[str, str]) -> dict[str, Any]:
        """Fill form fields. Keys are selectors, values are text to type."""
        async with self._lock:
            try:
                page = await self._ensure_browser()
                for selector, value in fields.items():
                    await page.fill(selector, value, timeout=5000)
                return {"status": "ok", "filled": len(fields)}
            except Exception as e:
                return {"status": "error", "error": str(e)[:200]}

    async def extract_text(self, selector: str) -> dict[str, Any]:
        """Extract text content from elements matching a selector."""
        async with self._lock:
            try:
                page = await self._ensure_browser()
                elements = await page.query_selector_all(selector)
                texts = [await el.inner_text() for el in elements]
                return {"status": "ok", "texts": texts, "count": len(texts)}
            except Exception as e:
                return {"status": "error", "error": str(e)[:200]}

    async def screenshot(self) -> dict[str, Any]:
        """Take a screenshot and return it as base64."""
        async with self._lock:
            try:
                page = await self._ensure_browser()
                screenshot_bytes = await page.screenshot(full_page=False)
                b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
                return {"status": "ok", "screenshot_base64": b64, "size": len(b64)}
            except Exception as e:
                return {"status": "error", "error": str(e)[:200]}

    async def search_google(self, query: str) -> dict[str, Any]:
        """Search Google and return organic results."""
        async with self._lock:
            try:
                page = await self._ensure_browser()
                await page.goto(f"https://www.google.com/search?q={query}", wait_until="domcontentloaded", timeout=15000)
                results: list[dict[str, str]] = []
                items = await page.query_selector_all("div.g")
                for item in items[:10]:
                    try:
                        title_el = await item.query_selector("h3")
                        link_el = await item.query_selector("a")
                        snippet_el = await item.query_selector("div[data-sncf]")
                        title = await title_el.inner_text() if title_el else ""
                        url = await link_el.get_attribute("href") if link_el else ""
                        snippet = await snippet_el.inner_text() if snippet_el else ""
                        results.append({"title": title, "url": url or "", "snippet": snippet})
                    except Exception:
                        continue
                return {"status": "ok", "query": query, "results": results, "count": len(results)}
            except Exception as e:
                return {"status": "error", "error": str(e)[:200]}

    async def scroll_and_read(self, url: str) -> dict[str, Any]:
        """Scroll through a page and read all visible text."""
        async with self._lock:
            try:
                page = await self._ensure_browser()
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                # Scroll to bottom
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1)
                # Read all text
                text = await page.evaluate("document.body.innerText")
                return {"status": "ok", "url": url, "content": text, "length": len(text)}
            except Exception as e:
                return {"status": "error", "error": str(e)[:200]}

    async def close(self) -> None:
        """Close the browser."""
        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
            self._browser = None
            self._page = None
            logger.info("[BrowserAgent] Browser closed")


# Singleton
_browser_agent_instance: Optional[BrowserAgent] = None


def get_browser_agent() -> BrowserAgent:
    """Get or create the singleton BrowserAgent."""
    global _browser_agent_instance
    if _browser_agent_instance is None:
        _browser_agent_instance = BrowserAgent()
    return _browser_agent_instance