# Stellapath — Claude.ai Context File

Paste this entire file at the start of 
every new claude.ai conversation to 
restore full project context instantly.

Last updated: April 2026

---

## The Team

I am building Stellapath with an AI team 
on claude.ai. Each member has a role:

Bolt — project manager and technical lead
Spark — senior data scientist
Edge — strategy and business partner
Law — legal counsel
Design — UI/UX designer

To talk to a specific member start 
message with their name.
Example: "Bolt — what should I do today?"

---

## The Product

Stellapath is a closed-loop AI career 
optimization platform. Not a job board.

Delivers 3 personalized job recommendations 
daily. Learns from every interaction. 
Gets smarter over time.

Tagline: Design your career path.
Mission: Help people find work they love — 
candidate-first not employer-first.

Beta launch: July 2026
Target users: 10 beta users initially

---

## Infrastructure

GitHub: github.com/Rezaya1234/jobmatch
Branches: master (prod) / dev (dev)

Render services:
  jobmatch-prod     backend Python 3.12
  jobmatch-dev      dev backend
  jobmatch-static   frontend React
  jobmatch-dev-static  dev frontend
  jobmatch-db       PostgreSQL prod paid
  jobmatch-db-dev   PostgreSQL dev paid

Live URLs:
  Prod frontend: https://jobmatch-76c4.onrender.com
  Dev frontend:  https://jobmatch-dev-static.onrender.com
  Prod API:      https://jobmatch-qqms.onrender.com
  API docs:      https://jobmatch-qqms.onrender.com/docs
  Admin:         https://jobmatch-76c4.onrender.com/admin

Local dev:
  Backend:  http://localhost:8080
  Frontend: http://localhost:5173
  API docs: http://localhost:8080/docs

---

## Tech Stack

Backend:    Python 3.12, FastAPI, 
            SQLAlchemy async, Alembic,
            Pydantic, asyncpg, aiohttp
Frontend:   React 18, Vite, Tailwind CSS,
            React Router
Database:   PostgreSQL, pgvector (beta)
            → Qdrant at scale
LLM:        Claude Haiku (Call 1 batch)
            Claude Sonnet (Call 2 reasoning)
Embedding:  BAAI/bge-small-en-v1.5 Stage 1
            BAAI/bge-large-en-v1.5 Stage 2
            Both free open source local
Email:      SendGrid (API key pending)
Scheduler:  APScheduler (beta)
            → Redis + Celery at scale
Brand:      Stellapath purple #5B4FE8
            Tagline: Design your career path

---

## Agent Architecture (9 agents)

1. Profile Agent
   Resume parsing, cold start weights,
   strict/flexible constraint flags,
   profile_version tracking

2. Search Agent
   Scrapes 41 companies daily at 3AM UTC
   Source trust scoring (rolling 30 days)
   CompanyHiringSnapshot written post-scrape
   Job description MD5 hash versioning
   Hard constraint filtering (6 constraints)

3. Filter Agent
   Soft constraint filtering (4 constraints)
   Heuristic scoring keyword overlap
   Stage 1 BGE-small threshold 0.60
   Stage 2 BGE-large threshold 0.70
   Remove shown job IDs
   Top 10-15 to Matching Agent

4. Matching Agent
   Single batch LLM Call 1 all jobs
   Compute weighted scores in code
   Normalize and rank
   Conditional Call 2 active users cached
   Max 2 LLM calls per user per day

5. Feedback Agent
   Immutable event log
   Separate job_user_state
   Weight updates every 5 signals
   Immediate on applied/interview/hired
   Drift protection floor 0.05 ceiling 0.50

6. Insights Agent
   Company one-pagers weekly Sunday 6:30AM
   User behavioral insights daily 6AM UTC
   LLM generates from job posting data
   Stored in company_insights table

7. Orchestration Agent
   Daily pipeline 5AM UTC
   3-job delivery guarantee
   Fallback strategy 6 steps
   Fallback jobs labeled Exploratory match
   Cost monitoring $1.50/user/month alert

8. Email Agent
   Daily digest 7AM UTC single dashboard link
   Weekly recap Monday 6AM UTC
   Inbound reply via SendGrid webhook
   feedback+{user_id}@stellapath.app

9. Vector Index
   BGE-small rebuilds daily 4AM UTC
   HNSW algorithm
   pgvector (beta) → Qdrant (scale)
   ANN query ~2ms per user

---

## Key Numbers

Max LLM calls:       2 per user per day
Cost per user:       ~$0.33/month
Gross margin:        96.7%
Cold start signals:  5 to graduate
Weight ceiling:      0.50 per dimension
Weight floor:        0.05 per dimension
LLM cost alert:      $1.50/user/month
Daily budget alert:  $600 total

---

## Matching Dimensions (fixed — never change)

skills_match:        0.35 cold start
experience_level:    0.25 cold start
salary:              0.20 cold start
industry_alignment:  0.10 cold start
function_type:       0.05 cold start
career_trajectory:   0.05 cold start

---

## Feedback Signal Values

hired:          +5  immediate weight update
interview:      +4  immediate weight update
applied:        +3  immediate weight update
thumbs_up:      +2
thumbs_down:    -2
click:          +1
apply_click:    +1
not_interested: -1

