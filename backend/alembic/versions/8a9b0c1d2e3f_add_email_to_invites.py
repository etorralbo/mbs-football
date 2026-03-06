"""add email to invites

Revision ID: 8a9b0c1d2e3f
Revises: 7f8a9b0c1d2e
Create Date: 2026-03-06 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8a9b0c1d2e3f"
down_revision: Union[str, None] = "7f8a9b0c1d2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invites", sa.Column("email", sa.String(255), nullable=True))
    op.create_index("ix_invites_email", "invites", ["email"])


def downgrade() -> None:
    op.drop_index("ix_invites_email", table_name="invites")
    op.drop_column("invites", "email")
