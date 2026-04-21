"""add role_description to user_profiles

Revision ID: a1b2c3d4e5f6
Revises: c65d1e88f464
Create Date: 2026-04-18

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'c65d1e88f464'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('role_description', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('user_profiles', 'role_description')
