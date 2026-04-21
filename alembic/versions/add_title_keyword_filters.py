"""add title_include and title_exclude to user_profiles

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'g7h8i9j0k1l2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column(
        'title_include', postgresql.ARRAY(sa.String()), nullable=False,
        server_default='{}',
    ))
    op.add_column('user_profiles', sa.Column(
        'title_exclude', postgresql.ARRAY(sa.String()), nullable=False,
        server_default='{}',
    ))


def downgrade() -> None:
    op.drop_column('user_profiles', 'title_exclude')
    op.drop_column('user_profiles', 'title_include')
