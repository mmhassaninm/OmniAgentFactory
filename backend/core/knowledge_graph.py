"""
Knowledge Graph Engine — persistent graph-based memory that tracks relationships
between Users, Tasks, Preferences, Entities, Skills, Outcomes, and Channels.

Uses networkx for in-memory graph operations and persists to MongoDB as JSON.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import networkx as nx

from core.database import get_db

logger = logging.getLogger(__name__)

# Node types
NODE_USER = "User"
NODE_TASK = "Task"
NODE_PREFERENCE = "Preference"
NODE_ENTITY = "Entity"
NODE_SKILL = "Skill"
NODE_OUTCOME = "Outcome"
NODE_CHANNEL = "Channel"

# Edge types
EDGE_PERFORMED = "performed"
EDGE_PREFERS = "prefers"
EDGE_RELATES_TO = "relates_to"
EDGE_LEARNED_FROM = "learned_from"
EDGE_TRIGGERED_BY = "triggered_by"


class KnowledgeGraph:
    """
    Persistent knowledge graph using networkx.

    Methods:
      add_node(node_id, node_type, attributes)
      add_edge(from_id, to_id, edge_type, weight=1.0)
      query_related(node_id, depth=2) -> list
      get_user_profile(user_id) -> dict
      update_from_interaction(user_id, message, response, outcome)
      export_context_for_llm(user_id) -> str
    """

    def __init__(self) -> None:
        self._graph: nx.MultiDiGraph = nx.MultiDiGraph()
        self._loaded: bool = False

    async def load(self) -> None:
        """Load the knowledge graph from MongoDB."""
        if self._loaded:
            return
        try:
            db = get_db()
            doc = await db.knowledge_graph.find_one({"_id": "graph_data"})
            if doc and "graph_data" in doc:
                data = json.loads(doc["graph_data"])
                self._graph = nx.node_link_graph(data, directed=True, multigraph=True)
                logger.info("[KnowledgeGraph] Loaded %d nodes, %d edges from MongoDB",
                           self._graph.number_of_nodes(), self._graph.number_of_edges())
            else:
                logger.info("[KnowledgeGraph] No existing graph found — starting fresh")
            self._loaded = True
        except Exception as e:
            logger.warning("[KnowledgeGraph] Load failed: %s", e)
            self._loaded = True

    async def _persist(self) -> None:
        """Save the graph to MongoDB as JSON."""
        try:
            data = nx.node_link_data(self._graph)
            db = get_db()
            await db.knowledge_graph.update_one(
                {"_id": "graph_data"},
                {"$set": {"graph_data": json.dumps(data), "updated_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True,
            )
        except Exception as e:
            logger.warning("[KnowledgeGraph] Persist failed: %s", e)

    def add_node(self, node_id: str, node_type: str, attributes: dict[str, Any] | None = None) -> None:
        """Add a node to the graph."""
        attrs = {"type": node_type, "created_at": datetime.now(timezone.utc).isoformat()}
        if attributes:
            attrs.update(attributes)
        self._graph.add_node(node_id, **attrs)

    def add_edge(self, from_id: str, to_id: str, edge_type: str, weight: float = 1.0) -> None:
        """Add a typed, weighted edge between two nodes."""
        # Ensure nodes exist
        if not self._graph.has_node(from_id):
            self.add_node(from_id, NODE_ENTITY)
        if not self._graph.has_node(to_id):
            self.add_node(to_id, NODE_ENTITY)
        self._graph.add_edge(from_id, to_id, key=edge_type, type=edge_type, weight=weight)

    def query_related(self, node_id: str, depth: int = 2) -> list[dict[str, Any]]:
        """Query nodes related to the given node_id up to `depth` hops."""
        if not self._graph.has_node(node_id):
            return []
        visited: set[str] = set()
        results: list[dict[str, Any]] = []
        current_level: list[str] = [node_id]
        for _ in range(depth):
            next_level: list[str] = []
            for nid in current_level:
                if nid in visited:
                    continue
                visited.add(nid)
                for neighbor in self._graph.neighbors(nid):
                    if neighbor not in visited:
                        edge_data = self._graph.get_edge_data(nid, neighbor)
                        edge_type = "unknown"
                        if edge_data:
                            for key in edge_data:
                                edge_type = edge_data[key].get("type", "unknown")
                                break
                        results.append({
                            "node_id": neighbor,
                            "type": self._graph.nodes[neighbor].get("type", "unknown"),
                            "edge_type": edge_type,
                            "attributes": dict(self._graph.nodes[neighbor]),
                        })
                        next_level.append(neighbor)
                    # Also check reverse edges
                    for pred in self._graph.predecessors(nid):
                        if pred not in visited:
                            edge_data = self._graph.get_edge_data(pred, nid)
                            edge_type = "unknown"
                            if edge_data:
                                for key in edge_data:
                                    edge_type = edge_data[key].get("type", "unknown")
                                    break
                            results.append({
                                "node_id": pred,
                                "type": self._graph.nodes[pred].get("type", "unknown"),
                                "edge_type": edge_type,
                                "attributes": dict(self._graph.nodes[pred]),
                            })
                            next_level.append(pred)
            current_level = list(set(next_level))
            if not current_level:
                break
        return results

    def get_user_profile(self, user_id: str) -> dict[str, Any]:
        """Get a full profile for a user from the knowledge graph."""
        user_node_id = f"user:{user_id}"
        if not self._graph.has_node(user_node_id):
            return {"user_id": user_id, "known": False, "nodes": []}
        related = self.query_related(user_node_id, depth=2)
        preferences = [n for n in related if n["type"] == NODE_PREFERENCE]
        tasks = [n for n in related if n["type"] == NODE_TASK]
        skills = [n for n in related if n["type"] == NODE_SKILL]
        entities = [n for n in related if n["type"] == NODE_ENTITY]
        return {
            "user_id": user_id,
            "known": True,
            "preferences": preferences,
            "tasks": tasks,
            "skills": skills,
            "entities": entities,
            "all_related": related,
        }

    async def update_from_interaction(
        self,
        user_id: str,
        message: str,
        response: str,
        outcome: str = "completed",
    ) -> None:
        """Update the knowledge graph from a user interaction."""
        user_node = f"user:{user_id}"
        if not self._graph.has_node(user_node):
            self.add_node(user_node, NODE_USER, {"user_id": user_id})

        # Create a task node
        task_id = f"task:{user_id}:{datetime.now(timezone.utc).timestamp()}"
        self.add_node(task_id, NODE_TASK, {"message": message[:200], "outcome": outcome})
        self.add_edge(user_node, task_id, EDGE_PERFORMED)

        # Create outcome node
        outcome_id = f"outcome:{user_id}:{datetime.now(timezone.utc).timestamp()}"
        self.add_node(outcome_id, NODE_OUTCOME, {"response": response[:200], "outcome": outcome})
        self.add_edge(task_id, outcome_id, EDGE_LEARNED_FROM)

        # Extract keywords from message as entities
        import re
        words = re.findall(r'\b[A-Z][a-z]{2,}\b', message)
        for word in words[:5]:
            entity_id = f"entity:{word.lower()}"
            if not self._graph.has_node(entity_id):
                self.add_node(entity_id, NODE_ENTITY, {"name": word})
            self.add_edge(task_id, entity_id, EDGE_RELATES_TO, weight=0.5)

        await self._persist()

    def export_context_for_llm(self, user_id: str) -> str:
        """Export formatted knowledge graph context for LLM prompt injection."""
        user_node = f"user:{user_id}"
        if not self._graph.has_node(user_node):
            return "[MEMORY CONTEXT]: No prior knowledge about this user."

        related = self.query_related(user_node, depth=2)
        if not related:
            return "[MEMORY CONTEXT]: No prior knowledge about this user."

        lines: list[str] = ["[MEMORY CONTEXT]:"]
        for item in related:
            attrs = item.get("attributes", {})
            name = attrs.get("name", attrs.get("message", item["node_id"]))
            lines.append(f"  - {item['type']} '{name}' ({item['edge_type']})")
        return "\n".join(lines)

    async def delete_user(self, user_id: str) -> bool:
        """Delete all nodes related to a user. Returns True if user existed."""
        user_node = f"user:{user_id}"
        if not self._graph.has_node(user_node):
            return False
        # Collect all nodes to remove (user + connected)
        to_remove = {user_node}
        for neighbor in self._graph.neighbors(user_node):
            to_remove.add(neighbor)
        for pred in self._graph.predecessors(user_node):
            to_remove.add(pred)
        self._graph.remove_nodes_from(to_remove)
        await self._persist()
        return True

    async def add_fact(self, user_id: str, fact: str) -> None:
        """Manually add a fact note to the graph for a user."""
        user_node = f"user:{user_id}"
        if not self._graph.has_node(user_node):
            self.add_node(user_node, NODE_USER, {"user_id": user_id})
        fact_id = f"fact:{user_id}:{datetime.now(timezone.utc).timestamp()}"
        self.add_node(fact_id, NODE_PREFERENCE, {"fact": fact})
        self.add_edge(user_node, fact_id, EDGE_PREFERS)
        await self._persist()


# Singleton
_graph_instance: Optional[KnowledgeGraph] = None


def get_knowledge_graph() -> KnowledgeGraph:
    """Get or create the singleton KnowledgeGraph."""
    global _graph_instance
    if _graph_instance is None:
        _graph_instance = KnowledgeGraph()
    return _graph_instance