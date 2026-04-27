"""add admin dashboard tables

Revision ID: r7s8t9u0v1w2
Revises: q6r7s8t9u0v1
Create Date: 2026-04-27
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = 'r7s8t9u0v1w2'
down_revision = 'q6r7s8t9u0v1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # is_admin on users
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'))

    # AgentLog
    op.create_table(
        'agent_logs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_name', sa.String(100), nullable=False),
        sa.Column('log_level', sa.String(20), nullable=False, server_default='INFO'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('run_id', sa.String(100), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_agent_logs_agent_name', 'agent_logs', ['agent_name'])
    op.create_index('ix_agent_logs_run_id', 'agent_logs', ['run_id'])
    op.create_index('ix_agent_logs_timestamp', 'agent_logs', ['timestamp'])

    # AdminAlert
    op.create_table(
        'admin_alerts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('metric_name', sa.String(100), nullable=True),
        sa.Column('metric_value', sa.Float(), nullable=True),
        sa.Column('threshold_value', sa.Float(), nullable=True),
        sa.Column('baseline_value', sa.Float(), nullable=True),
        sa.Column('baseline_comparison', sa.Text(), nullable=True),
        sa.Column('failure_type', sa.String(20), nullable=True),
        sa.Column('triggered_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('dismissed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('dismissed_by', sa.String(255), nullable=True),
        sa.Column('suppressed_until', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_admin_alerts_triggered_at', 'admin_alerts', ['triggered_at'])

    # TestAgentMetrics
    op.create_table(
        'test_agent_metrics',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('run_date', sa.Date(), nullable=False, unique=True),
        sa.Column('precision_at_50', sa.Float(), nullable=True),
        sa.Column('precision_at_15', sa.Float(), nullable=True),
        sa.Column('recall_at_50', sa.Float(), nullable=True),
        sa.Column('ndcg', sa.Float(), nullable=True),
        sa.Column('coverage', sa.Float(), nullable=True),
        sa.Column('false_positive_rate', sa.Float(), nullable=True),
        sa.Column('sample_size', sa.Integer(), nullable=True),
        sa.Column('confidence_score', sa.Float(), nullable=True),
        sa.Column('drift_flags', sa.JSON(), nullable=True),
        sa.Column('baseline_7day', sa.JSON(), nullable=True),
        sa.Column('label_sources', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_test_agent_metrics_run_date', 'test_agent_metrics', ['run_date'])

    # AlertThresholds
    op.create_table(
        'alert_thresholds',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('metric_name', sa.String(100), nullable=False, unique=True),
        sa.Column('warning_threshold', sa.Float(), nullable=True),
        sa.Column('critical_threshold', sa.Float(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # EvaluatedJob
    op.create_table(
        'evaluated_jobs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('run_date', sa.Date(), nullable=False),
        sa.Column('job_id', UUID(as_uuid=True), sa.ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('label_source', sa.String(20), nullable=False),
        sa.Column('relevance_label', sa.String(20), nullable=False),
        sa.Column('confidence_weight', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('rejection_stage', sa.String(100), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('dimension_scores', sa.JSON(), nullable=True),
        sa.Column('near_miss', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_evaluated_jobs_run_date', 'evaluated_jobs', ['run_date'])


def downgrade() -> None:
    op.drop_index('ix_evaluated_jobs_run_date', 'evaluated_jobs')
    op.drop_table('evaluated_jobs')
    op.drop_table('alert_thresholds')
    op.drop_index('ix_test_agent_metrics_run_date', 'test_agent_metrics')
    op.drop_table('test_agent_metrics')
    op.drop_index('ix_admin_alerts_triggered_at', 'admin_alerts')
    op.drop_table('admin_alerts')
    op.drop_index('ix_agent_logs_timestamp', 'agent_logs')
    op.drop_index('ix_agent_logs_run_id', 'agent_logs')
    op.drop_index('ix_agent_logs_agent_name', 'agent_logs')
    op.drop_table('agent_logs')
    op.drop_column('users', 'is_admin')
