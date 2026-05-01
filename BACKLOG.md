# Stellapath — Product Backlog

*Last updated: May 2026*

---

## Beta Readiness Checklist

| # | Item | Status | Blocker |
|---|------|--------|---------|
| B1 | Profile step enforcement + dashboard gate | ✅ Done | — |
| B2 | Visa authorization as pills with sublabels | ✅ Done | — |
| B3 | Seniority trimmed to 6 clean options | ✅ Done | — |
| B4 | Goals text auto-save (debounced, 500ms) | ✅ Done | — |
| B5 | Applications page (applied / interview table) | ✅ Done | — |
| B6 | Company insights page fully redesigned | ✅ Done | — |
| B7 | All tests passing (55/55) | ✅ Done | — |
| B8 | SendGrid API key configured | 🔴 Pending | Infra |
| B9 | Email agent live (daily digest + weekly recap) | 🔴 Pending | Needs B8 |
| B10 | End-to-end QA with real users | 🔴 Pending | Needs B9 |
| B11 | Domain registered (stellapath.app) | 🔴 Pending | Business |
| B12 | Beta user recruitment (10 active job seekers) | 🔴 Pending | Needs B10 |

---

## Phase 1 — Beta Launch (Target: July 2026)

### Infrastructure and DevOps

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Python environment setup | ✅ Complete | Python 3.12 |
| 2 | Project folder structure | ✅ Complete | |
| 3 | GitHub repo setup | ✅ Complete | Private, master/dev branches |
| 4 | LLM abstraction layer | ✅ Complete | Claude/OpenAI/Gemini adapters |
| 5 | Database models and migrations | ✅ Complete | Multiple migrations applied |
| 6 | Production database on Render | ✅ Complete | jobmatch-db paid |
| 7 | Dev database on Render | ✅ Complete | jobmatch-db-dev paid |
| 8 | Backend API deployed | ✅ Complete | Endpoints live |
| 9 | Frontend deployed | ✅ Complete | Pages live |
| 10 | Dev and prod separation | ✅ Complete | Both environments live |
| 11 | Python upgraded to 3.12 | ✅ Complete | runtime.txt updated |
| 12 | SESSION_STARTER.txt created | ✅ Complete | Prevents session crashes |
| 13 | SendGrid API key | 🔴 Pending | Unblocks email delivery |
| 14 | Domain name registration | 🔴 Pending | stellapath.app or similar |
| 15 | Company registration | 🔴 Pending | After legal review |
| 16 | Recovery Kit saved | 🔴 Pending | Google Password Manager |

### Agents and Pipeline

| # | Task | Status | Notes |
|---|------|--------|-------|
| 17 | Job scraper — 21 tech companies | ✅ Complete | |
| 18 | Job scraper — 10 upstream oil and gas | ✅ Complete | |
| 19 | Job scraper — 10 oilfield services | ✅ Complete | |
| 20 | Hard constraint filtering | ✅ Complete | 6 constraints |
| 21 | Soft constraint filtering | ✅ Complete | Phase B of Filter Agent |
| 22 | BGE embedding pipeline | ✅ Complete | Replaced by pgvector ANN pipeline (item 38e) — BGE code preserved in agents/embeddings.py for future local backend |
| 23 | Source trust scoring | ✅ Complete | Phase A of Search Agent |
| 24 | Match agent batch scoring Call 1 | ✅ Complete | |
| 25 | Match agent Call 2 with caching | ✅ Complete | Active users, 7-day TTL, profile version + weight drift invalidation |
| 26 | Feedback agent signals | ✅ Complete | |
| 27 | Weight learning and drift protection | ✅ Complete | |
| 28 | Orchestration agent | ✅ Complete | |
| 29 | Daily scheduler | ✅ Complete | |
| 30 | Email agent — daily digest | 🔴 Pending | Needs SendGrid key |
| 31 | Email agent — weekly recap | 🔴 Pending | |
| 32 | Company insight one-pagers | ✅ Complete | Insights Agent built |
| 33 | Fallback delivery with labels | ✅ Complete | "Exploratory match" label in Dashboard + Matches pages |
| 34 | 3-job delivery guarantee | ✅ Complete | 6-step fallback in orchestrator |
| 35 | CompanyHiringSnapshot data collection | ✅ Complete | Wired into Search Agent |
| 36 | Job description versioning hash-based | ✅ Complete | |
| 37 | Admin dashboard — 11 sections | ✅ Complete | /admin route |
| 38 | Test Agent implementation | ✅ Complete | agents/test_agent.py — precision@50, @15, recall, NDCG, coverage, FPR |
| 38a | TestAgentMetrics table | ✅ Complete | db/models.py — daily snapshot with 7-day baseline and drift flags |
| 38b | EvaluatedJob table | ✅ Complete | db/models.py — ground truth labels (LLM / user / human sources) |
| 38c | Match Quality Charts | ✅ Complete | Admin Section 6 — 30-day trend line + score distribution bar (recharts) |
| 38d | All 6 Test Agent metrics wired | ✅ Complete | Admin Section 4 — precision@50, @15, recall@50, NDCG, coverage, FPR with 7d baseline |
| 38e | pgvector ANN embedding pipeline (text-embedding-3-small, 1536d, HNSW cosine) | ✅ Complete | Replaces BGE — backfill 6667 jobs ($0.04), new jobs embedded at ingestion, profile embedding via build_intent_query, aspiration blend 0.7/0.3 |
| 38f | Outcome-anchored profile embedding | ✅ Complete | 0.8 × profile_embedding + 0.2 × job_embedding normalized on interview/applied signal |
| 38g | Embedding health metrics + /admin/embedding-health | ✅ Complete | Job + profile coverage in TestAgentMetrics.label_sources, dedicated admin endpoint |
| 39 | Prompts directory created | ✅ Complete | All 5 prompts in prompts/ + 3 agent implementation prompts in prompts/agents/ |
| 55 | First-run pipeline on profile completion | ✅ Complete | POST /pipeline/run-for-user/{id} with 60s asyncio.timeout; loading overlay in Setup step 4; polls matches every 3s before redirect |
| 56 | Match funnel delivered count fix | ✅ Complete | MatchFunnel.shown uses delivered_at filter; delivered_at added to MatchResponse |
| 57 | Feedback count accuracy fix | ✅ Complete | Passive link-clicks (weight=1) no longer create Feedback rows; feedback_count filters weight>=2; Apply uses recordSignal('applied') |
| 58 | Text feedback commentary + AI interpretation | ✅ Complete | Comment box in job modal + card chat icon; POST /users/{id}/feedback/event; Claude Haiku _COMMENTARY_SYSTEM → dimension/direction/confidence/hard_exclusion; ±0.01/0.03/0.05 delta |
| 59 | Commentary prompt library files | ✅ Complete | prompts/agents/feedback_agent_commentary.txt + prompts/agents/matching_agent_weights.txt |

