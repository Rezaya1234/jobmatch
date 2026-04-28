# Stellapath — System Architecture

*Last updated: April 2026*
*Version: MVP*

---

## 1. Architecture Overview

Stellapath is a closed-loop career optimization system — not a job board. It delivers 3 personalized job recommendations daily to each user, learns from every interaction, and continuously improves match quality over time through a feedback-driven weight learning system.

### Core design principles

- Precision first, but maintain minimum recall to ensure discovery — never leave a user with zero jobs
- Filter aggressively before any LLM usage — SQL and embeddings are free, LLM calls are not
- Batch all LLM calls — maximum 2 per user per day
- Open source models for embedding — zero API cost
- Provider-agnostic LLM layer — swap models via env var with zero code changes
- Separate search relevance, match score, and user intent state — never mix these three concepts
- Scale from 500 beta users to 100,000+ without architectural redesign
- Every component has a documented failure mode

### Daily pipeline schedule (US-optimized)

All times UTC. Designed so US users see fresh results when they wake up.

```
3:00 AM UTC  Scraping + job health checks
             (10 PM EST / 7 PM PST previous day)
4:00 AM UTC  Vector index rebuild
             (11 PM EST / 8 PM PST previous day)
5:00 AM UTC  Matching pipeline runs for all users
             (12 AM EST / 9 PM PST previous day)
6:00 AM UTC  Insights Agent updates
             (1 AM EST / 10 PM PST previous day)
7:00 AM UTC  Email delivery begins
             (2 AM EST / 11 PM PST previous day)
9:00 AM UTC  All processing confirmed complete
             (4 AM EST / 1 AM PST)
             East Coast users wake up to fresh results
             West Coast results ready by 6 AM PST

Weekly:
Monday 5:00 AM UTC  Company scores updated
Monday 6:00 AM UTC  Weekly recap emails sent
```

### End-to-end daily flow

```
PROFILE AGENT (onboarding only)
↓
SEARCH AGENT (3:00 AM UTC) — global scraper, no user context
✅ Scrape 41 company career pages → deduplicate by URL →
   mark closed jobs inactive → re-activate returned jobs →
   enforce 10k job cap
✅ Phase A: HTTP HEAD health check per job → source trust
   scoring (rolling 30 days) → alert if trust < 0.70 →
   skip sources with trust < 0.50
🔲 Phase C: Save CompanyHiringSnapshot (once per company per day) →
   check description MD5 hash → write JobDescriptionHistory only
   on change → no new services, no cost increase
↓
VECTOR INDEX (4:00 AM UTC)
Rebuild daily embedding index
↓
FILTER AGENT (5:00 AM UTC) — per user
✅ Hard constraint filtering (job type, work mode, location,
   visa sponsorship, excluded titles, excluded companies)
✅ Phase B: soft constraint filtering (salary, role type,
   experience, seniority) → heuristic scoring (keyword +
   title overlap) → Stage 1 BGE-small (threshold 0.60,
   0.50 cold start) → Stage 2 BGE-large (threshold 0.70) →
   remove shown job IDs → enforce top 10-15
↓
MATCHING AGENT (5:00 AM UTC)
Compress jobs → validate weights →
Call 1 batch LLM score → compute in code →
normalize → rank → top 3 per user
Call 2 (active users only, cached)
↓
ORCHESTRATION AGENT
Remove shown jobs → fallback if needed →
label fallback jobs → update shown memory
↓
EMAIL AGENT (7:00 AM UTC)
Single link to personalized dashboard →
deliver to user inbox
↓
USER INTERACTION
Dashboard → review jobs → feedback
↓
FEEDBACK AGENT (real-time)
Log event → update job_user_state →
attribute to dimensions → update weights
↓
INSIGHTS AGENT (6:00 AM UTC)
Update company scores →
update user behavioral insights
↓
VECTOR INDEX (4:00 AM UTC)
Rebuild daily embedding index
```

---

## 2. Three Core Concepts — Never Mix These

The entire architecture is built on strict separation of these three concepts. Mixing them causes feedback loop corruption, ranking instability, and model confusion.

### Concept 1 — Search Relevance
```
What:    Did this job pass filters and embedding
         similarity for this user?
Owner:   Search Agent
Used for: Candidate selection only
Stored:  Heuristic score + embedding similarity score
NOT the same as: Match score
```

### Concept 2 — Match Score
```
What:    How well does this job fit this user's
         profile and learned weights?
Owner:   Matching Agent
Used for: Ranking and delivery
Stored:  Per-dimension scores, weighted score,
         normalized score
NOT the same as: Search relevance or user intent
```

### Concept 3 — User Intent State
```
What:    What did the user actually do with this job?
Owner:   Feedback Agent
Used for: Learning and outcome tracking
Stored:  job_user_state (current) +
         feedback_event_log (immutable history)
NOT the same as: Match score
```

---

## 3. Constraint System

### Hard constraints — Filter Agent enforces

Zero exceptions. One violation = immediate discard. Never relaxed under any circumstances including fallback.

```
CONSTRAINT 1 — Location type
Rule:  Must match exactly (remote/hybrid/onsite)
Note:  Job location data is inconsistent —
       "onsite" sometimes allows remote,
       "hybrid" is defined differently per company.

CONSTRAINT 2 — Visa sponsorship
Rule:  Must offer sponsorship if user requires it

CONSTRAINT 3 — Excluded job titles
Rule:  Title must not contain excluded keywords

CONSTRAINT 4 — Excluded companies
Rule:  Company must not be on user blacklist

CONSTRAINT 5 — Previously shown jobs
Rule:  Job ID must not exist in shown memory (permanent)

CONSTRAINT 6 — Job active status
Rule:  URL must be verified live and active
```

### Soft constraints — relaxable in fallback

Applied after hard constraints pass. Relaxed in defined order during fallback delivery.

```
SOFT 1 — Salary minimum floor
Rule:        Job max salary >= user minimum
Relaxation:  ±10% in fallback

SOFT 2 — Role type
Rule:        Must match IC/manager/executive
Relaxation:  Adjacent role type in fallback

SOFT 3 — Experience floor
Rule:        Job minimum <= user experience + 2 years
Relaxation:  ±2 years in fallback

SOFT 4 — Seniority ceiling
Rule:        Job level <= user level + 1
Relaxation:  One additional level in fallback
```

---

## 4. Agent Architecture Table

