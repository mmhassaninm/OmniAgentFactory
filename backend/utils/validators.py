"""
Comprehensive input validation utilities for API endpoints.
Enforces consistent validation across all routes with clear error messages.
"""

import re
import logging
from typing import Any, Callable, Dict, Optional
from pydantic import BaseModel, Field, validator

logger = logging.getLogger(__name__)


class ValidationError(ValueError):
    """Custom validation error with field information."""

    def __init__(self, field: str, message: str):
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


# ── String Validators ────────────────────────────────────────────────────────

def validate_agent_name(name: str) -> str:
    """Validate agent name (alphanumeric, underscores, hyphens, 1-100 chars)."""
    if not name:
        raise ValidationError("name", "Agent name is required")
    if len(name) > 100:
        raise ValidationError("name", "Agent name must be <= 100 characters")
    if not re.match(r"^[a-zA-Z0-9_\-]+$", name):
        raise ValidationError(
            "name",
            "Agent name must contain only alphanumeric characters, underscores, and hyphens"
        )
    return name


def validate_agent_goal(goal: str) -> str:
    """Validate agent goal (non-empty, <= 500 chars)."""
    if not goal:
        raise ValidationError("goal", "Agent goal is required")
    if len(goal) > 500:
        raise ValidationError("goal", "Agent goal must be <= 500 characters")
    return goal


def validate_email(email: str) -> str:
    """Validate email address format."""
    email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if not re.match(email_pattern, email):
        raise ValidationError("email", "Invalid email address format")
    return email


def validate_url(url: str) -> str:
    """Validate URL format."""
    url_pattern = r"^https?://[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=]+$"
    if not re.match(url_pattern, url):
        raise ValidationError("url", "Invalid URL format (must start with http:// or https://)")
    return url


def validate_api_key(key: str, min_length: int = 20) -> str:
    """Validate API key format (alphanumeric, min length)."""
    if not key:
        raise ValidationError("api_key", "API key is required")
    if len(key) < min_length:
        raise ValidationError("api_key", f"API key must be at least {min_length} characters")
    if not re.match(r"^[a-zA-Z0-9_\-\.]+$", key):
        raise ValidationError("api_key", "API key contains invalid characters")
    return key


# ── Numeric Validators ───────────────────────────────────────────────────────

def validate_positive_int(value: int, field_name: str = "value") -> int:
    """Validate positive integer."""
    if value <= 0:
        raise ValidationError(field_name, "Value must be positive")
    return value


def validate_percentage(value: float, field_name: str = "percentage") -> float:
    """Validate percentage (0-100)."""
    if not (0 <= value <= 100):
        raise ValidationError(field_name, "Percentage must be between 0 and 100")
    return value


def validate_timeout(seconds: float) -> float:
    """Validate timeout value (0.1s - 3600s)."""
    if seconds < 0.1 or seconds > 3600:
        raise ValidationError("timeout", "Timeout must be between 0.1 and 3600 seconds")
    return seconds


# ── List/Array Validators ────────────────────────────────────────────────────

def validate_non_empty_list(items: list, field_name: str = "items") -> list:
    """Validate that list is not empty."""
    if not items or len(items) == 0:
        raise ValidationError(field_name, "List cannot be empty")
    return items


def validate_max_list_length(items: list, max_length: int, field_name: str = "items") -> list:
    """Validate list length doesn't exceed maximum."""
    if len(items) > max_length:
        raise ValidationError(
            field_name,
            f"List cannot contain more than {max_length} items (got {len(items)})"
        )
    return items


# ── Dictionary/JSON Validators ───────────────────────────────────────────────

def validate_message_format(msg: Dict[str, Any]) -> Dict[str, Any]:
    """Validate message has required 'role' and 'content' fields."""
    if not isinstance(msg, dict):
        raise ValidationError("message", "Message must be a JSON object")
    if "role" not in msg:
        raise ValidationError("message", "Message must have 'role' field")
    if "content" not in msg:
        raise ValidationError("message", "Message must have 'content' field")
    if msg["role"] not in ("system", "user", "assistant"):
        raise ValidationError("message", "Role must be 'system', 'user', or 'assistant'")
    return msg


def validate_messages_array(messages: list) -> list:
    """Validate array of messages."""
    if not isinstance(messages, list):
        raise ValidationError("messages", "Messages must be an array")
    validate_non_empty_list(messages, "messages")
    validate_max_list_length(messages, 100, "messages")

    for i, msg in enumerate(messages):
        try:
            validate_message_format(msg)
        except ValidationError as e:
            raise ValidationError(f"messages[{i}]", e.message)

    return messages


# ── Composite Validators ─────────────────────────────────────────────────────

def validate_create_agent_request(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate complete create-agent request."""
    errors: Dict[str, str] = {}

    # Validate name
    if "name" not in data:
        errors["name"] = "Agent name is required"
    else:
        try:
            data["name"] = validate_agent_name(data["name"])
        except ValidationError as e:
            errors["name"] = e.message

    # Validate goal
    if "goal" not in data:
        errors["goal"] = "Agent goal is required"
    else:
        try:
            data["goal"] = validate_agent_goal(data["goal"])
        except ValidationError as e:
            errors["goal"] = e.message

    # Validate template (optional)
    if "template" in data:
        valid_templates = ("general", "researcher", "coder", "analyst")
        if data["template"] not in valid_templates:
            errors["template"] = f"Template must be one of: {', '.join(valid_templates)}"

    if errors:
        raise ValidationError("request", f"Validation failed: {errors}")

    return data


def validate_agent_id(agent_id: str) -> str:
    """Validate agent ID format."""
    if not agent_id:
        raise ValidationError("agent_id", "Agent ID is required")
    if len(agent_id) > 100:
        raise ValidationError("agent_id", "Agent ID must be <= 100 characters")
    # Agent IDs are typically MongoDB ObjectId or UUID-like strings
    if not re.match(r"^[a-zA-Z0-9_\-]+$", agent_id):
        raise ValidationError("agent_id", "Agent ID contains invalid characters")
    return agent_id


# ── Rate Limit & Quota Validators ────────────────────────────────────────────

def validate_rate_limit_config(requests_per_minute: int) -> int:
    """Validate rate limit configuration."""
    if requests_per_minute < 1 or requests_per_minute > 10000:
        raise ValidationError(
            "requests_per_minute",
            "Rate limit must be between 1 and 10000 requests per minute"
        )
    return requests_per_minute


# ── Decorator for automatic validation ───────────────────────────────────────

def validate_input(validator_fn: Callable) -> Callable:
    """
    Decorator for automatic input validation.
    Catches ValidationError and returns standardized error response.
    """
    async def wrapper(*args, **kwargs):
        try:
            return await validator_fn(*args, **kwargs)
        except ValidationError as e:
            from utils.error_response import http_exception, ErrorCode
            raise http_exception(
                e.message,
                400,
                ErrorCode.VALIDATION_ERROR,
                {"field": e.field}
            )
    return wrapper
