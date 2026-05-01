"""add ticker_symbol to company_insights and seed company_type data

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'c9d0e1f2a3b4'
down_revision = 'b8c9d0e1f2a3'
branch_labels = None
depends_on = None

_PUBLIC = [
    ("ExxonMobil", "XOM"),
    ("Chevron", "CVX"),
    ("ConocoPhillips", "COP"),
    ("EOG Resources", "EOG"),
    ("Devon Energy", "DVN"),
    ("Diamondback Energy", "FANG"),
    ("APA Corporation", "APA"),
    ("Coterra Energy", "CTRA"),
    ("Occidental Petroleum", "OXY"),
    ("Expand Energy", None),
    ("SLB", "SLB"),
    ("Halliburton", "HAL"),
    ("Baker Hughes", "BKR"),
    ("TechnipFMC", "FTI"),
    ("NOV Inc.", "NOV"),
    ("Weatherford International", "WFRD"),
    ("Tenaris", "TS"),
    ("Archrock", "AROC"),
    ("Newpark Resources", "NR"),
    ("Patterson-UTI Energy", "PTEN"),
    ("Microsoft", "MSFT"),
    ("Meta", "META"),
    ("Apple", "AAPL"),
    ("Amazon", "AMZN"),
    ("Nvidia", "NVDA"),
    ("Salesforce", "CRM"),
    ("Snowflake", "SNOW"),
    ("Palantir", "PLTR"),
    ("C3.ai", "AI"),
    ("ServiceNow", "NOW"),
    ("Workday", "WDAY"),
    ("Adobe", "ADBE"),
    ("Intuit", "INTU"),
    ("Google", "GOOGL"),
]

_STARTUPS = [
    ("Anthropic", "startup_series_c"),
    ("OpenAI", "startup_series_c"),
    ("Mistral AI", "startup_series_b"),
    ("Cohere", "startup_series_b"),
    ("Scale AI", "startup_series_e"),
    ("Hugging Face", "startup_series_c"),
    ("Databricks", "startup_pre_ipo"),
    ("Together AI", "startup_series_b"),
    ("Glean", "startup_series_c"),
    ("Gong", "startup_series_e"),
    ("Intercom", "startup_series_d"),
    ("Writer", "startup_series_b"),
    ("Runway", "startup_series_c"),
    ("Pinecone", "startup_series_b"),
    ("Perplexity", "startup_series_b"),
    ("ElevenLabs", "startup_series_b"),
    ("Cursor", "startup_series_b"),
    ("Harvey AI", "startup_series_b"),
    ("Sierra AI", "startup_series_a"),
    ("Mistral", "startup_series_b"),
]


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns('company_insights')]
    if 'ticker_symbol' not in existing:
        op.add_column('company_insights', sa.Column('ticker_symbol', sa.String(20), nullable=True))

    for name, ticker in _PUBLIC:
        if ticker:
            conn.execute(
                sa.text(
                    "UPDATE company_insights SET company_type = 'public', ticker_symbol = :ticker"
                    " WHERE company_name = :name"
                ),
                {"ticker": ticker, "name": name},
            )
        else:
            conn.execute(
                sa.text("UPDATE company_insights SET company_type = 'public' WHERE company_name = :name"),
                {"name": name},
            )

    for name, ctype in _STARTUPS:
        conn.execute(
            sa.text("UPDATE company_insights SET company_type = :ctype WHERE company_name = :name"),
            {"ctype": ctype, "name": name},
        )


def downgrade() -> None:
    op.drop_column('company_insights', 'ticker_symbol')
