import { useState, useEffect } from 'react'
import { getMatches, submitFeedback, getFeedback } from '../api'

function ScoreBadge({ score }) {
  const pct = Math.round((score || 0) * 100)
  const color = pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'
  return <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{pct}% match</span>
}

function JobCard({ match, userId, onFeedback, initialRating = null }) {
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(initialRating)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleFeedback(rating) {
    setSaving(true)
    setError('')
    try {
      await submitFeedback(userId, match.job_id, rating, comment)
      setSubmitted(rating)
      onFeedback()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save feedback')
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
        <div className="flex items-center gap-2 flex-wrap">
          {submitted ? (
            <span className={`text-sm font-medium ${submitted === 'thumbs_up' ? 'text-green-600' : 'text-red-500'}`}>
              {submitted === 'thumbs_up' ? '👍 Good fit' : '👎 Not a fit'}
            </span>
          ) : saving ? (
            <span className="text-sm text-slate-400">Saving...</span>
          ) : (
            <>
              <button onClick={() => handleFeedback('thumbs_up')} className="text-lg hover:scale-110 transition-transform" title="Good fit">👍</button>
              <button onClick={() => handleFeedback('thumbs_down')} className="text-lg hover:scale-110 transition-transform" title="Not a fit">👎</button>
              <input
                type="text"
                placeholder="Optional comment..."
                value={comment}
                onChange={e => setComment(e.target.value)}
                className="text-xs border border-slate-200 rounded px-2 py-1 w-36 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </>
          )}
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
        <div className="flex items-center gap-2">
          {match.url && (
            <a href={match.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline font-medium">
              View job →
            </a>
          )}
        </div>
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
