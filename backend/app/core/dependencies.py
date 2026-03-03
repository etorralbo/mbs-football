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

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import verify_jwt_token
from app.db.session import get_db
from app.models.membership import Membership
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


def _resolve_active_membership(
    memberships: list[Membership],
    x_team_id: uuid.UUID | None,
) -> Membership:
    """
    Select the active membership from the user's list.

    - No memberships → 403 (not onboarded).
    - Single membership → auto-selected.
    - Multiple memberships → X-Team-Id header required.
    - X-Team-Id provided but not owned by user → 403 (IDOR prevention:
      never reveal whether the team_id exists at all).
    """
    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active team membership. Complete onboarding first.",
        )

    if x_team_id is not None:
        active = next((m for m in memberships if m.team_id == x_team_id), None)
        if active is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="X-Team-Id does not match any of your team memberships.",
            )
        return active

    if len(memberships) == 1:
        return memberships[0]

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            "Multiple team memberships found. "
            "Send X-Team-Id header to specify which team."
        ),
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    token: str = Depends(get_bearer_token),
    x_team_id: uuid.UUID | None = Header(default=None, alias="X-Team-Id"),
) -> CurrentUser:
    """
    Dependency to get the current authenticated user.

    Security flow:
    1. Verify JWT signature and claims via JWKS (ES256).
    2. Extract supabase_user_id from 'sub' claim.
    3. Load all Memberships for this user — single source of truth for
       team_id and role. UserProfile.team_id / UserProfile.role are
       intentionally NOT used here; they may be stale after team changes.
    4. Resolve the active membership (auto if one, X-Team-Id if many).
    5. Load UserProfile only for the internal user_id (FK in DB relations)
       and the display name.

    IDOR prevention:
    - team_id is NEVER taken from the request body or path params.
    - It always comes from the Membership row validated against the JWT.
    - An X-Team-Id that doesn't belong to the user returns 403, not 404.

    Raises:
        HTTPException 401: token missing or invalid.
        HTTPException 403: no membership (not onboarded), X-Team-Id mismatch,
                          or missing UserProfile.
        HTTPException 400: multiple memberships but no X-Team-Id provided.
    """
    token_payload = verify_jwt_token(token)

    supabase_user_id_str = token_payload.get("sub")
    try:
        supabase_user_id = uuid.UUID(supabase_user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Membership is the authoritative source for team_id and role.
    memberships = list(
        db.execute(
            select(Membership)
            .where(Membership.user_id == supabase_user_id)
            .order_by(Membership.created_at)
        ).scalars()
    )
    active = _resolve_active_membership(memberships, x_team_id)

    # UserProfile provides only the internal PK (used as FK in workout
    # sessions, logs, etc.) and the display name.
    profile = db.execute(
        select(UserProfile).where(UserProfile.supabase_user_id == supabase_user_id)
    ).scalar_one_or_none()

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User profile not found. Please complete onboarding.",
        )

    current_user = CurrentUser(
        user_id=profile.id,
        supabase_user_id=supabase_user_id,
        team_id=active.team_id,   # from Membership — never from UserProfile
        role=active.role,          # from Membership — never from UserProfile
        name=profile.name,
    )

    # Populate request state so RequestLoggingMiddleware can include auth
    # context in the structured log line without a second DB lookup.
    request.state.user_id = current_user.user_id
    request.state.team_id = current_user.team_id
    request.state.role = current_user.role

    return current_user


def get_auth_user_id(
    token: str = Depends(get_bearer_token),
) -> uuid.UUID:
    """
    Lightweight auth dependency: verify JWT and return the Supabase user ID.

    Unlike get_current_user(), this does NOT require a UserProfile to exist.
    Use for endpoints reachable before onboarding completes
    (GET /v1/me, POST /v1/teams, POST /v1/team-invites, POST /v1/team-invites/{token}/accept).

    Returns:
        uuid.UUID: The Supabase user ID ('sub' claim).

    Raises:
        HTTPException: 401 if token is missing or invalid.
    """
    token_payload = verify_jwt_token(token)
    supabase_user_id_str = token_payload.get("sub")
    try:
        return uuid.UUID(supabase_user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )


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
