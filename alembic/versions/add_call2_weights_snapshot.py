"""add call2_weights_snapshot to job_matches

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'w2x3y4z5a6b7'
down_revision = 'v1w2x3y4z5a6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('job_matches', sa.Column('call2_weights_snapshot', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('job_matches', 'call2_weights_snapshot')
