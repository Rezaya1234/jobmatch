# Stellapath — Technology Stack

*Last updated: April 2026*
*Python version: 3.12*

---

## 1. Infrastructure

```
Hosting:         Render.com (paid plan)
Region:          Virginia, US East
Python:          3.12

Services:
  jobmatch-prod         Backend API (production)
  jobmatch-dev          Backend API (development)
  jobmatch-static       React frontend (production)
  jobmatch-dev-static   React frontend (development)

Databases:
  jobmatch-db           PostgreSQL (paid, production)
  jobmatch-db-dev       PostgreSQL (paid, development)

Vector DB:
  Beta:    pgvector extension on existing PostgreSQL
  Scale:   Qdrant (self-hosted) → Qdrant cluster
           or Pinecone at 50K+ users

Source control:
  Provider:    GitHub (private repo)
  Repo:        github.com/Rezaya1234/jobmatch
  Branches:    master (production auto-deploy)
               dev (development auto-deploy)

Deployment:
  Method:   GitHub push → Render auto-deploy
  Build:    pip install -r requirements.txt
  Start:    uvicorn main:app --host 0.0.0.0
            --port $PORT
```

---

## 2. Backend Stack

```
Language:      Python 3.12
Framework:     FastAPI (async)
Server:        Uvicorn
ORM:           SQLAlchemy (async)
Migrations:    Alembic
Validation:    Pydantic
DB driver:     asyncpg
HTTP client:   aiohttp (health checks, URL verify)
NLP:           spaCy (keyword extraction,
               job compression)
Scheduler:     APScheduler (beta) →
               Redis + Celery (Phase 2 at 10K+ users)
Testing:       pytest + pytest-asyncio
```

---

## 3. Frontend Stack

```
Framework:     React 18 + Vite
Language:      JavaScript (JSX)
Routing:       React Router

Brand — Stellapath:
  Logo:        S with star motif
  Tagline:     "Design your career path"
  Primary:     Purple (#5B4FE8)
  Secondary:   Teal (accent, sparse)
  Success:     Green (85%+ match, positive signals)
  Warning:     Amber (70-84% match)
  Neutral:     Gray (structure, inactive)
  Error:       Red (negative signals, thumbs down)

Pages:
  Dashboard           Top 3 matches, funnel,
                      insights, missed opportunities
  Open Positions      Generic job search
  Saved Jobs          User-saved listings
  Applications        Application tracking
  Feedback            Feedback history
  Company Insights    Company behavior and scores
  Profile Setup       3-column AI-assisted onboarding
  Settings            Preferences and account
  /admin              Internal ML control center —
                      admin users only (is_admin=true).
                      Pipeline status, metric cards,
                      Test Agent evaluation, source health,
                      alerts, job scoring explorer,
                      weight evolution, replay mode.
                      Own layout, no shared sidebar.

Key components:
  Sidebar             Fixed left nav, 240px desktop,
                      collapsible, bottom tabs mobile
  JobCard             Compact — logo, title, metadata,
                      why you match, score badge,
                      thumbs, chevron, fallback label
  DetailsDrawer       Right overlay — full details,
                      apply, gap analysis, Call 2 content
  MatchFunnel         Shown → Clicked → Reacted
  MatchingInsights    Tiered behavioral insights
  MissedOpportunities Weekly high-score unreviewed jobs
  ScoreChart          14-day match score trend line
  ProfileSetup        Steps, form, AI preview panel
```

---

## 4. AI and Modeling Stack

### LLM Layer

```
Architecture:  Provider-agnostic abstraction
Interface:     /llm/client.py
Adapters:      claude, openai, gemini (all ready)
Switch via:    LLM_PROVIDER environment variable
               Zero code changes required

Call 1 — batch scoring (always runs):
  Model:       Claude Haiku
  Input:       ~5,000 tokens (15-20 compressed jobs
               + profile + weights)
  Output:      ~800 tokens (structured JSON scores)
  Cost:        ~$0.005 per user per day

Call 2 — structured decision content (conditional):
  Model:       Claude Sonnet
  Trigger:     Active users with feedback in
               last 7 days only (~40% of users)
  Produces:    Why worth pursuing, gap analysis,
               course gaps, confidence, advisor summary
  Cache key:   user_id + job_id + profile_version
  Invalidated: profile_version change,
               >0.10 weight shift in any dimension,
               job_updated_at change,
               7-day TTL
  Cost:        ~$0.002 per active user per day

Maximum LLM calls: 2 per user per day
Cost alert:        $1.50 per user per month
```

