import asyncio
from playwright.async_api import async_playwright
from utils.error_log import log_error


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
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox"]
        )

    async def stop(self):
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def search_web(self, query: str) -> str:
        """Search DuckDuckGo and return text results."""
        try:
            page = await self._browser.new_page()
            await page.goto(f"https://duckduckgo.com/?q={query}&t=h_&ia=web")
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


_browser_tool = BrowserTool()


async def get_browser_tool() -> BrowserTool:
    if _browser_tool._browser is None:
        await _browser_tool.start()
    return _browser_tool