| Agent | Executive Summary | Responsibilities | Flow | Technology Stack |
|-------|------------------|-----------------|------|-----------------|
| **Profile Agent** | Builds a structured understanding of who the user is and what they want before matching begins. Sets the foundation for all downstream personalization. | 1. Parse resume and extract structured profile (skills, experience, preferences, dealbreakers) 2. Initialize cold start weights for new users 3. Flag user as cold_start: true until 5 feedback signals accumulated 4. Optional enrichment via LinkedIn and GitHub URLs 5. Trigger weight recalibration on preference updates | INPUT: Raw resume, preferences, optional LinkedIn/GitHub URL HARD CONSTRAINTS INITIALIZED: Location type, visa requirement, excluded titles, excluded companies SOFT CONSTRAINTS INITIALIZED: Salary floor, role type, experience floor, seniority ceiling COLD START WEIGHTS: skills_match: 0.35, experience_level: 0.25, salary: 0.20, industry_alignment: 0.10, function_type: 0.05, career_trajectory: 0.05 PROCESS: Extract structured profile → set default weights → flag cold start → store OUTPUT: Structured user profile → PostgreSQL → cold start flag and weights to Orchestration Agent | Python 3.12, FastAPI, SQLAlchemy, Claude Sonnet (profile parsing — resume content sent to Anthropic API only), PostgreSQL |
| **Search Agent** | Global job scraper and source health monitor. Fetches all 41 company career pages daily, syncs to DB, and tracks per-source reliability. No user context — runs once per day at 3:00 AM UTC. | ✅ 1. Scrape 41 company career pages at 3:00 AM UTC ✅ 2. Deduplicate by URL — ON CONFLICT DO NOTHING ✅ 3. Mark closed jobs inactive (no longer in ATS feed) ✅ 4. Re-activate jobs that reappear in ATS ✅ 5. Enforce 10k job cap — remove oldest inactive jobs with no feedback ✅ Phase A — 6. HTTP HEAD health check per active job URL — mark inactive if 404/410 ✅ Phase A — 7. Track per-source trust score: jobs_returned, parse_success_rate, dead_link_pct (rolling 30 days) ✅ Phase A — 8. Log warning if source trust score drops below 0.70 ✅ Phase A — 9. Skip scrape for sources with trust score below 0.50
🔲 Phase C — 10. Save CompanyHiringSnapshot — per company per day: active_job_count, new_jobs_since_yesterday, removed_jobs_since_yesterday, jobs_by_department/seniority/location (JSON) — upsert on company_id + snapshot_date
🔲 Phase C — 11. Check description changes — MD5 hash each scraped description, compare to Job.description_hash, write JobDescriptionHistory row only if different, always update last_seen_at | INPUT: COMPANY_SOURCES (41 entries) SCRAPER HEALTH: Per source — last successful scrape timestamp, jobs returned vs yesterday, parse success/fail count. Alert if delta drops >50% or source returns zero. PHASE A NEW MODEL: SourceTrustScore — source_slug, jobs_returned_today, jobs_returned_yesterday, parse_success_count, parse_fail_count, dead_link_count, rolling_trust_score, last_scrape_at OUTPUT: Active job rows in PostgreSQL. SourceTrustScore rows updated per source. | Python 3.12, httpx (async), ats_fetchers, company_sources, SQLAlchemy, PostgreSQL |
| **Filter Agent** | Per-user candidate selector. Applies hard and soft constraints, scores by relevance, filters by embedding similarity, and returns top 10-15 candidates per user for the Matching Agent. Precision first — maintains minimum recall so users always get jobs. | ✅ 1. Apply hard constraints: job type, work mode, location, visa sponsorship, excluded titles, excluded companies ✅ 2. Write pass/fail to job_matches with failure reason ✅ 3. Give benefit of the doubt when job field data is missing ✅ Phase B — 4. Apply soft constraints: salary floor (±10% relaxation in fallback), role type, experience floor (±2yr), seniority ceiling (±1 level) ✅ Phase B — 5. Heuristic scoring: keyword overlap between job title/description and user skills/title keywords ✅ Phase B — 6. Stage 1 BGE-small embedding similarity (threshold 0.60 — relax to 0.50 for cold start users with fewer than 10 interactions) ✅ Phase B — 7. Stage 2 BGE-large quality filter on top-50 from Stage 1 (threshold 0.70) ✅ Phase B — 8. Remove previously shown job IDs (query ShownJobMemory) ✅ Phase B — 9. Enforce max 10-15 output — pass to Matching Agent. If fewer than 3 survive → signal fallback to Orchestration Agent | INPUT: User profile (hard + soft constraints, cold_start flag, weights_version), all active jobs in PostgreSQL, ShownJobMemory for this user COLD START: Users with fewer than 10 interactions — BGE-small threshold relaxed from 0.60 to 0.50 to ensure minimum discovery PHASE B NEW DEPENDENCY: ShownJobMemory table — user_id, job_id, shown_at (create if not exists) OUTPUT: Top 10-15 job candidates → Matching Agent. If fewer than 3 survive hard constraints → fallback signal to Orchestration Agent | Python 3.12, SQLAlchemy, PostgreSQL, sentence-transformers (BAAI/bge-small-en-v1.5 384d ~8ms, BAAI/bge-large-en-v1.5 1024d ~45ms), spaCy, pgvector |
| **Matching Agent** | The AI brain. Scores all filtered jobs in a single LLM call with explicit weighted dimensions. Computes final scores in code. Maximum 2 LLM calls per user per day. | 1. Receive top 10-15 jobs 2. Compress each job to ~300 tokens using spaCy 3. Check dimension_data_available and confidence flags per dimension per job 4. If salary missing — exclude from scoring, re-normalize remaining weights to sum to 1.0 5. Validate all weights sum to 1.0 before every LLM call 6. Batch ALL jobs into single Call 1 7. Compute weighted scores in code — never inside LLM 8. Normalize final scores 9. Flag low confidence jobs (2+ dimensions ambiguous) 10. Conditional Call 2 — structured decision content on top 3, active users only, cached per user_id + job_id + profile_version 11. Invalidate Call 2 cache when profile_version changes, weights shift >0.10 in any dimension, job_updated_at changes, or 7-day TTL expires | INPUT: Top 10-15 compressed jobs, user profile summary, dimension weights, cold start flag, dimension_data_available flags, dimension confidence levels ALLOWED DIMENSIONS — exactly these 6: skills_match, industry_alignment, experience_level, function_type, salary (excluded if data unavailable — weights re-normalized), career_trajectory DIMENSION CONFIDENCE LEVELS (per dimension per job): score: 0.0-1.0 or null, data_available: true/false, confidence: high/medium/low WEIGHT RULES: Sum to 1.0. No dimension above 0.50. No dimension below 0.05. Re-normalize if salary excluded. CALL 1 (always): Batch all jobs + weights + hallucination prevention → parse JSON → compute scores in code → normalize → rank CALL 2 (conditional, cached): Produces: why worth pursuing (2-3 sentences), what might hold user back, suggested course gaps, confidence level (high/medium/low), advisor-style summary. Cache key: user_id + job_id + profile_version. Invalidated by: profile_version change, >0.10 weight shift, job update, 7-day TTL. OUTPUT: Ranked list with per-dimension scores, confidence levels, weighted scores, normalized scores, low confidence flags, Call 2 structured content where cached | Python 3.12, Claude Haiku (Call 1), Claude Sonnet (Call 2 — conditional, cached), spaCy, JSON parsing with regex fallback, FastAPI |
| **Feedback Agent** | The learning engine. Converts every user interaction into structured signals that make tomorrow's matches smarter. Maintains immutable event history and separate current state. | 1. Log all feedback to immutable event log 2. Update job_user_state separately — never overwrite event log 3. Collect signals with standardized values 4. Trigger weight update every 5 signals 5. Immediate trigger on applied, interview, or hired 6. Attribute signals to matching dimensions 7. Extract themes from commentary using LLM 8. Enforce drift protection — floor 0.05, ceiling 0.50 9. Normalize weights — always sum to 1.0 10. Increment weights_version on every update 11. Persist updated weights | INPUT: Feedback events — type, job_id, dimension scores, timestamp, optional commentary SIGNAL VALUES: thumbs_up: +2, thumbs_down: -2, click: +1, apply_click: +1, applied: +3 (immediate), not_interested: -1, interview: +4 (immediate), hired: +5 (immediate) STATE MANAGEMENT: feedback_event_log — immutable, append only. job_user_state — current status per user-job pair, updated on each interaction. DIMENSION ATTRIBUTION: Strong skills_match on liked jobs → increase skills_match. Disliked for seniority → decrease experience_level. Commentary "wrong function" → adjust function_type. Applied/interview → treat dimension scores as strong anchor. DRIFT PROTECTION: No dimension above 0.50. No dimension below 0.05. Enforced after every update. OUTPUT: Updated normalized weights → increment weights_version → PostgreSQL → available for next cycle | Python 3.12, Claude Haiku (commentary NLP — conditional), SQLAlchemy, PostgreSQL, FastAPI |
| **Insights Agent** | The intelligence layer for company and career behavioral data. Owns company profiles, culture scores, hiring behavior patterns, and user-level career behavioral insights. Runs on its own cadence — not part of daily matching pipeline. | 1. Aggregate company behavioral data from feedback events — response rates, ghosting patterns, time to respond 2. Compute company accountability scores 3. Generate company profiles — size, stage, hiring behavior, culture rating 4. Generate user behavioral insights with tiered thresholds 5. Feed company snapshot to Matching Agent Call 2 6. Feed insights to Company Insights page and Dashboard 7. Update company scores weekly (Monday 5:00 AM UTC) 8. Update user insights daily (6:00 AM UTC) | INPUT: Aggregated feedback events (company behavior), individual user interaction history INSIGHT TIERS — user behavioral insights: <5 interactions: no insights — show "Interact with more jobs to unlock insights" 5-15 interactions: weak signals with caveat — "Early patterns based on limited interactions" 15+ interactions: strong signals — show confidently COMPANY INSIGHT PROCESS: Aggregate feedback per company → compute response rate, ghosting rate, avg response time → generate accountability score → store per company CADENCE: Company scores: Monday 5:00 AM UTC. User insights: daily 6:00 AM UTC. API RESPONSE (GET /companies/{slug}): hiring_velocity {jobs_today, jobs_7_days_ago, jobs_30_days_ago, week_change, week_change_pct, month_change, month_change_pct, trend, data_available, snapshot_date} — computed from CompanyHiringSnapshot; department_breakdown [{department, count, pct}] — top 6 + Other; user_feedback_count int — distinct users with FeedbackEvents for this company's jobs. OUTPUT: Company profiles and scores → Company Insights page and Matching Agent Call 2. User insights → Dashboard Matching Insights section. | Python 3.12, Claude Haiku (insight generation), SQLAlchemy, PostgreSQL, FastAPI |
| **Orchestration Agent** | The conductor. Coordinates every agent in the correct sequence for every user every day. Enforces cost controls and delivery guarantee. Note: Long-term, monitoring responsibilities will split into a separate Monitoring Service (Phase 2). | 1. Receive daily trigger at 5:00 AM UTC 2. Check cold start flag per user → select weights 3. Trigger Search Agent → receive candidates 4. If fewer than 3 survive hard filtering → skip Matching Agent → go to fallback 5. Trigger Matching Agent → receive ranked jobs 6. Remove previously shown job IDs 7. Apply 3-job delivery guarantee with fallback 8. Label fallback jobs transparently — "Exploratory match" pill, gray, never presented as top recommendations 9. Deliver top 3 via Email Agent 10. Update shown job memory permanently 11. Route feedback to Feedback Agent 12. Trigger Insights Agent at 6:00 AM UTC 13. Enforce max 2 LLM calls per user per day 14. Alert if per-user LLM cost exceeds $1.50/month 15. Trigger weekly recap Monday 6:00 AM UTC 16. Log all runs via match_run_id | INPUT: Scheduled trigger → user list → profiles, weights, shown memory, cold start flags FALLBACK SEQUENCE: Step 1: Relax salary floor ±10% Step 2: Relax experience floor ±2 years Step 3: Relax seniority ceiling one level Step 4: Relax role type to adjacent Step 5: Pull from unseen active jobs last 7 days — verify URL live Step 6: Deliver 1-2 jobs with message "Fewer matches today" FALLBACK LABELS: Standard: no label. Fallback: "Exploratory match" gray pill. Tooltip: "Outside your usual preferences — fewer strong matches today." Hard constraints NEVER relaxed. COST CONTROLS: Max 10-15 jobs to Matching Agent. Max 2 LLM calls per user per day. $1.50/month alert per user. FUTURE SPLIT (Phase 2): Pipeline control → Orchestration Agent. Metrics, logs, alerts, costs → separate Monitoring Service. OUTPUT: 3 jobs per user → email triggered → shown memory updated → state persisted → logs written | Python 3.12, APScheduler (beta) → Redis + Celery (Phase 2), FastAPI, SQLAlchemy, PostgreSQL |
| **Email Agent** | The delivery layer. Gets jobs into the user inbox every morning via a single link to the dashboard. No-reply sender — all interaction happens in the app. | 1. Receive top 3 jobs from Orchestration Agent 2. Render Stellapath-branded HTML email 3. Send daily digest at 7:00 AM UTC — single link to dashboard (no-reply) 4. Send weekly recap — missed high-score active jobs only, max 1 recap per job per user ever | INPUT: Top 3 jobs with scores, user name, email, ID DAILY DIGEST: Single dashboard link (not 3 job links). No-reply sender. Stellapath branding. First name greeting. "Your 3 matches for today" teaser. WEEKLY RECAP (Monday 6:00 AM UTC): Jobs from last 7 days, score ≥ 85%, zero interaction, URL verified active, max 1 recap per job per user. OUTPUT: Email delivered → user clicks link → reviews and reacts to jobs on dashboard | Python 3.12, SendGrid API, Jinja2, FastAPI |
| **Vector Index** | The speed layer. Pre-computes and indexes all job embeddings daily so each user's ANN search returns top candidates in ~2ms regardless of how many jobs exist. | 1. Rebuild index daily at 4:00 AM UTC 2. Embed all active jobs using BGE-small (384d) 3. Store in vector index with HNSW algorithm 4. Serve per-user ANN queries in ~2ms 5. Remove inactive job embeddings 6. Scale horizontally as corpus grows | INPUT: All active job descriptions from PostgreSQL EMBEDDING: Compress → prefix "Represent this for job matching: {text}" → embed BGE-small → store HNSW QUERY: Embed user profile (1 embedding) → ANN query → top 50-100 in ~2ms → BGE-large Stage 2 SCALING: <10K users: pgvector ($0). 10K-50K: Qdrant self-hosted ($50-200/mo). 50K-100K+: Qdrant cluster or Pinecone ($200-500/mo). OUTPUT: Top 50-100 job IDs → BGE-large → top 15-20 to Matching Agent | BAAI/bge-small-en-v1.5 (384d, 8ms, $0), BAAI/bge-large-en-v1.5 (1024d, 45ms, $0), sentence-transformers, pgvector → Qdrant HNSW, PostgreSQL |

