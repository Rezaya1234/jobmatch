import { useState, useEffect } from 'react'
import { getActivity } from '../api'

const EVENT_META = {
  thumbs_up:        { icon: '👍', label: 'Liked',               color: 'bg-green-100 text-green-700 border-green-200' },
  thumbs_down:      { icon: '👎', label: 'Disliked',            color: 'bg-rose-100 text-rose-700 border-rose-200' },
  link_click:       { icon: '🔗', label: 'Link clicked',        color: 'bg-slate-100 text-slate-600 border-slate-200' },
  email_thumbs_up:  { icon: '📧👍', label: 'Email liked',       color: 'bg-green-50 text-green-600 border-green-200' },
  email_thumbs_down:{ icon: '📧👎', label: 'Email disliked',    color: 'bg-rose-50 text-rose-600 border-rose-200' },
  dashboard_visit:  { icon: '👁', label: 'Dashboard visit',     color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  email_sent:       { icon: '✉️', label: 'Email sent',          color: 'bg-blue-50 text-blue-700 border-blue-200' },
  profile_updated:  { icon: '🧠', label: 'Profile updated',     color: 'bg-purple-100 text-purple-700 border-purple-200' },
}

function formatTs(ts) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
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
              {Array.isArray(before)
                ? (before.length ? before.join(', ') : <em className="opacity-50">empty</em>)
                : (before ?? <em className="opacity-50">null</em>)}
            </div>
            <div className="bg-green-50 border border-green-100 rounded p-2 text-green-700 leading-relaxed">
              <span className="text-green-500 font-bold mr-1">+</span>
              {Array.isArray(after)
                ? (after.length ? after.join(', ') : <em className="opacity-50">empty</em>)
                : (after ?? <em className="opacity-50">null</em>)}
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
      <p className="font-semibold text-slate-400 uppercase tracking-wide mb-2">Profile snapshot after update</p>
      {fields.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="text-slate-400 w-40 shrink-0">{k.replace(/_/g, ' ')}</span>
          <span className="text-slate-700 break-words">
            {Array.isArray(v) ? v.join(', ') : String(v)}
          </span>
        </div>
      ))}
    </div>
  )
}

function ActivityCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  const meta = EVENT_META[item.event_type] || { icon: '•', label: item.event_type, color: 'bg-slate-100 text-slate-600 border-slate-200' }
  const m = item.meta || {}
  const isProfileUpdate = item.event_type === 'profile_updated'
  const isEmailSent = item.event_type === 'email_sent'
  const hasDetail = isProfileUpdate || isEmailSent

  return (
    <div className="flex gap-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm shrink-0 ${meta.color}`}>
          {meta.icon}
        </div>
        <div className="w-px flex-1 bg-slate-200 mt-1" />
      </div>

      {/* Card */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="bg-white border border-slate-200 rounded-xl p-3 hover:shadow-sm transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-1 ${meta.color}`}>
                {meta.label}
              </span>

              {/* Job-related events */}
              {m.job_title && (
                <p className="text-sm font-medium text-slate-800 truncate">
                  {m.job_title} <span className="text-slate-400 font-normal">· {m.company}</span>
                </p>
              )}
              {m.comment && (
                <p className="text-xs text-slate-500 italic mt-0.5">"{m.comment}"</p>
              )}

              {/* Email sent */}
              {isEmailSent && (
                <p className="text-sm text-slate-600">
                  {m.job_count > 0
                    ? <>{m.job_count} job{m.job_count !== 1 ? 's' : ''} · <span className="text-slate-400">{m.cadence}</span></>
                    : <span className="text-slate-400">Re-engagement reminder</span>
                  }
                </p>
              )}

              {/* Profile updated — summary */}
              {isProfileUpdate && (
                <p className="text-sm text-slate-600">
                  {m.changes && Object.keys(m.changes).length > 0
                    ? `${Object.keys(m.changes).length} field${Object.keys(m.changes).length !== 1 ? 's' : ''} changed`
                    : 'No field changes'}
                  {m.reasoning && <span className="text-slate-400"> · {m.reasoning}</span>}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <p className="text-xs text-slate-400 whitespace-nowrap">{formatTs(item.created_at)}</p>
              {hasDetail && (
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                >
                  {expanded ? 'Hide' : 'Details'}
                </button>
              )}
            </div>
          </div>

          {/* Expanded detail */}
          {expanded && isProfileUpdate && (
            <>
              <Diff changes={m.changes} />
              <Snapshot snapshot={m.snapshot} />
            </>
          )}
          {expanded && isEmailSent && m.jobs && (
            <div className="mt-2 space-y-1">
              {m.jobs.map((j, i) => (
                <p key={i} className="text-xs text-slate-600">
                  {i + 1}. {j.title} <span className="text-slate-400">· {j.company}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const FILTERS = [
  { key: 'all',            label: 'All' },
  { key: 'feedback',       label: 'Feedback', match: e => ['thumbs_up','thumbs_down','email_thumbs_up','email_thumbs_down','link_click'].includes(e) },
  { key: 'profile',        label: 'Profile updates', match: e => e === 'profile_updated' },
  { key: 'email',          label: 'Emails sent', match: e => e === 'email_sent' },
  { key: 'visits',         label: 'Visits', match: e => e === 'dashboard_visit' },
]

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
  const visible = filter === 'all'
    ? activity
    : activity.filter(item => activeFilter?.match?.(item.event_type))

  const profileUpdates = activity.filter(a => a.event_type === 'profile_updated')

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">QA Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            {activity.length} events logged · {profileUpdates.length} profile update{profileUpdates.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={load} className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold">
          Refresh
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              filter === f.key
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
            }`}
          >
            {f.label}
            {f.key !== 'all' && (
              <span className="ml-1.5 opacity-60">
                {f.match ? activity.filter(a => f.match(a.event_type)).length : 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-base font-medium text-slate-500 mb-1">No events yet</p>
          <p className="text-sm">Start using the app — every action will appear here.</p>
        </div>
      ) : (
        <div>
          {visible.map(item => (
            <ActivityCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
