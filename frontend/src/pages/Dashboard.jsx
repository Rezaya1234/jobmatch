import { useState, useEffect } from 'react'
import { getMatches, submitFeedback, getFeedback, recordEngagement } from '../api'

function ScoreArc({ score }) {
  const pct = Math.round((score || 0) * 100)
  const r = 20
  const circ = 2 * Math.PI * r
  const filled = (pct / 100) * circ
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#94a3b8'

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
        <circle
          cx="26" cy="26" r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          transform="rotate(-90 26 26)"
        />
        <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{pct}%</text>
      </svg>
      <span className="text-xs text-slate-400">match</span>
    </div>
  )
}

function ScoreBar({ score }) {
  const pct = Math.round((score || 0) * 100)
  const color = pct >= 80 ? 'bg-green-400' : pct >= 60 ? 'bg-amber-400' : 'bg-slate-300'
  return <div className={`h-1 w-full rounded-t-xl ${color} opacity-80`} style={{ width: `${pct}%`, minWidth: '12%', maxWidth: '100%' }} />
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
      <span className={`text-sm font-semibold ${submitted === 'thumbs_up' ? 'text-green-600' : 'text-rose-500'}`}>
        {submitted === 'thumbs_up' ? '👍 Good fit' : '👎 Not a fit'}
      </span>
    )
  }
  if (saving) return <span className="text-sm text-slate-400">Saving…</span>
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={() => handleFeedback('thumbs_up')} className="text-xl hover:scale-110 transition-transform" title="Good fit">👍</button>
      <button onClick={() => handleFeedback('thumbs_down')} className="text-xl hover:scale-110 transition-transform" title="Not a fit">👎</button>
      <input
        type="text"
        placeholder="Optional note…"
        value={comment}
        onChange={e => setComment(e.target.value)}
        className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-700"
      />
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <div className="h-3 bg-slate-200 rounded w-24 mb-2" />
          <div className="h-5 bg-slate-200 rounded w-3/4 mb-1" />
          <div className="h-5 bg-slate-200 rounded w-1/2" />
        </div>
        <div className="w-13 h-13 rounded-full bg-slate-200" />
      </div>
      <div className="flex gap-2 mb-4">
        <div className="h-6 bg-slate-100 rounded-full w-16" />
        <div className="h-6 bg-slate-100 rounded-full w-20" />
        <div className="h-6 bg-slate-100 rounded-full w-14" />
      </div>
      <div className="rounded-xl bg-slate-100 p-4 mb-3">
        <div className="h-3 bg-slate-200 rounded w-24 mb-2" />
        <div className="h-3 bg-slate-200 rounded w-full mb-1" />
        <div className="h-3 bg-slate-200 rounded w-5/6" />
      </div>
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <div className="flex gap-2">
          <div className="h-7 w-8 bg-slate-200 rounded" />
          <div className="h-7 w-8 bg-slate-200 rounded" />
        </div>
        <div className="h-8 w-24 bg-slate-200 rounded-lg" />
      </div>
    </div>
  )
}

