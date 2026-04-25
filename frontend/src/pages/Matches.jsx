import { useState, useEffect } from 'react'
import { getMatches, submitFeedback, deleteFeedback, getFeedback } from '../api'

function ScoreBadge({ score }) {
  const pct = Math.round((score || 0) * 100)
  const color = pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'
  return <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{pct}% match</span>
}

function ThumbUpIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
    </svg>
  )
}

function ThumbDownIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
    </svg>
  )
}

function JobCard({ match, userId, onFeedback, initialRating = null }) {
  const [rating, setRating] = useState(initialRating)
  const [saving, setSaving] = useState(false)

  async function handleVote(r) {
    if (saving) return
    const next = rating === r ? null : r
    setRating(next)
    setSaving(true)
    try {
      if (next === null) {
        await deleteFeedback(userId, match.job_id)
      } else {
        await submitFeedback(userId, match.job_id, next, '')
      }
      onFeedback()
    } catch {
      setRating(rating)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 text-base truncate">{match.title}</h3>
          <p className="text-slate-500 text-sm">{match.company} · {match.location_raw || 'Location N/A'}</p>
        </div>
        <ScoreBadge score={match.score} />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {match.work_mode && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">{match.work_mode}</span>}
        {match.salary_min && (
          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">
            ${(match.salary_min / 1000).toFixed(0)}k{match.salary_max ? `–$${(match.salary_max / 1000).toFixed(0)}k` : '+'}
            {match.salary_currency ? ` ${match.salary_currency}` : ''}
          </span>
        )}
        {match.sector && <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">{match.sector}</span>}
      </div>

      {match.reasoning && (
        <p className="text-xs text-slate-500 italic mb-3">{match.reasoning}</p>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleVote('thumbs_up')}
            disabled={saving}
            aria-label="Good fit"
            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all disabled:opacity-50 ${
              rating === 'thumbs_up'
                ? 'border-green-300 text-green-600 bg-green-50'
                : 'border-slate-200 text-slate-400 hover:border-green-300 hover:text-green-600 hover:bg-green-50'
            }`}
          >
            <ThumbUpIcon />
          </button>
          <button
            onClick={() => handleVote('thumbs_down')}
            disabled={saving}
            aria-label="Not a fit"
            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all disabled:opacity-50 ${
              rating === 'thumbs_down'
                ? 'border-rose-300 text-rose-500 bg-rose-50'
                : 'border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50'
            }`}
          >
            <ThumbDownIcon />
          </button>
        </div>
        {match.url && (
          <a href={match.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline font-medium">
            View job →
          </a>
        )}
      </div>
    </div>
  )
}

export default function Matches() {
  const userId = localStorage.getItem('userId')
  const [matches, setMatches] = useState([])
  const [feedbackMap, setFeedbackMap] = useState({})
  const [minScore, setMinScore] = useState(0.8)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    if (!userId) return
    setLoading(true)
    try {
      const [data, fb] = await Promise.all([
        getMatches(userId, minScore),
        getFeedback(userId).catch(() => []),
      ])
      setMatches(data)
      const map = {}
      for (const f of fb) map[f.job_id] = f.rating
      setFeedbackMap(map)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId, minScore])

  const feedbackCount = Object.keys(feedbackMap).length

  if (!userId) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-lg mb-2">No account found.</p>
        <p className="text-sm">Go to <strong>Setup</strong> to create your account first.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Your Matches</h1>
        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-600 flex items-center gap-2">
            Min score:
            <select
              value={minScore}
              onChange={e => setMinScore(parseFloat(e.target.value))}
              className="border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={0}>All</option>
              <option value={0.5}>50%+</option>
              <option value={0.7}>70%+</option>
              <option value={0.8}>80%+</option>
            </select>
          </label>
          <button onClick={load} className="text-sm text-indigo-600 hover:underline font-medium">Refresh</button>
        </div>
      </div>

      {matches.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-slate-500">{matches.length} job{matches.length !== 1 ? 's' : ''} found</p>
            <p className="text-xs text-slate-400">{feedbackCount} rated — AI learns your taste automatically</p>
          </div>
          {feedbackCount > 0 && feedbackCount < 10 && (
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div className="bg-purple-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(feedbackCount / 10 * 100, 100)}%` }} />
            </div>
          )}
          {feedbackCount >= 10 && (
            <p className="text-xs text-purple-600 font-medium">Enough feedback collected — run the pipeline to re-score with updated preferences.</p>
          )}
        </div>
      )}

      {msg && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">{msg}</div>}

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading...</div>
      ) : matches.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg mb-2">No matches yet.</p>
          <p className="text-sm">Go to <strong>Pipeline</strong> to run a job search.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map(m => (
            <JobCard key={m.match_id} match={m} userId={userId} onFeedback={load} initialRating={feedbackMap[m.job_id] || null} />
          ))}
        </div>
      )}
    </div>
  )
}