---

## 5. Data Models

| Model | Key Fields | Purpose | Version Tracking |
|-------|-----------|---------|-----------------|
| User | id, email, resume_text, preferences, cold_start, profile_version, weights_version, **is_admin** (boolean, default false) | Core user identity and preferences. is_admin gates the /admin route — redirect to main dashboard if false. | profile_version increments on any profile save; weights_version increments on every weight update |
| Job | id, url, title, company, description, active_status, job_source, job_last_seen_at, job_inactive_reason, embedding_vector, **description_hash** (MD5 varchar), **description_version** (integer, default 1), **description_last_changed_at** (timestamp) | Scraped job data. description exposed in JobResponse API model and rendered as 150-200 char truncated snippet on Open Positions job cards. Full description available in detail drawer. description_hash enables zero-cost deduplication — new JobDescriptionHistory row written only when hash changes. | job_updated_at tracked for Call 2 cache invalidation. description_version increments only on content change. |
| JobMatch | id, user_id, job_id, match_run_id, per_dimension_scores, dimension_data_available (bool per dimension), dimension_score_confidence (high/medium/low per dimension), weighted_score, normalized_score, low_confidence_flag | Match result per user per job per run | Tied to match_run_id and profile_version |
| FeedbackEvent | id, feedback_event_id, user_id, job_id, signal_type, signal_value, timestamp, interaction_source, commentary | Immutable event log — append only, never modified | feedback_event_id unique per event |
| JobUserState | user_id, job_id, current_status, shown_at, last_interaction_at, interaction_type | Current status of each user-job relationship — separate from event log | Updated on each interaction, not immutable |
| LearnedWeights | user_id, skills_match, industry_alignment, experience_level, function_type, salary, career_trajectory, weights_version, updated_at | Dynamic per-user dimension weights | weights_version increments on every update |
| ShownJobMemory | user_id, job_id, shown_at | Permanent shown job history — never deleted | Permanent — no versioning needed |
| CompanyInsight | company_id, accountability_score, response_rate, ghosting_rate, avg_response_time, culture_signals, trust_score, updated_at | Company behavioral profile from aggregated feedback | updated_at tracked weekly |
| SourceTrustScore | source_id, source_name, valid_job_pct, parsing_success_pct, dead_link_pct, rolling_trust_score, last_successful_scrape, updated_at | Per-scraper reliability tracking | Rolling 30-day window |
| UserInsight | user_id, insight_text, interaction_count, signal_tier (weak/strong), updated_at | User behavioral patterns from interaction history | interaction_count determines tier |
| WeeklyRecapState | user_id, job_id, recap_sent_at | Tracks recap appearances — max 1 per job per user | Permanent — ensures no repeat recaps |
| OrchestrationLog | match_run_id, user_id, run_date, jobs_evaluated, jobs_delivered, llm_calls_made, llm_cost, fallback_triggered, fallback_steps_used | Full pipeline run history and cost tracking | match_run_id unique per run |
| **CompanyHiringSnapshot** | id, source_slug (string — matches CompanyInsight.slug), snapshot_date (date), active_job_count, new_jobs_since_yesterday, removed_jobs_since_yesterday, jobs_by_department (JSON), jobs_by_seniority (JSON), jobs_by_location (JSON), created_at | One row per company per day — long-term hiring intelligence built from daily scrape data. Upsert on source_slug + snapshot_date. Indexed on source_slug + snapshot_date. Queried by GET /companies/{slug} to compute week/month velocity deltas and department breakdown. | snapshot_date is the natural version key |
| **AgentLog** | id, agent_name, timestamp, message, details (JSON), log_level, run_id | Append-only log of all agent activity. Feeds the Admin Dashboard activity log. Color-coded by agent in the UI. | run_id links entries to a specific pipeline run |
| **AdminAlert** | id, severity, title, description, metric_name, metric_value, threshold_value, baseline_value, baseline_comparison (text), failure_type (data/model/infra), triggered_at, dismissed_at, dismissed_by, suppressed_until | Active and historical alerts. Suppressed within 24h if same root cause. Grouped if 3+ share root cause. | dismissed_at / suppressed_until control deduplication |
| **TestAgentMetrics** | id, run_date, precision_at_50, precision_at_15, recall_at_50, ndcg, coverage, false_positive_rate, sample_size, confidence_score, drift_flags (JSON), baseline_7day (JSON), label_sources (JSON) | Daily snapshot of all 6 evaluation metrics with baselines, drift flags, and label source breakdown. | run_date is the natural key |
| **AlertThresholds** | id, metric_name, warning_threshold, critical_threshold, updated_at | Editable per-metric thresholds. Updated via gear icon in admin top bar. Defaults hard-coded as fallback if table empty. | updated_at tracks last founder edit |
| **EvaluatedJob** | id, run_date, job_id, user_id, label_source, relevance_label, confidence_weight, rejection_stage, rejection_reason, dimension_scores (JSON), near_miss (boolean) | Ground truth labels for evaluation. Three sources: LLM-as-judge, user feedback, human audit. near_miss = passed hard filter + BGE-small > 0.60 but did not reach top 15. | label_source distinguishes LLM / user / human labels |
| **JobDescriptionHistory** | id, job_id (FK), description_text (text), description_hash (varchar), version_number (integer), valid_from (timestamp), valid_to (timestamp nullable), created_at | Immutable append-only log of job description changes. New row written only when MD5 hash differs from stored hash — same hash = no record, no storage cost. Current version: valid_to IS NULL. Previous versions: valid_to set to time of next change. | version_number matches Job.description_version at time of capture |

