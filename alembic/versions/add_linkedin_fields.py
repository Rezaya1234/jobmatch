"""add linkedin_url, avatar_url, display_name to user_profiles

Revision ID: m3n4o5p6q7r8
Revises: g7h8i9j0k1l2
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'm3n4o5p6q7r8'
down_revision = 'k1l2m3n4o5p6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('linkedin_url', sa.String(500), nullable=True))
    op.add_column('user_profiles', sa.Column('avatar_url', sa.String(1000), nullable=True))
    op.add_column('user_profiles', sa.Column('display_name', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('user_profiles', 'display_name')
    op.drop_column('user_profiles', 'avatar_url')
    op.drop_column('user_profiles', 'linkedin_url')
