"""exercises: add owner_type, is_editable; make coach_id nullable for COMPANY exercises

Revision ID: b2c3d4e5f6a7
Revises: a7b8c9d0e1f2
Create Date: 2026-03-03 09:00:00.000000

Backward-compatible schema evolution.

Changes:
  1. Create PostgreSQL enum type `exercise_owner_type` ('COMPANY', 'COACH').
  2. Add `owner_type` column — NOT NULL, default 'COACH'.
  3. Add `is_editable` column — NOT NULL boolean, default true.
  4. Make `coach_id` nullable (COMPANY exercises have no owning coach).
  5. Add partial unique index on (name) WHERE owner_type='COMPANY' so
     company exercise names are also globally unique.

All existing rows receive owner_type='COACH', is_editable=true via the
column server defaults — no explicit backfill SQL needed.
coach_id remains non-null for all existing rows; the FK is untouched.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ENUM_NAME = 'exercise_owner_type'
_ENUM_VALUES = ('COMPANY', 'COACH')


def upgrade() -> None:
    # 1. Create the PostgreSQL enum type.
    owner_type_enum = sa.Enum(*_ENUM_VALUES, name=_ENUM_NAME)
    owner_type_enum.create(op.get_bind(), checkfirst=True)

    # 2. Add owner_type column — NOT NULL with server default 'COACH'.
    #    Existing rows are filled immediately by the server default.
    op.add_column(
        'exercises',
        sa.Column(
            'owner_type',
            sa.Enum(*_ENUM_VALUES, name=_ENUM_NAME, create_type=False),
            nullable=False,
            server_default='COACH',
        ),
    )

    # 3. Add is_editable column — NOT NULL boolean, server default true.
    op.add_column(
        'exercises',
        sa.Column(
            'is_editable',
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )

    # 4. Remove NOT NULL constraint on coach_id so COMPANY exercises can
    #    be inserted with coach_id = NULL.
    #    The FK constraint remains; NULL simply means "no owning coach".
    op.alter_column('exercises', 'coach_id', nullable=True)

    # 5. Partial unique index: COMPANY exercise names must be globally unique.
    op.create_index(
        'uix_company_exercise_name',
        'exercises',
        ['name'],
        unique=True,
        postgresql_where=sa.text("owner_type = 'COMPANY'"),
    )


def downgrade() -> None:
    # Reverse in opposite order.
    op.drop_index('uix_company_exercise_name', table_name='exercises')

    # Restore NOT NULL on coach_id.
    # Any COMPANY exercises (coach_id IS NULL) must be removed first or the
    # ALTER will fail — in practice, remove them before downgrading.
    op.execute("DELETE FROM exercises WHERE owner_type = 'COMPANY'")
    op.alter_column('exercises', 'coach_id', nullable=False)

    op.drop_column('exercises', 'is_editable')
    op.drop_column('exercises', 'owner_type')

    sa.Enum(name=_ENUM_NAME).drop(op.get_bind(), checkfirst=True)
