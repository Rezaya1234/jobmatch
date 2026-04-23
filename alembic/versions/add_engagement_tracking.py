"""add engagement tracking columns to user_profiles

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa

revision = 'i9j0k1l2m3n4'
down_revision = 'h8i9j0k1l2m3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('last_engaged_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('user_profiles', sa.Column('last_emailed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('user_profiles', 'last_emailed_at')
    op.drop_column('user_profiles', 'last_engaged_at')