### Frontend and UX

| # | Task | Status | Notes |
|---|------|--------|-------|
| 40 | Dashboard UI — Stellapath branded | 🔴 In Progress | |
| 41 | Profile page — 3 column AI onboarding | 🔴 In Progress | |
| 42 | Profile step enforcement | ✅ Complete | Green step circles, progress bar, debounce auto-save, soft banners, mid default |
| 43 | Visa and work authorization UI update | ✅ Complete | 4 PillWithSub pills in 2-col grid, sublabels, consistent violet styling |
| 44 | Seniority level options update | ✅ Complete | 6 options: Entry Level, Mid Level, Senior, Manager, Director, Executive |
| 45 | Landing page comparison table | ✅ Complete | Live on site |
| 46 | Stellapath branding applied | 🔴 In Progress | |
| 47 | Company insights page redesign | ✅ Complete | Two column layout, SLUG_DOMAINS shared util |
| 48 | Hiring momentum section on insights | ✅ Complete | Velocity strip + department bar chart |
| 49 | What to Expect redesign | ✅ Complete | Traffic light pill + gradient range bars |
| 54 | Applications page | ✅ Complete | Table of applied/interview FeedbackSignal rows; replaces ComingSoon stub |

### Quality and Legal

| # | Task | Status | Notes |
|---|------|--------|-------|
| 50 | Fix failing tests | ✅ Complete | 14 failures → 0; filter logic, template signatures, stale assertions |
| 51 | End-to-end QA | 🔴 Pending | Before beta users |
| 52 | C3.ai contract legal review | 🔴 Pending | Deadline June 30 2026 |
| 53 | Beta user recruitment | 🔴 Pending | 10 active job seekers |

---

## Phase 2 — Post Beta (August 2026+)

| # | Task | Category |
|---|------|----------|
| 1 | Hiring probability ML model | Core Product |
| 2 | Interview preparation guide | Core Product |
| 3 | Likelihood of acceptance score | Core Product |
| 4 | ATS and screening filter intelligence | Core Product |
| 5 | Premium subscription tier | Monetization |
| 6 | Sponsored course recommendations | Monetization |
| 7 | Recruiter connection feature | Monetization |
| 8 | Early recruiter access program | Monetization |
| 9 | Direct placement to recruiters | Monetization |
| 10 | Career coaching marketplace | Monetization |
| 11 | Company accountability score | Platform |
| 12 | Company hiring behavior transparency | Platform |
| 13 | Company improvement dashboard | Platform |
| 14 | Post-application feedback collection | Platform |
| 15 | LinkedIn profile connection | Data Enrichment |
| 16 | GitHub profile analysis | Data Enrichment |
| 17 | Salary benchmarking integration | Data Enrichment |
| 18 | Company health signals | Data Enrichment |
| 19 | Intelligence Agent | Infrastructure |
| 20 | Crunchbase funding integration | Intelligence |
| 21 | Layoffs.fyi integration | Intelligence |
| 22 | News sentiment analysis | Intelligence |
| 23 | Hiring intensity score | Intelligence |
| 24 | Department-level growth signals | Intelligence |
| 25 | Periodic preference check-ins | Product |
| 26 | Early career module | Market Expansion |
| 27 | Monitoring Service | Infrastructure |
| 28 | Qdrant vector database | Infrastructure |
| 29 | Redis and Celery job queue | Infrastructure |
| 30 | LLM response caching | Infrastructure |

---

## Phase 3 — Future (2027+)

| # | Task | Category |
|---|------|----------|
| 1 | High school guidance module | Market Expansion |
| 2 | Enterprise career tracking | Enterprise |
| 3 | Cross-encoder reranking | ML |
| 4 | Data licensing | Revenue |
| 5 | Multilingual support | Market Expansion |
| 6 | Earnings call sentiment analysis | Intelligence |
| 7 | Revenue correlation modeling | Intelligence |
| 8 | Macro sector rotation signals | Intelligence |
| 9 | Full job intelligence platform | Vision |

---

## Prompts Queue — Ready to Run in Claude Code

| # | Prompt | Purpose |
|---|--------|---------|
| 1 | Prompts directory creation | Save all LLM prompts to GitHub |
| 2 | Profile step enforcement | Enforce onboarding flow |
| 3 | Visa and seniority UI updates | Profile page improvements |
| 4 | Company insights page redesign | ~~Done~~ |
| 5 | Test Agent implementation | Pipeline quality monitoring |
