import os
import chromadb
from chromadb.config import Settings
import logging

logger = logging.getLogger(__name__)

# Resolve path for local ChromaDB storage
DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_db")
os.makedirs(DB_DIR, exist_ok=True)

class VectorMemory:
    """
    Nexus Long-Term Semantic Memory using local ChromaDB.
    """
    def __init__(self):
        try:
            self.client = chromadb.PersistentClient(path=DB_DIR)
            # Collection for general factual RAG and past code solutions
            self.knowledge_vault = self.client.get_or_create_collection(
                name="nexus_vault",
                metadata={"hnsw:space": "cosine"}
            )
            # Collection for DevLog and QA execution history
            self.execution_history = self.client.get_or_create_collection(
                name="execution_history",
                metadata={"hnsw:space": "cosine"}
            )
            logger.info("ChromaDB Vector Memory initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {e}")
            raise

    async def store_memory(self, collection_name: str, doc_id: str, text: str, metadata: dict = None):
        """Store a document in the vector database."""
        try:
            collection = self.knowledge_vault if collection_name == "vault" else self.execution_history
            if not metadata:
                metadata = {}
            collection.add(
                documents=[text],
                metadatas=[metadata],
                ids=[doc_id]
            )
            return True
        except Exception as e:
            logger.error(f"Error storing memory '{doc_id}': {e}")
            return False

    async def recall_memory(self, collection_name: str, query: str, n_results: int = 3):
        """Retrieve most relevant memories based on semantic similarity."""
        try:
            collection = self.knowledge_vault if collection_name == "vault" else self.execution_history
            results = collection.query(
                query_texts=[query],
                n_results=n_results
            )
            
            if not results["documents"] or not results["documents"][0]:
                return []
                
            formatted_results = []
            for i in range(len(results["documents"][0])):
                doc = results["documents"][0][i]
                meta = results["metadatas"][0][i] if results["metadatas"] else {}
                dist = results["distances"][0][i] if "distances" in results else None
                formatted_results.append({
                    "text": doc,
                    "metadata": meta,
                    "distance": dist
                })
            return formatted_results
        except Exception as e:
            logger.error(f"Error recalling memory for query '{query}': {e}")
            return []

# Singleton instance
vector_memory = VectorMemory()
