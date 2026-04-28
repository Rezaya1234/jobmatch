# Stellapath — Operations Runbook

*Last updated: April 2026*
*For founder use — internal document*

---

## Starting the App Locally

Terminal 1 — Backend:
  cd C:\Users\rezar\jobmatch
  venv\Scripts\activate
  uvicorn main:app --host 0.0.0.0 --port 8080

Terminal 2 — Frontend:
  cd C:\Users\rezar\jobmatch\frontend
  npm run dev

Terminal 3 — Claude Code:
  cd C:\Users\rezar\jobmatch
  venv\Scripts\activate
  claude

Local URLs:
  Frontend:  http://localhost:5173
  API docs:  http://localhost:8080/docs

IMPORTANT: Always run Claude Code in its 
own terminal. Never run the app and 
Claude Code in the same terminal.

---

## Daily Development Workflow

1. Open Terminal 1 — start backend
2. Open Terminal 2 — start frontend
3. Open Terminal 3 — start Claude Code
4. Paste SESSION_STARTER.txt at beginning
   of every Claude Code session
5. Work on dev branch only
6. Test at http://localhost:5173
7. Commit frequently:
   git add .
   git commit -m "description"
   git push

Test on dev before merging:
  Dev frontend:  https://jobmatch-dev-static.onrender.com
  Dev backend:   https://jobmatch-dev.onrender.com

---

## Deploying to Production

Before merging to master checklist:
  □ Tests passing: pytest
  □ Tested manually on dev URL
  □ Env vars updated on Render prod
  □ DB migrations run on prod
  □ No console errors in frontend
  □ Email tested if email changes made
  □ git status clean

Deploy:
  git checkout master
  git merge dev
  git push
  Watch Render dashboard Events tab

---

## Running Database Migrations

Migrations run automatically on Render
deploy via: alembic upgrade head in
the start command.

Locally:
  cd C:\Users\rezar\jobmatch
  venv\Scripts\activate
  alembic upgrade head

Creating new migration:
  alembic revision --autogenerate -m "description"
  Review generated file in alembic/versions/
  alembic upgrade head

---

## Environment Variables

All secrets stored in Render dashboard.
Go to: Render → Service → Environment

Production jobmatch-prod:
  DATABASE_URL          Internal PostgreSQL URL
  LLM_PROVIDER          claude
  ANTHROPIC_API_KEY     Anthropic API key
  SENDGRID_API_KEY      Pending
  FROM_EMAIL            digest@stellapath.app
  FROM_NAME             Stellapath
  PIPELINE_TIMEZONE     UTC

Never commit secrets to GitHub.
Local dev: use .env file which is gitignored.
Template: .env.example committed with no secrets.

---

## Pipeline Schedule

All times UTC:
  3:00 AM  Scraping and job health checks
  4:00 AM  Vector index rebuild
  5:00 AM  Matching pipeline all users
  6:00 AM  Insights Agent updates
  7:00 AM  Email delivery
  9:00 AM  All processing complete

Weekly Monday:
  5:00 AM  Company scores updated
  6:00 AM  Weekly recap emails sent
  6:30 AM  Company insights regenerated

---

## Common Debugging Scenarios

### Pipeline did not run
1. Check Render → jobmatch-prod → Logs
2. Look for scheduler startup message
3. Check APScheduler cron config
4. Verify pipeline env vars are set

### Database connection error
1. Check DATABASE_URL uses internal URL
2. URL must start with postgresql+asyncpg://
3. Check Render → jobmatch-db → Status

### LLM call failing
1. Check ANTHROPIC_API_KEY is set
2. Check Anthropic console for API status
3. Check for rate limit errors in logs
4. Verify LLM_PROVIDER=claude in env vars

### Frontend not loading
1. Check Render → jobmatch-static → Status
2. Check browser console for errors
3. Verify API base URL in frontend config

### Jobs not appearing
1. Check if scraper ran at 3:00 AM UTC
2. Check Render logs for scraping errors
3. Verify source trust scores

### Email not sending
1. Check SENDGRID_API_KEY is configured
2. Check FROM_EMAIL is verified in SendGrid
3. Check SendGrid activity feed for errors

### Claude Code session crashing
1. Always run Claude Code in its own terminal
2. Paste SESSION_STARTER.txt at session start
3. Tell Claude Code never to start or stop
   long-running processes
4. Commit frequently so work is never lost

---

## Render Services Overview

| Service | Type | Branch | URL |
|---------|------|--------|-----|
| jobmatch-prod | Web Service | master | jobmatch-qqms.onrender.com |
| jobmatch-dev | Web Service | dev | jobmatch-dev.onrender.com |
| jobmatch-static | Static Site | master | jobmatch-76c4.onrender.com |
| jobmatch-dev-static | Static Site | dev | jobmatch-dev-static.onrender.com |
| jobmatch-db | PostgreSQL | - | Internal only |
| jobmatch-db-dev | PostgreSQL | - | Internal only |

---

## Emergency Procedures

### Site is down
1. Check status.render.com
2. Check Render → jobmatch-prod → Events
3. If failed deploy: rollback via Render
4. Fix on dev, test, re-deploy

### Bad deploy broke production
1. Go to Render → jobmatch-prod → Events
2. Click last successful deploy
3. Click Redeploy to roll back

### Accidental data deletion
1. Render PostgreSQL has daily backups
2. Go to Render → jobmatch-db → Backups
3. Restore to point before deletion

### API key compromised
1. Rotate key immediately at provider
2. Update env var on Render immediately
3. Check logs for unauthorized usage

---

## Accounts and Access

All accounts saved in Google Password Manager
as Stellapath Recovery Kit.

| Service | URL |
|---------|-----|
| GitHub | github.com |
| Render | render.com |
| Anthropic Console | console.anthropic.com |
| SendGrid | sendgrid.com |

---

## Legal Reminders

C3.ai employment contract:
- Never use work equipment for Stellapath
- Never use work email or internet
- Do not disclose to C3.ai
- Book California employment lawyer
  before June 30 2026
