"""
Request/response observability and metrics collection.
Tracks latency, errors, and request patterns across all endpoints.
"""

import time
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from collections import defaultdict

logger = logging.getLogger(__name__)


class RequestMetrics:
    """Collect and aggregate request/response metrics."""

    def __init__(self, max_history: int = 1000):
        """
        Args:
            max_history: Maximum recent requests to keep in memory
        """
        self.max_history = max_history
        self.recent_requests: List[Dict[str, Any]] = []
        self.endpoint_stats: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {
                "count": 0,
                "total_time_ms": 0,
                "error_count": 0,
                "last_error": None,
                "min_time_ms": float("inf"),
                "max_time_ms": 0,
                "avg_time_ms": 0,
            }
        )

    def record_request(
        self,
        endpoint: str,
        method: str,
        status_code: int,
        duration_ms: float,
        error: Optional[str] = None,
        client_ip: Optional[str] = None,
    ):
        """Record a completed request."""
        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "error": error,
            "client_ip": client_ip,
        }

        # Keep recent requests (sliding window)
        self.recent_requests.append(entry)
        if len(self.recent_requests) > self.max_history:
            self.recent_requests.pop(0)

        # Update endpoint statistics
        key = f"{method} {endpoint}"
        stats = self.endpoint_stats[key]
        stats["count"] += 1
        stats["total_time_ms"] += duration_ms
        if error:
            stats["error_count"] += 1
            stats["last_error"] = error
        stats["min_time_ms"] = min(stats["min_time_ms"], duration_ms)
        stats["max_time_ms"] = max(stats["max_time_ms"], duration_ms)
        stats["avg_time_ms"] = stats["total_time_ms"] / stats["count"]

    def get_stats_for_endpoint(self, endpoint: str, method: str = "") -> Dict[str, Any]:
        """Get aggregated stats for an endpoint."""
        key = f"{method} {endpoint}" if method else endpoint
        return self.endpoint_stats.get(key, {})

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get stats for all endpoints."""
        return dict(self.endpoint_stats)

    def get_recent_requests(self, limit: int = 50, endpoint: Optional[str] = None) -> List[Dict]:
        """Get recent requests, optionally filtered by endpoint."""
        requests = self.recent_requests[-limit:]
        if endpoint:
            requests = [r for r in requests if r["endpoint"] == endpoint]
        return requests

    def get_error_summary(self) -> Dict[str, Any]:
        """Get summary of errors by endpoint."""
        errors_by_endpoint = defaultdict(list)
        for req in self.recent_requests[-100:]:  # Last 100 requests
            if req["error"]:
                errors_by_endpoint[req["endpoint"]].append(
                    {
                        "status": req["status_code"],
                        "error": req["error"],
                        "timestamp": req["timestamp"],
                    }
                )
        return dict(errors_by_endpoint)

    def get_slowest_endpoints(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get slowest endpoints by average latency."""
        sorted_endpoints = sorted(
            self.endpoint_stats.items(),
            key=lambda x: x[1]["avg_time_ms"],
            reverse=True,
        )
        return [
            {
                "endpoint": endpoint,
                "avg_time_ms": stats["avg_time_ms"],
                "max_time_ms": stats["max_time_ms"],
                "request_count": stats["count"],
            }
            for endpoint, stats in sorted_endpoints[:limit]
        ]

    def get_health_summary(self) -> Dict[str, Any]:
        """Get overall system health summary."""
        total_requests = sum(s["count"] for s in self.endpoint_stats.values())
        total_errors = sum(s["error_count"] for s in self.endpoint_stats.values())
        error_rate = (total_errors / total_requests * 100) if total_requests > 0 else 0

        avg_latency = (
            sum(s["avg_time_ms"] for s in self.endpoint_stats.values())
            / len(self.endpoint_stats)
            if self.endpoint_stats
            else 0
        )

        return {
            "total_requests": total_requests,
            "total_errors": total_errors,
            "error_rate_pct": round(error_rate, 2),
            "avg_latency_ms": round(avg_latency, 2),
            "endpoints_tracked": len(self.endpoint_stats),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }


# Global metrics collector
_metrics = RequestMetrics()


def record_request(
    endpoint: str,
    method: str,
    status_code: int,
    duration_ms: float,
    error: Optional[str] = None,
    client_ip: Optional[str] = None,
):
    """Record a request to global metrics."""
    _metrics.record_request(endpoint, method, status_code, duration_ms, error, client_ip)


def get_metrics() -> RequestMetrics:
    """Get the global metrics collector."""
    return _metrics
