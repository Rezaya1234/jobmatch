"""add preferred_companies to user_profiles

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-19

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column(
        'preferred_companies', ARRAY(sa.String()), nullable=False, server_default='{}'
    ))


def downgrade() -> None:
    op.drop_column('user_profiles', 'preferred_companies')