---

## 6. Failure Modes

Every component has a documented failure response.

### LLM failure
```
Primary:    Retry once after 30 seconds
Secondary:  Deliver last successful matches
            with "matches from yesterday" label
Tertiary:   Skip delivery, notify user next day
            Log for monitoring
```

### Scraping failure (per source)
```
Primary:    Retry source after 1 hour
Secondary:  Use yesterday's jobs for that source
Tertiary:   Log and alert, continue with other
            sources, reduce source trust score
```

### Vector DB failure
```
Primary:    Fall back to heuristic-only filtering
Secondary:  Skip embedding stage, pass top 40
            heuristic results directly to LLM
            (quality degrades but system runs)
Tertiary:   Alert, continue with degraded quality
```

### Email delivery failure
```
Primary:    Retry after 10 minutes (3 attempts)
Secondary:  Queue for next delivery window
Tertiary:   Log missed delivery, attempt next day
```

### Job health check failure (URL returns 404)
```
Immediate:  Mark job as inactive in database
            Remove from all candidate pools
            Remove from vector index
            Log with job_inactive_reason
```

---

## 7. Scaling Architecture

| Scale | Vector DB | Job Queue | Workers | Estimated Cost/month |
|-------|-----------|-----------|---------|---------------------|
| 500 users | pgvector (existing PostgreSQL) | APScheduler in-process | 1 | ~$150 |
| 1K users | pgvector | APScheduler | 1 | ~$300 |
| 10K users | Qdrant self-hosted | Redis + Celery | 5-10 | ~$800 |
| 50K users | Qdrant cluster | Redis + Celery | 20-30 | ~$5,000 |
| 100K users | Qdrant cluster or Pinecone | Redis + Celery | 50+ | ~$18,000 |

---

## 8. Cost Model

### Per user per month (with 25% buffer for retries and spikes)

