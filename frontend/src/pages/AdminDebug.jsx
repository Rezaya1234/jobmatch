import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  triggerCollect,
  triggerStepEmbedJobs,
  triggerStepReset,
  triggerStepFilter,
  triggerStepCandidates,
  triggerStepScore,
  triggerStepDeliver,
  debugUserLookup,
  debugHardFilterSummary,
  debugAnnPool,
  debugSoftFilter,
  debugScored,
} from '../api'

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function StatusBadge({ status }) {
  const styles = {
    idle:    'bg-slate-100 text-slate-500',
    running: 'bg-amber-100 text-amber-600 animate-pulse',
    done:    'bg-emerald-100 text-emerald-700',
    error:   'bg-rose-100 text-rose-700',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || styles.idle}`}>
      {status}
    </span>
  )
}

function ScoreBar({ value }) {
  if (value == null) return <span className="text-slate-300 text-xs">—</span>
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 bg-slate-100 rounded-full h-1.5 shrink-0">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums">{pct}</span>
    </div>
  )
}

function SummaryCard({ label, value, color = 'slate' }) {
  const colors = { green: 'text-emerald-600', red: 'text-rose-600', slate: 'text-slate-700' }
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
      <div className={`text-2xl font-bold ${colors[color]}`}>{(value ?? 0).toLocaleString()}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}

function EmptyState({ children }) {
  return <p className="text-sm text-slate-400 py-8 text-center">{children}</p>
}

function SectionHeader({ title, subtitle, onFetch, loading, disabled }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {onFetch && (
        <button
          onClick={onFetch}
          disabled={disabled || loading}
          className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-40 shrink-0"
        >
          {loading ? 'Loading…' : 'Fetch'}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reason label formatting
// ---------------------------------------------------------------------------

const REASON_LABELS = {
  work_mode: 'Work mode mismatch',
  visa_sponsorship: 'Visa sponsorship required',
  excluded_title: 'Excluded job title',
  excluded_company: 'Excluded company',
  already_shown: 'Already shown',
  job_type: 'Job type mismatch',
  unknown: 'Unknown reason',
}

function formatReason(r) {
  return REASON_LABELS[r] || r
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const INITIAL_STEPS = {
  collect:    { status: 'idle', result: '' },
  embed:      { status: 'idle', result: '' },
  reset:      { status: 'idle', result: '' },
  filter:     { status: 'idle', result: '' },
  candidates: { status: 'idle', result: '' },
  score:      { status: 'idle', result: '' },
  deliver:    { status: 'idle', result: '' },
}

export default function AdminDebug() {
  // User state
  const [emailInput, setEmailInput]   = useState('')
  const [userId, setUserId]           = useState('')
  const [userInfo, setUserInfo]       = useState(null)
  const [loadingUser, setLoadingUser] = useState(false)
  const [userError, setUserError]     = useState('')

  // Pipeline step state
  const [steps, setSteps] = useState(INITIAL_STEPS)

  // Data sections
  const [hardFilter, setHardFilter]   = useState(null)
  const [annPool, setAnnPool]         = useState(null)
  const [softFilter, setSoftFilter]   = useState(null)
  const [scored, setScored]           = useState(null)
  const [loading, setLoading]         = useState({})

  // ── User lookup ──────────────────────────────────────────────────────────
  const handleLookup = async () => {
    const val = emailInput.trim()
    if (!val) return
    setLoadingUser(true)
    setUserError('')
    setUserInfo(null)
    try {
      // Accept either email or UUID directly
      let data
      if (val.includes('@')) {
        data = await debugUserLookup(val)
      } else {
        // Treat as raw user ID — build a minimal info object
        data = { user_id: val, email: val, profile_complete: null, has_embedding: null }
      }
      setUserId(data.user_id)
      setUserInfo(data)
    } catch (e) {
      const status = e?.response?.status
      if (status === 404) {
        setUserError(`No account found for "${val.toLowerCase()}" in this environment`)
      } else {
        setUserError(e?.response?.data?.detail || `Request failed (${status || 'network error'})`)
      }
    } finally {
      setLoadingUser(false)
    }
  }

  // ── Pipeline step execution ──────────────────────────────────────────────
  const patchStep = (key, patch) =>
    setSteps(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const runStep = async (key, fn) => {
    patchStep(key, { status: 'running', result: '' })
    try {
      const data = await fn()
      const result = data.detail ?? (data.count != null ? `${data.count} jobs` : 'done')
      patchStep(key, { status: 'done', result })
    } catch (e) {
      patchStep(key, { status: 'error', result: e?.response?.data?.detail || 'Error' })
    }
  }

  const STEPS = [
    {
      key: 'collect', label: 'Collect Jobs', desc: 'Scrape all 41 companies',
      fn: () => triggerCollect(), needsUser: false,
    },
    {
      key: 'embed', label: 'Embed Jobs', desc: 'Backfill embeddings for jobs missing vectors',
      fn: () => triggerStepEmbedJobs(), needsUser: false,
    },
    {
      key: 'reset', label: 'Reset Matches', desc: 'Clear job_match rows for this user',
      fn: () => triggerStepReset(userId), needsUser: true,
    },
    {
      key: 'filter', label: 'Hard Filter', desc: 'Apply constraints, write pass/fail',
      fn: () => triggerStepFilter(userId), needsUser: true,
    },
    {
      key: 'candidates', label: 'Check Candidates', desc: 'Count hard-passed unseen jobs',
      fn: () => triggerStepCandidates(userId), needsUser: true,
    },
    {
      key: 'score', label: 'LLM Score', desc: 'Claude Haiku batch scoring',
      fn: () => triggerStepScore(userId), needsUser: true,
    },
    {
      key: 'deliver', label: 'Deliver Top 3', desc: 'Mark top 3 as shown',
      fn: () => triggerStepDeliver(userId), needsUser: true,
    },
  ]

  // ── Section data loaders ─────────────────────────────────────────────────
  const loadSection = async (key, fn, setter) => {
    setLoading(prev => ({ ...prev, [key]: true }))
    try {
      setter(await fn())
    } catch (e) {
      console.error(key, e)
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50">

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-slate-800">Pipeline Inspector</span>
          <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2 py-0.5 rounded-full">Debug</span>
        </div>
        <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-700">← Admin</Link>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* ── User input ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">User</h2>
          <div className="flex gap-3 items-start">
            <input
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              placeholder="User email or ID"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
            />
            <button
              onClick={handleLookup}
              disabled={loadingUser || !emailInput.trim()}
              className="bg-violet-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50 shrink-0"
            >
              {loadingUser ? 'Loading…' : 'Load'}
            </button>
          </div>
          {userError && <p className="mt-2 text-sm text-rose-600">{userError}</p>}
          {userInfo && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                {userInfo.user_id}
              </span>
              {userInfo.profile_complete != null && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${userInfo.profile_complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-600'}`}>
                  Profile {userInfo.profile_complete ? '✓ complete' : '⚠ incomplete'}
                </span>
              )}
              {userInfo.has_embedding != null && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${userInfo.has_embedding ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-600'}`}>
                  Embedding {userInfo.has_embedding ? '✓ ready' : '⚠ missing'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Section 1: Pipeline Steps ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Pipeline Steps</h2>
          {!userId && (
            <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-amber-700">Load a user above to enable steps 2–6. Step 1 (Collect) runs globally and is always available.</p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {STEPS.map((step, i) => (
              <div key={step.key} className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="bg-violet-100 text-violet-700 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{step.label}</span>
                </div>
                <p className="text-xs text-slate-500">{step.desc}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runStep(step.key, step.fn)}
                    disabled={(step.needsUser && !userId) || steps[step.key].status === 'running'}
                    className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-md hover:bg-violet-700 disabled:opacity-40"
                  >
                    Run
                  </button>
                  <StatusBadge status={steps[step.key].status} />
                </div>
                {steps[step.key].result && (
                  <p className="text-xs text-slate-600">{steps[step.key].result}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 2: Hard Filter Summary ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <SectionHeader
            title="Hard Filter Summary"
            subtitle="Counts per elimination reason"
            onFetch={() => loadSection('hardFilter', () => debugHardFilterSummary(userId), setHardFilter)}
            loading={loading.hardFilter}
            disabled={!userId}
          />
          {!userId ? (
            <EmptyState>Load a user above to fetch filter data</EmptyState>
          ) : hardFilter ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Total Jobs Evaluated" value={hardFilter.total_jobs} />
                <SummaryCard label="Passed" value={hardFilter.passed} color="green" />
                <SummaryCard label="Failed" value={hardFilter.failed} color="red" />
              </div>
              <div className="space-y-1.5">
                {Object.entries(hardFilter.by_reason)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <div key={reason} className="flex items-center justify-between bg-rose-50 rounded-lg px-3 py-2">
                      <span className="text-xs text-rose-700 font-medium">{formatReason(reason)}</span>
                      <span className="text-xs font-bold text-rose-800 tabular-nums">
                        {count.toLocaleString()} eliminated
                      </span>
                    </div>
                  ))}
                <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-emerald-700 font-medium">Passed all constraints</span>
                  <span className="text-xs font-bold text-emerald-800 tabular-nums">
                    {hardFilter.passed.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState>Run Hard Filter step, then fetch to see elimination counts</EmptyState>
          )}
        </div>

        {/* ── Section 3: ANN Pool ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <SectionHeader
            title="ANN Pool — Top 50"
            subtitle={annPool ? `Query type: ${annPool.query_type} · ${annPool.total} results` : 'Cosine distance on profile embedding vs job embeddings'}
            onFetch={() => loadSection('annPool', () => debugAnnPool(userId), setAnnPool)}
            loading={loading.annPool}
            disabled={!userId}
          />
          {!userId ? (
            <EmptyState>Load a user above to fetch ANN pool data</EmptyState>
          ) : annPool?.jobs?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="pb-2 pr-3 font-medium w-8">#</th>
                    <th className="pb-2 pr-3 font-medium">Job Title</th>
                    <th className="pb-2 pr-3 font-medium">Company</th>
                    <th className="pb-2 pr-3 font-medium">Sector</th>
                    <th className="pb-2 font-medium">Similarity</th>
                  </tr>
                </thead>
                <tbody>
                  {annPool.jobs.map(j => (
                    <tr key={j.job_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-1.5 pr-3 text-slate-400 tabular-nums">{j.rank}</td>
                      <td className="py-1.5 pr-3 font-medium text-slate-700 max-w-[240px] truncate">{j.title}</td>
                      <td className="py-1.5 pr-3 text-slate-500 max-w-[140px] truncate">{j.company}</td>
                      <td className="py-1.5 pr-3 text-slate-400">{j.sector || '—'}</td>
                      <td className="py-1.5">
                        <span className="font-mono text-violet-600 font-semibold">
                          {(j.similarity * 100).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : annPool ? (
            <EmptyState>No hard-passed unseen jobs with embeddings found. Run Hard Filter step first.</EmptyState>
          ) : (
            <EmptyState>Fetch to see top 50 jobs by cosine similarity</EmptyState>
          )}
        </div>

        {/* ── Section 4: Soft Filter + Diversification ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <SectionHeader
            title="Soft Filter + Sector Diversification"
            subtitle={softFilter
              ? `${softFilter.soft_passed} passed soft · ${softFilter.soft_failed} dropped soft · ${softFilter.diversity_dropped} dropped by diversity · ${softFilter.final_count} final`
              : 'Shows all 50 ANN results with pass/fail per soft constraint'}
            onFetch={() => loadSection('softFilter', () => debugSoftFilter(userId), setSoftFilter)}
            loading={loading.softFilter}
            disabled={!userId}
          />
          {!userId ? (
            <EmptyState>Load a user above to fetch soft filter data</EmptyState>
          ) : softFilter?.jobs?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="pb-2 pr-3 font-medium w-8">#</th>
                    <th className="pb-2 pr-3 font-medium">Job Title</th>
                    <th className="pb-2 pr-3 font-medium">Company</th>
                    <th className="pb-2 pr-3 font-medium">Sector</th>
                    <th className="pb-2 pr-3 font-medium">Similarity</th>
                    <th className="pb-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {softFilter.jobs.map(j => {
                    const rowBg = !j.passed_soft
                      ? 'bg-rose-50/40'
                      : !j.passed_diversity
                      ? 'bg-amber-50/30'
                      : 'bg-emerald-50/40'

                    const badge = !j.passed_soft
                      ? { label: j.soft_reason || 'Failed soft', cls: 'bg-rose-100 text-rose-700' }
                      : !j.passed_diversity
                      ? { label: j.diversity_reason || 'Diversity cut', cls: 'bg-amber-100 text-amber-600' }
                      : { label: '✓ Top 15', cls: 'bg-emerald-100 text-emerald-700' }

                    return (
                      <tr key={j.job_id} className={`border-b border-slate-50 ${rowBg}`}>
                        <td className="py-1.5 pr-3 text-slate-400 tabular-nums">{j.rank}</td>
                        <td className="py-1.5 pr-3 font-medium text-slate-700 max-w-[220px] truncate">{j.title}</td>
                        <td className="py-1.5 pr-3 text-slate-500 max-w-[130px] truncate">{j.company}</td>
                        <td className="py-1.5 pr-3 text-slate-400">{j.sector || '—'}</td>
                        <td className="py-1.5 pr-3 font-mono text-violet-600">{(j.similarity * 100).toFixed(1)}%</td>
                        <td className="py-1.5">
                          <span className={`px-2 py-0.5 rounded-full font-medium text-xs ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : softFilter ? (
            <EmptyState>No results. Run Hard Filter step first.</EmptyState>
          ) : (
            <EmptyState>Fetch to see all 50 with soft filter and diversification results</EmptyState>
          )}
        </div>

        {/* ── Section 5: LLM Scores ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <SectionHeader
            title="LLM Dimension Scores"
            subtitle={scored
              ? `${scored.total_scored} scored · ${scored.delivered_count} delivered`
              : 'Claude Haiku dimension scores for all scored candidates'}
            onFetch={() => loadSection('scored', () => debugScored(userId), setScored)}
            loading={loading.scored}
            disabled={!userId}
          />
          {!userId ? (
            <EmptyState>Load a user above to fetch scored jobs</EmptyState>
          ) : scored?.jobs?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="pb-2 pr-2 font-medium w-6">#</th>
                    <th className="pb-2 pr-2 font-medium">Title</th>
                    <th className="pb-2 pr-2 font-medium">Company</th>
                    <th className="pb-2 pr-2 font-medium text-center">Skills</th>
                    <th className="pb-2 pr-2 font-medium text-center">Exp</th>
                    <th className="pb-2 pr-2 font-medium text-center">Salary</th>
                    <th className="pb-2 pr-2 font-medium text-center">Industry</th>
                    <th className="pb-2 pr-2 font-medium text-center">Function</th>
                    <th className="pb-2 pr-2 font-medium text-center">Trajectory</th>
                    <th className="pb-2 pr-2 font-medium text-center">Score</th>
                    <th className="pb-2 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.jobs.map(j => {
                    const rowBg = j.delivered
                      ? 'bg-violet-50'
                      : j.rank <= 3
                      ? 'bg-emerald-50/50'
                      : ''
                    const scoreColor = j.score >= 0.8
                      ? 'text-emerald-600'
                      : j.score >= 0.6
                      ? 'text-amber-600'
                      : 'text-rose-500'

                    return (
                      <tr key={j.job_id} className={`border-b border-slate-50 ${rowBg}`}>
                        <td className="py-2 pr-2 text-slate-400 tabular-nums">{j.rank}</td>
                        <td className="py-2 pr-2 font-medium text-slate-700 max-w-[180px] truncate">{j.title}</td>
                        <td className="py-2 pr-2 text-slate-500 max-w-[110px] truncate">{j.company}</td>
                        <td className="py-2 pr-2"><ScoreBar value={j.skills_match} /></td>
                        <td className="py-2 pr-2"><ScoreBar value={j.experience_level} /></td>
                        <td className="py-2 pr-2"><ScoreBar value={j.salary} /></td>
                        <td className="py-2 pr-2"><ScoreBar value={j.industry_alignment} /></td>
                        <td className="py-2 pr-2"><ScoreBar value={j.function_type} /></td>
                        <td className="py-2 pr-2"><ScoreBar value={j.career_trajectory} /></td>
                        <td className="py-2 pr-2 text-center">
                          <span className={`font-bold tabular-nums ${scoreColor}`}>
                            {j.score != null ? `${Math.round(j.score * 100)}%` : '—'}
                          </span>
                        </td>
                        <td className="py-2 text-center">
                          {j.delivered
                            ? <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium text-xs">Delivered</span>
                            : <span className="text-slate-400 text-xs">#{j.rank}</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : scored ? (
            <EmptyState>No scored jobs yet — run LLM Score step first</EmptyState>
          ) : (
            <EmptyState>Fetch to see dimension scores for all candidates</EmptyState>
          )}
        </div>

      </div>
    </div>
  )
}
