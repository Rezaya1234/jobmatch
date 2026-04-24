"""add company_insights table

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

revision = 'n4o5p6q7r8s9'
down_revision = 'm3n4o5p6q7r8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'company_insights',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('slug', sa.String(255), nullable=False),
        sa.Column('company_name', sa.String(255), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('hiring_outlook', sa.String(20), nullable=True),
        sa.Column('hiring_outlook_reason', sa.Text(), nullable=True),
        sa.Column('interview_difficulty', sa.Integer(), nullable=True),
        sa.Column('response_rate', sa.String(20), nullable=True),
        sa.Column('time_to_hire', sa.String(50), nullable=True),
        sa.Column('hiring_trend', sa.String(10), nullable=True),
        sa.Column('overall_rating', sa.Float(), nullable=True),
        sa.Column('rating_source', sa.String(100), nullable=True),
        sa.Column('pros', JSON, nullable=True),
        sa.Column('cons', JSON, nullable=True),
        sa.Column('signals', JSON, nullable=True),
        sa.Column('hiring_areas', JSON, nullable=True),
        sa.Column('risks', JSON, nullable=True),
        sa.Column('active_job_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('website', sa.String(500), nullable=True),
        sa.Column('hq_location', sa.String(255), nullable=True),
        sa.Column('company_size', sa.String(50), nullable=True),
        sa.Column('company_type', sa.String(50), nullable=True),
        sa.Column('sector', sa.String(255), nullable=True),
        sa.Column('generated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_company_insights_slug', 'company_insights', ['slug'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_company_insights_slug', 'company_insights')
    op.drop_table('company_insights')
