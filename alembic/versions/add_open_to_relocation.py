"""add open_to_relocation to user_profiles

Revision ID: a7b8c9d0e1f2
Revises: z1a2b3c4d5e6
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'a7b8c9d0e1f2'
down_revision = 'z1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns('user_profiles')]
    if 'open_to_relocation' not in existing:
        op.add_column(
            'user_profiles',
            sa.Column('open_to_relocation', sa.Boolean(), nullable=False, server_default='true'),
        )


def downgrade() -> None:
    op.drop_column('user_profiles', 'open_to_relocation')
