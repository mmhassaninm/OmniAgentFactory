"""
Swarm Marketer Agent — generates content, social posts, email campaigns.
Uses web search, content templates, and Shopify product data.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def generate_social_post(topic: str, platform: str = "twitter") -> dict[str, Any]:
    """
    Generate a social media post about a topic.

    Args:
        topic: The topic or product to promote
        platform: Social platform (twitter, linkedin, instagram, facebook)

    Returns:
        dict with generated post content
    """
    try:
        from core.model_router import get_model_router

        router = get_model_router()
        prompt = f"""Create a {platform} social media post about: {topic}

Make it engaging, include relevant hashtags, and optimize for {platform}.
Keep it under 280 characters for Twitter, longer for other platforms.

Return only the post content, no explanation."""

        response = await router.route_completion(prompt=prompt, model="openai/gpt-4o-mini")
        content = response.get("content", "") if isinstance(response, dict) else str(response)

        return {"status": "ok", "platform": platform, "post": content.strip()}
    except Exception as e:
        logger.warning("[Swarm/Marketer] social_post error: %s", e)
        return {"status": "error", "error": str(e)[:200]}


async def generate_product_campaign(product_name: str, features: list[str]) -> dict[str, Any]:
    """
    Generate marketing copy for a product.

    Args:
        product_name: Name of the product
        features: List of key features

    Returns:
        dict with campaign content
    """
    try:
        from core.model_router import get_model_router

        router = get_model_router()
        features_str = "\n".join([f"- {f}" for f in features])
        prompt = f"""Create a marketing campaign for {product_name}.

Key features:
{features_str}

Generate:
1. A catchy headline
2. A short product description (2-3 sentences)
3. A call-to-action
4. 5 relevant hashtags

Return in a structured format."""

        response = await router.route_completion(prompt=prompt, model="openai/gpt-4o-mini")
        content = response.get("content", "") if isinstance(response, dict) else str(response)

        return {
            "status": "ok",
            "product": product_name,
            "campaign": content.strip(),
        }
    except Exception as e:
        logger.warning("[Swarm/Marketer] campaign error: %s", e)
        return {"status": "error", "error": str(e)[:200]}


async def get_shopify_products_for_marketing() -> dict[str, Any]:
    """
    Get Shopify products for marketing campaigns.

    Returns:
        dict with product list suitable for marketing
    """
    try:
        from skills.shopify_ops.run import get_products

        result = await get_products(limit=10)
        return result
    except Exception as e:
        logger.warning("[Swarm/Marketer] shopify products error: %s", e)
        return {"status": "error", "error": str(e)[:200]}