import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getMatches, submitFeedback, getFeedback, recordEngagement, getProfile } from '../api'
import DetailsDrawer from '../components/DetailsDrawer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function firstName(email = '') {
  const local = email.split('@')[0] || ''
  const part = local.split('.')[0] || local.split('_')[0] || local
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
}

function formatTime(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function isNew(job) {
  if (!job?.posted_at) return false
  return (Date.now() - new Date(job.posted_at).getTime()) < 24 * 60 * 60 * 1000
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ toasts, onRemove }) {
  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg
                     animate-[fadeInUp_150ms_ease-out] pointer-events-auto"
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}

function useToasts() {
  const [toasts, setToasts] = useState([])
  const add = useCallback((message) => {
    const id = Date.now()
    setToasts(t => [...t, { id, message }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }, [])
  return [toasts, add]
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0" />
          <div className="flex-1">
            <div className="h-3 bg-slate-200 rounded w-24 mb-2" />
            <div className="h-5 bg-slate-200 rounded w-3/4" />
          </div>
        </div>
        <div className="w-14 h-7 bg-slate-100 rounded-full" />
      </div>
      <div className="flex gap-2 mb-4">
        <div className="h-6 bg-slate-100 rounded-full w-16" />
        <div className="h-6 bg-slate-100 rounded-full w-20" />
      </div>
      <div className="bg-slate-50 rounded-xl p-3 mb-4">
        <div className="h-3 bg-slate-200 rounded w-24 mb-2" />
        <div className="h-3 bg-slate-200 rounded w-full mb-1" />
        <div className="h-3 bg-slate-200 rounded w-4/5" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex gap-2">
          <div className="w-9 h-9 bg-slate-100 rounded-xl" />
          <div className="w-9 h-9 bg-slate-100 rounded-xl" />
        </div>
        <div className="w-6 h-6 bg-slate-100 rounded-full" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Job Card
// ---------------------------------------------------------------------------

function JobCard({ match, userId, initialRating, removing, onReact, onOpenDrawer }) {
  const [saving, setSaving] = useState(false)
  const pct = Math.round((match.score || 0) * 100)

  const scoreBadge = pct >= 85
    ? 'bg-green-50 text-green-700 border-green-200'
    : pct >= 70
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-slate-50 text-slate-500 border-slate-200'

  const initials = (match.company || '?').slice(0, 2).toUpperCase()

  async function handleFeedback(rating) {
    if (saving) return
    setSaving(true)
    try {
      await submitFeedback(userId, match.job_id, rating, '', 2)
      onReact(rating, match.job_id)
    } catch {
      setSaving(false)
    }
  }

  const reasons = match.reasoning
    ? match.reasoning.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 15).slice(0, 3)
    : []

  return (
    <div
      className={`
        bg-white rounded-2xl border border-slate-200 overflow-hidden
        shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]
        hover:border-l-[3px] hover:border-l-violet-500
        transition-all duration-200 group relative
        ${removing ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'}
      `}
      style={{ transition: removing ? 'all 200ms ease-out' : 'box-shadow 150ms, border 150ms, opacity 200ms, transform 200ms' }}
    >
      {/* New badge */}
      {isNew(match) && (
        <div className="absolute top-3 right-3 z-10">
          <span className="text-xs bg-violet-600 text-white px-2 py-0.5 rounded-full font-semibold">New</span>
        </div>
      )}

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-400 mb-0.5 truncate">{match.company}</p>
            <h3 className="text-base font-semibold text-slate-900 leading-snug truncate">{match.title}</h3>
          </div>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${scoreBadge}`}
            aria-label={`Match score: ${pct} percent`}
          >
            {pct}%
          </span>
        </div>

        {/* Meta tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {match.work_mode && (
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{match.work_mode}</span>
          )}
          {match.location_raw && (
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{match.location_raw}</span>
          )}
          {(match.salary_min || match.salary_max) && (
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              ${match.salary_min ? `${(match.salary_min/1000).toFixed(0)}k` : '?'}
              {match.salary_max ? `–$${(match.salary_max/1000).toFixed(0)}k` : '+'}
            </span>
          )}
          {match.sector && (
            <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{match.sector}</span>
          )}
        </div>

        {/* Why you match */}
        <div className="bg-slate-50 rounded-xl p-3 mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Why you match</p>
          {reasons.length > 0 ? (
            <ul className="space-y-1">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="text-violet-400 mt-0.5 shrink-0">·</span>
                  <span className="leading-snug">{r}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 leading-relaxed">{match.reasoning || 'Analysis in progress.'}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            {initialRating ? (
              <span className={`text-sm font-semibold ${initialRating === 'thumbs_up' ? 'text-green-600' : 'text-rose-500'}`}>
                {initialRating === 'thumbs_up' ? '👍 Good fit' : '👎 Not a fit'}
              </span>
            ) : (
              <>
                <button
                  onClick={() => handleFeedback('thumbs_up')}
                  disabled={saving}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-green-300 hover:text-green-600 hover:bg-green-50 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-400 min-h-[44px]"
                  aria-label="Good fit — thumbs up"
                >
                  👍
                </button>
                <button
                  onClick={() => handleFeedback('thumbs_down')}
                  disabled={saving}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rose-400 min-h-[44px]"
                  aria-label="Not a fit — thumbs down"
                >
                  👎
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => onOpenDrawer(match)}
            className="p-2 rounded-full text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={`View details for ${match.title}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Match Funnel
// ---------------------------------------------------------------------------

function MatchFunnel({ matches, feedback }) {
  const shown = matches.length
  const reacted = feedback.length
  const liked = feedback.filter(f => f.rating === 'thumbs_up').length
  const disliked = feedback.filter(f => f.rating === 'thumbs_down').length
  const reactRate = shown > 0 ? Math.round((reacted / shown) * 100) : 0

  if (shown === 0) {
    return (
      <div className="text-center py-6 text-slate-400">
        <p className="text-sm">Your funnel will appear after you interact with your first few matches.</p>
      </div>
    )
  }

  const steps = [
    { label: 'Shown', value: shown, color: 'bg-slate-200', width: 100 },
    { label: 'Reacted', value: reacted, color: 'bg-violet-400', width: shown > 0 ? Math.max(8, Math.round((reacted / shown) * 100)) : 0 },
    { label: 'Liked', value: liked, color: 'bg-green-400', width: shown > 0 ? Math.max(liked > 0 ? 4 : 0, Math.round((liked / shown) * 100)) : 0 },
  ]

  return (
    <div className="space-y-3">
      {steps.map(s => (
        <div key={s.label} className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-14 shrink-0">{s.label}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
            <div
              className={`${s.color} h-full rounded-full flex items-center justify-end pr-2`}
              style={{ width: `${s.width}%`, minWidth: s.value > 0 ? '24px' : 0 }}
            >
              <span className="text-xs font-semibold text-white">{s.value}</span>
            </div>
          </div>
        </div>
      ))}
      <div className="pt-2 flex gap-4 text-xs text-slate-500 flex-wrap">
        <span>Reaction rate: <strong className="text-slate-700">{reactRate}%</strong></span>
        <span>👍 <strong className="text-green-600">{liked}</strong> liked</span>
        <span>👎 <strong className="text-rose-500">{disliked}</strong> disliked</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Matching Insights
// ---------------------------------------------------------------------------

function MatchingInsights({ matches, feedback }) {
  const MIN_INTERACTIONS = 5

  if (feedback.length < MIN_INTERACTIONS) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-slate-400 leading-relaxed">
          Interact with at least {MIN_INTERACTIONS} jobs to unlock personalized insights.
        </p>
        <p className="text-xs text-slate-300 mt-1">{feedback.length}/{MIN_INTERACTIONS} interactions so far</p>
      </div>
    )
  }

  const liked = feedback.filter(f => f.rating === 'thumbs_up')
  const insights = []

  // Work mode insight
  const modes = {}
  for (const m of matches) {
    const fb = feedback.find(f => f.job_id === m.job_id)
    if (fb?.rating === 'thumbs_up' && m.work_mode) {
      modes[m.work_mode] = (modes[m.work_mode] || 0) + 1
    }
  }
  const topMode = Object.entries(modes).sort((a, b) => b[1] - a[1])[0]
  if (topMode) insights.push(`You prefer ${topMode[0].replace('_', '-')} roles`)

  // Sector insight
  const sectors = {}
  for (const m of matches) {
    const fb = feedback.find(f => f.job_id === m.job_id)
    if (fb?.rating === 'thumbs_up' && m.sector) {
      sectors[m.sector] = (sectors[m.sector] || 0) + 1
    }
  }
  const topSector = Object.entries(sectors).sort((a, b) => b[1] - a[1])[0]
  if (topSector) insights.push(`You engage most with ${topSector[0]} roles`)

  // Score insight
  const likedScores = liked.map(f => {
    const m = matches.find(x => x.job_id === f.job_id)
    return m?.score || 0
  }).filter(Boolean)
  if (likedScores.length > 0) {
    const avg = likedScores.reduce((s, v) => s + v, 0) / likedScores.length
    insights.push(`Jobs you like average ${Math.round(avg * 100)}% match score`)
  }

  if (insights.length === 0) {
    return <p className="text-sm text-slate-400">Keep interacting with jobs to unlock insights.</p>
  }

  return (
    <div className="space-y-3">
      {insights.map((insight, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="text-violet-400 mt-0.5 shrink-0">✦</span>
          <p className="text-sm text-slate-700">{insight}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Missed Opportunities
// ---------------------------------------------------------------------------

function MissedOpportunities({ matches, feedback }) {
  const reactedIds = new Set(feedback.map(f => f.job_id))
  const missed = matches
    .filter(m => (m.score || 0) >= 0.85 && !reactedIds.has(m.job_id))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3)

  if (missed.length === 0) {
    return (
      <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-4">
        No missed opportunities this week — you're staying on top of your matches.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {missed.map(m => {
        const pct = Math.round((m.score || 0) * 100)
        return (
          <div key={m.job_id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-violet-200 transition-colors">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">{m.title}</p>
              <p className="text-xs text-slate-400">{m.company}{m.location_raw ? ` · ${m.location_raw}` : ''}</p>
            </div>
            <div className="flex items-center gap-3 ml-3 shrink-0">
              <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">{pct}%</span>
              {m.url && (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
                >
                  Review →
                </a>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score Trend Chart (SVG)
// ---------------------------------------------------------------------------

function ScoreTrendChart({ matches }) {
  const byDate = {}
  for (const m of matches) {
    const ts = m.emailed_at || m.created_at
    if (!ts || !m.score) continue
    const day = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (!byDate[day]) byDate[day] = []
    byDate[day].push(m.score)
  }

  const points = Object.entries(byDate)
    .slice(-14)
    .map(([date, scores]) => ({
      date,
      avg: scores.reduce((s, v) => s + v, 0) / scores.length,
    }))

  if (points.length < 2) {
    return (
      <div className="h-24 flex items-center justify-center">
        <p className="text-sm text-slate-400">Your score trend will appear after 7 days of matches.</p>
      </div>
    )
  }

  const W = 500, H = 100, PX = 10, PY = 12
  const xStep = (W - PX * 2) / (points.length - 1)
  const minV = Math.min(...points.map(p => p.avg))
  const maxV = Math.max(...points.map(p => p.avg))
  const range = maxV - minV || 0.1

  const x = (i) => PX + i * xStep
  const y = (v) => PY + (1 - (v - minV) / range) * (H - PY * 2)

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.avg)}`).join(' ')

  const [hovered, setHovered] = useState(null)

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: '80px' }}
        role="img"
        aria-label="Match score trend over time"
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(t => (
          <line
            key={t}
            x1={PX} x2={W - PX}
            y1={PY + (1 - t) * (H - PY * 2)}
            y2={PY + (1 - t) * (H - PY * 2)}
            stroke="#f1f5f9" strokeWidth="1"
          />
        ))}

        {/* Line */}
        <path d={pathD} fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots + hover targets */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={x(i)} cy={y(p.avg)} r="3"
              fill="white" stroke="#7c3aed" strokeWidth="1.5"
            />
            <circle
              cx={x(i)} cy={y(p.avg)} r="12"
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHovered({ i, ...p })}
              onMouseLeave={() => setHovered(null)}
            />
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute bg-slate-900 text-white text-xs px-2 py-1 rounded-lg pointer-events-none z-10 -translate-x-1/2 -translate-y-full -mt-1 whitespace-nowrap"
          style={{
            left: `${(hovered.i / (points.length - 1)) * 100}%`,
            top: '0',
          }}
        >
          {hovered.date}: {Math.round(hovered.avg * 100)}%
        </div>
      )}

      {/* X-axis labels */}
      <div className="flex justify-between mt-1 px-2">
        <span className="text-xs text-slate-400">{points[0]?.date}</span>
        <span className="text-xs text-slate-400">{points[points.length - 1]?.date}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const userId = localStorage.getItem('userId')
  const userEmail = localStorage.getItem('userEmail') || ''

  const [allMatches, setAllMatches] = useState([])
  const [feedback, setFeedback] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [drawerJob, setDrawerJob] = useState(null)

  // Display state for top 3 + queue
  const [displayed, setDisplayed] = useState([])   // [{match, removing}]
  const [queue, setQueue] = useState([])

  const [toasts, addToast] = useToasts()

  // Derive unreacted matches for top 3
  function buildDisplayState(matches, fb) {
    const reactedIds = new Set(fb.map(f => f.job_id))
    const unreacted = matches
      .filter(m => !reactedIds.has(m.job_id))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
    const top3 = unreacted.slice(0, 3).map(m => ({ match: m, removing: false }))
    const rest = unreacted.slice(3)
    setDisplayed(top3)
    setQueue(rest)
  }

  async function load() {
    if (!userId) return
    setLoading(true)
    try {
      const [data, fb, prof] = await Promise.all([
        getMatches(userId, 0, 100, true),
        getFeedback(userId).catch(() => []),
        getProfile(userId).catch(() => null),
      ])
      setAllMatches(data)
      setFeedback(fb)
      setProfile(prof)
      buildDisplayState(data, fb)
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (userId) recordEngagement(userId)
  }, [userId])

  function handleReact(rating, jobId) {
    const msg = rating === 'thumbs_up'
      ? "Got it — we'll show more like this"
      : "Noted — we'll adjust your matches"
    addToast(msg)

    // Mark card as removing (animate out)
    setDisplayed(prev =>
      prev.map(d => d.match.job_id === jobId ? { ...d, removing: true } : d)
    )

    // After animation, replace with next from queue
    setTimeout(() => {
      setDisplayed(prev => {
        const filtered = prev.filter(d => d.match.job_id !== jobId)
        const next = queue[0]
        const newQueue = queue.slice(1)
        setQueue(newQueue)
        if (next) {
          return [...filtered, { match: next, removing: false }]
        }
        return filtered
      })
    }, 220)

    // Update feedback map
    setFeedback(prev => [...prev.filter(f => f.job_id !== jobId), { job_id: jobId, rating }])
  }

  function handleDrawerFeedback(rating, jobId) {
    handleReact(rating, jobId)
  }

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <p className="text-base font-semibold text-slate-700 mb-1">No account found</p>
        <p className="text-sm text-slate-400">
          Go to <Link to="/profile" className="text-violet-600 font-medium hover:underline">Profile</Link> to create your account.
        </p>
      </div>
    )
  }

  const name = profile?.role_description
    ? firstName(userEmail)
    : firstName(userEmail)

  const feedbackMap = Object.fromEntries(feedback.map(f => [f.job_id, f]))

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {getGreeting()}{name ? `, ${name}` : ''}.
          </h1>
          <p className="text-sm text-slate-500 mt-1">Here are your top matches for today.</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          {lastUpdated && (
            <p className="text-xs text-slate-400">Updated {formatTime(lastUpdated)}</p>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="text-xs font-semibold text-violet-600 hover:text-violet-800 disabled:opacity-40 transition-colors"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <p className="text-xs text-slate-300">Matches refresh daily at 5:00 AM</p>
        </div>
      </div>

      {/* ── Today's Top Matches ── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Today's Top Matches</h2>
            {!loading && allMatches.length > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">
                {displayed.length} of {allMatches.filter(m => !feedbackMap[m.job_id]).length} unreacted
              </p>
            )}
          </div>
          <Link to="/matches" className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors">
            View all matches →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : displayed.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <p className="text-sm font-medium text-slate-600 mb-1">
              {allMatches.length === 0
                ? "We're still finding your best matches. Check back soon or expand your preferences."
                : "You've reviewed all of today's matches. Come back tomorrow for new ones."}
            </p>
            <Link
              to="/profile"
              className="mt-3 inline-block text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
            >
              Update preferences →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {displayed.map(({ match, removing }) => (
              <JobCard
                key={match.job_id}
                match={match}
                userId={userId}
                initialRating={feedbackMap[match.job_id]?.rating || null}
                removing={removing}
                onReact={handleReact}
                onOpenDrawer={setDrawerJob}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Two-column section ── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-8">
        {/* Match Funnel — 40% */}
        <section className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Match Funnel</h2>
          <p className="text-xs text-slate-400 mb-4">Your engagement flow</p>
          <MatchFunnel matches={allMatches} feedback={feedback} />
        </section>

        {/* Matching Insights — 60% */}
        <section className="md:col-span-3 bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Matching Insights</h2>
          <p className="text-xs text-slate-400 mb-4">What we've learned about your preferences</p>
          <MatchingInsights matches={allMatches} feedback={feedback} />
        </section>
      </div>

      {/* ── Missed Opportunities ── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-8">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-slate-900">Missed Opportunities</h2>
          <Link to="/matches" className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors">
            View all missed →
          </Link>
        </div>
        <p className="text-xs text-slate-400 mb-4">Strong matches this week you haven't reviewed</p>
        <MissedOpportunities matches={allMatches} feedback={feedback} />
      </section>

      {/* ── Score Trend ── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-8">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Average Match Score</h2>
        <p className="text-xs text-slate-400 mb-4">Last 14 days</p>
        <ScoreTrendChart matches={allMatches} />
      </section>

      {/* Drawer */}
      {drawerJob && (
        <DetailsDrawer
          job={drawerJob}
          userId={userId}
          onClose={() => setDrawerJob(null)}
          onFeedback={handleDrawerFeedback}
        />
      )}

      {/* Toasts */}
      <Toast toasts={toasts} />
    </div>
  )
}
