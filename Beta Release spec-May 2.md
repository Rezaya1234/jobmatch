# Stellapath — Beta Release Specification
## Internal Confidential — May 2, 2026

*This document captures the complete product specification for the beta release of Stellapath as of May 2, 2026. It is written so that a technical co-founder, investor, or engineer could understand exactly what the product is, how it works, and how to recreate it from scratch.*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Overview](#2-product-overview)
3. [End-to-End User Flow](#3-end-to-end-user-flow)
4. [Frontend — Pages & Components](#4-frontend--pages--components)
5. [Backend — API & Agent Architecture](#5-backend--api--agent-architecture)
6. [Matching Algorithm — Deep Dive](#6-matching-algorithm--deep-dive)
7. [Feedback & Weight Learning System](#7-feedback--weight-learning-system)
8. [Data Models](#8-data-models)
9. [Daily Pipeline Schedule](#9-daily-pipeline-schedule)
10. [Admin Dashboard](#10-admin-dashboard)
11. [Tech Stack](#11-tech-stack)
12. [Infrastructure & Deployment](#12-infrastructure--deployment)
13. [Cost Model](#13-cost-model)
14. [Security & Privacy](#14-security--privacy)
15. [Failure Modes & Recovery](#15-failure-modes--recovery)
16. [What Is Not In Beta (Phase 2/3)](#16-what-is-not-in-beta-phase-23)
17. [Scaling Architecture](#17-scaling-architecture)

---

## 1. Executive Summary

Stellapath is a closed-loop career optimization system — not a job board. It delivers exactly 3 personalized job recommendations per user per day, learns from every interaction, and improves match quality over time through a feedback-driven weight learning system.

**Core value proposition:**
- Precision over volume — 3 curated matches per day, not 300
- Every interaction teaches the system what you actually want
- A career advisor layer (LLM Call 2) that tells you not just what fits, but whether it's worth pursuing
- Company intelligence pulled from real hiring data, not marketing copy

**What makes it different from a job board:**
- No searching, no filtering by hand — the system does it
- Match scores are explained at the dimension level (skills, experience, industry, function, salary, trajectory)
- Negative signals are as valuable as positive ones — a thumbs-down on a compensation-heavy role teaches the system salary is less important to you
- The advisor can say "don't apply" — not_recommended flag surfaces when a high-scoring job is strategically wrong for your stated direction

---

## 2. Product Overview

### Brand

- **Name:** Stellapath
- **Tagline:** "Design your career path"
- **Logo:** S with star motif
- **Colors:** Purple (#5B4FE8) primary, teal accent, green for success, amber for warning, red for negative

### What the product does (one paragraph)

A user uploads their resume and sets their preferences. The system parses their profile, builds an embedding-based understanding of who they are and what they want, and every morning at ~4 AM EST runs a pipeline that scrapes 41 company career pages, filters thousands of jobs against the user's hard constraints, uses vector similarity to narrow to the top 15 candidates, scores all 15 with Claude Haiku in a single batch LLM call across 6 weighted dimensions, optionally re-ranks by career alignment with a second Haiku call, and delivers the top 3 to the user's inbox and dashboard. Every interaction (thumbs, clicks, applies, text comments) feeds back into the user's dimension weights, making the next day's recommendations more accurate.

### Three core concepts (never mixed)

| Concept | Owner | Used for |
|---------|-------|----------|
| Search Relevance | Filter Agent | Candidate selection via embedding similarity |
| Match Score | Matching Agent | Ranking and delivery |
| User Intent State | Feedback Agent | Learning and outcome tracking |

Mixing these causes feedback loop corruption. They are stored in separate tables and never computed from the same inputs.

---

## 3. End-to-End User Flow

### 3.1 Sign Up → Onboarding

1. **Landing page** — Value proposition, sign-up CTA
   - **Sign-in page:** Two-column layout. Left: sign in form with email and password. Right: product preview showing 3 real job cards and modal overlay — gives new users a clear picture of the product before signing up.
2. **Sign-up** — Email + password (email normalized to lowercase)
3. **Profile Setup Wizard** — 4-step wizard, gated: dashboard inaccessible until `profile_complete = true`

**Step 1 — Resume Upload**
- Upload resume (PDF/text)
- Claude Sonnet parses: skills, experience, title history, preferred work modes, salary expectations
- AI preview panel on the right shows parsed output live
- `original_role_description` locked at this point — used as stable source for future re-generation

**Step 2 — Career Goals**
- Free-text textarea: "What direction are you heading?"
- `goals_text` debounce-saved every 500ms
- When set, the system re-generates `role_description` from `original_role_description` through the lens of the stated goal (intent-conditioned generation)
- The profile vector now points at what you *want*, not just what you've *done*

**Step 3 — Preferences**
- Work mode: Remote / Hybrid / Onsite (with relocation toggle, default off)
- Visa sponsorship: 4 options via PillWithSub selectors (US Citizen / Green Card / H-1B Transfer / Requires Sponsorship)
- Seniority: 6 levels — Entry Level, Mid Level, Senior, Manager, Director, Executive
- Salary floor, excluded companies, excluded job titles
- Preferred sectors (LOW weight in embedding — guides direction without over-constraining)

**Step 4 — Review & Confirm**
- Final review of all profile fields
- "Looks good" button sets `profile_complete = true`
- Triggers first-run pipeline (`POST /pipeline/run-for-user/{id}`) with 60-second timeout + loading overlay
- After pipeline completes, user lands on Dashboard

### 3.2 Daily Active Use

**Morning:** User receives email at ~7 AM UTC with single dashboard link

**Dashboard:**
- 3 job cards, each showing: company logo, title, metadata, match score, "Why you match" summary (from Call 2 reorder_reason)
- If `not_recommended = true`: amber warning icon + "Advisor caution" label instead of match %
- Fallback jobs (rare): gray "Exploratory match" pill

**Per job card actions:**
- Thumbs up / Thumbs down (immediate weight update on strong signals)
- Click through to DetailsDrawer
- Comment inline with text
- Optional text comment box appears after clicking Good fit or Not a fit in DetailsDrawer. Comment icon on Open Positions cards opens inline text box. Commentary processed by Feedback Agent via Claude Haiku.

**DetailsDrawer (right overlay):**
- Full job description
- Match score breakdown by dimension (6 bars)
- "Why this could be a good fit" section — from Call 2 advisor content
- If `not_recommended = true`: amber advisory banner replaces the above
- Gap analysis — what might hold you back, suggested course gaps
- Apply button — records `applied` signal (immediate weight update)
- Confidence level (high/medium/low) from Call 2

**Feedback loop:**
- Every interaction writes to `FeedbackEvent` (immutable) and updates `JobUserState`
- Text commentary is processed by Claude Haiku: extracts dimension, direction, confidence, optional hard exclusion phrase
- Every 5 signals: dimension weights recalibrated
- On applied/interview/hired: immediate weight update, outcome-anchored embedding blend (0.8 × profile + 0.2 × job)

### 3.3 Other Pages

- **Open Positions** — Generic job search (not personalized, no match scores)
- **Saved Jobs** — Jobs the user saved for later
- **Applications** — History of applied/interview signals, table with job links, status badges
- **Company Insights** — Company behavior data, hiring velocity, culture score, department breakdown
- **Profile / Settings** — Edit preferences, re-trigger profile re-generation

---

## 4. Frontend — Pages & Components

### Stack

- React 18 + Vite
- JavaScript (JSX)
- React Router for client-side routing
- Tailwind CSS for styling
- Recharts for data visualization
- Axios for API calls

### SPA Routing on Render

Two fixes required for deep routes (e.g. `/dashboard` on browser refresh):
1. `frontend/public/_redirects` with LF line endings (CRLF causes Render to silently ignore it): `/* /index.html 200`
2. Build script copies `index.html` → `404.html` post-build so Render uses it as a static 404 fallback:
   ```json
   "build": "vite build && node -e \"require('fs').copyFileSync('dist/index.html','dist/404.html')\""
   ```
3. `.gitattributes` forces LF on `_redirects` to survive Windows Git autocrlf

### Route Guards

- `RequireAuth` — redirects to `/signin` if no JWT
- `RequireProfile` — redirects to `/profile` if `profile_complete = false`
- `RequireAdmin` — calls backend to verify `is_admin = true`; redirects to dashboard if false

### Page Inventory

| Route | Page | Access |
|-------|------|--------|
| `/` | Landing | Public |
| `/signin` | Sign In | Public |
| `/signup` | Sign Up | Public |
| `/profile` | Profile Setup Wizard | Auth |
| `/dashboard` | Dashboard (top 3 matches) | Auth + profile complete |
| `/positions` | Open Positions | Auth |
| `/saved` | Saved Jobs | Auth |
| `/applications` | Applications History | Auth |
| `/feedback` | QA Dashboard — activity stream with user dropdown (admin sees all users; non-admin sees own only) | Auth |
| `/companies` | Company Insights List | Auth |
| `/companies/:slug` | Company Detail | Auth |
| `/settings` | Settings | Auth |
| `/admin` | Admin Dashboard | Admin only |

### Key Components

| Component | What it does |
|-----------|-------------|
| `Sidebar` | Fixed left nav, 240px desktop, collapsible, bottom tabs on mobile |
| `JobCard` | Compact card — logo, title, score badge, why you match, thumbs, fallback label |
| `DetailsDrawer` | Right overlay — full job detail, Call 2 content, advisory banner when not_recommended |
| `ScoreBadge` | Shows match % (green/amber), or amber warning icon + "Caution" when not_recommended |
| `MatchFunnel` | Shown → Clicked → Reacted funnel visualization |
| `MatchingInsights` | Tiered user behavioral insights (requires 5/15 interactions to unlock) |
| `MissedOpportunities` | Weekly high-score (≥85%) jobs user didn't interact with |
| `ScoreChart` | 14-day match score trend line (Recharts) |
| `ProfileSetup` | Wizard with StepNav, AI preview panel, debounce auto-save |
| `StepNav` | 4-step progress nav — active purple, completed purple filled circle with white checkmark, clickable |
| `ProgressBar` | 4px violet bar at top of wizard advancing 25% per step |
| `PillWithSub` | Pill selector with main label + sublabel (used for visa options, 2-col grid) |
| `DifficultyPill` | Traffic-light pill for interview difficulty: Easy/Moderate/Hard/Very Hard |
| `HiringMomentum` | Velocity strip (week/month deltas) only. Department bar chart removed — classification unreliable across sectors. |
| `SignalTimeline` | Vertical timeline for recent company signals, colored dots + type badges |
| `CompanyTypeBadge` | Shows Public/Private/Startup with series stage. Tooltip on hover explains what each stage means for candidates. 8 types: public, private, startup_seed, startup_series_a through c, pre_ipo. |
| `NotificationBell` | Connected to GET /users/{id}/notifications. 6 notification types: unreviewed matches, missed opportunities, profile incomplete, match quality improving, no activity 3 days, interview follow-up. |
| `RecentNews` | Fetches Google News RSS for company name. Shows last 5 headlines with source and date. Links open in new tab. Replaced LLM-generated Recent Signals. |

---

## 5. Backend — API & Agent Architecture

### Stack

- Python 3.12
- FastAPI (async)
- Uvicorn
- SQLAlchemy (async ORM)
- Alembic (migrations)
- Pydantic (validation)
- asyncpg (DB driver)
- httpx / aiohttp (health checks, URL verify)
- spaCy (job compression for LLM context)
- APScheduler (pipeline scheduling — beta; Redis + Celery at Phase 2)
- pytest + pytest-asyncio (55 unit and integration tests, all passing)

### API Module Layout

| Module | Responsibility |
|--------|---------------|
| `main.py` | FastAPI app, middleware, router registration, scheduler startup |
| `api/auth.py` | Sign up, sign in, JWT issue |
| `api/profile.py` | Profile CRUD, resume parse trigger, profile embedding |
| `api/jobs.py` | Job listing, search, filtering |
| `api/feedback.py` | Signal recording, commentary submission, weight update trigger |
| `api/companies.py` | Company detail, hiring velocity, department breakdown |
| `api/admin.py` | All `/admin/*` endpoints (pipeline status, metrics, alerts, etc.) |
| `api/pipeline.py` | Manual pipeline trigger (`/pipeline/run-for-user/{id}`) |
| `api/debug.py` | Admin debug pipeline — step-by-step pipeline runner with LLM 1 + LLM 2 steps |
| `llm/client.py` | Provider-agnostic LLM interface — swap model via `LLM_PROVIDER` env var |

### Agent Architecture (8 agents)

#### Agent 1 — Profile Agent

*Purpose: Build structured understanding of the user before matching begins.*

**What it does:**
- Parses resume via Claude Sonnet → extracts skills, experience, title history, salary expectations, preferences, dealbreakers
- Initializes cold start weights (5 feedback signals threshold)
- Sets `cold_start = true` until 5 feedback signals accumulated
- Builds `build_intent_query()` for embedding: HIGH weight on skills/title_include (repeated for emphasis), MEDIUM on seniority/work_mode/goals_text, LOW on preferred_sectors framed as "Target industry:" (not employer names), EXCLUDE employer names from embedding text
- **Intent-conditioned generation:** When `goals_text` or `preferred_sectors` is set, `role_description` is re-generated with the LLM prompt framing the user's experience *through the lens of their stated goal* — leading with the evidence most relevant to the target, presenting other skills as tools brought to that industry
- `original_role_description` locked at first parse — used as stable source for all future re-generations
- `_regenerate_description_bg` rebuilds and re-embeds when `goals_text` or `preferred_sectors` changes
- Embeds profile on save as background task (`update_profile_embedding`)

**Why this matters:**
A petroleum engineer targeting AI implementation roles would, without intent conditioning, generate a profile embedding that points at the oil and gas sector. With intent conditioning, the profile vector points at AI implementation.

**Initial cold start weights:**
```
skills_match:        0.30
experience_level:    0.15
salary:              0.15
industry_alignment:  0.15
function_type:       0.15
career_trajectory:   0.10
```

---

#### Agent 2 — Search Agent

*Purpose: Global job scraper and source health monitor. Runs once per day at 3:00 AM UTC. No user context.*

**What it does:**
- Scrapes 41 company career pages
- Deduplicates by URL (`ON CONFLICT DO NOTHING`)
- Marks closed jobs inactive; re-activates returned jobs
- Enforces 10k job cap (removes oldest inactive jobs with no feedback)
- Embeds new jobs at ingestion via `embed_single` (OpenAI text-embedding-3-small, 1536d)
- **Phase A:** HTTP HEAD health check per active job URL — marks inactive if 404/410
- **Phase A:** Per-source trust scoring: tracks `jobs_returned`, `parse_success_rate`, `dead_link_pct` (rolling 30 days). Logs warning if trust < 0.70. Skips scrape for sources with trust < 0.50
- **Phase C:** Saves `CompanyHiringSnapshot` — one row per company per day: active count, new/removed since yesterday, jobs by department/seniority/location (JSON). Upsert on `source_slug + snapshot_date`
- **Phase C:** MD5 hash description — writes `JobDescriptionHistory` row only on change; updates `last_seen_at` only when hash is identical (zero storage cost for stable jobs)

---

#### Agent 3 — Filter Agent

*Purpose: Per-user candidate selector. Returns top 15 semantically closest jobs that pass all hard constraints.*

**What it does:**

Hard constraints (zero exceptions, no relaxation ever):
1. Location type (remote/hybrid/onsite must match)
2. Visa sponsorship (must offer if user requires)
3. Excluded job titles
4. Excluded companies
5. Previously shown jobs (permanent memory)
6. Active job status (URL must be live)

**Location filter ordering (critical):** `_is_us_compatible_location` runs BEFORE `_contains_us_state` and `_contains_us_city`. This prevents "IN" (Indiana state code) from matching "IN" (India country code) in addresses like "Bangalore, KA, IN, 560066".

ANN search:
- Builds `build_intent_query()` from profile
- Aspiration blend at query time: `0.7 × profile_embedding + 0.3 × goals_embedding` (normalized)
- pgvector ANN cosine distance (`embedding_vector <=> query_vector LIMIT 50`) on hard-passed unseen jobs
- Soft constraint post-filter (salary floor ±10%, role type, experience floor ±2 years, seniority ceiling +1)
- Sector diversification: cap any single sector at 60% (skip if <20% of results have sector data)
- Company cap: `_COMPANY_CAP = 2` — prevents one employer from filling all 15 slots
- Returns top 15 to Matching Agent

---

#### Agent 4 — Matching Agent

*Purpose: The AI brain. Scores all filtered jobs in a single batch LLM call with explicit weighted dimensions.*

*See Section 6 for deep dive.*

---

#### Agent 5 — Feedback Agent

*Purpose: The learning engine. Converts every user interaction into structured signals that make tomorrow's matches smarter.*

**What it does:**
- Logs all feedback to immutable `FeedbackEvent` table
- Updates `JobUserState` separately (current status per user-job pair)
- Collects signals with standardized values (see table in Section 7)
- Triggers weight update every 5 signals; immediate trigger on applied/interview/hired
- Attributes signals to matching dimensions
- Extracts themes from free-text commentary via Claude Haiku: returns `dimension`, `direction`, `confidence` (high/medium/low → ±0.05/0.03/0.01 delta), optional `hard_exclusion` phrase
- Drift protection: floor 0.05, ceiling 0.50 per dimension
- Normalizes weights to sum to 1.00 after every update
- Increments `weights_version` on every update
- Outcome-anchored embedding on interview/applied: `0.8 × profile_embedding + 0.2 × job_embedding` (normalized)
- Passive link-clicks (weight=1) write `ActivityLog` only — never create `FeedbackEvent` rows

**Commentary writes to both `FeedbackEvent` and `ActivityLog`.** `FeedbackEvent` is the source of truth for AI weight learning. `ActivityLog` is what the QA page reads. Both must be written on every commentary submission — writing only to `FeedbackEvent` causes commentary to be invisible on the QA page. The `log_event` call in `submit_commentary` must use the correct argument order: `log_event(session, user_id, event_type, **kwargs)` — session first, meta as keyword args.

---

#### Agent 6 — Insights Agent

*Purpose: Intelligence layer for company and career behavioral data.*

**What it does:**
- Aggregates company behavioral data from feedback events (response rates, ghosting patterns, time to respond)
- Computes company accountability scores
- Generates user behavioral insights with tiered thresholds:
  - < 5 interactions: no insights shown
  - 5–15 interactions: weak signals with caveat ("Early patterns based on limited interactions")
  - 15+ interactions: strong signals shown confidently
- Feeds company snapshots to Matching Agent Call 2
- Company scores updated weekly (Monday 5:00 AM UTC)
- User insights updated daily (6:00 AM UTC)

---

#### Agent 7 — Orchestration Agent

*Purpose: The conductor. Coordinates every agent in sequence, enforces cost controls, guarantees delivery.*

**What it does:**
- Triggered at 5:00 AM UTC
- Checks cold start flag per user → selects weights
- Runs Filter Agent → Matching Agent per user
- Removes previously shown job IDs
- Applies 3-job delivery guarantee with fallback

**Fallback sequence (soft constraints relaxed in order):**
1. Relax salary floor ±10%
2. Relax experience floor ±2 years
3. Relax seniority ceiling one level
4. Relax role type to adjacent
5. Pull from unseen active jobs last 7 days (URL-verified)
6. Deliver 1–2 jobs with "Fewer matches today" message

Hard constraints are NEVER relaxed in fallback.

Fallback jobs get gray "Exploratory match" pill — never presented as recommendations.

**Cost controls:**
- Max 10–15 jobs to Matching Agent per user
- Max 2 LLM calls per user per day
- Alert at $1.50/user/month

---

#### Agent 8 — Email Agent

*Purpose: Gets jobs into the user inbox every morning via a single dashboard link.*

**What it does:**
- Renders Stellapath-branded HTML email via Jinja2
- Sends daily digest at 7:00 AM UTC — single link to dashboard (no-reply; all interaction happens in-app)
- Weekly recap (Monday 6:00 AM UTC): jobs from last 7 days, score ≥ 85%, zero interaction, URL-verified, max 1 recap per job per user ever

---

## 6. Matching Algorithm — Deep Dive

### Call 1 — Batch Scoring (always runs, Claude Haiku)

**Input:** 10–15 jobs, each compressed to ~300 tokens using spaCy + user profile summary + dimension weights

**Dimensions scored (exactly these 6):**
1. `skills_match` — technical and functional skill overlap
2. `industry_alignment` — sector match vs preferred_sectors
3. `experience_level` — years/seniority fit
4. `function_type` — role type fit (IC/manager/executive)
5. `salary` — compensation fit (excluded + weights re-normalized if data unavailable)
6. `career_trajectory` — alignment with stated career direction

**Sector Rule:** When `preferred_sectors` is non-empty, the system prompt instructs the LLM: job sector outside preferred_sectors → `industry_alignment` must be ≤ 0.25. Without this, the LLM would reason "leadership skills transfer" and score cross-sector jobs moderately.

**Per dimension per job:**
- `score`: 0.0–1.0 (null if data unavailable)
- `data_available`: true/false
- `confidence`: high/medium/low

**Score computation (in code, never inside LLM):**
1. Multiply each dimension score by its weight
2. Sum weighted scores
3. Apply function floor penalty: if `function_type < 0.40` → multiply final score by 0.70 (prevents fundamental role type mismatches from ranking highly despite strong skills/experience)
4. Normalize across all candidates

**Weight rules:**
- Always sum to 1.00
- No dimension above 0.50
- No dimension below 0.05
- Re-normalize if salary excluded

### Reorder Pass — LLM 2 (conditional, Claude Haiku)

Fires when profile has explicit intent signals (`goals_text` or `preferred_sectors` set).

**What it does:** Reviews all 15 candidates after Call 1 scoring. Given the candidate's stated goal and background, returns:
- `top_3_ids` — the 3 jobs that best serve the stated career direction (not just skills overlap)
- `top_3_reasons` — one sentence per job addressed directly to the candidate about that specific role (no process language, no "ranked X of 15" — stored in `call2_content["reorder_reason"]` for user-facing display)
- `reasoning` — admin-only: one sentence explaining why the order changed
- `profile_gap` — admin-only: one sentence on missing profile data limiting quality
- `swaps_made` — bool

If `swaps_made = true`, normalized score values are redistributed to the new order before delivery selection.

**In admin debug page:** LLM 1 Score and LLM 2 Score are separate triggerable steps. LLM 2 results table shows: LLM 1 rank → LLM 2 rank per job, ▲/▼ indicators, industry score, plus reasoning and profile_gap banners — all admin-only.

### Call 2 — Structured Decision Content (conditional, Claude Sonnet)

Fires only for active users with feedback in last 7 days (~40% of users).

**Produces:**
- Why worth pursuing (2–3 sentences)
- What might hold user back
- Suggested course gaps
- Confidence level (high/medium/low)
- Advisor-style summary
- `not_recommended` (bool)

**`not_recommended = true` when:**
- The role contradicts the candidate's stated direction, or
- The advisor_summary is predominantly negative — even if dimension scores are high

**When `not_recommended = true`:**
- Dashboard card: amber warning icon + "Advisor caution" label instead of match %
- DetailsDrawer: amber advisory banner replaces "Why this could be a good fit" section

**Cache:** Key = `user_id + job_id + profile_version`. Invalidated by: profile_version change, >0.10 weight shift in any dimension, `job_updated_at` change, 7-day TTL.

---

## 7. Feedback & Weight Learning System

### Signal Values

| Signal | Value | Update Trigger |
|--------|-------|----------------|
| thumbs_up | +2 | Every 5 signals |
| thumbs_down | -2 | Every 5 signals |
| click | +1 | Every 5 signals |
| apply_click | +1 | Every 5 signals |
| applied | +3 | Immediate |
| not_interested | -1 | Every 5 signals |
| interview | +4 | Immediate |
| hired | +5 | Immediate |

### Weight Update Mechanics

1. Signal arrives → attribute to relevant dimensions
2. Apply delta (±0.05 high / ±0.03 medium / ±0.01 low confidence)
3. Enforce floor (0.05) and ceiling (0.50) per dimension
4. Normalize so all weights sum to 1.00
5. Increment `weights_version`
6. Persist to `LearnedWeights` table
7. Invalidate Call 2 cache if any dimension shifts >0.10

### Commentary Processing

Text commentary submitted via:
- Modal comment box (in DetailsDrawer)
- Job card inline input

Processing (async background task):
- Claude Haiku `_COMMENTARY_SYSTEM` prompt
- Returns structured JSON: `{dimension, direction, confidence, hard_exclusion?}`
- `hard_exclusion` triggers an immediate update to the user's excluded titles/companies
- Writes to both `FeedbackEvent` and `ActivityLog` (so QA page can display it)

---

## 8. Data Models

### Core Models

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `User` | id, email (lowercase), is_admin, profile_version, weights_version | `is_admin` gates /admin route |
| `UserProfile` | user_id, resume_text, role_description, original_role_description, goals_text, profile_complete, profile_embedding (vector 1536), preferences (JSON) | `profile_complete` gates dashboard |
| `Job` | id, url, title, company, description, description_hash (MD5), description_version, embedding_vector (vector 1536), active_status, job_source | `description_hash` enables zero-cost deduplication |
| `JobMatch` | user_id, job_id, match_run_id, per_dimension_scores (JSON), dimension_data_available (JSON), dimension_score_confidence (JSON), weighted_score, normalized_score, low_confidence_flag | One row per user per job per run |
| `FeedbackEvent` | feedback_event_id, user_id, job_id, signal_type, signal_value, commentary, timestamp | Immutable — append only, never modified |
| `JobUserState` | user_id, job_id, current_status, shown_at, last_interaction_at | Current status — separate from immutable log |
| `LearnedWeights` | user_id, skills_match, industry_alignment, experience_level, function_type, salary, career_trajectory, weights_version | Dynamic per-user dimension weights |
| `ShownJobMemory` | user_id, job_id, shown_at | Permanent shown history — never deleted |
| `ActivityLog` | user_id, event_type, event_data (JSON), created_at | Powers QA page activity stream |

### Intelligence Models

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `CompanyInsight` | company_id, accountability_score, response_rate, ghosting_rate, avg_response_time, culture_signals, trust_score | Updated weekly |
| `CompanyHiringSnapshot` | source_slug, snapshot_date, active_job_count, new_jobs_since_yesterday, removed_jobs_since_yesterday, jobs_by_department/seniority/location (JSON) | One row per company per day |
| `JobDescriptionHistory` | job_id, description_text, description_hash, version_number, valid_from, valid_to | Append-only — new row only when hash changes |
| `SourceTrustScore` | source_slug, rolling_trust_score, dead_link_pct, parse_success_pct | Rolling 30-day window |
| `UserInsight` | user_id, insight_text, interaction_count, signal_tier (weak/strong) | Tiered by interaction count |
| `WeeklyRecapState` | user_id, job_id, recap_sent_at | Ensures max 1 recap per job per user |
| `OrchestrationLog` | match_run_id, user_id, run_date, jobs_delivered, llm_calls_made, llm_cost, fallback_triggered | Full pipeline run history |

### Admin / Monitoring Models

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `AgentLog` | agent_name, timestamp, message, details (JSON), log_level, run_id | Powers activity log in admin |
| `AdminAlert` | severity, title, metric_name, metric_value, threshold_value, baseline_comparison, failure_type, triggered_at, dismissed_at | Alert deduplication via suppressed_until |
| `TestAgentMetrics` | run_date, precision_at_50, precision_at_15, recall_at_50, ndcg, coverage, false_positive_rate, drift_flags (JSON), baseline_7day (JSON) | Daily evaluation snapshot |
| `AlertThresholds` | metric_name, warning_threshold, critical_threshold | Editable via admin gear icon |
| `EvaluatedJob` | run_date, job_id, user_id, label_source, relevance_label, confidence_weight, near_miss | Ground truth for evaluation metrics |

---

## 9. Daily Pipeline Schedule

All times UTC. Designed so US users see fresh results when they wake up.

```
3:00 AM UTC   Search Agent — scrape 41 career pages
              Phase A: HTTP HEAD health check per job URL
              Phase C: Company hiring snapshots
              Phase C: Job description versioning
              (10 PM EST / 7 PM PST previous day)

4:00 AM UTC   Vector Index — rebuild HNSW index
              (11 PM EST / 8 PM PST)

5:00 AM UTC   Matching Pipeline — Filter Agent + Matching Agent
              per user (all users run in sequence)
              (12 AM EST / 9 PM PST)

6:00 AM UTC   Insights Agent — user behavioral insights
              (1 AM EST / 10 PM PST)

7:00 AM UTC   Email Agent — daily digest delivery
              (2 AM EST / 11 PM PST)

9:00 AM UTC   All processing confirmed complete
              (4 AM EST — East Coast users wake up
               to fresh results)

Weekly Monday:
5:00 AM UTC   Company scores updated
6:00 AM UTC   Weekly recap emails sent
6:30 AM UTC   Company insights regenerated
```

---

## 10. Admin Dashboard

Route: `/admin` — only accessible when `user.is_admin = true`. Own layout, no shared sidebar. Desktop only.

### Section 1 — Pipeline Status Bar
Full-width banner: green/amber/red health indicator, last run timestamp, next scheduled run, users processed, average match score, total LLM cost today broken down by Call 1 Haiku vs Call 2 Sonnet.

### Section 2 — Recommended Actions
Up to 5 cards sorted by severity. Rule-based root cause grouping:

| Signal Pattern | Root Cause | Action |
|----------------|------------|--------|
| Precision↓ + Coverage↓ + Near misses↑ | Over-filtering | Relax similarity thresholds |
| Thumbs up↓ + Score stable | Score calibration drift | Review dimension weights |
| Source jobs↓ + Precision stable | Scraper quality degrading | Investigate source trust |

CRITICAL triggers: Precision@50 < 0.65, pipeline not complete by 9 AM, >5% users received zero jobs, LLM failure rate > 10%.

### Section 3 — Metric Cards (5 cards)
Match Quality, Precision Metrics, LLM Cost Breakdown, Source Health, User Activity.

### Section 4 — Test Agent Evaluation
All 6 metrics with today value, 7-day baseline, delta, color indicator:

| Metric | Green | Amber | Red |
|--------|-------|-------|-----|
| Precision@50 | >0.80 | 0.65-0.80 | <0.65 |
| Precision@15 | >0.85 | 0.75-0.85 | <0.75 |
| Recall@50 (estimated) | shown with sample size | — | — |
| NDCG | >0.80 | 0.65-0.80 | <0.65 |
| Coverage | standard | — | — |
| False Positive Rate | <0.20 | 0.20-0.35 | >0.35 |

Drift Detection Panel: embedding distribution shift, job category shift >10%, average score shift >8 points, precision drop >10% vs baseline.

### Section 5 — Pipeline Funnel + Activity Log
Left: Step-down funnel showing job counts at each stage (scraped → hard constraints → soft constraints → top 50 → top 15 → delivered). Right: Agent activity log, color-coded by agent, auto-refresh 60s.

### Section 6 — Match Quality Charts
Line chart (average match score, 30 days) + bar chart (score distribution by bucket, today).

### Section 7 — Source Health Table
All 41 sources: jobs today, % change vs yesterday, trust score, status (Healthy/Degraded/Failed). Expandable rows with 7-day mini chart and error details.

### Section 8 — Alert System
Active alerts with severity, triggering metric, baseline comparison, failure type (data/model/infra), dismiss + investigate buttons. Duplicate suppression within 24h; grouping when 3+ share root cause.

### Section 9 — User Activity Summary
6 stat boxes: active users, new profiles, feedback signals, cold start graduations, applied signals, interview signals — each with change vs yesterday.

### Section 10 — Job Scoring Explorer
Search by user email or job title. Table showing all scored jobs: user, title, company, match score, Top 50/Top 15 membership, rejection stage, reaction. Expanded row shows all 6 dimension scores with bar charts, rejection reason, Call 2 reasoning.

Near Misses tab: jobs that passed hard constraints, scored above 0.60 on BGE-small, but didn't reach top 15.

Replay Mode: select a user, adjust thresholds/weights, re-run pipeline against stored job data, see side-by-side original vs new top 15.

### Section 11 — Weight Evolution
Tab 1: Platform average — all 6 dimensions over 30 days (line chart). Tab 2: Individual user — weight history + feedback history + current weights as bar chart.

### QA Dashboard (`/feedback`)

The QA Dashboard is accessible to all authenticated users but behaves differently based on role:

- **Admin users:** On load, calls `GET /admin/users` to fetch the full user list. A dropdown renders at the top of the page listing every user by email. Selecting any user reloads the activity stream for that user — allows the founder to inspect any user's exact interaction history, commentary, weight updates, and pipeline events.
- **Non-admin users:** `GET /admin/users` returns 403, which is caught silently. The dropdown shows only their own account. Activity stream shows their own events.

Activity stream events shown: thumbs up/down, clicks, commentary (with text inline), applied, interview, email sent, recap sent, profile updated, weights updated, cold start graduation, LLM scored, jobs delivered, filter run, dashboard visit.

**Commentary events** appear in the stream with the comment text shown inline (e.g., `"Halliburton — commented: "too much travel"`). These are populated from `ActivityLog` rows with `event_type = "commentary"`.

### Admin Debug Page (Pipeline Step-by-Step)

Separate from the main admin dashboard. Allows founder to step through the pipeline manually for any user:

**Steps (each independently triggerable):**
1. Check Profile
2. LLM 1 Score (Haiku batch scoring)
3. LLM 2 Score (Haiku reorder pass) — separate step, `skip_reorder=True` on LLM 1
4. Check Matches
5. Delivery Preview

LLM 2 results section shows: ranking table (LLM 1 rank → LLM 2 rank per job, ▲ green / ▼ red indicators), reasoning card, profile_gap banner — all admin-only.

---

## 11. Tech Stack

### AI / ML

| Layer | Technology | Notes |
|-------|-----------|-------|
| Profile parsing | Claude Sonnet | Resume → structured profile |
| Batch scoring (Call 1) | Claude Haiku | ~$0.005/user/day |
| Reorder pass (LLM 2) | Claude Haiku | Only when intent signals set |
| Decision content (Call 2) | Claude Sonnet | Active users only, cached |
| Commentary NLP | Claude Haiku | Dimension/direction/confidence extraction |
| Profile embedding | OpenAI text-embedding-3-small | 1536d, $0.02/1M tokens |
| Job embedding | OpenAI text-embedding-3-small | 1536d, embedded at ingestion |
| LLM abstraction | `llm/client.py` | Provider-agnostic — swap via `LLM_PROVIDER` env var |

**Two-LLM architecture rationale:**
- Call 1 (Haiku): batch scoring of 10–15 jobs — speed and cost matter, structured output only
- Call 2 (Sonnet): nuanced advisor content for top 3 jobs — quality matters, cached aggressively
- Reorder (Haiku): career direction judgment — fast, binary output
- Commentary (Haiku): dimension attribution — fast, structured output

**LinkedIn "People in your network" removed:** LinkedIn Connections API closed to third parties since 2015. Feature is not deliverable. Removed from DetailsDrawer, Settings, and Privacy page.

### Vector Database

| Volume | Solution | Cost |
|--------|---------|------|
| Beta (current) | pgvector on existing PostgreSQL | $0 |
| 10K–50K users | Qdrant self-hosted | $50–200/mo |
| 50K–100K+ | Qdrant cluster or Pinecone | $200–500/mo |

Current: HNSW cosine index on `jobs.embedding_vector vector(1536)`. Query time: ~2ms.

Embedding backend switchable via `EMBEDDING_BACKEND` env var:
- `openai` (current): API calls to OpenAI
- `local` (future, at 100+ DAU): BAAI/bge-small-en-v1.5 + bge-large-en-v1.5 (~2.1GB RAM, requires Render Pro at $85/mo)

### Database

PostgreSQL on Render. Migrations via Alembic (auto-run at deploy: `alembic upgrade head`). pgvector extension installed.

### Email

SendGrid API. Daily digest + weekly recap. Reply-to address `feedback+{user_id}@stellapath.app` with webhook for inbound reply processing (endpoint: `POST /webhooks/email-reply`).

---

## 12. Infrastructure & Deployment

### Render Services

| Service | Type | Branch | URL |
|---------|------|--------|-----|
| jobmatch-qqms | Web Service (backend) | prod | jobmatch-qqms.onrender.com |
| jobmatch-dev | Web Service (backend) | dev | jobmatch-dev.onrender.com |
| jobmatch-76c4 | Static Site (frontend) | prod | jobmatch-76c4.onrender.com |
| jobmatch-dev-static | Static Site (frontend) | dev | jobmatch-dev-static.onrender.com |
| jobmatch-db | PostgreSQL | — | Internal only (prod) |
| jobmatch-db-dev | PostgreSQL | — | Internal only (dev) |

### Branch Structure

```
dev    → deploys to dev Render services (test here first)
prod   → deploys to prod Render services (production)
master → no Render service attached (unused for deployment)
```

**Deployment flow: `dev → prod` directly, skip master.**

### Deploy Procedure

```
git stash   (if any uncommitted local changes)
git checkout prod
git merge dev --no-edit
git push origin prod
git checkout dev
git stash pop
```

Watch Render dashboard — both jobmatch-76c4 (frontend) and jobmatch-qqms (backend) auto-deploy within 1–2 minutes.

**Rule: Always ask for explicit confirmation before pushing to prod. Never auto-push.**

### Environment Variables (Render dashboard)

```
DATABASE_URL        Internal PostgreSQL URL (postgresql+asyncpg://)
LLM_PROVIDER        claude
ANTHROPIC_API_KEY   Anthropic API key
OPENAI_API_KEY      OpenAI API key (embeddings)
SENDGRID_API_KEY    SendGrid (pending configuration)
FROM_EMAIL          reza.rah@gmail.com (temporary — switch to digest@stellapath.app once sender domain verified in SendGrid)
FROM_NAME           Stellapath
PIPELINE_TIMEZONE   UTC
EMBEDDING_BACKEND   openai
VITE_API_URL        (frontend env var — backend URL)
```

---

## 13. Cost Model

### Per user per month (25% buffer for retries and spikes)

```
LLM (Call 1 + Call 2, 25% buffer):   ~$0.24
Embeddings (OpenAI):                   $0.03
Database:                              $0.03
Vector search (pgvector):              $0.00
Email (SendGrid):                      $0.01
Infrastructure:                        $0.05
─────────────────────────────────────────────
Total cost per user:                  ~$0.36/month
Revenue per user:                    $10.00/month
Gross margin:                         96.4%
```

Note: Embedding cost drops to ~$0.00 when switching to local BGE at 100+ DAU (Render Pro, $85/mo).

### Monthly by scale

| Users | LLM Cost | Total Tech | Revenue |
|-------|---------|-----------|---------|
| 500 | $120 | $150 | $5,000 |
| 1K | $240 | $300 | $10,000 |
| 10K | $2,400 | $3,500 | $100,000 |
| 50K | $12,000 | $18,000 | $500,000 |
| 100K | $24,000 | $35,000 | $1,000,000 |

---

## 14. Security & Privacy

- All secrets in Render environment variables — never committed to GitHub
- Local dev: `.env` file (gitignored); template: `.env.example` (committed, no secrets)
- Resume sent to Anthropic API for parsing only — not stored by Anthropic beyond the API call
- Profile summary (role description, skills, sectors) sent to OpenAI for embedding — not stored or used for training (API policy)
- User data used only for job matching — never sold or shared
- Deletable on user request
- `is_admin` flag required for `/admin` route — verified via API on every page load (not just localStorage)

**Current privacy statement:**
> "Resume content is processed by Anthropic for profile parsing only. A summary of your job preferences (not your full resume) is sent to OpenAI for embedding-based matching. Neither provider stores or trains on this data. You are in control of your data and can request deletion at any time."

---

## 15. Failure Modes & Recovery

| Component | Primary | Secondary | Tertiary |
|-----------|---------|----------|---------|
| LLM failure | Retry once after 30s | Deliver last successful matches ("from yesterday" label) | Skip delivery, notify next day |
| Scraping failure (per source) | Retry after 1 hour | Use yesterday's jobs for that source | Log and alert, continue with others, reduce trust score |
| Vector DB failure | Fall back to heuristic-only filtering | Skip embedding stage, pass top 40 heuristic results to LLM | Alert, continue with degraded quality |
| Email delivery failure | Retry after 10 min (3 attempts) | Queue for next delivery window | Log missed delivery, attempt next day |
| URL returns 404 | Mark job inactive immediately, remove from pools and index | — | — |

---

## 16. What Is Not In Beta (Phase 2/3)

### Phase 2 (post-beta)

- LinkedIn profile import (Sign In with LinkedIn — name, headline, experience pre-fill only; Connections API closed, warm-intro feature not deliverable)
- Advanced company accountability scoring
- Course recommendations
- Recruiter connection feature
- Premium subscription tier
- Hiring probability ML model
- Direct placement to recruiters
- Monitoring Service (split from Orchestration Agent)
- Qdrant cluster / Pinecone
- Redis + Celery job queue
- LLM-generated Recommended Actions (replacing rules-based v1)

### Phase 3 (2027+)

- High school module
- Enterprise career tracking
- Cross-encoder reranking evaluation
- Data licensing
- Multilingual support

---

## 17. Scaling Architecture

| Scale | Vector DB | Job Queue | Workers | Est. Cost/month |
|-------|---------|---------|---------|----------------|
| 500 users | pgvector | APScheduler in-process | 1 | ~$150 |
| 1K users | pgvector | APScheduler | 1 | ~$300 |
| 10K users | Qdrant self-hosted | Redis + Celery | 5–10 | ~$800 |
| 50K users | Qdrant cluster | Redis + Celery | 20–30 | ~$5,000 |
| 100K users | Qdrant cluster or Pinecone | Redis + Celery | 50+ | ~$18,000 |

### Architectural guarantees that survive to 100K

- Filter-before-LLM principle: SQL and embeddings are cheap; LLMs are batched per user (max 2/day)
- Provider-agnostic LLM layer: swap models via env var with zero code changes
- Embedding backend switchable: `EMBEDDING_BACKEND=openai|local`
- Three core concept separation (search relevance / match score / user intent state) means the feedback loop remains clean regardless of scale
- No redesign required below 100K users — only infrastructure upgrades

---

*Document prepared: May 2, 2026 — Beta release. Internal use only.*
