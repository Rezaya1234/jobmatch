import { useState, useEffect } from 'react'
import { getMatches, submitFeedback, getFeedback } from '../api'

function ScoreBadge({ score }) {
  const pct = Math.round((score || 0) * 100)
  const color = pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'
  return <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{pct}% match</span>
}

function FeedbackRow({ match, userId, initialRating, onFeedback }) {
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(initialRating)
  const [saving, setSaving] = useState(false)

  async function handleFeedback(rating) {
    setSaving(true)
    try {
      await submitFeedback(userId, match.job_id, rating, comment, 2)
      setSubmitted(rating)
      onFeedback()
    } finally {
      setSaving(false)
    }
  }

  if (submitted) {
    return (
      <span className={`text-sm font-medium ${submitted === 'thumbs_up' ? 'text-green-600' : 'text-red-500'}`}>
        {submitted === 'thumbs_up' ? '👍 Good fit' : '👎 Not a fit'}
      </span>
    )
  }
  if (saving) return <span className="text-sm text-slate-400">Saving...</span>
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={() => handleFeedback('thumbs_up')} className="text-xl hover:scale-110 transition-transform" title="Good fit">👍</button>
      <button onClick={() => handleFeedback('thumbs_down')} className="text-xl hover:scale-110 transition-transform" title="Not a fit">👎</button>
      <input
        type="text"
        placeholder="Optional comment..."
        value={comment}
        onChange={e => setComment(e.target.value)}
        className="text-xs border border-slate-200 rounded px-2 py-1 w-40 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
    </div>
  )
}

