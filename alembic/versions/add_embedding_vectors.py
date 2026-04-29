"""add pgvector embedding columns to jobs and user_profiles

Revision ID: z1a2b3c4d5e6
Revises: y4z5a6b7c8d9
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = 'z1a2b3c4d5e6'
down_revision = ('y4z5a6b7c8d9', 'a6b7c8d9e0f1')
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Add embedding_vector to jobs
    jobs_cols = [c['name'] for c in inspector.get_columns('jobs')]
    if 'embedding_vector' not in jobs_cols:
        op.execute(
            "ALTER TABLE jobs ADD COLUMN embedding_vector vector(1536)"
        )
        op.execute("""
            CREATE INDEX jobs_embedding_hnsw_idx
            ON jobs USING hnsw (embedding_vector vector_cosine_ops)
        """)

    # Add profile_embedding to user_profiles
    profile_cols = [c['name'] for c in inspector.get_columns('user_profiles')]
    if 'profile_embedding' not in profile_cols:
        op.execute(
            "ALTER TABLE user_profiles ADD COLUMN profile_embedding vector(1536)"
        )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS jobs_embedding_hnsw_idx")
    op.execute("ALTER TABLE jobs DROP COLUMN IF EXISTS embedding_vector")
    op.execute("ALTER TABLE user_profiles DROP COLUMN IF EXISTS profile_embedding")
