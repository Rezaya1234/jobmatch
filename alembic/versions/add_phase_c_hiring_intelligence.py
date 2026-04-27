"""add phase C hiring intelligence tables

Revision ID: q6r7s8t9u0v1
Revises: p5q6r7s8t9u0
Create Date: 2026-04-27
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = 'q6r7s8t9u0v1'
down_revision = 'p5q6r7s8t9u0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New fields on jobs table
    op.add_column('jobs', sa.Column('description_hash', sa.String(32), nullable=True))
    op.add_column('jobs', sa.Column('description_version', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('jobs', sa.Column('description_last_changed_at', sa.DateTime(timezone=True), nullable=True))

    # CompanyHiringSnapshot — one row per source per day
    op.create_table(
        'company_hiring_snapshots',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('source_slug', sa.String(100), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('active_job_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('new_jobs_since_yesterday', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('removed_jobs_since_yesterday', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('jobs_by_department', sa.JSON(), nullable=True),
        sa.Column('jobs_by_seniority', sa.JSON(), nullable=True),
        sa.Column('jobs_by_location', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('source_slug', 'snapshot_date', name='uq_company_snapshot_date'),
    )
    op.create_index('ix_company_hiring_snapshots_source_slug', 'company_hiring_snapshots', ['source_slug'])

    # JobDescriptionHistory — append-only, new row only on content change
    op.create_table(
        'job_description_history',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('job_id', UUID(as_uuid=True), sa.ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('description_text', sa.Text(), nullable=False),
        sa.Column('description_hash', sa.String(32), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('valid_from', sa.DateTime(timezone=True), nullable=False),
        sa.Column('valid_to', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_job_description_history_job_id', 'job_description_history', ['job_id'])


def downgrade() -> None:
    op.drop_index('ix_job_description_history_job_id', 'job_description_history')
    op.drop_table('job_description_history')

    op.drop_index('ix_company_hiring_snapshots_source_slug', 'company_hiring_snapshots')
    op.drop_table('company_hiring_snapshots')

    op.drop_column('jobs', 'description_last_changed_at')
    op.drop_column('jobs', 'description_version')
    op.drop_column('jobs', 'description_hash')