---

## Hard Constraints (never relaxed)

1. Location type must match exactly
2. Visa sponsorship if required
3. Excluded job titles
4. Excluded companies
5. Previously shown jobs never repeat
6. Job must be active and URL live

## Soft Constraints (relaxable in fallback)

1. Salary minimum floor  relax 10%
2. Role type  adjacent in fallback
3. Experience floor  2 years in fallback
4. Seniority ceiling  one level in fallback

---

## Company Sources (41 total)

Tech (21):
Anthropic, OpenAI, Google DeepMind,
Microsoft AI, Meta AI, Apple, Amazon,
Nvidia, Salesforce, Databricks, Snowflake,
Scale AI, Cohere, Mistral, Hugging Face,
Palantir, C3.ai, ServiceNow, Workday,
Adobe, Intuit

Upstream Oil and Gas (10):
ExxonMobil, Chevron, ConocoPhillips,
EOG Resources, Devon Energy,
Diamondback Energy, APA Corporation,
Coterra Energy, Occidental Petroleum,
Expand Energy

Oilfield Services (10):
SLB, Halliburton, Baker Hughes,
TechnipFMC, NOV Inc.,
Weatherford International, Tenaris,
Archrock, Newpark Resources,
Patterson-UTI Energy

---

## Daily Pipeline Schedule

3:00 AM UTC  Scraping and health checks
4:00 AM UTC  Vector index rebuild
5:00 AM UTC  Matching pipeline all users
6:00 AM UTC  Insights Agent user updates
6:30 AM UTC  Company insights regenerated
7:00 AM UTC  Email delivery
9:00 AM UTC  All processing complete

Weekly Monday:
5:00 AM UTC  Company scores updated
6:00 AM UTC  Weekly recap emails sent

---

## Documentation Files

SUMMARY.md       Product overview — read first
ARCHITECTURE.md  Full system design and agents
TECH_STACK.md    Technology decisions
STRATEGY.md      Business and long-term vision
BACKLOG.md       Phase 1/2/3 task lists
RUNBOOK.md       Operations and debugging
CONTEXT.md       This file — paste to claude.ai
SESSION_STARTER.txt  Paste to Claude Code

---

## What Is Built

✅ Full agent architecture in codebase
✅ 41 company scrapers active
✅ Frontend deployed (pages live)
✅ Database migrations applied
✅ Dev and prod environments live
✅ Admin dashboard /admin 11 sections
✅ CompanyHiringSnapshot daily collection
✅ Job description MD5 hash versioning
✅ Company insights one-pagers live
✅ Landing page with comparison table
✅ All documentation files created
✅ SESSION_STARTER.txt created

---

## What Is Pending Before Beta

🔴 SendGrid API key — unblocks email
🔴 BGE embedding pipeline Phase B
🔴 Source trust scoring Phase A
🔴 Match Agent Call 2 with caching
🔴 Email daily digest and weekly recap
🔴 3-job delivery guarantee
🔴 Fallback delivery with labels
🔴 End-to-end QA full user flow
🔴 Domain name registration
🔴 Company registration after legal
🔴 Beta user recruitment 10 users
🔴 C3.ai legal review June 30 2026
🔴 Fix 2 failing tests
🔴 Prompts directory

## In Progress

🔄 Dashboard UI Stellapath branded
🔄 Profile page step enforcement
🔄 Visa and seniority UI updates
🔄 Company insights page redesign
   Two column layout
   Hiring momentum section
   What to Expect range bars
   Traffic light interview difficulty

---

## Long-Term Vision

Job intelligence platform — the Bloomberg
Terminal for career decisions.

Data flywheel already building:
CompanyHiringSnapshot collects daily.
365 days = irreplaceable proprietary dataset.

Phases:
Phase 2 late 2026: Intelligence Agent,
  external signals, hiring intensity score
Phase 3 2027: Hiring probability ML model,
  earnings sentiment, macro signals
2028+: Full job intelligence platform,
  enterprise data licensing

---

## Strategy

Monetization:
Phase 1: Free beta
Phase 2: Premium $9.99-19.99/month
  for deeper insights not job recommendations
Phase 3: Recruiter access opt-in,
  sponsored courses, company dashboard

Quit job trigger:
$3,000-5,000 MRR for 3 consecutive months
plus 12 months personal runway

Funding:
Angel Q1 2027 at 500 active users
VC late 2027 on strong revenue

---

## Legal

C3.ai CIIA employment contract risk.
Book California Section 2870 lawyer
before June 30 2026.
Never use work equipment for Stellapath.
Never disclose to C3.ai until after
lawyer consultation.

---

## Last Working On

Set up VS Code as primary development
environment with three terminal tabs:
Tab 1: Backend on port 8080
Tab 2: Frontend on port 5177
Tab 3: Claude Code

App is working locally with results showing.
Workspace saved as stellapath.code-workspace.

Ready to work on:
1. Company insights page redesign
   (two column layout, hiring momentum,
   What to Expect range bars)
2. Profile page step enforcement
3. BGE embedding pipeline Phase B
4. SendGrid API key configuration

Prompt for company insights redesign
is written and ready to run.
