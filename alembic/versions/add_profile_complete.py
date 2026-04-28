"""add profile_complete to user_profiles

Revision ID: y4z5a6b7c8d9
Revises: x3y4z5a6b7c8
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa

revision = 'y4z5a6b7c8d9'
down_revision = 'x3y4z5a6b7c8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns('user_profiles')]
    if 'profile_complete' not in existing:
        op.add_column(
            'user_profiles',
            sa.Column('profile_complete', sa.Boolean(), nullable=False, server_default='false'),
        )


def downgrade() -> None:
    op.drop_column('user_profiles', 'profile_complete')
