"""add indexes for common query patterns

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-19

"""
from alembic import op

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('ix_job_matches_user_id', 'job_matches', ['user_id'])
    op.create_index('ix_job_matches_job_id', 'job_matches', ['job_id'])
    op.create_index('ix_job_matches_user_score', 'job_matches', ['user_id', 'score'])
    op.create_index('ix_job_matches_filter_score', 'job_matches', ['user_id', 'passed_hard_filter', 'score'])
    op.create_index('ix_feedback_user_id', 'feedback', ['user_id'])
    op.create_index('ix_jobs_created_at', 'jobs', ['created_at'])
    op.create_index('ix_user_profiles_user_id', 'user_profiles', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_job_matches_user_id', 'job_matches')
    op.drop_index('ix_job_matches_job_id', 'job_matches')
    op.drop_index('ix_job_matches_user_score', 'job_matches')
    op.drop_index('ix_job_matches_filter_score', 'job_matches')
    op.drop_index('ix_feedback_user_id', 'feedback')
    op.drop_index('ix_jobs_created_at', 'jobs')
    op.drop_index('ix_user_profiles_user_id', 'user_profiles')
