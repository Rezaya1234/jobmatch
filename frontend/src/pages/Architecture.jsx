const AGENTS = [
  {
    name: 'Search Agent',
    color: 'blue',
    icon: '🔍',
    what: 'Fetches all open positions directly from company career pages via ATS APIs (Greenhouse, Lever, Ashby) and unofficial JSON endpoints. Runs independently of any user profile — syncs everything, stores in the jobs table.',
    config: [
      'Sources: 21 companies — Greenhouse (7), Lever (2), Ashby (10), unofficial JSON (Google, Amazon)',
      'Greenhouse: Anthropic, Scale AI, Together AI, Glean, Gong, Intercom, Databricks',
      'Lever: Mistral AI, Palantir',
      'Ashby: OpenAI, Cohere, Writer, Runway, Pinecone, Perplexity, ElevenLabs, Cursor, Harvey AI, Sierra AI',
      'Deduplicates by URL — same job never stored twice',
      'Marks jobs as inactive when they disappear from the ATS (position closed)',
      'Hard cap: 10,000 active jobs total — oldest unfeedback-ed jobs removed first',
      'Concurrency: 5 companies fetched in parallel',
    ],
    constraints: [
      'No LLM involved — zero cost per run',
      'Unofficial endpoints (Google, Amazon) may break without notice',
      '6 companies excluded (Hugging Face, W&B, Groq, C3.ai, DataRobot, Zendesk) — use Workday/proprietary ATS with no public API',
      'ATS slugs must be manually verified — wrong slug = silent empty result',
      'No description fetched for jobs missing content field',
    ],
    improvements: [
      'Auto-detect ATS type from company domain instead of manual config',
      'Add LinkedIn, Workday, iCIMS integrations for companies that use those',
      'Notify admin when a company endpoint starts returning 0 jobs (likely broken)',
      'Store per-company fetch health (last success, last count) for monitoring',
    ],
  },
  {
    name: 'Filter Agent',
    color: 'green',
    icon: '🔽',
    what: 'Applies hard constraints per user against the full job pool. Rule-based — no LLM. Creates a job_match row for every job, marking pass/fail.',
    config: [
      'Hard constraints: work mode, job type, location, target companies',
      'Location matching: handles US aliases (USA, United States, America, etc.)',
      'Work mode: passes jobs with no mode listed (benefit of the doubt)',
      'Company: substring match, case-insensitive',
    ],
    constraints: [
      'No LLM — free to run on any number of jobs',
      'Once a job_match row exists, the job is not re-filtered',
      'Missing data (no location, no job type) defaults to pass',
      'Company filter only applies if preferred_companies is set',
    ],
    improvements: [
      'Add salary range as a hard constraint',
      'Add seniority level as a hard constraint',
      'Re-filter existing matches when profile constraints change',
    ],
  },
  {
    name: 'Match Agent',
    color: 'purple',
    icon: '🎯',
    what: 'Scores filtered jobs against the user profile using Claude AI. Uses the profile background, feedback history, and liked/disliked job examples to calibrate scores.',
    config: [
      'Model: Claude Haiku (fast, low cost)',
      'Batch size: 10 jobs per LLM call',
      'Concurrency: 4 parallel batches',
      'Job description: truncated to 800 characters',
      'Scoring range: 0.0 (poor fit) → 1.0 (perfect fit)',
      'In-context learning: includes up to 10 liked + 10 disliked job examples',
    ],
    constraints: [
      'Scores the 50 most recently posted jobs that pass filters — older ones queued for next run',
      'Title keyword filters (include/exclude) applied before scoring to focus the pool',
      'Thumbs-down jobs: score set to 0.0, never shown',
      'Only scores jobs with score = NULL (never re-scores unless reset)',
    ],
    improvements: [
      'Upgrade to Claude Sonnet for more nuanced scoring',
      'Increase job description limit for better signal',
      'Add skill matching (extract skills from resume vs job requirements)',
      'Track score history to show how preferences evolved over time',
    ],
  },
  {
    name: 'Feedback Agent',
    color: 'amber',
    icon: '🧠',
    what: 'Analyzes thumbs up/down patterns and rewrites the user profile to reflect actual preferences. Runs automatically every 5 feedback submissions.',
    config: [
      'Model: Claude Sonnet (standard tier)',
      'Auto-triggers: every 5 feedback submissions',
      'Minimum feedback required: 3 items before any update',
      'Updates: role_description, preferred_sectors, company_type, company_sizes, seniority, salary',
      'After profile update: automatically resets scores and re-scores all matches',
    ],
    constraints: [
      'Only updates fields with clear repeated patterns (2+ data points)',
      'User comments carry more weight than implicit signals',
      'Does not update hard constraints (work mode, location, company list)',
      'Returns {} and skips update if signals are mixed or insufficient',
    ],
    improvements: [
      'Show the user what changed in the profile after each learning cycle',
      'Allow manual trigger of feedback learning from the UI',
      'Add skill inference from liked jobs (extract common skills)',
      'Track feedback learning history so user can see evolution',
    ],
  },
  {
    name: 'Orchestrator',
    color: 'indigo',
    icon: '⚙️',
    what: 'Coordinates the full pipeline. Decoupled into two independent phases: job collection (profile-independent) and user matching (per user).',
    config: [
      'Phase 1 — Collect: runs search agent, no user context',
      'Phase 2 — Match: filter + score for every user with a profile',
      'Full pipeline: runs both phases in sequence',
      'Per-user error isolation: one user failing never blocks others',
    ],
    constraints: [
      'In-memory pipeline state (single process only — not horizontally scalable)',
      'Pipeline state resets on server restart',
      'No retry logic on individual agent failures',
      'Sequential user processing (not parallelized across users)',
    ],
    improvements: [
      'Parallelize matching across users',
      'Persist pipeline state to DB for multi-process/multi-server support',
      'Add retry with backoff for failed scoring batches',
      'Add pipeline run history table for audit trail',
    ],
  },
  {
    name: 'Scheduler',
    color: 'slate',
    icon: '🕐',
    what: 'Triggers the daily full pipeline automatically. Uses APScheduler running in-process.',
    config: [
      'Schedule: daily at 08:00 UTC',
      'Job: full pipeline (collect + match all users)',
      'Library: APScheduler (in-process, not a separate worker)',
    ],
    constraints: [
      'Runs only while the server process is alive',
      'No distributed locking — multiple server instances would double-run',
      'No email/alert on pipeline failure',
      'No configurable schedule from the UI',
    ],
    improvements: [
      'Separate collection (6:00 AM) and matching (7:00 AM) schedules',
      'Add failure alerting (email or webhook)',
      'Allow schedule configuration from the Settings UI',
      'Move to a proper task queue (Celery, RQ) for production',
    ],
  },
]

