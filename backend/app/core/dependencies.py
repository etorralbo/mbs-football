"""
Authentication and authorization dependencies.

Provides FastAPI dependencies for:
- Extracting and verifying JWT tokens
- Loading current user from database
- Role-based access control
"""
import uuid
from dataclasses import dataclass
from typing import Annotated, Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import verify_jwt_token
from app.db.session import get_db
from app.models.user_profile import Role, UserProfile


# HTTP Bearer token scheme with auto_error=False
bearer_scheme = HTTPBearer(auto_error=False)


def get_bearer_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """
    Extract Bearer token from Authorization header.

    Args:
        credentials: HTTP Bearer credentials (optional if not provided)

    Returns:
        str: The JWT token string

    Raises:
        HTTPException: 401 if credentials are missing
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


@dataclass
class CurrentUser:
    """
    Current authenticated user information.

    Contains the minimal set of user data needed for authorization
    throughout the application.
    """
    user_id: uuid.UUID
    supabase_user_id: uuid.UUID
    team_id: uuid.UUID
    role: Role
    name: str


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    token: str = Depends(get_bearer_token),
) -> CurrentUser:
    """
    Dependency to get the current authenticated user.

    Security flow:
    1. Extract JWT token from Authorization header (via get_bearer_token)
    2. Verify token signature and claims using JWKS
    3. Extract supabase_user_id from token's 'sub' claim
    4. Look up UserProfile by supabase_user_id
    5. Return CurrentUser if found, otherwise 403 (not onboarded)

    Args:
        db: Database session
        token: JWT token string from Authorization header

    Returns:
        CurrentUser: The authenticated user's profile data

    Raises:
        HTTPException: 401 if token is invalid or missing
        HTTPException: 403 if user is not onboarded (no UserProfile)
    """
    # Verify the JWT token (raises 401 if invalid)
    token_payload = verify_jwt_token(token)

    # Extract Supabase user ID from 'sub' claim
    supabase_user_id_str = token_payload.get("sub")
    try:
        supabase_user_id = uuid.UUID(supabase_user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Look up user profile
    stmt = select(UserProfile).where(UserProfile.supabase_user_id == supabase_user_id)
    user_profile = db.execute(stmt).scalar_one_or_none()

    if not user_profile:
        # User has valid token but no profile in our system (not onboarded)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User not onboarded. Please complete registration.",
        )

    current_user = CurrentUser(
        user_id=user_profile.id,
        supabase_user_id=user_profile.supabase_user_id,
        team_id=user_profile.team_id,
        role=user_profile.role,
        name=user_profile.name,
    )

    # Populate request state so RequestLoggingMiddleware can include auth
    # context in the structured log line without a second DB lookup.
    request.state.user_id = current_user.user_id
    request.state.team_id = current_user.team_id
    request.state.role = current_user.role

    return current_user


def require_role(*allowed_roles: Role) -> Callable[[CurrentUser], CurrentUser]:
    """
    Dependency factory for role-based access control.

    Creates a dependency that checks if the current user has one of the allowed roles.

    Usage:
        @app.get("/coach-only")
        def coach_endpoint(user: Annotated[CurrentUser, Depends(require_role(Role.COACH))]):
            ...

    Args:
        *allowed_roles: One or more Role enum values that are allowed

    Returns:
        A dependency function that validates user role

    Raises:
        HTTPException: 403 if user doesn't have required role
    """
    def role_checker(current_user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(r.value for r in allowed_roles)}",
            )
        return current_user

    return role_checker


# Convenience dependencies for common role checks
require_coach = require_role(Role.COACH)
require_athlete = require_role(Role.ATHLETE)
require_any_role = require_role(Role.COACH, Role.ATHLETE)
