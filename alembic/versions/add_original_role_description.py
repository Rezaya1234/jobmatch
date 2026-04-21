"""add original_role_description to user_profiles

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-19

"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('original_role_description', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('user_profiles', 'original_role_description')
