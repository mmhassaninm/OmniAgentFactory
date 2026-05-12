"""
Idea Engine v2 — Real Web Research + AI Idea Generation
Searches the web and uses LLM to generate novel development ideas
"""
import json
import logging
import random
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# Ideas about AI/evolution/agents and passive monetization that inspire NexusOS development
SEARCH_QUERIES = [
    "AI agent self-improvement techniques 2026",
    "autonomous AI evolution loop best practices",
    "multi-agent collaboration patterns LLM",
    "self-evolving code generation systems",
    "passive income AI agents automation 2026",
    "autonomous AI SaaS monetization microtasks",
    "zero-intervention digital product generation arbitrage",
    "automated affiliate marketing agent network",
    "automated digital products shopify revenue bot",
    "multi-channel AI revenue generation strategies",
]

IDEA_GENERATION_PROMPT = """
You are a senior technical analyst specializing in AI agents, autonomous self-evolving architectures, and zero-intervention monetization pipelines.
You are a technical analyst specializing in self-evolving AI systems and profitable automation.

# Ultimate Core Mandate
The absolute priority of OmniBot/NexusOS is generating passive financial yield with zero human intervention.
Every development idea generated must either:
1. Direct or optimize multi-channel revenue generation (AI Content generation, microtask automation, digital product sales, automated Shopify store deployment, arbitrage bots, affiliate networking).
2. Deepen self-evolution capabilities (the ability of the factory to write its own custom money-making engines, add new UI pages, self-update its code, and deploy features autonomously).

# Project Context
NexusOS is an autonomous AI agent factory with:
- FastAPI backend + React frontend
- MongoDB persistence
- LangGraph agent orchestration
- Self-evolution loop (continuous improvement)
- Shopify theme generator (7-agent swarm)
- Multi-provider LLM router (Claude, Groq, OpenRouter, etc.)

# Web Research Results
{web_results}

# Already Implemented Ideas (don't repeat these)
{implemented_ideas}

# Your Task
Generate 2-3 novel development ideas that:
1. Are completely different from implemented ideas.
2. Directly align with the Ultimate Core Mandate (monetization/self-development).
3. Leverage findings from web research.
4. Fit the NexusOS architecture.
5. Deliver measurable value (performance, passive income, reliability, automation).

Output ONLY valid JSON (no markdown, no explanation):
{{
  "ideas": [
    {{
      "title": "Short Title",
      "description": "2-3 sentence detailed description",
      "source": "Web source or inspiration (URL or title)",
      "impact": "high|medium|low",
      "feasibility": "high|medium|low",
      "category": "evolution|tools|performance|reliability|integration|ui",
      "estimated_files": ["file1.py", "file2.py"],
      "estimated_hours": 4
    }}
  ]
}}
"""


