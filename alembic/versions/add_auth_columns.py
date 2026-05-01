"""add password auth columns to users

Revision ID: 7d2c5b8e1a3f
Revises: 3f8e9a1b2c4d
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = '7d2c5b8e1a3f'
down_revision = '3f8e9a1b2c4d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns('users')]

    if 'password_hash' not in existing:
        op.add_column('users', sa.Column('password_hash', sa.String(255), nullable=True))
    if 'email_verified' not in existing:
        op.add_column('users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default='false'))
    if 'verification_token' not in existing:
        op.add_column('users', sa.Column('verification_token', sa.String(128), nullable=True))
        op.create_index('ix_users_verification_token', 'users', ['verification_token'])
    if 'verification_token_expires_at' not in existing:
        op.add_column('users', sa.Column('verification_token_expires_at', sa.DateTime(timezone=True), nullable=True))
    if 'reset_token' not in existing:
        op.add_column('users', sa.Column('reset_token', sa.String(128), nullable=True))
        op.create_index('ix_users_reset_token', 'users', ['reset_token'])
    if 'reset_token_expires_at' not in existing:
        op.add_column('users', sa.Column('reset_token_expires_at', sa.DateTime(timezone=True), nullable=True))

    # Existing users created via email-only signup are considered verified
    op.execute("UPDATE users SET email_verified = true WHERE password_hash IS NULL")


def downgrade() -> None:
    op.drop_index('ix_users_reset_token', 'users')
    op.drop_index('ix_users_verification_token', 'users')
    op.drop_column('users', 'reset_token_expires_at')
    op.drop_column('users', 'reset_token')
    op.drop_column('users', 'verification_token_expires_at')
    op.drop_column('users', 'verification_token')
    op.drop_column('users', 'email_verified')
    op.drop_column('users', 'password_hash')