function TodayCard({ match, userId, initialRating, onFeedback }) {
  const pct = Math.round((match.score || 0) * 100)
  const scoreColor = pct >= 80 ? 'border-green-300' : pct >= 60 ? 'border-amber-300' : 'border-slate-200'

  return (
    <div className={`bg-white rounded-2xl border ${scoreColor} shadow-sm hover:shadow-md transition-shadow overflow-hidden`}>
      <div className="h-1">
        <ScoreBar score={match.score} />
      </div>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{match.company}</p>
            <h3 className="text-lg font-bold text-slate-900 leading-snug">{match.title}</h3>
          </div>
          <ScoreArc score={match.score} />
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3 mb-5">
          {match.work_mode && (
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-medium">{match.work_mode}</span>
          )}
          {match.location_raw && (
            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{match.location_raw}</span>
          )}
          {match.salary_min && (
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
              ${(match.salary_min / 1000).toFixed(0)}k{match.salary_max ? `–$${(match.salary_max / 1000).toFixed(0)}k` : '+'}
            </span>
          )}
          {match.sector && (
            <span className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full">{match.sector}</span>
          )}
        </div>

        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Why it matches</p>
          <p className="text-sm text-slate-700 leading-relaxed">{match.reasoning || 'Analysis in progress.'}</p>
        </div>

        <div className="mb-4 border-l-2 border-slate-200 pl-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Gap Analysis</p>
          <p className="text-xs text-slate-400">Coming soon — we'll highlight where your profile diverges from this role.</p>
        </div>

        <div className="mb-5 border-l-2 border-slate-200 pl-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Company Insights</p>
          <p className="text-xs text-slate-400">Response rates and interview data will appear here as the community contributes.</p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <FeedbackRow match={match} userId={userId} initialRating={initialRating} onFeedback={onFeedback} />
          {match.url && (
            <a
              href={match.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
            >
              Apply
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function HistoryCard({ match, rating }) {
  const pct = Math.round((match.score || 0) * 100)
  const dotColor = pct >= 80 ? 'bg-green-400' : pct >= 60 ? 'bg-amber-400' : 'bg-slate-300'
  const dateStr = match.emailed_at
    ? new Date(match.emailed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : new Date(match.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{match.title}</p>
          <p className="text-xs text-slate-500">{match.company}{match.location_raw ? ` · ${match.location_raw}` : ''}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 ml-4 shrink-0">
        <span className="text-xs font-bold text-slate-500">{pct}%</span>
        <span className="text-xs text-slate-400">{dateStr}</span>
        {match.url && (
          <a
            href={match.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-500 hover:text-indigo-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
          >
            View →
          </a>
        )}
      </div>
    </div>
  )
}

function HistoryGroup({ title, count, children }) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">{count}</span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <p className="text-base font-semibold text-slate-600 mb-1">No matches yet</p>
      <p className="text-sm text-slate-400">The pipeline runs daily at 3 AM Central. Check back soon.</p>
    </div>
  )
}

export default function Dashboard() {
  const userId = localStorage.getItem('userId')
  const [matches, setMatches] = useState([])
  const [feedbackMap, setFeedbackMap] = useState({})
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!userId) return
    setLoading(true)
    try {
      const [data, fb] = await Promise.all([
        getMatches(userId, 0, 100, true),
        getFeedback(userId).catch(() => []),
      ])
      setMatches(data)
      const map = {}
      for (const f of fb) map[f.job_id] = f
      setFeedbackMap(map)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (userId) recordEngagement(userId)
  }, [userId])

  if (!userId) {
    return (
      <div className="text-center py-20">
        <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <p className="text-base font-semibold text-slate-600 mb-1">No account found</p>
        <p className="text-sm text-slate-400">Go to <strong className="text-slate-600">Profile</strong> to create your account first.</p>
      </div>
    )
  }

  const emailedMatches = matches.filter(m => m.emailed_at)
  let todayMatches = []

  if (emailedMatches.length > 0) {
    const latestTs = emailedMatches.reduce((max, m) =>
      new Date(m.emailed_at) > new Date(max.emailed_at) ? m : max
    ).emailed_at
    const latestDay = new Date(latestTs).toDateString()
    const latestBatch = emailedMatches
      .filter(m => new Date(m.emailed_at).toDateString() === latestDay)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
    todayMatches = latestBatch

    if (todayMatches.length < 3) {
      const todayIds = new Set(todayMatches.map(m => m.job_id))
      const extras = matches
        .filter(m => !todayIds.has(m.job_id) && !m.emailed_at)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 3 - todayMatches.length)
      todayMatches = [...todayMatches, ...extras]
    }
  } else {
    todayMatches = [...matches]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 3)
  }

  const todayIds = new Set(todayMatches.map(m => m.job_id))
  const historyMatches = matches.filter(m => !todayIds.has(m.job_id))

  const likedHistory    = historyMatches.filter(m => feedbackMap[m.job_id]?.rating === 'thumbs_up')
  const dislikedHistory = historyMatches.filter(m => feedbackMap[m.job_id]?.rating === 'thumbs_down')
  const notReviewed     = historyMatches.filter(m => !feedbackMap[m.job_id])
  const hasHistory = likedHistory.length > 0 || dislikedHistory.length > 0 || notReviewed.length > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your Dashboard</h1>
          {!loading && todayMatches.length > 0 && (
            <p className="text-sm text-slate-500 mt-1">
              {emailedMatches.length > 0 ? "Today's top matches" : "Your latest matches — email digest coming soon"}
            </p>
          )}
        </div>
        <button
          onClick={load}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-5">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : matches.length === 0 ? (
        <EmptyState />
      ) : (
        <>
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

          {hasHistory && (
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">History</h2>
              <HistoryGroup title="Not Reviewed" count={notReviewed.length}>
                {notReviewed.map(m => <HistoryCard key={m.match_id} match={m} />)}
              </HistoryGroup>
              <HistoryGroup title="Liked" count={likedHistory.length}>
                {likedHistory.map(m => <HistoryCard key={m.match_id} match={m} rating="thumbs_up" />)}
              </HistoryGroup>
              <HistoryGroup title="Disliked" count={dislikedHistory.length}>
                {dislikedHistory.map(m => <HistoryCard key={m.match_id} match={m} rating="thumbs_down" />)}
              </HistoryGroup>
            </div>
          )}
        </>
      )}
    </div>
  )
}
