# Stellapath — Product Backlog

*Last updated: April 2026*

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
| 22 | BGE embedding pipeline | ✅ Complete | Phase B of Filter Agent |
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
| 38 | Test Agent implementation | 🔴 Pending | After admin dashboard |
| 39 | Prompts directory created | ✅ Complete | All 5 prompts in prompts/ directory |

### Frontend and UX

| # | Task | Status | Notes |
|---|------|--------|-------|
| 40 | Dashboard UI — Stellapath branded | 🔴 In Progress | |
| 41 | Profile page — 3 column AI onboarding | 🔴 In Progress | |
| 42 | Profile step enforcement | ✅ Complete | 4-step wizard, RequireProfile route guard on 5 routes |
| 43 | Visa and work authorization UI update | ✅ Complete | Checkbox list, TN/E-3 split out, clearer labels |
| 44 | Seniority level options update | ✅ Complete | Values now match filter_agent seniority rank map |
| 45 | Landing page comparison table | ✅ Complete | Live on site |
| 46 | Stellapath branding applied | 🔴 In Progress | |
| 47 | Company insights page redesign | ✅ Complete | Two column layout, SLUG_DOMAINS shared util |
| 48 | Hiring momentum section on insights | ✅ Complete | Velocity strip + department bar chart |
| 49 | What to Expect redesign | ✅ Complete | Traffic light pill + gradient range bars |

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
