"""
Shopify Operations skill — get products, orders, and revenue data.
Entry points: get_products, get_orders, get_revenue
"""

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _get_shopify_client() -> tuple[str, str, str] | None:
    """Get Shopify credentials from environment. Returns (store_url, token, version) or None."""
    store_url = os.getenv("SHOPIFY_STORE_URL", "")
    token = os.getenv("SHOPIFY_ACCESS_TOKEN", "")
    version = os.getenv("SHOPIFY_API_VERSION", "2025-01")
    if not store_url or not token:
        return None
    return (store_url, token, version)


async def _shopify_get(endpoint: str) -> dict[str, Any]:
    """Make an authenticated GET request to the Shopify REST API."""
    creds = _get_shopify_client()
    if not creds:
        return {"status": "error", "error": "Shopify credentials not configured"}
    store_url, token, version = creds
    url = f"https://{store_url}/admin/api/{version}/{endpoint}"
    headers = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.json()
            return {"status": "error", "error": f"Shopify API error: HTTP {resp.status_code}"}
    except Exception as e:
        return {"status": "error", "error": str(e)[:200]}


async def get_products(limit: int = 10) -> dict[str, Any]:
    """
    Get products from the Shopify store.

    Args:
        limit: Maximum number of products to return (default 10)

    Returns:
        dict with products list and status
    """
    result = await _shopify_get(f"products.json?limit={limit}")
    if "status" in result and result["status"] == "error":
        return result
    products = result.get("products", [])
    return {
        "status": "ok",
        "count": len(products),
        "products": [
            {
                "id": p.get("id"),
                "title": p.get("title"),
                "status": p.get("status"),
                "variants": len(p.get("variants", [])),
                "created_at": p.get("created_at"),
            }
            for p in products
        ],
    }


async def get_orders(limit: int = 10, status: str = "any") -> dict[str, Any]:
    """
    Get orders from the Shopify store.

    Args:
        limit: Maximum number of orders to return (default 10)
        status: Order status filter (any, open, closed, cancelled)

    Returns:
        dict with orders list and status
    """
    endpoint = f"orders.json?limit={limit}"
    if status != "any":
        endpoint += f"&status={status}"
    result = await _shopify_get(endpoint)
    if "status" in result and result["status"] == "error":
        return result
    order_list = result.get("orders", [])
    return {
        "status": "ok",
        "count": len(order_list),
        "orders": [
            {
                "id": o.get("id"),
                "order_number": o.get("order_number"),
                "total_price": o.get("total_price"),
                "currency": o.get("currency"),
                "financial_status": o.get("financial_status"),
                "created_at": o.get("created_at"),
                "customer_email": o.get("email", ""),
            }
            for o in order_list
        ],
    }


async def get_revenue(days: int = 7) -> dict[str, Any]:
    """
    Get revenue summary from Shopify orders.

    Args:
        days: Number of days to look back (default 7)

    Returns:
        dict with revenue data and status
    """
    from datetime import datetime, timedelta, timezone

    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = await _shopify_get(f"orders.json?status=any&created_at_min={since}&financial_status=paid")
    if "status" in result and result["status"] == "error":
        return result
    order_list = result.get("orders", [])
    total = sum(float(o.get("total_price", 0)) for o in order_list)
    return {
        "status": "ok",
        "days": days,
        "order_count": len(order_list),
        "total_revenue": round(total, 2),
        "currency": order_list[0].get("currency", "USD") if order_list else "USD",
    }