```
LLM (1-2 calls/day × 25% buffer):  ~$0.24
Database:                            $0.03
Vector search:                       $0.00 (beta)
Email (SendGrid):                    $0.01
Infrastructure:                      $0.05
────────────────────────────────────────────
Total cost per user:                 ~$0.33/month
Revenue per user:                    $10.00/month
Gross margin:                        96.7%
```

### Monthly cost by scale

| Scale | LLM Cost | Total Tech | Revenue (at $10/user) |
|-------|----------|------------|----------------------|
| 500 users | $120 | $150 | $5,000 |
| 1K users | $240 | $300 | $10,000 |
| 10K users | $2,400 | $3,500 | $100,000 |
| 50K users | $12,000 | $18,000 | $500,000 |
| 100K users | $24,000 | $35,000 | $1,000,000 |

### Cost alert thresholds

```
Per user per month LLM alert:   $1.50
Daily total LLM alert:          $600
Action:                         Review pipeline logs
                                Check for runaway calls
                                Verify batch sizing
```

---

## 9. MVP vs Phase Roadmap

| Feature | MVP | Phase 2 | Phase 3 |
|---------|-----|---------|---------|
| All 8 agents | ✅ | - | - |
| BGE embedding pipeline | ✅ | - | - |
| Weekly recap email | ✅ | - | - |
| Matching Agent Call 2 with caching | ✅ | - | - |
| Scraper health dashboard | ✅ | - | - |
| Company insights (basic) | ✅ | - | - |
| Company Insights detail page redesign — hiring momentum, velocity strip, department bar chart, gradient range bars, traffic light pill, timeline signals, SLUG_DOMAINS shared util | ✅ | - | - |
| Post-application feedback (in-app only) | ✅ | - | - |
| Personalized dashboard | ✅ | - | - |
| Application tracking | ✅ | - | - |
| Generic job search tab | ✅ | - | - |
| Job description snippets on Open Positions cards (150-200 chars, truncated from stored description — no extra scraping or compute) | ✅ | - | - |
| Post-hire engagement | ~~cancelled~~ | - | - |
| Fallback job labeling | ✅ | - | - |
| Strict/flexible constraint flags | ~~cancelled~~ | - | - |
| Source trust scoring | ✅ | - | - |
| Failure mode handling | ✅ | - | - |
| LinkedIn/GitHub enrichment | - | ✅ | - |
| Advanced company accountability | - | ✅ | - |
| Course recommendations | - | ✅ | - |
| Recruiter connection | - | ✅ | - |
| Premium subscription | - | ✅ | - |
| Hiring probability ML model | - | ✅ | - |
| Direct placement to recruiters | - | ✅ | - |
| Monitoring Service (split from Orchestration) | - | ✅ | - |
| Qdrant cluster / Pinecone | - | ✅ | - |
| Redis + Celery job queue | - | ✅ | - |
| High school module | - | - | ✅ |
| Enterprise career tracking | - | - | ✅ |
| Cross-encoder reranking evaluation | - | - | ✅ |
| Data licensing | - | - | ✅ |
| Multilingual support | - | - | ✅ |
| CompanyHiringSnapshot (hiring intelligence) | ✅ | - | - |
| JobDescriptionHistory (description versioning) | ✅ | - | - |
| Admin dashboard — pipeline status, metric cards, source health | ✅ | - | - |
| Admin dashboard — Test Agent evaluation + drift detection | ✅ | - | - |
| Admin dashboard — Job Scoring Explorer + Near Misses + Replay Mode | ✅ | - | - |
| Admin dashboard — Recommended Actions (rules-based v1) | ✅ | - | - |
| Admin dashboard — Recommended Actions (LLM-generated v2) | - | ✅ | - |
| Admin dashboard — Weight Evolution + Alert Threshold settings | ✅ | - | - |

---

## 10. Phase C — Long-term Hiring Intelligence

*Goal: Collect hiring intelligence over time using existing infrastructure only. No new services, no new dependencies, no cost increase.*

### Design principles

- Use existing Render PostgreSQL only
- No new paid APIs or services
- Storage cost near zero — write only on change (description versioning) or once per day per company (snapshots)
- No new dependencies — hashlib (MD5) is Python stdlib
- Piggybacks on the existing daily scrape cycle

---

### Task 1 — CompanyHiringSnapshot table

One row per company per day. Upsert (UPDATE rather than INSERT if snapshot_date already exists for that company).

```
CompanyHiringSnapshot
─────────────────────────────────────────────────
id                        UUID, primary key
source_slug               string (matches CompanyInsight.slug — same slugify logic)
snapshot_date             date (not timestamp)
active_job_count          integer
new_jobs_since_yesterday  integer  (first_seen_at = today)
removed_jobs_since_yesterday integer  (was active yesterday, gone today)
jobs_by_department        JSON  (department → count)
jobs_by_seniority         JSON  (level → count)
jobs_by_location          JSON  (remote/hybrid/onsite → count)
created_at                timestamp with timezone

Index: (source_slug, snapshot_date) — unique
```

Department classification: use job title keywords if a `department` field is not available on the scraped job.

---

### Task 2 — Job description versioning

New fields added to the existing Job table:

```
description_hash              varchar  (MD5 hex of description text)
description_version           integer  default 1
description_last_changed_at   timestamp with timezone
```

New table — append-only, never updated:

```
JobDescriptionHistory
─────────────────────────────────────────────────
id                UUID, primary key
job_id            FK → jobs
description_text  text
description_hash  varchar
version_number    integer
valid_from        timestamp with timezone
valid_to          timestamp with timezone, nullable  (NULL = current version)
created_at        timestamp with timezone
```

Save logic (runs for every job on every scrape):

```
1. Compute MD5(description_text)
2. Compare to Job.description_hash
3. If DIFFERENT:
     - Set valid_to = now() on the current JobDescriptionHistory row
     - Insert new JobDescriptionHistory row (valid_to = NULL)
     - Update Job.description_hash, description_version += 1,
       description_last_changed_at = now()
4. If SAME:
     - Update Job.last_seen_at only
     - No new history row — zero storage cost
```

Most days for most jobs: hash is identical → zero new records.

---

### Task 3 — Search Agent pipeline additions

Added at the end of every daily scrape cycle, after existing sync and health check steps:

**Step A — Save company hiring snapshot**
```
For each company scraped today:
  1. COUNT active jobs total
  2. COUNT jobs where first_seen_at = today  (new)
  3. COUNT jobs active yesterday, not today  (removed)
  4. GROUP BY department (title keyword fallback if no field)
  5. GROUP BY seniority level
  6. GROUP BY location type (remote/hybrid/onsite)
  7. UPSERT CompanyHiringSnapshot for today
```

**Step B — Check description changes**
```
For each job scraped today:
  1. Compute MD5 hash of description
  2. Compare to Job.description_hash
  3. If different → close old history row, insert new row, update Job fields
  4. If same → update last_seen_at only
```

---

### Storage optimization rules

| Rule | Reason |
|------|--------|
| Same description hash → no new JobDescriptionHistory row | Eliminates duplicate storage — most jobs don't change daily |
| CompanyHiringSnapshot: one row per company per day | Small structured data — 41 companies × 365 days = ~15k rows/year |
| FeedbackEvent stores profile_version reference, not full profile JSON | Avoids duplicating profile data across thousands of events |
| Raw HTML discarded at scrape time | Only parsed structured fields written to DB |

