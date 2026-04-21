# JobMatch — Project Summary

## Product Description

JobMatch is an AI-powered job matching platform. It automatically fetches job listings from public job boards, filters them against your hard constraints (location, work mode, job type), then uses Claude AI to score each job against your soft preferences (seniority, sector, salary, company size). You get a ranked list of matches you can browse, give feedback on, and the system learns from your feedback to improve future matches. A daily email digest is also built in.

---

## Solution Architecture

```
Job Board APIs (free)
  RemoteOK, Arbeitnow, Jobicy
        ↓
  Search Agent (httpx, no LLM)
        ↓
  PostgreSQL — jobs table (153 jobs today)
        ↓
  Filter Agent (deterministic, no LLM)
  — work mode, job type, location
        ↓
  Match Agent (Claude Haiku)
  — scores 0.0–1.0 against soft preferences
        ↓
  job_matches table (score + reasoning)
        ↓
  React UI / Email Digest
        ↓
  Feedback Agent (Claude Haiku)
  — learns from thumbs up/down → updates preferences
```

Scheduled: Pipeline runs daily at 8:00 AM UTC automatically via APScheduler.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.14, FastAPI, uvicorn |
| Database | PostgreSQL 16, SQLAlchemy 2.0 async, Alembic |
| AI/LLM | Anthropic Claude Haiku (scoring + feedback learning) |
| Job Sources | RemoteOK API, Arbeitnow API, Jobicy API |
| Email | SendGrid (built, needs valid API key) |
| Scheduler | APScheduler (cron) |
| Frontend | React + Vite + Tailwind CSS |
| HTTP client | httpx (async) |

---

## Directory Structure

```
C:\Users\rezar\jobmatch\
├── main.py                  # FastAPI app entry point
├── .env                     # All secrets and config
├── requirements.txt
├── alembic.ini
├── alembic\versions\        # DB migrations
├── agents\
│   ├── orchestrator.py      # Coordinates full pipeline
│   ├── search_agent.py      # Fetches jobs from APIs
│   ├── filter_agent.py      # Hard constraint filtering
│   ├── match_agent.py       # LLM scoring
│   └── feedback_agent.py    # Learns from feedback
├── api\
│   ├── users.py             # User + profile endpoints
│   ├── jobs.py              # All jobs listing
│   ├── matches.py           # Scored matches
│   ├── feedback.py          # Thumbs up/down
│   ├── pipeline.py          # Trigger pipeline
│   └── deps.py              # DB session injection
├── db\
│   ├── models.py            # SQLAlchemy ORM models
│   └── database.py          # Async engine setup
├── llm\
│   ├── client.py            # Abstract LLM interface
│   ├── factory.py           # Provider switching
│   └── adapters\claude.py   # Anthropic SDK adapter
├── mailer\
│   ├── sender.py            # SendGrid integration
│   └── templates.py         # HTML + text email templates
├── scheduler\
│   └── scheduler.py         # APScheduler cron setup
└── frontend\                # React app
    ├── src\
    │   ├── App.jsx           # Router + nav
    │   ├── api.js            # All API calls
    │   └── pages\
    │       ├── Setup.jsx     # Account + preferences
    │       ├── Jobs.jsx      # All fetched jobs
    │       ├── Matches.jsx   # Scored + filtered matches
    │       └── Pipeline.jsx  # Trigger pipeline
    └── vite.config.js        # Proxy → port 9000
```

---

## Database Tables

| Table | Purpose |
|---|---|
| users | Email-based accounts |
| user_profiles | Hard constraints + soft preferences |
| jobs | All fetched job listings (153 today) |
| job_matches | Per-user filter result + score + reasoning |
| feedback | Thumbs up/down with optional comment |

---

## Important Values to Remember

| What | Value |
|---|---|
| Your user ID | 99881292-d861-4b44-a6e6-f22474863647 |
| Your email | reza.rah@gmail.com |
| DB name | jobmatch |
| DB user/pass | postgres / postgres |
| DB port | 5432 |
| Backend port | 9000 (current) |
| Frontend port | 5173 |
| Frontend URL | http://localhost:5173 |
| API docs | http://localhost:9000/docs |
| Anthropic org ID | 9de1c06a-bf33-4c73-99de-0f2329fdea07 |

---

## How to Start the App (Every Time)

Terminal 1 — Backend:
  cd C:\Users\rezar\jobmatch
  venv\Scripts\uvicorn.exe main:app --port 9000

Terminal 2 — Frontend:
  cd C:\Users\rezar\jobmatch\frontend
  npm run dev

Then open http://localhost:5173

---

## What Still Needs to Be Done

| Item | Notes |
|---|---|
| SendGrid email | Need a valid SENDGRID_API_KEY — get at sendgrid.com |
| Personalized search queries | Search currently pulls all jobs; could filter by your sectors at API level |
| Auth/login | No password protection — anyone with the URL can access |
| Production deployment | Currently local only — needs a server (Railway, Render, etc.) |
| More job sources | Wellfound, LinkedIn, Greenhouse public APIs |
| Rate limit handling | Add retry + backoff in match agent for Anthropic rate limits |

---

## Running Costs (Estimated)

| Step | Cost |
|---|---|
| Job search (3 APIs) | $0 |
| Scoring 150 jobs with Haiku | ~$0.01 |
| Daily digest email (SendGrid) | $0 (free tier) |
| Total per day | ~$0.01 |
