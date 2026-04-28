"""add orchestration_log table and match_run_id to job_matches

Revision ID: u0v1w2x3y4z5
Revises: t9u0v1w2x3y4
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'u0v1w2x3y4z5'
down_revision = 't9u0v1w2x3y4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('job_matches', sa.Column('match_run_id', sa.String(36), nullable=True))
    op.create_index('ix_job_matches_match_run_id', 'job_matches', ['match_run_id'])

    op.create_table(
        'orchestration_logs',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('match_run_id', sa.String(36), nullable=False, unique=True),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('run_date', sa.Date(), nullable=False),
        sa.Column('jobs_evaluated', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('jobs_delivered', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('llm_calls_made', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('llm_cost_usd', sa.Float(), nullable=False, server_default='0'),
        sa.Column('fallback_triggered', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('fallback_steps_used', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_orchestration_logs_match_run_id', 'orchestration_logs', ['match_run_id'])
    op.create_index('ix_orchestration_logs_user_id', 'orchestration_logs', ['user_id'])
    op.create_index('ix_orchestration_logs_run_date', 'orchestration_logs', ['run_date'])


def downgrade():
    op.drop_index('ix_orchestration_logs_run_date', 'orchestration_logs')
    op.drop_index('ix_orchestration_logs_user_id', 'orchestration_logs')
    op.drop_index('ix_orchestration_logs_match_run_id', 'orchestration_logs')
    op.drop_table('orchestration_logs')
    op.drop_index('ix_job_matches_match_run_id', 'job_matches')
    op.drop_column('job_matches', 'match_run_id')
