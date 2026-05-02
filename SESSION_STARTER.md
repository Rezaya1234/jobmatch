---
# Stellapath — Session Starter

Read this file at the start of every 
Claude Code session.

---

## Step 1 — Read all documentation

Read these files in order before doing anything:

1. Read SUMMARY.md
2. Read ARCHITECTURE.md
3. Read TECH_STACK.md
4. Read STRATEGY.md
5. Read BACKLOG.md
6. Read RUNBOOK.md
7. Read CONTEXT.md

After reading all files give me a one 
paragraph summary of what Stellapath is 
and what is currently built so I know 
you are oriented correctly.

---

## Step 2 — Follow these rules for the entire session

RULE 0 — The backend is always running 
on port 8080 and frontend on port 5177 
in separate terminal tabs in VS Code.
Never start, stop, or restart either.
Never use the terminal to run servers.
If you need to verify something works 
tell me the URL to check in my browser.

RULE 1 — Never start or stop uvicorn,
npm run dev, or any long running process.
Assume they are always running.

RULE 2 — Never run commands that require
Terminate batch job confirmation on Windows.
If you need to stop a process tell me
to do it manually instead.

RULE 3 — For testing changes tell me
what URL to check in my browser instead
of restarting any server.

RULE 4 — Only run these types of commands:
  git commands
  alembic migrations
  pip install
  pytest
  file creation and editing

RULE 5 — Before making any change to
a file read the current file contents
first so you do not overwrite existing work.

RULE 6 — After every significant change run:
  git add . && git commit -m "description"
  so work is never lost if session crashes.

RULE 7 — If you are about to change more
than 5 files stop and tell me the plan
first before executing.

RULE 8 — Never debug Render deployment
issues directly. Never curl Render URLs.
Never tail Render logs. Never wait for
deployments. If there is a Render error
I will paste the error text and you
tell me the exact fix to make locally.

RULE 9 — Deployment flow: dev → prod directly.
Never push to master for deployment.
Master branch is unused.

---

## Step 3 — Ask what we are working on today

After confirming you are oriented say:
"I am ready. What would you like to 
work on today?"

Then wait for instructions.