### Matching Dimensions

```
Fixed set — exactly these 6, no others permitted:
  skills_match
  industry_alignment
  experience_level
  function_type
  salary           (excluded + weights re-normalized
                   if data unavailable)
  career_trajectory

Per dimension per job:
  score:           0.0-1.0 (null if unavailable)
  data_available:  true/false
  confidence:      high/medium/low
```

### Default Cold Start Weights

Applied when user has fewer than 5 feedback signals:

```
skills_match:        0.35
experience_level:    0.25
salary:              0.20
industry_alignment:  0.10
function_type:       0.05
career_trajectory:   0.05
Total:               1.00
```

### Weight Constraints

```
Ceiling per dimension:   0.50
Floor per dimension:     0.05
Always normalized:       sum = 1.00
Retraining trigger:      every 5 signals
Immediate trigger:       applied, interview, hired
weights_version:         increments on every update
```

### Feedback Signal Values

```
thumbs_up:        +2
thumbs_down:      -2
click:            +1
apply_click:      +1   (intent)
applied:          +3   (immediate weight update)
not_interested:   -1
interview:        +4   (immediate weight update)
hired:            +5   (immediate weight update)
```

### Embedding Models

```
Stage 1 — Fast filter:
  Model:       BAAI/bge-small-en-v1.5
  Dimensions:  384
  Speed:       ~8ms per document on CPU
  Cost:        $0 — open source, runs locally
  Threshold:   0.60 (relaxed to 0.50 for cold start)
  Purpose:     Reduce 100K jobs to ~40-60 candidates

Stage 2 — Quality filter:
  Model:       BAAI/bge-large-en-v1.5
  Dimensions:  1024
  Speed:       ~45ms per document on CPU
  Cost:        $0 — open source, runs locally
  Threshold:   0.70
  Purpose:     Reduce 40-60 to 15-20 for LLM

Note:        Bi-encoder embedding similarity filter —
             not a cross-encoder reranker.
             Cross-encoder evaluation deferred
             to Phase 3 if quality gap identified.

Required embedding prefix (BGE models):
  "Represent this for job matching: {text}"

Model loading:
  Load both models at application startup
  Keep in memory — never reload per request

Future upgrade path:
  Voyage AI voyage-large-2-instruct
  Trigger: Only if post-beta quality benchmarks
  show embedding as primary bottleneck
```

---

## 5. Data Pipeline

```
Scraping:
  Sources:     41 company career pages
  Schedule:    3:00 AM UTC daily
  Tool:        BeautifulSoup / Scrapy
  Dedup:       URL hash

Source trust scoring:
  Track per source:
    valid_job_pct
    parsing_success_pct
    dead_link_pct (within 48 hours)
    rolling_trust_score (30-day window)
  Alert:       trust score < 0.70
  Action:      auto-deprioritize degraded sources

Health checks:
  Schedule:    3:00 AM UTC (with scraping)
  Method:      HTTP HEAD request, 5s timeout
  On failure:  Mark inactive, log reason,
               remove from vector index

Company hiring snapshots (Phase C):
  Schedule:    End of daily scrape cycle
  Per company: active_job_count,
               new_jobs_since_yesterday,
               removed_jobs_since_yesterday,
               jobs by department / seniority /
               location (JSON)
  Storage:     One row per company per day —
               upsert on company_id + snapshot_date
  Cost:        $0 — existing PostgreSQL only

Description versioning (Phase C):
  Schedule:    End of daily scrape cycle
  Method:      MD5 hash of description text
               compared to Job.description_hash
  On change:   Close current JobDescriptionHistory
               row (valid_to = now()), insert new row,
               increment description_version
  No change:   Update last_seen_at only —
               zero new records, zero storage cost
  Library:     hashlib (Python stdlib — no new deps)

Vector index rebuild:
  Schedule:    4:00 AM UTC daily
  Model:       BGE-small (Stage 1 only in index)
  Algorithm:   HNSW

Matching pipeline:
  Schedule:    5:00 AM UTC daily

Insights update:
  User insights:    6:00 AM UTC daily
  Company scores:   Monday 5:00 AM UTC

Email delivery:
  Daily digest:     7:00 AM UTC
  Weekly recap:     Monday 6:00 AM UTC

All processing complete by 9:00 AM UTC
(4 AM EST — users wake up to fresh results)
```

