"""
Security module for JWT verification using Supabase JWKS.

Provides secure JWT token validation with JWKS caching and strict claim verification.
"""
from functools import lru_cache
from typing import Dict, Any
import jwt
from jwt import PyJWKClient
from fastapi import HTTPException, status

from app.core.config import get_settings

settings = get_settings()


@lru_cache(maxsize=1)
def get_jwks_client() -> PyJWKClient:
    """
    Get cached JWKS client.

    Uses lru_cache to ensure only one PyJWKClient instance is created.
    PyJWKClient internally caches keys and handles TTL.

    Returns:
        PyJWKClient: Cached JWKS client instance
    """
    return PyJWKClient(
        settings.SUPABASE_JWKS_URL,
        cache_keys=True,
        max_cached_keys=16,
    )


def verify_jwt_token(token: str) -> Dict[str, Any]:
    """
    Verify a Supabase JWT token using JWKS.

    Security requirements:
    - Validates JWT signature using JWKS
    - Verifies token expiration (exp claim)
    - Verifies issuer (iss claim)
    - Verifies audience (aud claim)
    - Does NOT accept unsigned tokens (algorithms must include RS256)

    Args:
        token: The JWT token string (without "Bearer " prefix)

    Returns:
        Dict containing the decoded token payload with claims

    Raises:
        HTTPException: 401 if token is invalid, expired, or has invalid claims
    """
    try:
        # Get JWKS client (cached) and signing key
        jwks_client = get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token).key

        # Decode and verify the token with strict validation
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["ES256"],
            audience=settings.SUPABASE_JWT_AUD,
            issuer=settings.SUPABASE_JWT_ISSUER,
            options={
                "require": ["exp", "iat", "sub"],
            },
        )

        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token audience",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidIssuerError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token issuer",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.DecodeError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        # Catch-all for any other JWT errors
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
