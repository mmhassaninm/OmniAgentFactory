"""
Standardized API error response format.
All endpoints should use these functions to return consistent error responses.
"""

from datetime import datetime
from typing import Any, Dict, Optional
from fastapi import HTTPException


class ErrorCode:
    """Standard error codes for the API."""
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    CONFLICT = "CONFLICT"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    BAD_REQUEST = "BAD_REQUEST"
    TIMEOUT = "TIMEOUT"
    RATE_LIMIT = "RATE_LIMIT"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"


def error_response(
    message: str,
    code: str = ErrorCode.INTERNAL_ERROR,
    status_code: int = 500,
    details: Optional[Dict[str, Any]] = None,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a standardized error response.

    Args:
        message: Human-readable error message
        code: Error code from ErrorCode class
        status_code: HTTP status code
        details: Optional additional error details
        timestamp: ISO8601 timestamp (auto-generated if not provided)

    Returns:
        Standardized error dict ready for JSON response
    """
    return {
        "status": "error",
        "code": code,
        "message": message,
        "details": details or {},
        "timestamp": timestamp or datetime.now().isoformat() + "Z",
    }


def http_exception(
    message: str,
    status_code: int = 500,
    code: str = ErrorCode.INTERNAL_ERROR,
    details: Optional[Dict[str, Any]] = None,
) -> HTTPException:
    """
    Create an HTTPException with standardized format.

    Usage:
        raise http_exception("Invalid request", 400, ErrorCode.BAD_REQUEST, {"field": "name"})
    """
    resp = error_response(message, code, status_code, details)
    return HTTPException(status_code=status_code, detail=resp)


def validation_error(message: str, field: Optional[str] = None) -> HTTPException:
    """Quick helper for validation errors (400)."""
    details = {"field": field} if field else {}
    return http_exception(message, 400, ErrorCode.VALIDATION_ERROR, details)


def not_found_error(resource: str, identifier: str) -> HTTPException:
    """Quick helper for not found errors (404)."""
    return http_exception(
        f"{resource} not found: {identifier}",
        404,
        ErrorCode.NOT_FOUND,
        {"resource": resource, "identifier": identifier},
    )


def unauthorized_error(reason: str = "Authentication required") -> HTTPException:
    """Quick helper for unauthorized errors (401)."""
    return http_exception(reason, 401, ErrorCode.UNAUTHORIZED)


def forbidden_error(reason: str = "Access denied") -> HTTPException:
    """Quick helper for forbidden errors (403)."""
    return http_exception(reason, 403, ErrorCode.FORBIDDEN)


def conflict_error(resource: str, detail: str) -> HTTPException:
    """Quick helper for conflict errors (409)."""
    return http_exception(
        f"{resource} conflict: {detail}",
        409,
        ErrorCode.CONFLICT,
        {"resource": resource},
    )


def service_unavailable_error(service: str) -> HTTPException:
    """Quick helper for service unavailable errors (503)."""
    return http_exception(
        f"Service temporarily unavailable: {service}",
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
        {"service": service},
    )


def timeout_error(operation: str, timeout_seconds: float) -> HTTPException:
    """Quick helper for timeout errors (504)."""
    return http_exception(
        f"{operation} timed out after {timeout_seconds}s",
        504,
        ErrorCode.TIMEOUT,
        {"operation": operation, "timeout_seconds": timeout_seconds},
    )


def external_service_error(service: str, detail: str) -> HTTPException:
    """Quick helper for external service errors (502)."""
    return http_exception(
        f"External service error from {service}: {detail}",
        502,
        ErrorCode.EXTERNAL_SERVICE_ERROR,
        {"service": service, "external_detail": detail},
    )
