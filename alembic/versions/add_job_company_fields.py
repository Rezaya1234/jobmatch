"""add source_company and is_active to jobs

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-19

"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('source_company', sa.String(100), nullable=True))
    op.add_column('jobs', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'))
    op.create_index('ix_jobs_source_company', 'jobs', ['source_company'])
    op.create_index('ix_jobs_is_active', 'jobs', ['is_active'])


def downgrade() -> None:
    op.drop_index('ix_jobs_is_active', table_name='jobs')
    op.drop_index('ix_jobs_source_company', table_name='jobs')
    op.drop_column('jobs', 'is_active')
    op.drop_column('jobs', 'source_company')
