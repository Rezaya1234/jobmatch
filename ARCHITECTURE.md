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
SEARCH AGENT (3:00 AM UTC)
Scrape jobs → health check → hard filter →
soft filter → heuristic score →
Stage 1 BGE-small → Stage 2 BGE-large →
top 10-15 per user
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
Dashboard → feedback → email reply
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

### Hard constraints — Search Agent enforces

Zero exceptions. One violation = immediate discard. Never relaxed under any circumstances including fallback.

Users can mark each constraint as STRICT or FLEXIBLE.

```
CONSTRAINT 1 — Location type
Default:   STRICT
Strict:    Must match exactly (remote/hybrid/onsite)
Flexible:  ±1 tier relaxation allowed
Note:      Job location data is inconsistent —
           "onsite" sometimes allows remote,
           "hybrid" is defined differently per company.
           Allow users to mark flexible if they
           want broader discovery.

CONSTRAINT 2 — Visa sponsorship
Default:   STRICT
Rule:      Must offer sponsorship if user requires it
Flexible:  N/A — legal requirement, always strict

CONSTRAINT 3 — Excluded job titles
Default:   STRICT
Rule:      Title must not contain excluded keywords
Flexible:  N/A — user explicitly blacklisted these

CONSTRAINT 4 — Excluded companies
Default:   STRICT
Rule:      Company must not be on user blacklist
Flexible:  N/A — user explicitly blacklisted these

CONSTRAINT 5 — Previously shown jobs
Default:   STRICT (permanent)
Rule:      Job ID must not exist in shown memory
Flexible:  N/A — never repeat shown jobs

CONSTRAINT 6 — Job active status
Default:   STRICT
Rule:      URL must be verified live and active
Flexible:  N/A — dead jobs never surface
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
| **Profile Agent** | Builds a structured understanding of who the user is and what they want before matching begins. Sets the foundation for all downstream personalization. | 1. Parse resume and extract structured profile (skills, experience, preferences, dealbreakers) 2. Initialize cold start weights for new users 3. Flag user as cold_start: true until 5 feedback signals accumulated 4. Set strict/flexible flag per constraint based on user input 5. Optional enrichment via LinkedIn and GitHub URLs 6. Trigger weight recalibration on preference updates | INPUT: Raw resume, preferences, strict/flexible flags per constraint, optional LinkedIn/GitHub URL HARD CONSTRAINTS INITIALIZED: Location type (strict/flexible), visa requirement, excluded titles, excluded companies SOFT CONSTRAINTS INITIALIZED: Salary floor, role type, experience floor, seniority ceiling COLD START WEIGHTS: skills_match: 0.35, experience_level: 0.25, salary: 0.20, industry_alignment: 0.10, function_type: 0.05, career_trajectory: 0.05 PROCESS: Extract structured profile → set default weights → set strict/flexible flags → flag cold start → store OUTPUT: Structured user profile → PostgreSQL → cold start flag and weights to Orchestration Agent | Python 3.12, FastAPI, SQLAlchemy, Claude Sonnet (profile parsing — resume content sent to Anthropic API only), PostgreSQL |
| **Search Agent** | The cost gatekeeper. Eliminates irrelevant jobs using free rule-based and embedding methods before any LLM call. Precision first — but maintains minimum recall so users always get jobs to review. | 1. Scrape jobs daily at 3:00 AM UTC from 21 company career pages 2. Deduplicate by URL hash 3. URL health check — mark stale jobs inactive 4. Track per-source trust score — % valid jobs, % parsing success, % dead links 5. Auto-deprioritize sources with trust score below 0.70 6. Apply hard constraints (strict mode) — immediate discard on failure 7. Apply flexible constraint relaxation where flagged 8. Apply soft constraints 9. Heuristic scoring — keyword overlap, skill match, title similarity 10. Stage 1 BGE-small embedding (threshold 0.60) — relax to 0.50 for cold start users 11. Stage 2 BGE-large quality filter (threshold 0.70) 12. Remove previously shown job IDs 13. Pass top 10-15 to Matching Agent | INPUT: All active jobs, user profile, strict/flexible constraint flags, shown job memory HARD CONSTRAINTS: (see constraint system above) SOURCE TRUST SCORING: Track per source — % valid jobs, % parsing success rate, % dead links within 48 hours, historical reliability (rolling 30 days). Alert if trust score drops below 0.70. Auto-deprioritize degraded sources. COLD START RECALL PROTECTION: Users with fewer than 10 interactions — relax embedding threshold from 0.60 to 0.50 to ensure minimum discovery. SCRAPER HEALTH: Per source — last successful scrape timestamp, jobs returned vs yesterday, success/failure status, error type. Alert if delta drops >50% or source returns zero. PROCESS: Scrape → deduplicate → health check → hard filter → soft filter → heuristic score → Stage 1 BGE-small → Stage 2 BGE-large → remove shown → enforce max 10-15 OUTPUT: Top 10-15 candidates to Matching Agent. If fewer than 3 survive → skip Matching Agent → trigger fallback. | Python 3.12, BeautifulSoup/Scrapy, BAAI/bge-small-en-v1.5 (Stage 1, 384d, 8ms, $0), BAAI/bge-large-en-v1.5 (Stage 2, 1024d, 45ms, $0), sentence-transformers, spaCy, pgvector → Qdrant HNSW, PostgreSQL, aiohttp |
| **Matching Agent** | The AI brain. Scores all filtered jobs in a single LLM call with explicit weighted dimensions. Computes final scores in code. Maximum 2 LLM calls per user per day. | 1. Receive top 10-15 jobs 2. Compress each job to ~300 tokens using spaCy 3. Check dimension_data_available and confidence flags per dimension per job 4. If salary missing — exclude from scoring, re-normalize remaining weights to sum to 1.0 5. Validate all weights sum to 1.0 before every LLM call 6. Batch ALL jobs into single Call 1 7. Compute weighted scores in code — never inside LLM 8. Normalize final scores 9. Flag low confidence jobs (2+ dimensions ambiguous) 10. Conditional Call 2 — structured decision content on top 3, active users only, cached per user_id + job_id + profile_version 11. Invalidate Call 2 cache when profile_version changes, weights shift >0.10 in any dimension, job_updated_at changes, or 7-day TTL expires | INPUT: Top 10-15 compressed jobs, user profile summary, dimension weights, cold start flag, dimension_data_available flags, dimension confidence levels ALLOWED DIMENSIONS — exactly these 6: skills_match, industry_alignment, experience_level, function_type, salary (excluded if data unavailable — weights re-normalized), career_trajectory DIMENSION CONFIDENCE LEVELS (per dimension per job): score: 0.0-1.0 or null, data_available: true/false, confidence: high/medium/low WEIGHT RULES: Sum to 1.0. No dimension above 0.50. No dimension below 0.05. Re-normalize if salary excluded. CALL 1 (always): Batch all jobs + weights + hallucination prevention → parse JSON → compute scores in code → normalize → rank CALL 2 (conditional, cached): Produces: why worth pursuing (2-3 sentences), what might hold user back, suggested course gaps, confidence level (high/medium/low), advisor-style summary. Cache key: user_id + job_id + profile_version. Invalidated by: profile_version change, >0.10 weight shift, job update, 7-day TTL. OUTPUT: Ranked list with per-dimension scores, confidence levels, weighted scores, normalized scores, low confidence flags, Call 2 structured content where cached | Python 3.12, Claude Haiku (Call 1), Claude Sonnet (Call 2 — conditional, cached), spaCy, JSON parsing with regex fallback, FastAPI |
| **Feedback Agent** | The learning engine. Converts every user interaction into structured signals that make tomorrow's matches smarter. Maintains immutable event history and separate current state. | 1. Log all feedback to immutable event log 2. Update job_user_state separately — never overwrite event log 3. Collect signals with standardized values 4. Trigger weight update every 5 signals 5. Immediate trigger on applied, interview, or hired 6. Attribute signals to matching dimensions 7. Extract themes from commentary using LLM 8. Enforce drift protection — floor 0.05, ceiling 0.50 9. Normalize weights — always sum to 1.0 10. Increment weights_version on every update 11. Persist updated weights | INPUT: Feedback events — type, job_id, dimension scores, timestamp, optional commentary SIGNAL VALUES: thumbs_up: +2, thumbs_down: -2, click: +1, apply_click: +1, applied: +3 (immediate), not_interested: -1, interview: +4 (immediate), hired: +5 (immediate) STATE MANAGEMENT: feedback_event_log — immutable, append only. job_user_state — current status per user-job pair, updated on each interaction. DIMENSION ATTRIBUTION: Strong skills_match on liked jobs → increase skills_match. Disliked for seniority → decrease experience_level. Commentary "wrong function" → adjust function_type. Applied/interview → treat dimension scores as strong anchor. DRIFT PROTECTION: No dimension above 0.50. No dimension below 0.05. Enforced after every update. OUTPUT: Updated normalized weights → increment weights_version → PostgreSQL → available for next cycle | Python 3.12, Claude Haiku (commentary NLP — conditional), SQLAlchemy, PostgreSQL, FastAPI |
| **Insights Agent** | The intelligence layer for company and career behavioral data. Owns company profiles, culture scores, hiring behavior patterns, and user-level career behavioral insights. Runs on its own cadence — not part of daily matching pipeline. | 1. Aggregate company behavioral data from feedback events — response rates, ghosting patterns, time to respond 2. Compute company accountability scores 3. Generate company profiles — size, stage, hiring behavior, culture rating 4. Generate user behavioral insights with tiered thresholds 5. Feed company snapshot to Matching Agent Call 2 6. Feed insights to Company Insights page and Dashboard 7. Update company scores weekly (Monday 5:00 AM UTC) 8. Update user insights daily (6:00 AM UTC) | INPUT: Aggregated feedback events (company behavior), individual user interaction history INSIGHT TIERS — user behavioral insights: <5 interactions: no insights — show "Interact with more jobs to unlock insights" 5-15 interactions: weak signals with caveat — "Early patterns based on limited interactions" 15+ interactions: strong signals — show confidently COMPANY INSIGHT PROCESS: Aggregate feedback per company → compute response rate, ghosting rate, avg response time → generate accountability score → store per company CADENCE: Company scores: Monday 5:00 AM UTC. User insights: daily 6:00 AM UTC. OUTPUT: Company profiles and scores → Company Insights page and Matching Agent Call 2. User insights → Dashboard Matching Insights section. | Python 3.12, Claude Haiku (insight generation), SQLAlchemy, PostgreSQL, FastAPI |
| **Orchestration Agent** | The conductor. Coordinates every agent in the correct sequence for every user every day. Enforces cost controls and delivery guarantee. Note: Long-term, monitoring responsibilities will split into a separate Monitoring Service (Phase 2). | 1. Receive daily trigger at 5:00 AM UTC 2. Check cold start flag per user → select weights 3. Trigger Search Agent → receive candidates 4. If fewer than 3 survive hard filtering → skip Matching Agent → go to fallback 5. Trigger Matching Agent → receive ranked jobs 6. Remove previously shown job IDs 7. Apply 3-job delivery guarantee with fallback 8. Label fallback jobs transparently — "Exploratory match" pill, gray, never presented as top recommendations 9. Deliver top 3 via Email Agent 10. Update shown job memory permanently 11. Route feedback to Feedback Agent 12. Trigger Insights Agent at 6:00 AM UTC 13. Enforce max 2 LLM calls per user per day 14. Alert if per-user LLM cost exceeds $1.50/month 15. Trigger weekly recap Monday 6:00 AM UTC 16. Log all runs via match_run_id | INPUT: Scheduled trigger → user list → profiles, weights, shown memory, cold start flags FALLBACK SEQUENCE: Step 1: Relax salary floor ±10% Step 2: Relax experience floor ±2 years Step 3: Relax seniority ceiling one level Step 4: Relax role type to adjacent Step 5: Pull from unseen active jobs last 7 days — verify URL live Step 6: Deliver 1-2 jobs with message "Fewer matches today" FALLBACK LABELS: Standard: no label. Fallback: "Exploratory match" gray pill. Tooltip: "Outside your usual preferences — fewer strong matches today." Hard constraints NEVER relaxed. COST CONTROLS: Max 10-15 jobs to Matching Agent. Max 2 LLM calls per user per day. $1.50/month alert per user. FUTURE SPLIT (Phase 2): Pipeline control → Orchestration Agent. Metrics, logs, alerts, costs → separate Monitoring Service. OUTPUT: 3 jobs per user → email triggered → shown memory updated → state persisted → logs written | Python 3.12, APScheduler (beta) → Redis + Celery (Phase 2), FastAPI, SQLAlchemy, PostgreSQL |
| **Email Agent** | The delivery layer. Gets jobs into the user inbox every morning via a single personalized link. Captures feedback from email replies without requiring login. | 1. Receive top 3 jobs from Orchestration Agent 2. Render Stellapath-branded HTML email 3. Generate unique reply-to per user (feedback+{user_id}@stellapath.app) 4. Send daily digest at 7:00 AM UTC — single link to dashboard 5. Receive inbound replies via SendGrid parse webhook 6. Parse and route to Feedback Agent 7. Send weekly recap — missed high-score active jobs only, max 1 recap per job per user ever 8. Send post-hire celebration on job acceptance | INPUT: Top 3 jobs with scores, user name, email, ID DAILY DIGEST: Single dashboard link (not 3 job links). Stellapath branding. First name greeting. "Your 3 matches for today" teaser. Reply instructions. WEEKLY RECAP (Monday 6:00 AM UTC): Jobs from last 7 days, score ≥ 85%, zero interaction, URL verified active, max 1 recap per job per user. INBOUND: reply-to: feedback+{user_id}@stellapath.app → SendGrid parse → POST /webhooks/email-reply → extract user_id → route to Feedback Agent. OUTPUT: Email delivered → dashboard link → passive feedback captured | Python 3.12, SendGrid API, Jinja2, FastAPI (POST /webhooks/email-reply), aiohttp |
| **Vector Index** | The speed layer. Pre-computes and indexes all job embeddings daily so each user's ANN search returns top candidates in ~2ms regardless of how many jobs exist. | 1. Rebuild index daily at 4:00 AM UTC 2. Embed all active jobs using BGE-small (384d) 3. Store in vector index with HNSW algorithm 4. Serve per-user ANN queries in ~2ms 5. Remove inactive job embeddings 6. Scale horizontally as corpus grows | INPUT: All active job descriptions from PostgreSQL EMBEDDING: Compress → prefix "Represent this for job matching: {text}" → embed BGE-small → store HNSW QUERY: Embed user profile (1 embedding) → ANN query → top 50-100 in ~2ms → BGE-large Stage 2 SCALING: <10K users: pgvector ($0). 10K-50K: Qdrant self-hosted ($50-200/mo). 50K-100K+: Qdrant cluster or Pinecone ($200-500/mo). OUTPUT: Top 50-100 job IDs → BGE-large → top 15-20 to Matching Agent | BAAI/bge-small-en-v1.5 (384d, 8ms, $0), BAAI/bge-large-en-v1.5 (1024d, 45ms, $0), sentence-transformers, pgvector → Qdrant HNSW, PostgreSQL |

---

## 5. Data Models

| Model | Key Fields | Purpose | Version Tracking |
|-------|-----------|---------|-----------------|
| User | id, email, resume_text, preferences, constraint_flags (strict/flexible per constraint), cold_start, profile_version | Core user identity and preferences | profile_version increments on any profile change |
| Job | id, url, title, company, description, active_status, job_source, job_last_seen_at, job_inactive_reason, embedding_vector | Scraped job data | job_updated_at tracked for Call 2 cache invalidation |
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
| Post-application feedback | ✅ | - | - |
| Personalized dashboard | ✅ | - | - |
| Application tracking | ✅ | - | - |
| Generic job search tab | ✅ | - | - |
| Post-hire engagement | ✅ | - | - |
| Fallback job labeling | ✅ | - | - |
| Strict/flexible constraint flags | ✅ | - | - |
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
