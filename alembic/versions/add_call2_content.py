"""add call2_content to job_matches

Revision ID: s8t9u0v1w2x3
Revises: r7s8t9u0v1w2
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = 's8t9u0v1w2x3'
down_revision = 'r7s8t9u0v1w2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('job_matches', sa.Column('call2_content', sa.JSON(), nullable=True))
    op.add_column('job_matches', sa.Column('call2_generated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('job_matches', 'call2_generated_at')
    op.drop_column('job_matches', 'call2_content')
