"""recreate funnel_event enum with lowercase values

Revision ID: a8b9c0d1e2f3
Revises: f6a7b8c9d0e1
Create Date: 2026-02-28 12:00:00.000000

Why: all previous migrations used UPPERCASE enum values
(e.g. 'TEMPLATE_CREATED_AI') but FunnelEvent Python enum uses lowercase
values (e.g. "template_created_ai").  PostgreSQL enum comparisons are
case-sensitive, so every db.commit() that included an event insert was
failing with:

    ERROR: invalid input value for enum funnel_event: "template_created_ai"

This caused the entire transaction to roll back, making the save endpoint
return 500 even though the LLM draft succeeded.

Fix: recreate the enum with lowercase values matching the Python source.
Existing rows (if any) are cast via LOWER(); the product_events table is
expected to be empty since inserts were always failing.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create replacement enum with lowercase values (matching FunnelEvent.value).
    op.execute("""
        CREATE TYPE funnel_event_lc AS ENUM (
            'team_created',
            'invite_created',
            'invite_accepted',
            'template_created_ai',
            'assignment_created',
            'session_first_log_added',
            'session_completed'
        )
    """)

    # 2. Migrate the column; LOWER() handles the UPPERCASE → lowercase conversion
    #    for any rows that exist (table is expected empty due to prior bug).
    op.execute("""
        ALTER TABLE product_events
        ALTER COLUMN event_name TYPE funnel_event_lc
        USING LOWER(event_name::text)::funnel_event_lc
    """)

    # 3. Drop the old uppercase enum.
    op.execute("DROP TYPE funnel_event")

    # 4. Rename to the canonical name so all existing ORM code continues to work.
    op.execute("ALTER TYPE funnel_event_lc RENAME TO funnel_event")


def downgrade() -> None:
    # Reverse: recreate uppercase enum and cast back.
    op.execute("""
        CREATE TYPE funnel_event_uc AS ENUM (
            'TEAM_CREATED',
            'INVITE_CREATED',
            'INVITE_ACCEPTED',
            'TEMPLATE_CREATED_AI',
            'ASSIGNMENT_CREATED',
            'SESSION_FIRST_LOG_ADDED',
            'SESSION_COMPLETED'
        )
    """)
    op.execute("""
        ALTER TABLE product_events
        ALTER COLUMN event_name TYPE funnel_event_uc
        USING UPPER(event_name::text)::funnel_event_uc
    """)
    op.execute("DROP TYPE funnel_event")
    op.execute("ALTER TYPE funnel_event_uc RENAME TO funnel_event")
