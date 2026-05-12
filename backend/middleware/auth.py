"""
JWT-based API authentication middleware.
Provides login, token refresh, and token validation for all /api/ endpoints.

Endpoints:
  POST /api/auth/login — returns JWT token
  POST /api/auth/refresh — refresh token
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# JWT configuration
SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "omnibot-dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# Try to import JWT libraries — degrade gracefully if not installed
try:
    from jose import jwt, JWTError
    from passlib.context import CryptContext

    JWT_AVAILABLE = True
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except ImportError:
    JWT_AVAILABLE = False
    jwt = None  # type: ignore
    JWTError = Exception  # type: ignore


def create_access_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    if not JWT_AVAILABLE:
        return "mock-token-python-jose-not-installed"
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def verify_token(token: str) -> dict[str, Any]:
    """Verify a JWT token and return the payload."""
    if not JWT_AVAILABLE:
        return {"sub": "anonymous", "role": "admin"}
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        logger.warning("[Auth] Token verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user(request: Request) -> dict[str, Any]:
    """
    Dependency: extract and validate the current user from the Authorization header.
    If AUTH_SECRET_KEY is not set, authentication is bypassed (dev mode).
    """
    # Bypass if no auth key configured
    if not os.getenv("AUTH_SECRET_KEY"):
        return {"sub": "anonymous", "role": "admin", "bypass": True}

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header[7:]
    return await verify_token(token)


@router.post("/login")
async def login(body: dict[str, str]) -> dict[str, Any]:
    """
    Authenticate a user and return a JWT token.
    Body: { username, password }
    For now, accepts any non-empty credentials in dev mode.
    """
    username = body.get("username", "")
    password = body.get("password", "")

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")

    # In production, this would validate against a user database
    # For now, allow all requests in dev mode
    token = create_access_token({"sub": username, "role": "admin"})
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


@router.post("/refresh")
async def refresh_token(request: Request) -> dict[str, Any]:
    """
    Refresh an existing JWT token.
    Requires valid Bearer token in Authorization header.
    """
    user = await get_current_user(request)
    token = create_access_token({"sub": user.get("sub", "anonymous"), "role": user.get("role", "user")})
    return {"access_token": token, "token_type": "bearer"}