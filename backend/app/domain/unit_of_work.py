"""Minimal Unit-of-Work abstraction.

Only the batch assignment workflow uses this explicitly; single-operation use
cases continue to rely on the repository committing (existing pattern) so that
no broad refactoring is needed.

Design principles:
- Keep it small: just commit() and rollback().
- Domain layer owns the interface; persistence layer owns the implementation.
- The use case calls commit() on success and rollback() on any exception,
  making transaction ownership unambiguous.
"""
from abc import ABC, abstractmethod


class AbstractUnitOfWork(ABC):
    @abstractmethod
    def commit(self) -> None:
        """Commit the current transaction."""
        ...

    @abstractmethod
    def rollback(self) -> None:
        """Roll back the current transaction, discarding any pending changes."""
        ...
