"""add goals_text to user_profiles

Revision ID: a6b7c8d9e0f1
Revises: y4z5a6b7c8d9
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa

revision = 'a6b7c8d9e0f1'
down_revision = 'z5a6b7c8d9e0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns('user_profiles')]
    if 'goals_text' not in existing:
        op.add_column(
            'user_profiles',
            sa.Column('goals_text', sa.Text(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column('user_profiles', 'goals_text')
