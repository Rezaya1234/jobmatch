# Stellapath — Strategy

*Last updated: April 2026*

---

## Mission

Help people find work they love and design
their career — candidate-first, not
employer-first.

---

## Positioning

Stellapath is not a job board. It is the
first virtual career coach and job assistant
in one platform — learning from every
interaction to deliver smarter matches
and actionable career guidance every day.

Most platforms were built for employers.
LinkedIn charges recruiters. Indeed charges
companies. Their AI optimizes for employer
outcomes.

Stellapath's AI works exclusively for the
candidate. Every feature is designed around
where you want to go — not what employers
are posting.

---

## Core Value Proposition

Stop searching for jobs. Start building
the career you actually want.

Today, job seekers waste hours scrolling
through irrelevant listings, applying to
roles they were never right for, and
getting rejected without understanding why.

Stellapath does the heavy lifting overnight.
Every morning, your most relevant
opportunities are ready — along with clear
insight into the role, the company, and
how to move forward.

---

## Beta Product (July 2026 Launch)

Features available at launch:

- 3 daily job recommendations — personalized,
  delivered every morning, no searching required
- Job board with unlimited search — tens of
  roles pre-prioritized for your profile
- Why you fit and skill gap analysis on every
  recommendation
- How to close gaps — external unbiased
  learning resources
- Weekly missed opportunities recap
- Closed loop feedback system — gets smarter
  with every interaction
- Company insight one-pagers — hiring speed,
  culture, career trends from a candidate lens
- Feedback tab — virtual career advisor that
  reads your actions and what you say
- All-in-one: matching, insights, and growth

---

## Competitive Positioning

StellaPath vs Traditional Job Platforms

Key structural advantage: LinkedIn and Indeed
make money from employers. Their incentives
favor employer outcomes. Stellapath revenue
comes from candidates. The incentives are
perfectly aligned with the user.

Feature highlights vs competitors:
- Career focus: built for where you want to go
- Learns and improves: every interaction counts
- Fit and gap clarity: every recommendation
- Actionable guidance: specific and unbiased
- How jobs reach you: 3 curated roles daily
- No repeated jobs: never repeated
- All-in-one: jobs plus insights plus growth

---

## Monetization Roadmap

Phase 1 — Free beta:
Founding members get premium free for
active testing and feedback.

Phase 2 — Premium tier (~500 active users):
Charge for deeper career insights — NOT
for job recommendations. Recommendations
are always free.
Target: $9.99-19.99/month

Phase 3 — Employer side (opt-in only):
Recruiter access to opted-in candidate
profiles. Candidates control visibility.
Companies pay for access.
Sponsored courses (affiliate commission).
Company improvement dashboard (paid B2B).

Quit job trigger:
$3,000-5,000 MRR for 3 consecutive months
plus 12 months personal runway.

---

## Funding Path

Bootstrap through beta.
Angel raise Q1 2027 (~$200-300K)
  Trigger: 500 active users.
VC conversation late 2027
  Trigger: strong revenue growth.

---

## Long-Term Vision — Job Intelligence Platform

### The Vision

StellaPath long-term ambition extends beyond
job matching into becoming the first career
intelligence platform — combining real-time
hiring signals, company financial data, and
macro hiring trends to help candidates make
smarter career decisions before opportunities
become public knowledge.

Think Bloomberg Terminal for career decisions.
Bloomberg sells market intelligence to
investors for $25,000 per year. StellaPath
delivers career intelligence to individuals
for $10-20 per month.

### The Core Insight

A candidate who knows Company X is about to
enter an aggressive hiring phase has a
significant advantage. They can prepare,
network, and position themselves before
the competition even knows the opportunity
exists. No platform currently packages
this intelligence for the individual
job seeker.

### Hiring Intensity Signal

A composite score built from:

Leading indicators (predict future hiring):
- Funding rounds
- Revenue growth
- Job posting velocity from our scraper data
- Headcount growth rate
- Office expansion announcements
- New product launches
- M&A activity

Lagging indicators (confirm hiring trend):
- Active job postings by department
- Time to fill roles
- Interview difficulty scores
- Layoff history

### Data We Are Collecting Today

Tier 1 — Collecting now (irreplaceable):
- Job posting velocity per company per day
  via CompanyHiringSnapshot table
- Job description evolution and versioning
  hash-based — only saves on change
- Full user feedback context with profile
  and weight snapshots
- Match score history per user over time
- User outcome data: applied, interviewed, hired

Tier 2 — Collecting within 30 days:
- Department-level hiring growth signals
- Time to fill per role type
- User search journey and intent signals
- Profile completion and quality signals

Tier 3 — Phase 2 external signals:
- Funding round monitoring via Crunchbase
- Layoff event tracking via Layoffs.fyi
- News sentiment analysis
- Company financial parsing via SEC EDGAR
- Sector hiring trend aggregation

### The Proprietary Moat

Every day of data collection that starts
today becomes irreplaceable history by 2027.
In 12 months we will have 365 daily hiring
snapshots per company. This longitudinal
data cannot be purchased or recreated.

