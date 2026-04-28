"""add notification_prefs to users

Revision ID: z5a6b7c8d9e0
Revises: y4z5a6b7c8d9
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'z5a6b7c8d9e0'
down_revision = 'y4z5a6b7c8d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns('users')]
    if 'notification_prefs' not in existing:
        op.add_column('users', sa.Column(
            'notification_prefs', postgresql.JSON(astext_type=sa.Text()), nullable=True,
        ))


def downgrade() -> None:
    op.drop_column('users', 'notification_prefs')
