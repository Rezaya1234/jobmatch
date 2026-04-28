"""add is_fallback to job_matches

Revision ID: v1w2x3y4z5a6
Revises: u0v1w2x3y4z5
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'v1w2x3y4z5a6'
down_revision = 'u0v1w2x3y4z5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('job_matches', sa.Column('is_fallback', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('job_matches', 'is_fallback')
