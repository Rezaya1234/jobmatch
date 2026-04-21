"""deactivate old job board jobs (remoteok, arbeitnow, jobicy, indeed)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-19

"""
from alembic import op

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE jobs
        SET is_active = false
        WHERE source_company IS NULL
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE jobs
        SET is_active = true
        WHERE source_company IS NULL
    """)