---

## 6. Email Stack

```
Provider:      SendGrid (paid)

Outbound:
  Daily digest:   7:00 AM UTC — single dashboard link
  Weekly recap:   Monday 6:00 AM UTC
  Post-hire:      Triggered on job acceptance

Inbound (reply feedback):
  Reply-to:    feedback+{user_id}@stellapath.app
  Webhook:     SendGrid inbound parse
  Endpoint:    POST /webhooks/email-reply
  Processing:  Extract user_id → route to
               Feedback Agent

Status:        API key pending configuration
```

---

## 7. Security and Privacy

```
Secrets:
  Storage:     Environment variables only
  Never:       Committed to GitHub
  Local:       .env file (gitignored)
  Template:    .env.example (committed, no secrets)

Data handling:
  Resume:      Sent to Anthropic API for profile
               parsing only. Not stored by Anthropic
               beyond API call. Not shared with any
               other third party.
  Embeddings:  Computed locally using open source
               models. No resume or profile data
               sent to third parties for embedding.
  User data:   Used only for job matching.
               Never sold or shared.
               Deletable on request.

Privacy statement (accurate):
  "Resume content is processed by our LLM provider
  (Anthropic) for profile parsing only. It is not
  stored, sold, or shared with any other third party.
  All embeddings are computed locally. You are in
  control of your data and can request deletion
  at any time."
```

---

## 8. Development Workflow

```
Daily:

  cd C:\Users\rezar\jobmatch
  venv\Scripts\activate
  claude (Claude Code)
  Work on dev branch
  git add . && git commit -m "description"
  git push → auto-deploys to dev

Release checklist before merging to master:
  □ Tests passing (pytest)
  □ Manually tested on dev URL
  □ Env vars updated on prod Render
  □ DB migrations run on prod (alembic upgrade head)
  □ No console errors in frontend
  □ Email tested if email changes made
  □ git status clean

Release:
  git checkout master
  git merge dev
  git push → auto-deploys to prod
```

---

## 9. Cost Model

```
Per user per month (includes 25% buffer):
  LLM:              ~$0.24
  Database:          $0.03
  Vector search:     $0.00 (beta) → $0.01 (scale)
  Email:             $0.01
  Infrastructure:    $0.05
  ──────────────────────────────────────────
  Total:             ~$0.33/month
  Revenue:           $10.00/month
  Gross margin:      96.7%

Note: 25% buffer applied to LLM costs to account
for retries, token count variance, and usage spikes.
```

---

## 10. Upgrade Roadmap

```
Before beta (immediate):
  ✅ Configure SendGrid API key
  ✅ Add pgvector to PostgreSQL
  ✅ Implement BGE embedding pipeline
  ✅ Implement batched LLM architecture
  ✅ Add source trust scoring
  ✅ Add strict/flexible constraint flags
  ✅ Add dimension confidence levels
  ✅ Phase C: CompanyHiringSnapshot daily snapshots
  ✅ Phase C: JobDescriptionHistory versioning
  🔲 Admin dashboard — /admin ML control center
       (pipeline status, metric cards, Test Agent
        evaluation, job scoring explorer, alerts,
        source health, weight evolution, replay mode)

Phase 2 (post beta):
  Qdrant self-hosted for vector search
  Redis + Celery job queue
  LLM response caching
  Call 2 cache invalidation system
  LinkedIn/GitHub profile enrichment
  Advanced company accountability scoring
  Monitoring Service (split from Orchestration)

Phase 3 (2027):
  Qdrant cluster or Pinecone
  Hiring probability ML model
  Cross-encoder reranking evaluation
  Multilingual support
  Enterprise career tracking
  Data licensing
```
