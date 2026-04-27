"""add source_trust_scores table

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-04-26

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = 'p5q6r7s8t9u0'
down_revision = 'n4o5p6q7r8s9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'source_trust_scores',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('source_slug', sa.String(100), nullable=False, unique=True),
        sa.Column('jobs_returned_last', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('jobs_returned_prev', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('parse_success_count', sa.Float(), nullable=False, server_default='0'),
        sa.Column('parse_fail_count', sa.Float(), nullable=False, server_default='0'),
        sa.Column('dead_link_count', sa.Float(), nullable=False, server_default='0'),
        sa.Column('rolling_trust_score', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('last_scrape_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_source_trust_scores_source_slug', 'source_trust_scores', ['source_slug'])


def downgrade() -> None:
    op.drop_index('ix_source_trust_scores_source_slug', 'source_trust_scores')
    op.drop_table('source_trust_scores')
