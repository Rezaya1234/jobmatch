"""add matching v2 — weighted scoring, cold start, signals, shown memory

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSON, UUID as PG_UUID

revision = 'j0k1l2m3n4o5'
down_revision = 'i9j0k1l2m3n4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # user_profiles — new hard constraints + cold start + weight management
    op.add_column('user_profiles', sa.Column('visa_sponsorship_required', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('user_profiles', sa.Column('excluded_companies', ARRAY(sa.String()), nullable=False, server_default='{}'))
    op.add_column('user_profiles', sa.Column('years_experience', sa.Integer(), nullable=True))
    op.add_column('user_profiles', sa.Column('role_type', sa.String(20), nullable=True))
    op.add_column('user_profiles', sa.Column('cold_start', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('user_profiles', sa.Column('feedback_signal_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('user_profiles', sa.Column('learned_weights', JSON(), nullable=True))

    # job_matches — pre-LLM scoring, multi-head scoring, shown memory
    op.add_column('job_matches', sa.Column('heuristic_score', sa.Float(), nullable=True))
    op.add_column('job_matches', sa.Column('embedding_score', sa.Float(), nullable=True))
    op.add_column('job_matches', sa.Column('dimension_scores', JSON(), nullable=True))
    op.add_column('job_matches', sa.Column('weights_used', JSON(), nullable=True))
    op.add_column('job_matches', sa.Column('weighted_score', sa.Float(), nullable=True))
    op.add_column('job_matches', sa.Column('normalized_score', sa.Float(), nullable=True))
    op.add_column('job_matches', sa.Column('low_confidence', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('job_matches', sa.Column('shown_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('job_matches', sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('job_matches', sa.Column('recap_sent_at', sa.DateTime(timezone=True), nullable=True))

    # feedback_signals — click, applied, interview
    op.create_table(
        'feedback_signals',
        sa.Column('id', PG_UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', PG_UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('job_id', PG_UUID(as_uuid=True), sa.ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('signal_type', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_feedback_signals_user_id', 'feedback_signals', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_feedback_signals_user_id', 'feedback_signals')
    op.drop_table('feedback_signals')

    for col in ('recap_sent_at', 'delivered_at', 'shown_at', 'low_confidence',
                'normalized_score', 'weighted_score', 'weights_used',
                'dimension_scores', 'embedding_score', 'heuristic_score'):
        op.drop_column('job_matches', col)

    for col in ('learned_weights', 'feedback_signal_count', 'cold_start',
                'role_type', 'years_experience', 'excluded_companies', 'visa_sponsorship_required'):
        op.drop_column('user_profiles', col)