function TodayCard({ match, userId, initialRating, onFeedback }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{match.company}</p>
          <h3 className="text-lg font-bold text-slate-900 leading-snug">{match.title}</h3>
        </div>
        <ScoreBadge score={match.score} />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mt-3 mb-4">
        {match.work_mode && (
          <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">{match.work_mode}</span>
        )}
        {match.location_raw && (
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{match.location_raw}</span>
        )}
        {match.salary_min && (
          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">
            ${(match.salary_min / 1000).toFixed(0)}k{match.salary_max ? `–$${(match.salary_max / 1000).toFixed(0)}k` : '+'}
          </span>
        )}
        {match.sector && (
          <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">{match.sector}</span>
        )}
      </div>

      {/* Why it matches */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 mb-3">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Why it matches your profile</p>
        <p className="text-sm text-blue-900 leading-relaxed">{match.reasoning || 'No reasoning available yet.'}</p>
      </div>

      {/* Gap analysis placeholder */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Gap Analysis · Coming Soon</p>
        <p className="text-sm text-slate-400">We'll highlight where your profile doesn't perfectly align with this role.</p>
      </div>

      {/* Company insights placeholder */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Company Insights · Coming Soon</p>
        <p className="text-sm text-slate-400">Response rates and interview outcome data will appear here as the community shares results.</p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <FeedbackRow match={match} userId={userId} initialRating={initialRating} onFeedback={onFeedback} />
        {match.url && (
          <a
            href={match.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            View Job
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}

function HistoryCard({ match, rating }) {
  const dateStr = match.emailed_at
    ? new Date(match.emailed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : new Date(match.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{match.title}</p>
        <p className="text-xs text-slate-500">{match.company} · {match.location_raw || 'Location N/A'}</p>
      </div>
      <div className="flex items-center gap-3 ml-4 shrink-0">
        {match.score != null && <ScoreBadge score={match.score} />}
        <span className="text-xs text-slate-400">{dateStr}</span>
        {match.url && (
          <a href={match.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline">
            View →
          </a>
        )}
      </div>
    </div>
  )
}

function DislikedHistoryCard({ fb }) {
  const dateStr = new Date(fb.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{fb.job_title}</p>
        <p className="text-xs text-slate-500">{fb.company}</p>
      </div>
      <div className="flex items-center gap-3 ml-4 shrink-0">
        <span className="text-xs text-slate-400">{dateStr}</span>
        {fb.comment && <span className="text-xs text-slate-400 italic">"{fb.comment}"</span>}
      </div>
    </div>
  )
}

function HistoryGroup({ title, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  if (count === 0) return null
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{count}</span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

export default function Dashboard() {
  const userId = localStorage.getItem('userId')
  const [matches, setMatches] = useState([])
  const [feedbackList, setFeedbackList] = useState([])
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!userId) return
    setLoading(true)
    try {
      const [data, fb] = await Promise.all([
        getMatches(userId, 0, 100),
        getFeedback(userId).catch(() => []),
      ])
      setMatches(data)
      setFeedbackList(fb)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId])

  if (!userId) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-lg mb-2">No account found.</p>
        <p className="text-sm">Go to <strong>Profile</strong> to create your account first.</p>
      </div>
    )
  }

  // Build feedback map: job_id → {rating, comment, created_at}
  const feedbackMap = {}
  for (const f of feedbackList) feedbackMap[f.job_id] = f

  // Determine today's 3: most recent emailed batch
  const emailedMatches = matches.filter(m => m.emailed_at)
  let todayMatches = []
  let historyMatches = matches

  if (emailedMatches.length > 0) {
    const latestDate = emailedMatches.reduce((max, m) =>
      new Date(m.emailed_at) > new Date(max.emailed_at) ? m : max
    ).emailed_at
    const latestDay = new Date(latestDate).toDateString()
    todayMatches = emailedMatches.filter(m => new Date(m.emailed_at).toDateString() === latestDay)
    const todayIds = new Set(todayMatches.map(m => m.job_id))
    historyMatches = matches.filter(m => !todayIds.has(m.job_id))
  } else if (matches.length > 0) {
    // No emails sent yet — show top 3 scored as "latest"
    todayMatches = [...matches].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3)
    const todayIds = new Set(todayMatches.map(m => m.job_id))
    historyMatches = matches.filter(m => !todayIds.has(m.job_id))
  }

  // History groups from matches (liked + not reviewed)
  const likedHistory = historyMatches.filter(m => feedbackMap[m.job_id]?.rating === 'thumbs_up')
  const notReviewedHistory = historyMatches.filter(m => !feedbackMap[m.job_id] && m.emailed_at)

  // Disliked: from feedback list (these are excluded from the matches API response)
  const dislikedFeedback = feedbackList.filter(f => f.rating === 'thumbs_down')

  const hasHistory = likedHistory.length > 0 || notReviewedHistory.length > 0 || dislikedFeedback.length > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your Dashboard</h1>
          {todayMatches.length > 0 && (
            <p className="text-sm text-slate-500 mt-1">
              {emailedMatches.length > 0 ? "Today's top matches" : "Your latest matches"}
            </p>
          )}
        </div>
        <button onClick={load} className="text-sm text-indigo-600 hover:underline font-medium">Refresh</button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading...</div>
      ) : matches.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg mb-2">No matches yet.</p>
          <p className="text-sm">The pipeline runs daily at 3 AM Central. Check back soon.</p>
        </div>
      ) : (
        <>
          {/* Today's 3 */}
          <div className="space-y-5 mb-10">
            {todayMatches.map(m => (
              <TodayCard
                key={m.match_id}
                match={m}
                userId={userId}
                initialRating={feedbackMap[m.job_id]?.rating || null}
                onFeedback={load}
              />
            ))}
          </div>

          {/* History */}
          {hasHistory && (
            <div>
              <h2 className="text-base font-semibold text-slate-500 uppercase tracking-wide mb-3">History</h2>
              <HistoryGroup title="Not Reviewed" count={notReviewedHistory.length}>
                {notReviewedHistory.map(m => <HistoryCard key={m.match_id} match={m} />)}
              </HistoryGroup>
              <HistoryGroup title="Liked" count={likedHistory.length}>
                {likedHistory.map(m => <HistoryCard key={m.match_id} match={m} rating="thumbs_up" />)}
              </HistoryGroup>
              <HistoryGroup title="Disliked" count={dislikedFeedback.length}>
                {dislikedFeedback.map(f => <DislikedHistoryCard key={f.id} fb={f} />)}
              </HistoryGroup>
            </div>
          )}
        </>
      )}
    </div>
  )
}
