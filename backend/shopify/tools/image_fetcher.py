"""
Shopify Theme Factory — Image Fetcher
Downloads royalty-free images from Unsplash (or falls back to picsum.photos).
"""

import logging
import os
from pathlib import Path
from typing import List, Optional

import requests

logger = logging.getLogger(__name__)

UNSPLASH_KEY = os.getenv("UNSPLASH_ACCESS_KEY", "")
UNSPLASH_API = "https://api.unsplash.com/search/photos"
PICSUM_URL = "https://picsum.photos/{width}/{height}"

HEADERS = {
    "User-Agent": "ShopifyThemeFactory/1.0",
}


class ImageFetcher:

    def __init__(self, output_dir: Path, unsplash_key: Optional[str] = None):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.unsplash_key = unsplash_key or os.getenv("UNSPLASH_ACCESS_KEY", "")

    def fetch_unsplash(self, query: str, width: int = 1200, height: int = 800) -> Optional[bytes]:
        """Download an image from Unsplash matching the query."""
        if not self.unsplash_key:
            return None
        try:
            params = {
                "query": query,
                "per_page": 1,
                "orientation": "landscape",
                "client_id": self.unsplash_key,
            }

            resp = requests.get(UNSPLASH_API, params=params, headers=HEADERS, timeout=10)
            data = resp.json()
            results = data.get("results", [])
            if not results:
                return None
            image_url = results[0]["urls"]["regular"]
            img_resp = requests.get(image_url, timeout=20)
            return img_resp.content
        except Exception as e:
            logger.warning("Unsplash fetch failed for '%s': %s", query, e)
            return None

    def fetch_picsum(self, width: int = 1200, height: int = 800) -> Optional[bytes]:
        """Fallback: download a placeholder from picsum.photos."""
        try:
            url = f"https://picsum.photos/{width}/{height}"
            resp = requests.get(url, timeout=15)
            return resp.content
        except Exception as e:
            logger.warning("Picsum fallback failed: %s", e)
            return None

    def download_image(self, query: str, filename: str, width: int = 1200, height: int = 800) -> Optional[Path]:
        """Download one image to output_dir and return its local path."""
        content = self.fetch_unsplash(query, width, height) or self.fetch_picsum(width, height)
        if not content:
            logger.warning("Could not fetch image for '%s'", query)
            return None
        dest = self.output_dir / filename
        dest.write_bytes(content)
        logger.info("Downloaded image: %s (%d bytes)", dest, len(content))
        return dest

    def download_demo_images(self, queries: List[str]) -> List[Path]:
        """Download a batch of demo images for a theme."""
        paths = []
        for i, query in enumerate(queries[:15]):  # cap at 15 images
            filename = f"demo-{i+1:02d}.jpg"
            path = self.download_image(query, filename)
            if path:
                paths.append(path)
        return paths
