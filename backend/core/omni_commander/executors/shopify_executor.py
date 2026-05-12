"""
Omni Commander — Shopify Executor

Provides integration with Shopify store Admin REST API to query and update products.
Also supports automated Liquid theme section layout writing.
"""

import os
import json
import httpx
import logging
from pathlib import Path
from typing import Dict, Any

from routers.shopify import _get_shopify_creds_async
from core.model_router import get_model_router

logger = logging.getLogger(__name__)


async def execute_shopify_action(params: Dict[str, Any]) -> Dict[str, Any]:
    """Execute shopify store automation actions."""
    action = params.get("action", "")
    
    # Load settings from database / config
    store_url, admin_token, api_version = await _get_shopify_creds_async()
    
    # Normalize URL
    clean_url = store_url.removeprefix("https://").removeprefix("http://").rstrip("/")
    base_api = f"https://{clean_url}/admin/api/{api_version}"
    headers = {
        "X-Shopify-Access-Token": admin_token,
        "Content-Type": "application/json"
    }
    
    try:
        # ── 1. QUERY STORE PRODUCTS ───────────────────────────────────────────
        if action == "get_products":
            if not store_url or not admin_token:
                return {"success": False, "error": "Shopify store credentials are not configured."}
                
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(f"{base_api}/products.json?limit=10", headers=headers)
                
            if r.status_code != 200:
                return {"success": False, "error": f"Shopify API returned {r.status_code}: {r.text[:300]}"}
                
            products = r.json().get("products", [])
            simple_products = []
            for p in products:
                simple_products.append({
                    "id": p.get("id"),
                    "title": p.get("title"),
                    "handle": p.get("handle"),
                    "price": p["variants"][0].get("price") if p.get("variants") else "N/A",
                    "status": p.get("status")
                })
                
            return {
                "success": True,
                "products": simple_products,
                "count": len(products)
            }
            
        # ── 2. UPDATE PRODUCT PRICING/DATA ────────────────────────────────────
        elif action == "update_product":
            product_id = params.get("product_id")
            changes = params.get("changes", {})
            
            if not store_url or not admin_token:
                 return {"success": False, "error": "Shopify store credentials are not configured."}
            if not product_id:
                return {"success": False, "error": "Product ID parameter is missing."}
            if not changes:
                return {"success": False, "error": "No changes dictionary provided to apply."}
                
            # Restructure changes matching Shopify product REST schema
            # E.g. {"price": "19.99"} should update the first variant
            payload = {"product": {"id": product_id}}
            
            # Check title / body updates
            if "title" in changes:
                payload["product"]["title"] = changes["title"]
            if "body_html" in changes:
                 payload["product"]["body_html"] = changes["body_html"]
                 
            # Check price updates (price lives on first variant)
            if "price" in changes:
                # We need to query the product first to fetch first variant ID
                async with httpx.AsyncClient(timeout=15) as client:
                    vr = await client.get(f"{base_api}/products/{product_id}.json", headers=headers)
                    if vr.status_code == 200:
                        vdata = vr.json().get("product", {})
                        if vdata.get("variants"):
                            first_variant_id = vdata["variants"][0].get("id")
                            payload["product"]["variants"] = [{"id": first_variant_id, "price": changes["price"]}]
            
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.put(f"{base_api}/products/{product_id}.json", headers=headers, json=payload)
                
            if r.status_code != 200:
                 return {"success": False, "error": f"Shopify Update failed: {r.text[:300]}"}
                 
            return {
                "success": True,
                "message": f"Successfully updated Shopify Product ID {product_id}",
                "updated_product": r.json().get("product")
            }
            
        # ── 3. GENERATE SECTION LIQUID CODE ────────────────────────────────────
        elif action == "create_section":
            section_name = params.get("section_name", "custom-section")
            spec = params.get("spec", "A modern Shopify custom section template")
            
            if not section_name.endswith(".liquid"):
                 section_name += ".liquid"
                 
            router = get_model_router()
            
            liquid_prompt = (
                f"Generate a beautiful, production-ready custom Shopify theme Section Liquid file named '{section_name}'.\n"
                f"Specifications:\n{spec}\n\n"
                f"Guidelines:\n"
                f"- Include HTML, inline Tailwind, CSS styles, and javascript as appropriate.\n"
                f"- Include a complete, valid liquid `{{% schema %}}` definition at the bottom with proper settings, presets, and name matching.\n"
                f"- Return ONLY the liquid code template. Do not write explanation, markdown formatting wrappers, or text outside the Liquid template."
            )
            
            raw_liquid = await router.call_model([{"role": "user", "content": liquid_prompt}])
            
            # Clean markdown codeblocks
            cleaned_liquid = raw_liquid.strip()
            if cleaned_liquid.startswith("```"):
                import re
                match = re.search(r"```(?:liquid|html|xml)?\s*([\s\S]*?)\s*```", cleaned_liquid)
                if match:
                    cleaned_liquid = match.group(1).strip()
            
            # Save section file locally to shopify output themes sections directory
            output_dir = Path(__file__).parent.parent.parent.parent / "shopify" / "output" / "themes" / "sections"
            os.makedirs(output_dir, exist_ok=True)
            
            section_path = output_dir / section_name
            with open(section_path, "w", encoding="utf-8") as f:
                f.write(cleaned_liquid)
                
            return {
                "success": True,
                "section_name": section_name,
                "saved_path": str(section_path),
                "preview_preview_code": cleaned_liquid[:600] + "\n... [truncated] ...",
                "message": f"Successfully generated custom Shopify section Liquid file '{section_name}'."
            }
            
        else:
            return {"success": False, "error": f"Unknown Shopify action: {action}"}
            
    except Exception as e:
        logger.exception("Error executing Shopify action")
        return {"success": False, "error": str(e)}
