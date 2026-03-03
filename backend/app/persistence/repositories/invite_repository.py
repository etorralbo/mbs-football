"""Repository for Invite aggregate."""
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.invite import Invite
from app.models.user_profile import Role


class AbstractInviteRepository(ABC):

    @abstractmethod
    def create(
        self,
        team_id: uuid.UUID,
        token: str,
        role: Role,
        created_by_user_id: uuid.UUID,
        expires_at: Optional[datetime] = None,
    ) -> Invite:
        """Persist a new invite and return it (flushed, not committed)."""
        ...

    @abstractmethod
    def get_by_token(self, token: str) -> Optional[Invite]:
        """Return the invite with the given token, or None."""
        ...

    @abstractmethod
    def mark_used(self, invite: Invite) -> Invite:
        """Set used_at to now (flushed, not committed)."""
        ...


class SqlAlchemyInviteRepository(AbstractInviteRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

    def create(
        self,
        team_id: uuid.UUID,
        token: str,
        role: Role,
        created_by_user_id: uuid.UUID,
        expires_at: Optional[datetime] = None,
    ) -> Invite:
        invite = Invite(
            id=uuid.uuid4(),
            team_id=team_id,
            token=token,
            role=role,
            created_by_user_id=created_by_user_id,
            expires_at=expires_at,
        )
        self._db.add(invite)
        self._db.flush()
        return invite

    def get_by_token(self, token: str) -> Optional[Invite]:
        stmt = select(Invite).where(Invite.token == token)
        return self._db.execute(stmt).scalar_one_or_none()

    def mark_used(self, invite: Invite) -> Invite:
        invite.used_at = datetime.now(timezone.utc)
        self._db.flush()
        return invite
