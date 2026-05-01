"""add feedback_events and job_user_state tables

Revision ID: b8c9d0e1f2a3
Revises: 7d2c5b8e1a3f
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'b8c9d0e1f2a3'
down_revision = '7d2c5b8e1a3f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'feedback_events' not in existing_tables:
        op.create_table(
            'feedback_events',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('feedback_event_id', UUID(as_uuid=True), unique=True, nullable=False),
            sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('job_id', UUID(as_uuid=True), sa.ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False),
            sa.Column('signal_type', sa.String(30), nullable=False),
            sa.Column('signal_value', sa.Integer(), nullable=False),
            sa.Column('interaction_source', sa.String(30), nullable=False, server_default='dashboard'),
            sa.Column('commentary', sa.Text(), nullable=True),
            sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index('ix_feedback_events_user_id', 'feedback_events', ['user_id'])
        op.create_index('ix_feedback_events_timestamp', 'feedback_events', ['timestamp'])

    if 'job_user_state' not in existing_tables:
        op.create_table(
            'job_user_state',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('job_id', UUID(as_uuid=True), sa.ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False),
            sa.Column('current_status', sa.String(30), nullable=False),
            sa.Column('shown_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('last_interaction_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('interaction_type', sa.String(30), nullable=False),
            sa.UniqueConstraint('user_id', 'job_id', name='uq_job_user_state'),
        )
        op.create_index('ix_job_user_state_user_id', 'job_user_state', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_job_user_state_user_id', 'job_user_state')
    op.drop_table('job_user_state')
    op.drop_index('ix_feedback_events_timestamp', 'feedback_events')
    op.drop_index('ix_feedback_events_user_id', 'feedback_events')
    op.drop_table('feedback_events')
