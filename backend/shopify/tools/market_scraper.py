"""
Shopify Theme Factory — Market Scraper
Scrapes ThemeForest and Shopify Theme Store for trend data.
"""

import asyncio
import logging
import time
from typing import List, Dict, Any

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}
DELAY = 1.5  # seconds between requests to respect rate limits


class MarketScraper:

    def get_themeforest_trending(self) -> List[Dict[str, Any]]:
        """Scrape ThemeForest top-selling Shopify themes."""
        url = "https://themeforest.net/category/ecommerce/shopify?sort=sales"
        themes = []
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            soup = BeautifulSoup(resp.text, "lxml")

            for item in soup.select(".product-list__item")[:20]:
                title_el = item.select_one(".product-list__item-title a")
                price_el = item.select_one(".product-list__item-price")
                sales_el = item.select_one(".product-list__item-sales")
                rating_el = item.select_one(".product-list__rating--count")
                tag_els = item.select(".product-list__item-tags a")

                if not title_el:
                    continue

                themes.append({
                    "source": "themeforest",
                    "title": title_el.get_text(strip=True),
                    "url": title_el.get("href", ""),
                    "price": price_el.get_text(strip=True) if price_el else "",
                    "sales": sales_el.get_text(strip=True) if sales_el else "",
                    "rating": rating_el.get_text(strip=True) if rating_el else "",
                    "tags": [t.get_text(strip=True) for t in tag_els],
                })
            time.sleep(DELAY)
        except Exception as e:
            logger.warning("ThemeForest scrape failed: %s", e)
        return themes

    def get_shopify_theme_store(self) -> List[Dict[str, Any]]:
        """Scrape Shopify's official theme store."""
        url = "https://themes.shopify.com/themes?sort_by=most_used"
        themes = []
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            soup = BeautifulSoup(resp.text, "lxml")

            for card in soup.select("[data-testid='theme-card'], .theme-card, article")[:20]:
                title_el = card.select_one("h2, h3, [data-testid='theme-name']")
                price_el = card.select_one("[data-testid='theme-price'], .price")
                tag_els = card.select("[data-testid='industry-tag'], .tag")

                if not title_el:
                    continue

                themes.append({
                    "source": "shopify_store",
                    "title": title_el.get_text(strip=True),
                    "price": price_el.get_text(strip=True) if price_el else "Free",
                    "tags": [t.get_text(strip=True) for t in tag_els[:5]],
                })
            time.sleep(DELAY)
        except Exception as e:
            logger.warning("Shopify Theme Store scrape failed: %s", e)
        return themes

    async def search_trending_niches(self) -> List[str]:
        """Use existing web_search tool for niche trend queries."""
        insights = []
        queries = [
            "best selling shopify themes 2025 2026 niche",
            "shopify theme marketplace opportunities high demand low competition",
            "themeforest shopify top sellers niche analysis",
        ]
        try:
            from tools.tools.web_search import web_search
            for query in queries:
                try:
                    result = await asyncio.to_thread(web_search, query, 5)
                    if result:
                        insights.append(result)
                    await asyncio.sleep(0.5)
                except Exception as e:
                    logger.warning("Web search failed for '%s': %s", query, e)
        except ImportError:
            logger.warning("web_search tool not available — skipping web search")
        return insights

    async def gather_all(self) -> Dict[str, Any]:
        """Run all scrapers and return combined market data."""
        themeforest = await asyncio.to_thread(self.get_themeforest_trending)
        shopify_store = await asyncio.to_thread(self.get_shopify_theme_store)
        web_insights = await self.search_trending_niches()

        return {
            "themeforest_trending": themeforest,
            "shopify_store": shopify_store,
            "web_insights": web_insights,
            "total_themes_analyzed": len(themeforest) + len(shopify_store),
        }
