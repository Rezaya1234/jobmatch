"""
Target companies for direct career page scraping.
Each entry: name (display), slug (unique key), ats (which fetcher to use).

ATS types:
  greenhouse  — boards-api.greenhouse.io
  lever       — api.lever.co
  ashby       — api.ashbyhq.com
  google      — careers.google.com (unofficial JSON)
  amazon      — amazon.jobs (unofficial JSON)
"""

COMPANY_SOURCES: list[dict] = [
    # --- Greenhouse (confirmed working) ---
    {"name": "Anthropic",        "slug": "anthropic",     "ats": "greenhouse", "domain": "anthropic.com"},
    {"name": "Scale AI",         "slug": "scaleai",       "ats": "greenhouse", "domain": "scale.ai"},
    {"name": "Together AI",      "slug": "togetherai",    "ats": "greenhouse", "domain": "together.ai"},
    {"name": "Glean",            "slug": "gleanwork",     "ats": "greenhouse", "domain": "glean.com"},
    {"name": "Gong",             "slug": "gongio",        "ats": "greenhouse", "domain": "gong.com"},
    {"name": "Intercom",         "slug": "intercom",      "ats": "greenhouse", "domain": "intercom.com"},
    {"name": "Databricks",       "slug": "databricks",    "ats": "greenhouse", "domain": "databricks.com"},

    # --- Lever ---
    {"name": "Mistral AI",       "slug": "mistral",       "ats": "lever",      "domain": "mistral.ai"},
    {"name": "Palantir",         "slug": "palantir",      "ats": "lever",      "domain": "palantir.com"},

    # --- Ashby ---
    {"name": "OpenAI",           "slug": "openai",        "ats": "ashby",      "domain": "openai.com"},
    {"name": "Cohere",           "slug": "cohere",        "ats": "ashby",      "domain": "cohere.com"},
    {"name": "Writer",           "slug": "writer",        "ats": "ashby",      "domain": "writer.com"},
    {"name": "Runway",           "slug": "runway",        "ats": "ashby",      "domain": "runwayml.com"},
    {"name": "Pinecone",         "slug": "pinecone",      "ats": "ashby",      "domain": "pinecone.io"},
    {"name": "Perplexity",       "slug": "perplexity",    "ats": "ashby",      "domain": "perplexity.ai"},
    {"name": "ElevenLabs",       "slug": "elevenlabs",    "ats": "ashby",      "domain": "elevenlabs.io"},
    {"name": "Cursor",           "slug": "cursor",        "ats": "ashby",      "domain": "cursor.sh"},
    {"name": "Harvey AI",        "slug": "harvey",        "ats": "ashby",      "domain": "harvey.ai"},
    {"name": "Sierra AI",        "slug": "sierra",        "ats": "ashby",      "domain": "sierra.ai"},

    # --- Unofficial JSON (best-effort) ---
    {"name": "Google",           "slug": "google",        "ats": "google",     "domain": "google.com"},
    {"name": "Amazon",           "slug": "amazon",        "ats": "amazon",     "domain": "amazon.com"},
]

# Fast lookup: company display name → domain
COMPANY_DOMAIN: dict[str, str] = {s["name"]: s["domain"] for s in COMPANY_SOURCES}
