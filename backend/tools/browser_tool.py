"""
Browser tool powered by Playwright.
Existing methods (search_web, get_page_content, take_screenshot) preserved.
Money Agent methods added: search_for_clients, find_contact_email, fill_contact_form.
Headful (visible) mode enabled when AGENT_MODE=human_in_loop so the human can monitor.
Platform detection: Windows host runs headful, Linux container (Docker) runs headless unless human_in_loop.
"""
import os
import logging
import re
import platform
from urllib.parse import quote_plus

from playwright.async_api import async_playwright
from duckduckgo_search import DDGS
from utils.error_log import log_error

logger = logging.getLogger(__name__)

# Platform-aware headless detection
_IS_WINDOWS = platform.system() == "Windows"
_AGENT_MODE = os.environ.get("AGENT_MODE", "human_in_loop")
# On Windows host: always show browser. In Docker: headless=True unless human_in_loop
_HEADLESS = not _IS_WINDOWS if _AGENT_MODE != "human_in_loop" else False


class BrowserTool:
    """
    Gives agents controlled browser access for:
    - Web research and scraping
    - Finding potential clients
    - Posting on platforms
    - Collecting information
    """

    def __init__(self):
        self._browser = None
        self._playwright = None

    async def start(self):
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=_HEADLESS,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )

    async def stop(self):
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def _broadcast_telemetry(self, page, action_name: str, details: str):
        """Capture screenshot and broadcast frame and logs over WebSockets in the background."""
        try:
            import base64
            import asyncio
            from api.browser_session import browser_session_mgr
            
            # Capture JPEG screenshot at 65% quality for ultra-fast websocket transmission
            img_bytes = await page.screenshot(type="jpeg", quality=65)
            b64_str = base64.b64encode(img_bytes).decode("utf-8")
            
            # Broadcast frame and log message to WebSocket clients
            asyncio.create_task(browser_session_mgr.broadcast_frame(b64_str))
            asyncio.create_task(browser_session_mgr.broadcast_log(f"[{action_name}] {details}"))
        except Exception as e:
            logger.debug("Failed to broadcast telemetry: %s", e)

    # ── Existing methods (unchanged) ─────────────────────────────────────────

    async def search_web(self, query: str) -> str:
        """Search DuckDuckGo and return text results."""
        try:
            logger.info("Searching web via DDGS for: %s", query)
            ddgs = DDGS()
            try:
                search_results = ddgs.text(query, max_results=5)
            except Exception as e:
                logger.warning("[BrowserTool.search_web] DDGS query failed, using empty list fallback: %s", e)
                search_results = []  # Fallback to empty list [] with a logged warning
                
            if not search_results:
                return ""
            
            texts = []
            for r in search_results:
                title = r.get("title", "")
                snippet = r.get("body", "")
                texts.append(f"{title}\n{snippet}")
            return "\n\n".join(texts)
        except Exception as e:
            logger.warning("[BrowserTool.search_web] Critical error, returning empty string: %s", e)
            return ""

    async def get_page_content(self, url: str) -> str:
        """Get text content from any URL."""
        try:
            page = await self._browser.new_page()
            await page.goto(url, timeout=15000)
            await page.wait_for_timeout(1000)
            await self._broadcast_telemetry(page, "GET_PAGE", f"Fetched content of {url}")
            content = await page.inner_text("body")
            await page.close()
            return content[:5000]
        except Exception as e:
            log_error("BrowserTool.get_page_content", e)
            return f"Failed to load page: {str(e)}"

    async def take_screenshot(self, url: str, path: str = "screenshot.png") -> str | None:
        """Take a screenshot of a URL."""
        try:
            page = await self._browser.new_page()
            await page.goto(url, timeout=15000)
            await self._broadcast_telemetry(page, "SCREENSHOT", f"Captured full screenshot for {url}")
            await page.screenshot(path=path, full_page=True)
            await page.close()
            return path
        except Exception as e:
            log_error("BrowserTool.take_screenshot", e)
            return None

    # ── Money Agent methods ──────────────────────────────────────────────────

    async def search_for_clients(self, niche: str = "content writing", limit: int = 10) -> list[dict]:
        """
        Use DuckDuckGo API (via duckduckgo-search library) to find potential clients.
        Avoids brittle Playwright selectors which break when DDG changes HTML.
        Returns list of {title, url, snippet, source} dicts.
        """
        queries = [
            f"{niche} needed for small business",
            f"hire freelance {niche}",
            f"looking for {niche} creator",
        ]
        results: list[dict] = []
        try:
            ddgs = DDGS()
            for query in queries:
                if len(results) >= limit:
                    break
                try:
                    # DDGS.text() returns generator of results
                    search_results = ddgs.text(query, max_results=min(10, limit - len(results)))
                    for result in search_results:
                        if len(results) >= limit:
                            break
                        results.append({
                            "title": result.get("title", ""),
                            "url": result.get("href", ""),
                            "snippet": result.get("body", ""),
                            "source": "duckduckgo",
                            "query": query
                        })
                except Exception as e:
                    logger.debug("[BrowserTool.search_for_clients] DDG query failed for '%s': %s", query, e)
        except Exception as e:
            log_error("BrowserTool.search_for_clients", e)
            logger.warning("DDG search failed, falling back to empty results")
        return results[:limit]

    async def find_contact_email(self, url: str) -> str | None:
        """
        Visit a page and look for a contact email address.
        Checks mailto: links and /contact pages.
        """
        try:
            page = await self._browser.new_page()
            await page.goto(f"https://{url}" if not url.startswith("http") else url, timeout=12000)
            await page.wait_for_timeout(1000)
            await self._broadcast_telemetry(page, "FIND_EMAIL", f"Searching for contact emails on {url}")

            # Look for mailto: links on the current page
            hrefs = await page.eval_on_selector_all("a[href^='mailto:']", "els => els.map(e => e.href)")
            if hrefs:
                email = hrefs[0].replace("mailto:", "").split("?")[0].strip()
                await page.close()
                return email

            # Try /contact page
            contact_url = url.rstrip("/") + "/contact"
            if not contact_url.startswith("http"):
                contact_url = "https://" + contact_url
            try:
                await page.goto(contact_url, timeout=8000)
                await page.wait_for_timeout(800)
                hrefs = await page.eval_on_selector_all("a[href^='mailto:']", "els => els.map(e => e.href)")
                if hrefs:
                    email = hrefs[0].replace("mailto:", "").split("?")[0].strip()
                    await page.close()
                    return email
            except Exception:
                pass

            # Scan page text for email pattern
            body_text = await page.inner_text("body")
            found = re.findall(r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}", body_text)
            await page.close()
            return found[0] if found else None
        except Exception as e:
            log_error("BrowserTool.find_contact_email", e)
            return None

    async def fill_contact_form(self, url: str, data: dict) -> dict:
        """
        Navigate to a URL and fill form fields with the provided data dict.
        Does NOT submit — leaves the form for the human to review and submit.
        Returns screenshot path + filled field summary.
        """
        screenshot_path = f"logs/form_preview_{url[:20].replace('/', '_')}.png"
        filled: list[str] = []
        try:
            page = await self._browser.new_page()
            await page.goto(url if url.startswith("http") else f"https://{url}", timeout=12000)
            await page.wait_for_timeout(1000)

            for selector, value in data.items():
                try:
                    await page.fill(selector, str(value))
                    filled.append(selector)
                except Exception:
                    try:
                        await page.type(selector, str(value))
                        filled.append(selector)
                    except Exception:
                        pass

            await self._broadcast_telemetry(page, "FORM_FILL", f"Filled contact form details at {url}: {filled}")
            await page.screenshot(path=screenshot_path, full_page=False)
            # Keep page open (visible) for human to submit
            logger.info("[BrowserTool] Form filled at %s — waiting for human to submit", url)
            return {"status": "FILLED_AWAITING_HUMAN", "filled_fields": filled, "screenshot": screenshot_path}
        except Exception as e:
            log_error("BrowserTool.fill_contact_form", e)
            return {"status": "ERROR", "error": str(e), "filled_fields": filled}


# ── Singleton ────────────────────────────────────────────────────────────────
_browser_tool = BrowserTool()


async def get_browser_tool() -> BrowserTool:
    if _browser_tool._browser is None:
        await _browser_tool.start()
    return _browser_tool
