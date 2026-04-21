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
    {"name": "Anthropic",        "slug": "anthropic",     "ats": "greenhouse"},
    {"name": "Scale AI",         "slug": "scaleai",       "ats": "greenhouse"},
    {"name": "Together AI",      "slug": "togetherai",    "ats": "greenhouse"},
    {"name": "Glean",            "slug": "gleanwork",     "ats": "greenhouse"},
    {"name": "Gong",             "slug": "gongio",        "ats": "greenhouse"},
    {"name": "Intercom",         "slug": "intercom",      "ats": "greenhouse"},
    {"name": "Databricks",       "slug": "databricks",    "ats": "greenhouse"},

    # --- Lever ---
    {"name": "Mistral AI",       "slug": "mistral",       "ats": "lever"},
    {"name": "Palantir",         "slug": "palantir",      "ats": "lever"},

    # --- Ashby ---
    {"name": "OpenAI",           "slug": "openai",        "ats": "ashby"},
    {"name": "Cohere",           "slug": "cohere",        "ats": "ashby"},
    {"name": "Writer",           "slug": "writer",        "ats": "ashby"},
    {"name": "Runway",           "slug": "runway",        "ats": "ashby"},
    {"name": "Pinecone",         "slug": "pinecone",      "ats": "ashby"},
    {"name": "Perplexity",       "slug": "perplexity",    "ats": "ashby"},
    {"name": "ElevenLabs",       "slug": "elevenlabs",    "ats": "ashby"},
    {"name": "Cursor",           "slug": "cursor",        "ats": "ashby"},
    {"name": "Harvey AI",        "slug": "harvey",        "ats": "ashby"},
    {"name": "Sierra AI",        "slug": "sierra",        "ats": "ashby"},

    # --- Unofficial JSON (best-effort) ---
    {"name": "Google",           "slug": "google",        "ats": "google"},
    {"name": "Amazon",           "slug": "amazon",        "ats": "amazon"},
]
