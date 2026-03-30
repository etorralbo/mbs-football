"""SQLAlchemy concrete implementation of AbstractUnitOfWork."""
from sqlalchemy.orm import Session

from app.domain.unit_of_work import AbstractUnitOfWork


class SqlAlchemyUnitOfWork(AbstractUnitOfWork):
    def __init__(self, db: Session) -> None:
        self._db = db

    def commit(self) -> None:
        self._db.commit()

    def rollback(self) -> None:
        self._db.rollback()