const COLOR_MAP = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
  slate:  { bg: 'bg-slate-50',  border: 'border-slate-200',  badge: 'bg-slate-100 text-slate-600',  dot: 'bg-slate-400' },
}

function BulletList({ items, color = 'slate' }) {
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${COLOR_MAP[color]?.dot || 'bg-slate-400'}`} />
          {item}
        </li>
      ))}
    </ul>
  )
}

function AgentRow({ agent }) {
  const c = COLOR_MAP[agent.color]
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5`}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{agent.icon}</span>
        <div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>Agent</span>
          <h3 className="text-base font-bold text-slate-900 mt-0.5">{agent.name}</h3>
        </div>
      </div>

      <p className="text-sm text-slate-700 mb-4 leading-relaxed">{agent.what}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Configuration</p>
          <BulletList items={agent.config} color={agent.color} />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Constraints & Limits</p>
          <BulletList items={agent.constraints} color={agent.color} />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Improvement Ideas</p>
          <BulletList items={agent.improvements} color={agent.color} />
        </div>
      </div>
    </div>
  )
}

export default function Architecture() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">System Architecture</h1>
        <p className="text-slate-500 text-sm">
          A blueprint of every agent in the pipeline — what it does, how it's configured, its limits, and ideas for improvement.
        </p>
      </div>

      {/* Pipeline flow */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-8">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Pipeline Flow</p>
        <div className="flex items-center flex-wrap gap-2 text-sm">
          {[
            { label: 'Company ATS', sub: '21 companies', color: 'bg-slate-100 text-slate-600' },
            { arrow: true },
            { label: 'Search Agent', sub: 'collect', color: 'bg-blue-100 text-blue-700' },
            { arrow: true },
            { label: 'Jobs Table', sub: 'database', color: 'bg-slate-100 text-slate-600' },
            { arrow: true },
            { label: 'Filter Agent', sub: 'per user', color: 'bg-green-100 text-green-700' },
            { arrow: true },
            { label: 'Match Agent', sub: 'LLM scoring', color: 'bg-purple-100 text-purple-700' },
            { arrow: true },
            { label: 'Matches', sub: 'shown to user', color: 'bg-indigo-100 text-indigo-700' },
          ].map((item, i) =>
            item.arrow ? (
              <span key={i} className="text-slate-300 font-bold">→</span>
            ) : (
              <div key={i} className={`px-3 py-1.5 rounded-lg ${item.color} text-center`}>
                <div className="font-medium">{item.label}</div>
                <div className="text-xs opacity-70">{item.sub}</div>
              </div>
            )
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Feedback Agent</span>
          <span>runs separately — triggered every 5 ratings, rewrites profile, auto re-scores</span>
        </div>
      </div>

      {/* Agent cards */}
      <div className="space-y-4">
        {AGENTS.map(agent => <AgentRow key={agent.name} agent={agent} />)}
      </div>
    </div>
  )
}
