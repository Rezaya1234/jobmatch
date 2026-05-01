"""add role column to users, drop is_admin

Revision ID: 3f8e9a1b2c4d
Revises: a7b8c9d0e1f2
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = '3f8e9a1b2c4d'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns('users')]

    if 'role' not in existing:
        op.add_column('users', sa.Column('role', sa.String(20), nullable=False, server_default="'user'"))
        if 'is_admin' in existing:
            op.execute("UPDATE users SET role = 'admin' WHERE is_admin = true")

    # Ensure founding admin account
    op.execute("UPDATE users SET role = 'admin' WHERE email = 'reza.rah@gmail.com'")

    if 'is_admin' in existing:
        op.drop_column('users', 'is_admin')


def downgrade() -> None:
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'))
    op.execute("UPDATE users SET is_admin = true WHERE role = 'admin'")
    op.drop_column('users', 'role')
