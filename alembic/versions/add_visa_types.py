"""add visa_types to user_profiles

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'w2x3y4z5a6b7'
down_revision = 'v1w2x3y4z5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column(
        'visa_types', postgresql.JSON(astext_type=sa.Text()), nullable=True,
    ))


def downgrade() -> None:
    op.drop_column('user_profiles', 'visa_types')
