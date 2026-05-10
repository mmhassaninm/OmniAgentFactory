"""
Browser tool powered by Playwright.
Existing methods (search_web, get_page_content, take_screenshot) preserved.
Money Agent methods added: search_for_clients, find_contact_email, fill_contact_form.
Headful (visible) mode enabled when AGENT_MODE=human_in_loop so the human can monitor.
"""
import os
import logging
import re
from urllib.parse import quote_plus

from playwright.async_api import async_playwright
from utils.error_log import log_error

logger = logging.getLogger(__name__)

_HEADLESS = os.environ.get("AGENT_MODE", "human_in_loop") != "human_in_loop"


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

    # ── Existing methods (unchanged) ─────────────────────────────────────────

    async def search_web(self, query: str) -> str:
        """Search DuckDuckGo and return text results."""
        try:
            page = await self._browser.new_page()
            await page.goto(f"https://duckduckgo.com/?q={quote_plus(query)}&t=h_&ia=web")
            await page.wait_for_timeout(2000)
            results = await page.query_selector_all(".result__body")
            texts = []
            for r in results[:5]:
                text = await r.inner_text()
                texts.append(text.strip())
            await page.close()
            return "\n\n".join(texts)
        except Exception as e:
            log_error("BrowserTool.search_web", e)
            return f"Search failed: {str(e)}"

    async def get_page_content(self, url: str) -> str:
        """Get text content from any URL."""
        try:
            page = await self._browser.new_page()
            await page.goto(url, timeout=15000)
            await page.wait_for_timeout(1000)
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
            await page.screenshot(path=path, full_page=True)
            await page.close()
            return path
        except Exception as e:
            log_error("BrowserTool.take_screenshot", e)
            return None

    # ── Money Agent methods ──────────────────────────────────────────────────

    async def search_for_clients(self, niche: str = "content writing", limit: int = 10) -> list[dict]:
        """
        DuckDuckGo search for businesses that might need the service.
        Returns list of {title, url, snippet} dicts.
        """
        queries = [
            f"{niche} needed for small business",
            f"hire freelance {niche} writer",
            f"looking for {niche} creator site:reddit.com",
        ]
        results: list[dict] = []
        try:
            page = await self._browser.new_page()
            for query in queries:
                if len(results) >= limit:
                    break
                try:
                    await page.goto(
                        f"https://duckduckgo.com/?q={quote_plus(query)}&t=h_&ia=web",
                        timeout=12000,
                    )
                    await page.wait_for_timeout(1500)
                    items = await page.query_selector_all(".result")
                    for item in items[:5]:
                        try:
                            title_el  = await item.query_selector(".result__title")
                            url_el    = await item.query_selector(".result__url")
                            body_el   = await item.query_selector(".result__snippet")
                            title   = (await title_el.inner_text()).strip()  if title_el  else ""
                            url     = (await url_el.inner_text()).strip()    if url_el    else ""
                            snippet = (await body_el.inner_text()).strip()   if body_el   else ""
                            if title:
                                results.append({"title": title, "url": url, "snippet": snippet, "query": query})
                        except Exception:
                            pass
                except Exception as e:
                    logger.debug("[BrowserTool] search query failed: %s", e)
            await page.close()
        except Exception as e:
            log_error("BrowserTool.search_for_clients", e)
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
