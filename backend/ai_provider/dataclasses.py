"""
Normalized response structure returned by AIProvider implementations.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, Optional


@dataclass
class AIResponse:
    """
    Standardized response structure across all providers.
    """
    content: str
    model: str
    provider: str
    latency_ms: int
    success: bool
    metadata: Dict[str, Any] = field(default_factory=dict)