### Estimated storage at current volumes (41 companies)

```
CompanyHiringSnapshot:  41 rows/day × ~0.5 KB = ~20 KB/day → ~7 MB/year
JobDescriptionHistory:  ~5% of 10k jobs change per day = ~500 rows/day × ~2 KB = ~1 MB/day → ~365 MB/year (worst case)
                        Realistically <10% of that — most descriptions stable
Net new cost:           $0 (within existing Render PostgreSQL plan)
```

---

## 11. Admin Dashboard — Internal ML Control Center

*Goal: Not just monitoring — a machine learning control center enabling the founder to detect issues, understand root causes, evaluate ranking quality, and take immediate corrective action. Internal only, never visible to regular users.*

---

### Access and routing

```
Route:  /admin
Auth:   user.is_admin === true (added to User model, default false)
Guard:  If not admin → redirect to main dashboard
Layout: Own layout — no shared sidebar

Top bar:
  Left:   Stellapath logo
  Center: "Admin" badge (purple)
  Right:  Live UTC clock | Link back to main app | Gear icon (threshold settings)
```

---

### Section 1 — Pipeline Status Bar

Full-width banner at top of page.

```
Left:   Status indicator
        🟢 Healthy    — last run successful
        🟡 Degraded   — warnings present
        🔴 Failed     — critical failure

Center: Last run timestamp | Next scheduled run

Right:  Users processed | Average match score | Total LLM cost today
        Breakdown: Call 1 Haiku $X.XX | Call 2 Sonnet $X.XX | Per-user avg $X.XX
```

---

### Section 2 — Recommended Actions

*Purpose: Tell the founder what to do next.*

Max 5 cards, sorted by severity. Only visible when triggered.

Each card contains:
```
Severity:           WARNING / CRITICAL
Title:              one line
Description:        1-2 sentences
Triggering metric:  name + current value
Root cause:         inferred from signal group (rules-based v1)
Recommended action: specific next step
Dismiss button
```

Root cause grouping rules (v1 — rules-based, LLM-generated in Phase 2):

| Signal Group | Root Cause | Recommended Action |
|---|---|---|
| Precision ↓ + Coverage ↓ + Near misses ↑ | Over-filtering in ranking | Relax similarity thresholds |
| Thumbs up ↓ + Score stable | Score calibration drift | Review dimension weights |
| Source jobs ↓ + Precision stable | Scraper quality degrading | Investigate source trust scores |

CRITICAL triggers:
- Precision@50 < 0.65
- Pipeline not complete by 9 AM UTC
- >5% of users received zero jobs
- LLM failure rate > 10%

WARNING triggers:
- Precision drop >10% vs 7-day baseline
- LLM cost spike >30% day over day
- Thumbs up rate drop >15% week on week
- Source trust score below 0.70
- Source returning zero jobs
- NDCG drops >10% vs baseline

Empty state: ✅ "All systems nominal — no actions required"

---

### Section 3 — Metric Cards

Five cards in a row:

| Card | Primary Metric | Secondary | Color Rules |
|---|---|---|---|
| Match Quality | Thumbs up rate % (7-day rolling) | Trend + 14-day sparkline | standard |
| Precision Metrics | Precision@50 today | Precision@15 + trend vs 7-day baseline | green >0.80, amber 0.65-0.80, red <0.65 |
| LLM Cost Breakdown | Total cost today | Call 1 Haiku / Call 2 Sonnet / per-user avg + progress bar vs $600 budget | green <50%, amber 50-80%, red >80% |
| Source Health | "X of Y sources healthy" | Failing sources listed | green all healthy, amber 1-2 failing, red 3+ failing |
| User Activity | Users processed today | Feedback signals / cold start completions / trend vs yesterday | standard |

---

### Section 4 — Test Agent Evaluation

**Ground truth definition**

All metrics reference labeled data from three sources:

```
label_source:       "LLM" | "user" | "human"
relevance_label:    relevant / not_relevant
confidence_weight:  0.0–1.0
```

Sources: LLM-as-judge (primary), user feedback (thumbs up/down, applied, interview), human audit (founder review).

**Metrics grid — all 6 metrics**

| Metric | Description | Color Thresholds |
|---|---|---|
| Precision@50 | Relevant jobs in top 50 / 50 | green >0.80, amber 0.65-0.80, red <0.65 |
| Precision@15 | Relevant jobs in top 15 / 15 | green >0.85, amber 0.75-0.85, red <0.75 |
| Recall@50 (estimated) | Relevant in top 50 / total relevant in sample | shown with sample size |
| NDCG | Ranking quality | green >0.80, amber 0.65-0.80, red <0.65 |
| Coverage | Job type diversity | standard |
| False Positive Rate | Irrelevant jobs delivered / total delivered | green <0.20, amber 0.20-0.35, red >0.35 |

Each metric shows: today value | 7-day baseline | delta (+ or -) | color indicator

**Recall@50 estimation method**

```
Sample: 100% of Top 50 and Top 15 + 1% random stratified sample of full pool
Stratification: industry, seniority, location
Formula: Recall@50 = relevant in top 50 / total relevant in sample
Display: "Evaluated X jobs today (100% top 15, 1% full pool sample)"
```

**Confidence score**: calculated from sample size, label agreement, metric stability. Only shown when 100+ active users. Empty state: "Requires 100+ active users (currently X users)"

**Drift Detection Panel**

Title: "Drift Alerts"

Triggers:
- Embedding distribution shift exceeds threshold
- Job category distribution shifts >10%
- Average score shifts >8 points
- Precision drops >10% vs baseline

Sample alert format: "Precision dropped 12% vs 7-day baseline" | "Job category distribution changed (tech ↓ 8%, ops ↑ 6%)"

Empty state: "No drift detected"

---

### Section 5 — Pipeline Funnel + Activity Log

**Left (45%) — Pipeline Funnel**

Title: "Pipeline Funnel — Today"

Stages (job counts + drop-off % from previous stage + avg score at stage):
```
Jobs scraped
  → After hard constraints
  → After soft constraints
  → After heuristics
  → Top 50
  → Top 15
  → Delivered
```

Visual: horizontal step-down bar chart or funnel.

**Right (55%) — Activity Log**

Title: "Agent Activity Log — Today"

Each entry:
```
Timestamp | Agent (color coded) | Short message | Expandable chevron → details
```

Agent color coding:
```
Search Agent:        blue
Matching Agent:      purple
Feedback Agent:      green
Orchestration Agent: orange
Test Agent:          red
Insights Agent:      teal
Email Agent:         gray
Vector Index:        dark blue
```

Behavior: auto-refresh every 60 seconds | last 50 entries shown | "Load more" for older

---

### Section 6 — Match Quality Charts

Full width below funnel and logs.

```
Chart 1 (line):  Average match score — last 30 days
                 X: dates, Y: 0-100%, color: Stellapath purple

Chart 2 (bar):   Score distribution — today
                 Buckets: 0-60 | 60-70 | 70-80 | 80-90 | 90-100
                 Color: green 80+, purple 70-80, gray <70
```

---

### Section 7 — Source Health Table

Title: "Scraper Source Health" | Subtitle: "Updated daily at 3:00 AM UTC"

Columns: `Source | Sector | Jobs Today | % Change vs Yesterday | Trust Score | Status | Last Success`

