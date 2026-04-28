"""add visa_types to user_profiles

Revision ID: x3y4z5a6b7c8
Revises: w2x3y4z5a6b7
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'x3y4z5a6b7c8'
down_revision = 'w2x3y4z5a6b7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns('user_profiles')]
    if 'visa_types' not in existing:
        op.add_column('user_profiles', sa.Column(
            'visa_types', postgresql.JSON(astext_type=sa.Text()), nullable=True,
        ))


def downgrade() -> None:
    op.drop_column('user_profiles', 'visa_types')
