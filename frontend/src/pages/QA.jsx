import { useState, useEffect } from 'react'
import { getActivity } from '../api'

// ---------------------------------------------------------------------------
// Event metadata
// ---------------------------------------------------------------------------

const EVENT_META = {
  thumbs_up:            { icon: '👍', label: 'Liked',                color: 'bg-green-100 text-green-700 border-green-200' },
  thumbs_down:          { icon: '👎', label: 'Disliked',             color: 'bg-rose-100 text-rose-700 border-rose-200' },
  link_click:           { icon: '🔗', label: 'Link clicked',         color: 'bg-slate-100 text-slate-600 border-slate-200' },
  email_thumbs_up:      { icon: '📧👍', label: 'Email liked',        color: 'bg-green-50 text-green-600 border-green-200' },
  email_thumbs_down:    { icon: '📧👎', label: 'Email disliked',     color: 'bg-rose-50 text-rose-600 border-rose-200' },
  click:                { icon: '👆', label: 'Clicked job',          color: 'bg-sky-100 text-sky-700 border-sky-200' },
  applied:              { icon: '📨', label: 'Applied',              color: 'bg-amber-100 text-amber-700 border-amber-200' },
  interview:            { icon: '🤝', label: 'Interview',            color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  dashboard_visit:      { icon: '👁', label: 'Dashboard visit',      color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  email_sent:           { icon: '✉️', label: 'Email sent',           color: 'bg-blue-50 text-blue-700 border-blue-200' },
  recap_sent:           { icon: '📋', label: 'Recap sent',           color: 'bg-blue-50 text-blue-600 border-blue-200' },
  profile_updated:      { icon: '🧠', label: 'Profile updated',      color: 'bg-purple-100 text-purple-700 border-purple-200' },
  weights_updated:      { icon: '⚖️', label: 'Weights updated',      color: 'bg-violet-100 text-violet-700 border-violet-200' },
  cold_start_graduated: { icon: '🎓', label: 'Cold start graduated', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  llm_scored:           { icon: '🤖', label: 'LLM scored',           color: 'bg-orange-50 text-orange-700 border-orange-200' },
  jobs_delivered:       { icon: '📦', label: 'Jobs delivered',       color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  filter_run:           { icon: '🔍', label: 'Filter run',           color: 'bg-slate-100 text-slate-600 border-slate-200' },
}

const DIMENSIONS = ['skills_match', 'industry_alignment', 'experience_level', 'function_type', 'salary', 'career_trajectory']

function formatTs(ts) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WeightBar({ label, value, before }) {
  const pct = Math.round((value || 0) * 100)
  const prevPct = before ? Math.round((before || 0) * 100) : null
  const delta = prevPct !== null ? pct - prevPct : null
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-36 text-slate-500 shrink-0">{label.replace(/_/g, ' ')}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${pct * 2}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-slate-700">{pct}%</span>
      {delta !== null && (
        <span className={`w-10 text-right font-mono text-xs ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
          {delta > 0 ? `+${delta}` : delta === 0 ? '—' : delta}
        </span>
      )}
    </div>
  )
}

function WeightsPanel({ weights, weightsBefore }) {
  if (!weights) return null
  return (
    <div className="mt-3 bg-violet-50 border border-violet-100 rounded-lg p-3 space-y-2">
      <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide mb-2">
        Dimension weights {weightsBefore ? '(with change vs before)' : ''}
      </p>
      {DIMENSIONS.map(d => (
        <WeightBar key={d} label={d} value={weights[d]} before={weightsBefore?.[d]} />
      ))}
    </div>
  )
}

function DimensionScores({ scores }) {
  if (!scores) return null
  return (
    <div className="mt-2 space-y-1.5">
      {DIMENSIONS.map(d => {
        const v = scores[d]
        if (v == null) return null
        const pct = Math.round(v * 100)
        const color = pct >= 70 ? 'bg-green-400' : pct >= 45 ? 'bg-amber-400' : 'bg-rose-400'
        return (
          <div key={d} className="flex items-center gap-2 text-xs">
            <span className="w-36 text-slate-500 shrink-0">{d.replace(/_/g, ' ')}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
              <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-8 text-right font-mono text-slate-600">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

function Diff({ changes }) {
  if (!changes || Object.keys(changes).length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      {Object.entries(changes).map(([field, { before, after }]) => (
        <div key={field} className="text-xs">
          <span className="font-semibold text-slate-500 uppercase tracking-wide">{field.replace(/_/g, ' ')}</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <div className="bg-rose-50 border border-rose-100 rounded p-2 text-rose-700 leading-relaxed">
              <span className="text-rose-400 font-bold mr-1">−</span>
              {Array.isArray(before) ? (before.length ? before.join(', ') : <em className="opacity-50">empty</em>) : (before ?? <em className="opacity-50">null</em>)}
            </div>
            <div className="bg-green-50 border border-green-100 rounded p-2 text-green-700 leading-relaxed">
              <span className="text-green-500 font-bold mr-1">+</span>
              {Array.isArray(after) ? (after.length ? after.join(', ') : <em className="opacity-50">empty</em>) : (after ?? <em className="opacity-50">null</em>)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Snapshot({ snapshot }) {
  if (!snapshot) return null
  const fields = Object.entries(snapshot).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
  return (
    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-slate-400 uppercase tracking-wide mb-2">Profile snapshot</p>
      {fields.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="text-slate-400 w-40 shrink-0">{k.replace(/_/g, ' ')}</span>
          <span className="text-slate-700 break-words">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
        </div>
      ))}
    </div>
  )
}

function JobsList({ jobs, showScores }) {
  if (!jobs?.length) return null
  return (
    <div className="mt-2 space-y-3">
      {jobs.map((j, i) => (
        <div key={i} className="border border-slate-100 rounded-lg p-2 bg-slate-50">
          <p className="text-xs font-semibold text-slate-700">{i + 1}. {j.title} <span className="text-slate-400 font-normal">· {j.company}</span></p>
          {showScores && (
            <div className="flex gap-3 mt-1 text-xs text-slate-500">
              {j.score != null && <span>Score: <strong className="text-slate-700">{Math.round(j.score * 100)}%</strong></span>}
              {j.heuristic_score != null && <span>Heuristic: <strong className="text-slate-700">{Math.round(j.heuristic_score * 100)}%</strong></span>}
            </div>
          )}
          {showScores && j.dimension_scores && <DimensionScores scores={j.dimension_scores} />}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity card
// ---------------------------------------------------------------------------

function ActivityCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  const meta = EVENT_META[item.event_type] || { icon: '•', label: item.event_type, color: 'bg-slate-100 text-slate-600 border-slate-200' }
  const m = item.meta || {}

  const hasDetail = ['profile_updated', 'email_sent', 'weights_updated', 'jobs_delivered', 'llm_scored'].includes(item.event_type)

  function Summary() {
    switch (item.event_type) {
      case 'thumbs_up':
      case 'thumbs_down':
      case 'email_thumbs_up':
      case 'email_thumbs_down':
        return <p className="text-sm text-slate-700">{m.job_title} <span className="text-slate-400">· {m.company}</span>{m.comment && <span className="text-slate-500 italic"> — "{m.comment}"</span>}</p>

      case 'click':
      case 'applied':
      case 'interview':
      case 'link_click':
        return <p className="text-sm text-slate-700">{m.job_title} <span className="text-slate-400">· {m.company}</span></p>

      case 'email_sent':
        return <p className="text-sm text-slate-600">{m.job_count > 0 ? <>{m.job_count} job{m.job_count !== 1 ? 's' : ''} · <span className="text-slate-400">{m.cadence}</span></> : <span className="text-slate-400">Re-engagement</span>}</p>

      case 'recap_sent':
        return <p className="text-sm text-slate-600">{m.job_count} job{m.job_count !== 1 ? 's' : ''} in weekly recap</p>

      case 'profile_updated':
        return (
          <p className="text-sm text-slate-600">
            {m.changes ? `${Object.keys(m.changes).length} field${Object.keys(m.changes).length !== 1 ? 's' : ''} changed` : 'No changes'}
            {m.reasoning && <span className="text-slate-400"> · {m.reasoning}</span>}
          </p>
        )

      case 'weights_updated': {
        const changed = m.weights && m.weights_before
          ? DIMENSIONS.filter(d => Math.abs((m.weights[d] || 0) - (m.weights_before[d] || 0)) > 0.001)
          : []
        return (
          <p className="text-sm text-slate-600">
            {changed.length > 0 ? `${changed.length} dimension${changed.length !== 1 ? 's' : ''} shifted` : 'Weights recalculated'}
            {' · '}<span className="text-slate-400">{m.signal_count} signals</span>
            {m.cold_start === false && <span className="ml-1.5 text-teal-600 text-xs font-medium">✓ Warm</span>}
          </p>
        )
      }

      case 'cold_start_graduated':
        return <p className="text-sm text-slate-600">Enough signals ({m.signal_count}) — now using learned weights</p>

      case 'llm_scored':
        return <p className="text-sm text-slate-600">{m.jobs_scored} job{m.jobs_scored !== 1 ? 's' : ''} scored · <span className="text-slate-400">${(m.estimated_cost_usd || 0).toFixed(5)} est. cost</span></p>

      case 'jobs_delivered':
        return <p className="text-sm text-slate-600">{m.job_count} job{m.job_count !== 1 ? 's' : ''} selected for delivery</p>

      case 'filter_run':
        return <p className="text-sm text-slate-600"><span className="text-green-600 font-medium">{m.passed} passed</span> · <span className="text-rose-500">{m.failed} filtered out</span> · {m.total} total</p>

      case 'dashboard_visit':
        return <p className="text-sm text-slate-400">Opened dashboard</p>

      default:
        return null
    }
  }

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm shrink-0 ${meta.color}`}>
          {meta.icon}
        </div>
        <div className="w-px flex-1 bg-slate-200 mt-1" />
      </div>

      <div className="pb-4 flex-1 min-w-0">
        <div className="bg-white border border-slate-200 rounded-xl p-3 hover:shadow-sm transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-1 ${meta.color}`}>
                {meta.label}
              </span>
              <Summary />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="text-xs text-slate-400 whitespace-nowrap">{formatTs(item.created_at)}</p>
              {hasDetail && (
                <button onClick={() => setExpanded(e => !e)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                  {expanded ? 'Hide' : 'Details'}
                </button>
              )}
            </div>
          </div>

          {expanded && (
            <div className="mt-1">
              {item.event_type === 'profile_updated' && <><Diff changes={m.changes} /><Snapshot snapshot={m.snapshot} /></>}
              {item.event_type === 'weights_updated' && <WeightsPanel weights={m.weights} weightsBefore={m.weights_before} />}
              {item.event_type === 'email_sent' && m.jobs && (
                <div className="mt-2 space-y-1">{m.jobs.map((j, i) => (
                  <p key={i} className="text-xs text-slate-600">{i + 1}. {j.title} <span className="text-slate-400">· {j.company}</span></p>
                ))}</div>
              )}
              {item.event_type === 'llm_scored' && (
                <p className="mt-2 text-xs text-slate-500">Batch scored {m.jobs_scored} jobs. Estimated LLM cost: ${(m.estimated_cost_usd || 0).toFixed(5)}</p>
              )}
              {item.event_type === 'jobs_delivered' && <JobsList jobs={m.jobs} showScores={true} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'signals',   label: 'Signals',   match: e => ['thumbs_up','thumbs_down','email_thumbs_up','email_thumbs_down','link_click','click','applied','interview'].includes(e) },
  { key: 'scoring',   label: 'Scoring',   match: e => ['llm_scored','filter_run','jobs_delivered'].includes(e) },
  { key: 'learning',  label: 'Learning',  match: e => ['weights_updated','profile_updated','cold_start_graduated'].includes(e) },
  { key: 'email',     label: 'Email',     match: e => ['email_sent','recap_sent'].includes(e) },
]

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function StatsBar({ activity }) {
  const signals = activity.filter(a => ['thumbs_up','thumbs_down','applied','interview','click','link_click'].includes(a.event_type))
  const weightUpdates = activity.filter(a => a.event_type === 'weights_updated')
  const lastWeights = weightUpdates[0]?.meta?.weights
  const delivered = activity.filter(a => a.event_type === 'jobs_delivered').reduce((s, a) => s + (a.meta?.job_count || 0), 0)
  const totalCost = activity.filter(a => a.event_type === 'llm_scored').reduce((s, a) => s + (a.meta?.estimated_cost_usd || 0), 0)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {[
        { label: 'Total signals', value: signals.length },
        { label: 'Weight updates', value: weightUpdates.length },
        { label: 'Jobs delivered', value: delivered },
        { label: 'LLM cost (est.)', value: `$${totalCost.toFixed(4)}` },
      ].map(s => (
        <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-slate-800">{s.value}</p>
          <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QA() {
  const userId = localStorage.getItem('userId')
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')

  async function load() {
    if (!userId) return
    setLoading(true)
    try {
      const data = await getActivity(userId)
      setActivity(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId])

  if (!userId) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p className="text-base font-semibold mb-1">No account found</p>
        <p className="text-sm">Go to Profile to set up your account first.</p>
      </div>
    )
  }

  const activeFilter = FILTERS.find(f => f.key === filter)
  const visible = filter === 'all' ? activity : activity.filter(item => activeFilter?.match?.(item.event_type))

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">QA Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">{activity.length} events logged</p>
        </div>
        <button onClick={load} disabled={loading} className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold disabled:opacity-40">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <StatsBar activity={activity} />

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(f => {
          const count = f.key === 'all' ? activity.length : activity.filter(a => f.match?.(a.event_type)).length
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                filter === f.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
              }`}
            >
              {f.label} <span className="opacity-60 ml-1">{count}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-base font-medium text-slate-500 mb-1">No events yet</p>
          <p className="text-sm">Start using the app — every action will appear here.</p>
        </div>
      ) : (
        <div>{visible.map(item => <ActivityCard key={item.id} item={item} />)}</div>
      )}
    </div>
  )
}