### The Intelligence Agent (Phase 2)

A new dedicated agent will own external
signal collection, distinct from the
existing Insights Agent which generates
user-facing content.

Intelligence Agent responsibilities:
- Funding round monitoring
- Layoff event tracking
- News sentiment processing
- Company financial signal parsing
- Sector trend aggregation
- Hiring intensity score computation

### Phase Roadmap

Phase 1 — Beta July 2026:
Job posting velocity on company one-pagers
as hiring momentum: High, Stable, Slowing.
Zero additional cost — uses existing data.

Phase 2 — Post Beta late 2026:
Intelligence Agent introduced.
Crunchbase and Layoffs.fyi integration.
Hiring intensity score launched.
Department-level growth signals.

Phase 3 — Scale 2027:
Hiring probability ML model.
Earnings call sentiment analysis.
Predictive hiring intensity scoring.
Macro sector rotation signals.

Long-Term Vision 2028+:
Full job intelligence platform.
Industry-level hiring predictions.
Enterprise data licensing.
The career equivalent of Bloomberg.

### Investor Narrative

This vision transforms the story from
a smart job matching app ($100M outcome)
to a career intelligence platform with
a proprietary data moat.

The data flywheel compounds:
More users → more outcome signals →
better predictions → better matches →
more users.

By Series A Q1 2027 we will have
12 months of proprietary hiring pattern
data that no competitor can replicate.

---

## Legal Considerations

Employment contract: C3.ai CIIA agreement
governs IP assignment. StellaPath is
consumer AI. C3.ai is enterprise AI.
Different markets but both AI is a grey area.

Action required: Book California employment
lawyer specializing in Section 2870
inventor rights before beta launch.
Deadline: June 30, 2026.

Rules until lawyer consulted:
- Never use work equipment for Stellapath
- Never use work email or internet
- Do not disclose to C3.ai
- Keep all development on personal devices

---

## Key Metrics to Track

Primary — product-market fit signals:
- 7-day retention rate
- Thumbs up rate — target above 40% by day 30
- Cold start graduation rate
  5 signals within 14 days
- Applied rate per recommendation
- Interview rate

Secondary — growth signals:
- Daily active users
- Profile completion rate
- Email open rate
- Word of mouth referrals

Business metrics:
- MRR
- Cost per user per month — target below $0.33
- Gross margin — target above 95%

---

## Sprint Roadmap Summary

### Development Philosophy

Sprints are two weeks each.
Each sprint targets one large task,
three medium tasks, and three to four
small tasks. Buffer is always maintained
for beta user feedback and unexpected issues.

Solo founder with full time job.
Claude Code is the engineering team.
Bolt admin agent in Sprint 1 increases
daily productivity by 30-60 minutes.

Cost constraint: no significant
infrastructure cost increases until
revenue justifies them.

### Phase 2 — Sprints 1-5 (May-July 2026)

Theme: Productivity, data foundation,
scale infrastructure, intelligence layer.

Key milestones:
  Sprint 1: Bolt agent live, companies
  table, data collection infrastructure
  Sprint 2: Champion challenger live,
  first generic ATS scrapers, beta users
  Sprint 3: 100 companies, hiring
  intelligence dashboard, tiered system
  Sprint 4: Intelligence Agent, career
  journey MVP, external signals begin
  Sprint 5: 200 companies, Workday scraper,
  hiring intensity score

### Phase 2 — Sprints 6-10 (July-September 2026)

Theme: Career intelligence, recruiter
connections, network features, premium prep.

Key milestones:
  Sprint 6: Interview prep, visa data,
  salary intelligence
  Sprint 7: Career analytics, ATS
  screening intelligence
  Sprint 8: Recruiter access program,
  monitoring service
  Sprint 9: 300 companies, resume builder
  Sprint 10: Network tab, recruiter
  visibility opt-in

### Phase 3 — Q4 2026+

Theme: Revenue, scale, enterprise,
Bloomberg Terminal vision.

Key milestones:
  Premium subscription launch
  Direct recruiter placement
  Scale to 1000 companies
  Data licensing product
  Enterprise career tracking
  Full job intelligence platform

### New Features Planned

Beyond job matching Stellapath is building:

Network and contacts tab:
  Import contacts from email and social media.
  Organize job-related contacts with templates
  for coffee chats and role inquiries.
  Quarterly reminders to reconnect.

Resume builder and auto-apply:
  In-app resume builder optimized for
  target roles. One-click application
  submission on behalf of user.

Tiered intelligence:
  Engagement unlocks deeper insights.
  Tiers 1-5 based on reaction count.
  Paid tier unlocks recruiter access
  and premium career tools regardless
  of engagement tier.

Privacy commitment:
  Interview outcomes and company names
  never shared. Aggregate patterns
  shared anonymously. Profile shared
  with recruiters only on explicit
  opt-in. Formal privacy policy
  published in Sprint 3.

Company structure:
  Decision between C-Corp and PBC
  (Public Benefit Corporation) in Sprint 1.
  PBC considered given candidate-first
  mission alignment and investor signaling.
  Registration after C3.ai legal clears.
