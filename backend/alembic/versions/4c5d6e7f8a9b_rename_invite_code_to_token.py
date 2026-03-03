"""rename invite code to token

Revision ID: 4c5d6e7f8a9b
Revises: 3b4c5d6e7f8a
Create Date: 2026-03-03

Renames invites.code → invites.token and updates the associated index and
unique constraint to match the new column name.
"""
from alembic import op

revision = "4c5d6e7f8a9b"
down_revision = "3b4c5d6e7f8a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("invites", "code", new_column_name="token")
    op.execute("ALTER INDEX ix_invites_code RENAME TO ix_invites_token")
    op.execute(
        "ALTER TABLE invites RENAME CONSTRAINT uq_invites_code TO uq_invites_token"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE invites RENAME CONSTRAINT uq_invites_token TO uq_invites_code"
    )
    op.execute("ALTER INDEX ix_invites_token RENAME TO ix_invites_code")
    op.alter_column("invites", "token", new_column_name="code")