Status rules:
```
Green  "Healthy"   — normal
Amber  "Degraded"  — <50% of yesterday's job count
Red    "Failed"    — zero jobs or scrape error
```

Trust score color: green >0.80, amber 0.70-0.80, red <0.70

Sort: Failed first → Degraded → Healthy

Expandable rows show:
- Error message (if failed)
- 7-day job count mini chart
- Sample job titles today
- Trust score history 30 days

---

### Section 8 — Alert System

Title: "Test Agent Alerts"

Each alert card:
```
Severity:             INFO / WARNING / CRITICAL
Timestamp
Title + description
Metric:               current value vs threshold
baseline_comparison:  "vs 7-day baseline: was 0.84, now 0.71"
failure_type:         "data" | "model" | "infra"
Dismiss button
Investigate button    → links to relevant dashboard section
```

Alert suppression rules:
- No duplicate alerts within 24 hours
- Group by root cause
- If 3+ alerts share same root cause → single grouped alert with count

Thresholds:

| Severity | Trigger |
|---|---|
| INFO | Precision@50 drops 5-10% vs baseline |
| INFO | LLM cost +15-30% day over day |
| INFO | Source returning 30-50% fewer jobs |
| WARNING | Precision@50 < 0.75 |
| WARNING | Precision@15 < 0.85 |
| WARNING | Thumbs up rate drops >15% week on week |
| WARNING | LLM cost +30% day over day |
| WARNING | Source trust score drops below 0.70 |
| WARNING | NDCG drops >10% vs baseline |
| CRITICAL | Precision@50 < 0.65 |
| CRITICAL | Zero jobs to >5% of users |
| CRITICAL | LLM failure rate >10% |
| CRITICAL | Pipeline not complete by 9 AM UTC |
| CRITICAL | False positive rate >0.35 |

Empty state: ✅ "No active alerts — pipeline is healthy"

---

### Section 9 — User Activity Summary

Title: "User Activity — Today"

Six stat boxes in two rows. Each: large number + label + change vs yesterday with arrow.

```
Row 1:  Total active users | New profiles completed today | Feedback signals received today
Row 2:  Cold start graduations today | Applied signals received | Interview signals received
```

---

### Section 10 — Job Scoring Explorer

Title: "Daily Job Scoring Explorer"

Search by user email or job title. Filters: date, score range, reaction type.

**Main table columns:**
`User | Job Title | Company | Match Score | Top 50? | Top 15? | Rejection Stage | Reaction`

Rejection Stage values:
```
"Hard constraint: [constraint name]"
"Soft constraint: [constraint name]"
"Heuristic: score [X]"
"BGE-small: similarity [X]"
"BGE-large: similarity [X]"
"LLM: dimension [name] scored low"
"Delivered"
```

Reaction column: 👍 👎 ⏳ ✅ 🎯

**Expanded row shows:**
- Full job description
- All 6 dimension scores (bar charts)
- Lowest scoring dimension highlighted
- Dimension most influencing final score
- Gap between user weights and actual scores
- User's current weights
- Call 2 reasoning (if generated)
- "Why this failed" — e.g., "Rejected at BGE-large — similarity 0.58 below 0.70 threshold"

**Near Misses tab:**

```
Near Miss Rate = missed relevant jobs / candidate jobs

Criteria for near miss:
  - Passed hard constraints
  - Scored above 0.60 in BGE-small
  - Did not reach top 15

Columns: Job Title | Company | Stage 1 Score | Rejection Stage | Reason
```

**Replay Mode:**

```
1. Select a user
2. Adjust thresholds or weights
3. Re-run pipeline logic against stored job data

Display: side-by-side Original top 15 vs New top 15 + score differences per job

Note: uses stored job data from that run — does not re-scrape or re-embed
```

---

### Section 11 — Weight Evolution

Title: "Weight Evolution"

```
Tab 1 — Platform Average:
  Line chart — all 6 dimensions over 30 days
  skills_match: blue | industry_alignment: green | experience_level: purple
  function_type: orange | salary: teal | career_trajectory: red

Tab 2 — Individual User:
  Search by user email
  Weight evolution over time (line chart)
  Feedback history below chart
  Current weights as horizontal bar chart
  Cold start status + signal count
```

---

### Alert Threshold Settings

Accessible via gear icon in top bar. All values editable and persisted to `AlertThresholds` table.

| Setting | Default |
|---|---|
| Precision@50 warning | 0.75 |
| Precision@50 critical | 0.65 |
| Precision@15 warning | 0.85 |
| Thumbs up rate drop warning | 15% |
| LLM cost spike warning | 30% |
| LLM daily budget | $600 |
| Source trust score warning | 0.70 |
| False positive rate critical | 0.35 |
| Drift threshold | 10% |

---

### Backend endpoints

All endpoints require admin authentication. Return JSON. Handle empty states gracefully (empty arrays, not errors).

```
GET   /admin/pipeline-status
GET   /admin/recommended-actions
GET   /admin/test-agent-metrics
GET   /admin/agent-logs            (paginated)
GET   /admin/pipeline-funnel
GET   /admin/source-health
GET   /admin/alerts
PATCH /admin/alerts/:id/dismiss
GET   /admin/user-activity
GET   /admin/job-scoring
GET   /admin/weight-evolution
GET   /admin/thresholds
PATCH /admin/thresholds
```

---

### New database models

```
AgentLog
  id, agent_name, timestamp, message, details (JSON), log_level, run_id

AdminAlert
  id, severity, title, description, metric_name, metric_value,
  threshold_value, baseline_value, baseline_comparison (text),
  failure_type (data | model | infra),
  triggered_at, dismissed_at, dismissed_by, suppressed_until

TestAgentMetrics
  id, run_date, precision_at_50, precision_at_15, recall_at_50,
  ndcg, coverage, false_positive_rate, sample_size, confidence_score,
  drift_flags (JSON), baseline_7day (JSON), label_sources (JSON)

AlertThresholds
  id, metric_name, warning_threshold, critical_threshold, updated_at

EvaluatedJob
  id, run_date, job_id, user_id, label_source, relevance_label,
  confidence_weight, rejection_stage, rejection_reason,
  dimension_scores (JSON), near_miss (boolean)
```

User model addition: `is_admin: boolean (default false)`

---

### Styling

```
Background:       white
Section bg:       light gray
Accent:           Stellapath purple
Design:           clean, minimal
Responsive:       desktop only — no mobile needed

Data refresh:
  Pipeline log + alerts + recommended actions: every 60 seconds
  Metric cards:                                every 5 minutes
  All other sections:                          on page load
```

Every section requires a clean empty state, e.g.: "No pipeline runs yet — data will appear after first run"

---

## 12. Company Insights Page — Detail View Architecture

*Status: ✅ Implemented — April 2026*

*Covers the CompanyDetail.jsx page redesign. Does not change: LLM generation logic, weekly cron schedule, list page card grid, API endpoint structure, logo resolution logic, upsert logic, database schema (additions only), search and filter functionality.*

---

### Layout — Three Zones