class IdeaEngineV2:
    """Generates development ideas from web research and AI analysis."""

    def __init__(self, model_router, registry_manager):
        self.model_router = model_router
        self.registry = registry_manager

    async def research_and_generate(self) -> List[Dict[str, Any]]:
        """Main entry point: research web + generate ideas."""
        try:
            logger.info("🔍 IdeaEngineV2: Starting web research and idea generation...")

            # Step 1: Search the web
            web_results = await self._web_research()

            # Step 2: Get implemented ideas to avoid duplication
            implemented = await self.registry.get_implemented_ideas(limit=20)

            # Step 3: Generate ideas using LLM
            ideas = await self._generate_via_llm(web_results, implemented)

            # Step 4: Filter duplicates
            filtered = await self.registry.filter_duplicate_ideas(ideas)

            logger.info(f"✨ Generated {len(filtered)} unique ideas (from {len(ideas)} total)")
            return filtered

        except Exception as e:
            logger.error(f"Idea generation failed: {e}")
            return []

    async def _web_research(self) -> List[Dict[str, str]]:
        """Search the web using DuckDuckGo for relevant topics with strict async timeouts."""
        results = []
        try:
            import asyncio
            from duckduckgo_search import DDGS

            # Pick 1-2 random searches
            queries = random.sample(SEARCH_QUERIES, 2)

            for query in queries:
                logger.info(f"  Searching: {query}")
                try:
                    # Run DDGS in a background thread to prevent blocking the main asyncio event loop
                    def sync_search():
                        with DDGS(timeout=5) as ddgs:
                            return list(ddgs.text(query, max_results=3))

                    # Hard safety limit at the async coroutine level
                    search_results = await asyncio.wait_for(
                        asyncio.to_thread(sync_search),
                        timeout=6.0
                    )
                    for r in search_results:
                        results.append({
                            "title": r.get("title", ""),
                            "snippet": r.get("body", "")[:200],
                            "url": r.get("href", ""),
                            "query": query
                        })
                except Exception as e:
                    logger.warning(f"  Search failed for '{query}': {e}")

            if not results:
                logger.info("  Web search returned zero results. Using pre-cached high-quality AI knowledge base as fallback...")
                results = [
                    {
                        "title": "ChromaDB Semantic Caching in Multi-Agent Councils",
                        "snippet": "Semantic caching preserves LLM tokens by storing previous deliberation consensus and mapping new queries using cosine similarity.",
                        "url": "https://chromadb.com/blog/semantic-caching",
                        "query": "multi-agent collaboration patterns LLM"
                    },
                    {
                        "title": "Self-Evolving AI Code Improvement Heuristics",
                        "snippet": "Static code analysis engines coupled with AST parsing allow LLM agents to accurately target unused imports, complexity bottlenecks, and logging gaps.",
                        "url": "https://arxiv.org/abs/2410.02345",
                        "query": "self-evolving code generation systems"
                    },
                    {
                        "title": "FastAPI Async Timeout and Circuit Breaker Middleware",
                        "snippet": "Implementing per-route timeouts and circuit breakers prevents runaway external API calls from blocking async application servers.",
                        "url": "https://fastapi.tiangolo.com/advanced/middleware",
                        "query": "AI agent self-improvement techniques 2025"
                    }
                ]

            logger.info(f"  Found {len(results)} web results")
            return results

        except Exception as e:
            logger.warning(f"Web research failed: {e}. Falling back to pre-cached high-quality AI knowledge base...")
            return [
                {
                    "title": "ChromaDB Semantic Caching in Multi-Agent Councils",
                    "snippet": "Semantic caching preserves LLM tokens by storing previous deliberation consensus and mapping new queries using cosine similarity.",
                    "url": "https://chromadb.com/blog/semantic-caching",
                    "query": "multi-agent collaboration patterns LLM"
                },
                {
                    "title": "Self-Evolving AI Code Improvement Heuristics",
                    "snippet": "Static code analysis engines coupled with AST parsing allow LLM agents to accurately target unused imports, complexity bottlenecks, and logging gaps.",
                    "url": "https://arxiv.org/abs/2410.02345",
                    "query": "self-evolving code generation systems"
                },
                {
                    "title": "FastAPI Async Timeout and Circuit Breaker Middleware",
                    "snippet": "Implementing per-route timeouts and circuit breakers prevents runaway external API calls from blocking async application servers.",
                    "url": "https://fastapi.tiangolo.com/advanced/middleware",
                    "query": "AI agent self-improvement techniques 2025"
                }
            ]

    async def _generate_via_llm(self, web_results: List[dict],
                               implemented: List[dict]) -> List[Dict[str, Any]]:
        """Use LLM to generate ideas based on web research."""
        try:
            # Format web results
            web_text = "\n".join([
                f"- {r['title']}: {r['snippet']}"
                for r in web_results[:5]
            ])

            # Format implemented ideas
            impl_text = "\n".join([
                f"- {i.get('title')}: {i.get('description', '')[:100]}"
                for i in implemented[:10]
            ])

            prompt = IDEA_GENERATION_PROMPT.format(
                web_results=web_text or "(No web results)",
                implemented_ideas=impl_text or "(None yet)"
            )

            # Call LLM
            logger.info("  Calling LLM for idea generation...")
            response = await self.model_router.call_model(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=1000
            )

            # Parse JSON
            try:
                data = json.loads(response)
                ideas = data.get("ideas", [])
                logger.info(f"  LLM generated {len(ideas)} ideas")
                return ideas
            except json.JSONDecodeError:
                logger.warning(f"LLM returned invalid JSON: {response[:100]}")
                return []

        except Exception as e:
            logger.error(f"LLM idea generation failed: {e}")
            return []
