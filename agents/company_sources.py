"""
Target companies for direct career page scraping.
Each entry: name (display), slug (unique key), ats (which fetcher to use).

ATS types:
  greenhouse  — boards-api.greenhouse.io
  lever       — api.lever.co
  ashby       — api.ashbyhq.com
  workday     — {workday_host}/wday/cxs/{tenant}/{workday_board}/jobs  (POST)
  google      — careers.google.com (unofficial JSON)
  amazon      — amazon.jobs (unofficial JSON)

Workday entries require two extra keys:
  workday_host   e.g. "chevron.wd5.myworkdayjobs.com"
  workday_board  e.g. "Chevron"

Sector-tagged entries populate Job.sector at insert time.
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

    # -----------------------------------------------------------------------
    # Upstream Oil & Gas  (Workday)
    # -----------------------------------------------------------------------
    {
        "name": "ExxonMobil",
        "slug": "exxonmobil",
        "ats": "j2w",
        "domain": "exxonmobil.com",
        "sector": "upstream_oil_gas",
        "j2w_base": "https://jobs.exxonmobil.com",
    },
    {
        "name": "Chevron",
        "slug": "chevron",
        "ats": "workday",
        "domain": "chevron.com",
        "sector": "upstream_oil_gas",
        "workday_host": "chevron.wd5.myworkdayjobs.com",
        "workday_board": "jobs",
    },
    {
        "name": "ConocoPhillips",
        "slug": "conocophillips",
        "ats": "workday",
        "domain": "conocophillips.com",
        "sector": "upstream_oil_gas",
        "workday_host": "conocophillips.wd1.myworkdayjobs.com",   # confirmed
        "workday_board": "External",                               # confirmed board name
    },
    {
        "name": "EOG Resources",
        "slug": "eogresources",
        "ats": "eog_html",   # ASP Classic portal — POST search form, parse HTML
        "domain": "eoginc.com",
        "sector": "upstream_oil_gas",
    },
    {
        "name": "Devon Energy",
        "slug": "devonenergy",
        "ats": "workday",
        "domain": "devonenergy.com",
        "sector": "upstream_oil_gas",
        "workday_host": "devonenergy.wd5.myworkdayjobs.com",   # confirmed wd5
        "workday_board": "careers",                             # confirmed board name
    },
    {
        "name": "Diamondback Energy",
        "slug": "diamondbackenergy",
        "ats": "workday",
        "domain": "diamondbackenergy.com",
        "sector": "upstream_oil_gas",
        "workday_host": "diamondbackenergy.wd12.myworkdayjobs.com",
        "workday_board": "DBE",
    },
    {
        "name": "APA Corporation",
        "slug": "apacorp",
        "ats": "workday",
        "domain": "apacorp.com",
        "sector": "upstream_oil_gas",
        "workday_host": "apa.wd105.myworkdayjobs.com",
        "workday_board": "APA-PrivateCareersPage02042024",
    },
    {
        "name": "Coterra Energy",
        "slug": "coterra",
        "ats": "recruitee",   # uses coterraenergy.recruitee.com — not Workday
        "domain": "coterra.com",
        "sector": "upstream_oil_gas",
        "recruitee_slug": "coterraenergy",
    },
    {
        "name": "Occidental Petroleum",
        "slug": "occidental",
        "ats": "workday",
        "domain": "oxy.com",
        "sector": "upstream_oil_gas",
        "workday_host": "oxy.wd5.myworkdayjobs.com",   # confirmed wd5
        "workday_board": "Corporate",                    # confirmed board name
    },
    {
        "name": "Expand Energy",
        "slug": "expandenergy",
        "ats": "j2w",
        "domain": "expandenergy.com",
        "sector": "upstream_oil_gas",
        "j2w_base": "https://jobs.expandenergy.com",
    },

    # -----------------------------------------------------------------------
    # Oilfield Services  (Workday)
    # -----------------------------------------------------------------------
    {
        "name": "SLB",
        "slug": "slb",
        "ats": "slb_coveo",
        "domain": "slb.com",
        "sector": "oilfield_services",
    },
    {
        "name": "Halliburton",
        "slug": "halliburton",
        "ats": "halliburton_html",
        "domain": "halliburton.com",
        "sector": "oilfield_services",
    },
    {
        "name": "Baker Hughes",
        "slug": "bakerhughes",
        "ats": "workday",
        "domain": "bakerhughes.com",
        "sector": "oilfield_services",
        "workday_host": "bakerhughes.wd5.myworkdayjobs.com",
        "workday_board": "BakerHughes",
    },
    {
        "name": "TechnipFMC",
        "slug": "technipfmc",
        "ats": "j2w",
        "domain": "technipfmc.com",
        "sector": "oilfield_services",
        "j2w_base": "https://careers.technipfmc.com",
    },
    {
        "name": "NOV Inc.",
        "slug": "novinc",
        "ats": "oracle_hcm",
        "domain": "nov.com",
        "sector": "oilfield_services",
        "oracle_host": "egay.fa.us6.oraclecloud.com",
        "oracle_site": "CX_2001",
    },
    {
        "name": "Weatherford International",
        "slug": "weatherford",
        "ats": "oracle_hcm",
        "domain": "weatherford.com",
        "sector": "oilfield_services",
        "oracle_host": "fa-exmi-saasfaprod1.fa.ocs.oraclecloud.com",
        "oracle_site": "CX_1",
    },
    {
        "name": "Tenaris",
        "slug": "tenaris",
        "ats": "j2w",
        "domain": "tenaris.com",
        "sector": "oilfield_services",
        "j2w_base": "https://recruitment.tenaris.com",
    },
    {
        "name": "Archrock",
        "slug": "archrock",
        "ats": "oracle_hcm",
        "domain": "archrock.com",
        "sector": "oilfield_services",
        "oracle_host": "edva.fa.us2.oraclecloud.com",
        "oracle_site": "CX_1",
    },
    {
        "name": "Newpark Resources",
        "slug": "newpark",
        "ats": "custom",   # no dedicated ATS; posts to external job boards only
        "domain": "newpark.com",
        "sector": "oilfield_services",
    },
    {
        "name": "Patterson-UTI Energy",
        "slug": "pattersonuti",
        "ats": "oracle_hcm",
        "domain": "patenergy.com",
        "sector": "oilfield_services",
        "oracle_host": "fa-elpm-saasfaprod1.fa.ocs.oraclecloud.com",
        "oracle_site": "CX",
    },
]

# Fast lookup: company display name → domain
COMPANY_DOMAIN: dict[str, str] = {s["name"]: s["domain"] for s in COMPANY_SOURCES}