```
ZONE 1 — Hero (full width)
  Company logo
  Company name (large, bold)
  Status pill: Growing / Stable / Slowing
  Active job count
  Company summary paragraph
  "View open positions →" link → /positions?company={slug}

ZONE 2 — Intelligence (two columns, 32px gap)
  Left column (45%):
    Hiring Outlook + reason
    Hiring Momentum (velocity strip + department breakdown)
    What to Expect (redesigned metrics)
    Recent Signals (timeline)

  Right column (55%):
    Pros section
    Cons section
    Risks & Considerations section

  Responsive: stack to single column at ≤768px

ZONE 3 — Footer (full width)
  Company Snapshot card: Website, HQ, Size, Type, Sector
  Where Hiring tags
  "View all open positions →" link → /positions?company={slug}
  Top 5 open positions list: REMOVED
```

---

### Change 1 — Hiring Momentum Section

Positioned in left column between Hiring Outlook and What to Expect.
Data source: CompanyHiringSnapshot table — most recent snapshot for this company.

**New API fields added to GET /companies/{slug} response:**

```
hiring_velocity: {
  jobs_today:          int
  jobs_7_days_ago:     int
  jobs_30_days_ago:    int
  week_change:         int      (jobs_today - jobs_7_days_ago)
  week_change_pct:     float
  month_change:        int      (jobs_today - jobs_30_days_ago)
  month_change_pct:    float
  trend:               "up" | "down" | "flat"
  data_available:      bool     (false if no snapshot exists)
}

department_breakdown: [
  { department: string, count: int, pct: float }
]
(top 6 departments by count + "Other" catch-all for the rest)
```

Both fields read from CompanyHiringSnapshot. If no snapshot exists:
`data_available: false` — frontend renders empty state.

**Frontend — A. Velocity strip:**

```
"655 active roles"            large, bold
"↑ +47 this week (+7%)"       green if trend up, red if down, gray if flat
"↑ +180 this month (+38%)"    same color logic

Arrow icons: ↑ green (#22C55E), ↓ red (#EF4444), → gray (flat)
```

**Frontend — B. Department breakdown:**

```
Title: "Where they are hiring"

Horizontal bar chart — top 6 departments + Other

Each row:
  Department name   left aligned, gray, 14px
  Purple bar        proportional to count, height 24px,
                    color Stellapath purple (#5B4FE8),
                    fully rounded ends, 8px gap between bars
  Percentage        right of bar, purple, bold
  Count             far right, gray, 13px
```

**Frontend — C. Link:**

```
Below department breakdown:
"View open positions →"
Links to: /positions?company={slug}
```

**Frontend — D. Empty state (data_available: false):**

```
Light gray dashed border box
Clock icon
Text: "Hiring momentum data will appear after our next
      pipeline run — check back tomorrow."
```

**Frontend — E. Last updated:**

```
Small gray text below chart
"Last updated: {snapshot_date}"
```

---

### Change 2 — What to Expect Redesign

**A. Interview Difficulty — traffic light pill (replaces 1–5 dots):**

```
Score 1–2:  🟢 green pill   "Easy"
Score 3:    🟡 amber pill   "Moderate"
Score 4:    🔴 red pill     "Hard"
Score 5:    🔴 red pill     "Very Hard"

Pill style: rounded, colored background, white text, bold, 14px
```

**B. Response Rate / Time to Hire / Employee Sentiment — gradient range bar:**

Each metric shows:
- Label (left aligned, gray, 14px)
- Full-width gradient track (height 6px, fully rounded ends)
- Throttle dot on track at calculated position
- Value label centered below dot (small gray, 12px)

```
Track gradient (left → right):
  #EF4444 (red) → #F59E0B (amber) → #22C55E (green)

Throttle dot:
  8px diameter circle, white border 2px
  Color matches zone:
    0–33% position:  red dot  (#EF4444)
    33–66% position: amber dot (#F59E0B)
    66–100% position: green dot (#22C55E)
```

Throttle position calculation per metric:

```
Response Rate:
  Parse percentage from string e.g. "~25%"
  Position = parsed percentage (0–100%)
  Label shows raw value e.g. "~25%"

Time to Hire:
  Parse weeks from string e.g. "6-10 weeks"
  Scale: 1 week = 100% (rightmost/green), 12+ weeks = 0% (leftmost/red)
  Faster = further right (green side)
  Label shows raw value e.g. "6-10 weeks"

Employee Sentiment:
  Scale: 0/5 = 0%, 5/5 = 100%
  Position = (rating / 5) * 100
  Label shows e.g. "4.1 / 5"
```

**C. Section title tooltip:**

```
ⓘ icon — right of "What to Expect" title, small, gray
On hover tooltip:
  "These metrics are estimated from industry data and job
  posting signals. They will be updated with real figures
  as Stellapath users report their experiences."
```

**D. Footnote:**

```
When data is estimated (default — fewer than 10 user inputs):
  Small italic gray text: "ⓘ Estimated from industry data"

When real data exists (≥10 user inputs):
  Replace with: "Based on {count} Stellapath users"
  Only show when count ≥ 10
```

**New API field added to GET /companies/{slug} response:**

```
user_feedback_count: int
  Count of users who applied to this company and reported outcomes.
  Used by frontend to switch between estimated and real footnote.
```

---

### Change 3 — Two Column Layout

See Zone 2 in the Layout section above.

```
Desktop: two columns, 45% left / 55% right, 32px gap
Tablet (≤768px): stack to single column
Mobile: single column
```

---

### Change 4 — Open Positions Removed from Detail Page

```
Removed:
  Top 5 open positions list
  GET /companies/{slug}/jobs API call on this page

Replaced with two links:
  1. Below hiring momentum section
  2. In footer zone (Zone 3)

Link text: "View open positions →"
Link destination: /positions?company={slug}
```

---

### Change 5 — Recent Signals Timeline

Replaces bullet list with vertical timeline.

```
Each signal entry:
  Date          left, small gray
  Vertical line connecting signals
  Colored dot   by signal type:
    hiring_surge:  green
    expansion:     blue
    tech_stack:    purple
    culture:       amber
    leadership:    gray
  Signal type badge  colored pill
  Signal title       bold
```

---

### Change 6 — SLUG_DOMAINS Deduplication

```
Problem:
  SLUG_DOMAINS constant duplicated in:
    CompanyInsights.jsx
    CompanyDetail.jsx

Solution:
  Move to single shared file:
    src/utils/companyDomains.js

  Import from there in both components:
    import { SLUG_DOMAINS } from '../utils/companyDomains'
```

---

### Files Changed

```
Frontend:
  frontend/src/pages/CompanyDetail.jsx      layout, all 5 UI changes
  frontend/src/pages/CompanyInsights.jsx    import SLUG_DOMAINS from util
  frontend/src/utils/companyDomains.js      NEW — shared constant

Backend:
  api/companies.py                          added HiringVelocity and
                                            DepartmentBreakdownItem Pydantic
                                            models; hiring_velocity,
                                            department_breakdown,
                                            user_feedback_count added to
                                            GET /companies/{slug} response;
                                            queries CompanyHiringSnapshot by
                                            source_slug for velocity deltas
                                            and top-6 dept breakdown
```

### Not Changed

```
agents/company_insight_agent.py   LLM generation logic untouched
scheduler config                  weekly cron schedule untouched
CompanyInsights.jsx               list page card grid and filters untouched
API endpoint structure            no new routes, only new fields on existing route
Logo resolution logic             untouched
Upsert logic                      untouched
Database schema                   additions only — no modifications to existing fields
Search and filter functionality   untouched
```
