"""add profile_version, weights_version, call2_profile_version

Revision ID: t9u0v1w2x3y4
Revises: s8t9u0v1w2x3
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = 't9u0v1w2x3y4'
down_revision = 's8t9u0v1w2x3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_profiles', sa.Column('profile_version', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('user_profiles', sa.Column('weights_version', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('job_matches', sa.Column('call2_profile_version', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('job_matches', 'call2_profile_version')
    op.drop_column('user_profiles', 'weights_version')
    op.drop_column('user_profiles', 'profile_version')
