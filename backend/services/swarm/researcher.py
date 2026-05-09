from .base_agent import BaseAgent
from services.search_engine import search_duckduckgo
from services.vector_db import vector_memory

class ResearcherAgent(BaseAgent):
    def __init__(self, model: str = "local-model"):
        super().__init__(
            name="Researcher",
            role="Data & Context Gatherer",
            system_prompt="""You are the Swarm's Researcher. Your goal is to gather context from the web and the knowledge base to answer queries or provide technical context.
You must analyze the problem, formulate precise search queries, and synthesize the gathered information into a concise technical summary.""",
            model=model
        )

    async def execute_research(self, topic: str) -> str:
        """Perform a multi-stage research and return synthesized context."""
        # 1. Recall from Semantic Memory (Vector DB)
        memory_results = await vector_memory.recall_memory("vault", topic, n_results=3)
        memory_context = "\n".join([r['text'] for r in memory_results]) if memory_results else "No relevant internal memories."

        # 2. Web Search
        web_results = await search_duckduckgo(topic, limit=5)
        
        # 3. Synthesize via LM Studio
        synthesis_prompt = f"""
        Research Topic: {topic}
        
        Internal Semantic Memory:
        {memory_context}
        
        Live Web Results:
        {web_results}
        
        Synthesize this information into a clear, actionable technical context report. Focus on factual data, code patterns, and constraints.
        """
        return await self.execute(synthesis_prompt)
