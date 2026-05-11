"""
MongoDB query optimization utilities.
Prevents N+1 queries, enables efficient bulk operations, and provides query caching.
"""

import logging
import asyncio
from typing import Any, Dict, List, Optional, Callable
from datetime import datetime, timedelta
from collections import defaultdict

logger = logging.getLogger(__name__)


class QueryBatcher:
    """Batch similar database queries to prevent N+1 problem."""

    def __init__(self, batch_timeout_ms: float = 10.0):
        """
        Args:
            batch_timeout_ms: Time to wait before executing batch (default 10ms)
        """
        self.batch_timeout_ms = batch_timeout_ms
        self.pending_queries: Dict[str, List] = defaultdict(list)
        self.batch_tasks: Dict[str, asyncio.Task] = {}

    async def batch_fetch(
        self,
        query_type: str,
        collection_name: str,
        query_field: str,
        ids: List[Any],
        fetch_fn: Callable,
    ) -> Dict[Any, Any]:
        """
        Batch fetch multiple IDs at once to prevent N+1 queries.

        Args:
            query_type: Type identifier for this query (e.g., "user_by_id")
            collection_name: MongoDB collection name
            query_field: Field to query on (e.g., "_id", "user_id")
            ids: List of IDs to fetch
            fetch_fn: Async function that takes collection and query, returns result

        Returns:
            Dictionary mapping ID -> document
        """
        batch_key = f"{query_type}:{collection_name}:{query_field}"

        # Add to pending batch
        self.pending_queries[batch_key].extend(ids)

        # If batch task doesn't exist, create one
        if batch_key not in self.batch_tasks or self.batch_tasks[batch_key].done():
            task = asyncio.create_task(
                self._execute_batch_after_delay(batch_key, collection_name, query_field, fetch_fn)
            )
            self.batch_tasks[batch_key] = task

        # Wait for batch to complete
        results = await self.batch_tasks[batch_key]
        return {result_id: doc for result_id, doc in results}

    async def _execute_batch_after_delay(
        self,
        batch_key: str,
        collection_name: str,
        query_field: str,
        fetch_fn: Callable,
    ):
        """Execute batched query after delay."""
        # Wait for batch timeout
        await asyncio.sleep(self.batch_timeout_ms / 1000.0)

        # Get all pending IDs for this batch
        ids = list(set(self.pending_queries[batch_key]))
        self.pending_queries[batch_key] = []

        if not ids:
            return []

        logger.debug(
            "Executing batch query: %s (batched %d IDs)",
            batch_key,
            len(ids)
        )

        try:
            # Execute fetch with batched IDs
            results = await fetch_fn(collection_name, {query_field: {"$in": ids}})
            return [(r.get(query_field), r) for r in results]
        except Exception as e:
            logger.error("Batch query failed: %s", e)
            return []


class QueryCache:
    """Simple query result cache with TTL."""

    def __init__(self, default_ttl_seconds: int = 300):
        """
        Args:
            default_ttl_seconds: Default cache TTL (default 5 minutes)
        """
        self.default_ttl_seconds = default_ttl_seconds
        self.cache: Dict[str, tuple] = {}  # key -> (value, expiry_time)
        self.hit_count = 0
        self.miss_count = 0

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired."""
        if key not in self.cache:
            self.miss_count += 1
            return None

        value, expiry_time = self.cache[key]
        if datetime.utcnow() > expiry_time:
            del self.cache[key]
            self.miss_count += 1
            return None

        self.hit_count += 1
        return value

    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None):
        """Set value in cache with TTL."""
        ttl = ttl_seconds or self.default_ttl_seconds
        expiry_time = datetime.utcnow() + timedelta(seconds=ttl)
        self.cache[key] = (value, expiry_time)

    def invalidate(self, key: str):
        """Remove key from cache."""
        if key in self.cache:
            del self.cache[key]

    def invalidate_pattern(self, pattern: str):
        """Remove all keys matching pattern."""
        import fnmatch
        keys_to_delete = [k for k in self.cache.keys() if fnmatch.fnmatch(k, pattern)]
        for key in keys_to_delete:
            del self.cache[key]

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total = self.hit_count + self.miss_count
        hit_rate = (self.hit_count / total * 100) if total > 0 else 0
        return {
            "hits": self.hit_count,
            "misses": self.miss_count,
            "hit_rate_pct": round(hit_rate, 1),
            "total_entries": len(self.cache),
        }


class AggregationOptimizer:
    """Optimize MongoDB aggregation pipelines."""

    @staticmethod
    def build_efficient_lookup(
        from_collection: str,
        local_field: str,
        foreign_field: str,
        as_field: str,
    ) -> Dict[str, Any]:
        """Build efficient $lookup stage."""
        return {
            "$lookup": {
                "from": from_collection,
                "localField": local_field,
                "foreignField": foreign_field,
                "as": as_field,
            }
        }

    @staticmethod
    def build_batch_filters(filters: Dict[str, Any]) -> Dict[str, Any]:
        """Build $match stage from filter dict."""
        return {"$match": filters}

    @staticmethod
    def build_projection(fields: List[str]) -> Dict[str, Any]:
        """Build $project stage from field list."""
        projection = {field: 1 for field in fields}
        projection["_id"] = 1  # Always include _id
        return {"$project": projection}

    @staticmethod
    def build_sort(sort_specs: Dict[str, int]) -> Dict[str, Any]:
        """Build $sort stage (1 for ascending, -1 for descending)."""
        return {"$sort": sort_specs}

    @staticmethod
    def build_limit(count: int) -> Dict[str, Any]:
        """Build $limit stage."""
        return {"$limit": count}

    @staticmethod
    def build_skip(count: int) -> Dict[str, Any]:
        """Build $skip stage."""
        return {"$skip": count}

    @staticmethod
    def build_group_aggregation(
        group_field: str,
        aggregations: Dict[str, str]
    ) -> Dict[str, Any]:
        """
        Build $group stage for aggregation.

        Args:
            group_field: Field to group by
            aggregations: Dict of {output_field: aggregation_expr}
                E.g., {"total": "$sum:1", "avg_score": "$avg:score"}
        """
        group_spec = {"_id": f"${group_field}"}

        for output_field, expr in aggregations.items():
            if expr.startswith("$sum:"):
                # $sum:field or $sum:1 for count
                field = expr.split(":", 1)[1]
                group_spec[output_field] = {"$sum": int(field) if field == "1" else f"${field}"}
            elif expr.startswith("$avg:"):
                field = expr.split(":", 1)[1]
                group_spec[output_field] = {"$avg": f"${field}"}
            elif expr.startswith("$max:"):
                field = expr.split(":", 1)[1]
                group_spec[output_field] = {"$max": f"${field}"}
            elif expr.startswith("$min:"):
                field = expr.split(":", 1)[1]
                group_spec[output_field] = {"$min": f"${field}"}

        return {"$group": group_spec}


# Global instances
_default_query_cache = QueryCache()
_default_query_batcher = QueryBatcher()


def get_query_cache() -> QueryCache:
    """Get global query cache instance."""
    return _default_query_cache


def get_query_batcher() -> QueryBatcher:
    """Get global query batcher instance."""
    return _default_query_batcher
