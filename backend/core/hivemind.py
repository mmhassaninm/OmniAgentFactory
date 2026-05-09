"""
HiveMind: All agents share one collective consciousness.
When any agent learns something valuable, ALL agents 
benefit immediately in their next evolution cycle.
"""
import chromadb
from datetime import datetime


class HiveMind:
    def __init__(self):
        self.client = chromadb.Client()
        self.collection = self.client.get_or_create_collection(
            name="hivemind_consciousness",
            metadata={"description": "Shared knowledge across all agents"}
        )

    async def remember(self, agent_id: str, agent_name: str,
                      knowledge: str, category: str = "general"):
        """Agent deposits knowledge into collective memory."""
        self.collection.add(
            documents=[knowledge],
            metadatas=[{
                "agent_id": agent_id,
                "agent_name": agent_name,
                "category": category,
                "timestamp": datetime.utcnow().isoformat(),
                "times_helped": 0,
            }],
            ids=[f"{agent_id}_{datetime.utcnow().timestamp()}"]
        )

    async def recall(self, query: str, n_results: int = 5) -> list[str]:
        """Any agent can retrieve relevant knowledge from the hive."""
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results
        )
        return results["documents"][0] if results.get("documents") else []

    async def get_collective_wisdom(self, goal: str) -> str:
        """
        Before starting evolution, agent checks:
        'What does the hive already know about this?'
        """
        memories = await self.recall(goal)
        if not memories:
            return "No collective wisdom yet for this goal."
        return f"Collective wisdom from {len(memories)} previous agents:\n" + \
               "\n".join(f"• {m[:200]}" for m in memories)

    async def reinforce(self, knowledge_id: str):
        """Mark a piece of knowledge as helpful — it rises in priority."""
        pass  # Update times_helped counter


_hivemind = HiveMind()

def get_hivemind() -> HiveMind:
    return _hivemind
