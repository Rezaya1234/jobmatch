import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getMatches, submitFeedback, getFeedback, recordEngagement, getProfile } from '../api'
import DetailsDrawer from '../components/DetailsDrawer'
import CompanyLogo from '../components/CompanyLogo'

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

function Toast({ toasts }) {
  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg animate-[fadeInUp_150ms_ease-out] pointer-events-auto">
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
// Score Ring (circular progress)
// ---------------------------------------------------------------------------

function ScoreRing({ pct }) {
  const r = 22
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 56 56" className="w-14 h-14" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="28" cy="28" r={r} fill="none" stroke="#ede9fe" strokeWidth="5" />
        <circle
          cx="28" cy="28" r={r}
          fill="none" stroke="#7c3aed" strokeWidth="5"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-800">
        {pct}%
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Check Bullet (green checkmark)
// ---------------------------------------------------------------------------

function CheckBullet({ text }) {
  return (
    <div className="flex items-start gap-1.5">
      <svg className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
      <span className="text-xs text-slate-600 leading-snug">{text}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top Reasons — sorted by dimension score weight
// ---------------------------------------------------------------------------

const DIMENSION_LABELS = {
  skills_match:       'Skills match',
  experience_level:   'Experience level',
  industry_alignment: 'Industry alignment',
  salary:             'Salary fit',
  function_type:      'Function type',
  career_trajectory:  'Career trajectory',
}

function TopReasons({ match }) {
  const scores = match.dimension_scores || {}
  const sorted = Object.entries(scores)
    .filter(([, v]) => typeof v === 'number')
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)

  // Case 1: dimension scores available — sorted by weight
  if (sorted.length > 0) {
    return (
      <div className="w-full">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Top reasons</p>
        <div className="space-y-1.5">
          {sorted.map(([key, val]) => {
            const pct = Math.round(val * 100)
            const label = DIMENSION_LABELS[key] || key.replace(/_/g, ' ')
            const color = pct >= 70
              ? { check: 'text-green-500', score: 'text-green-600', bar: 'bg-green-400' }
              : pct >= 45
              ? { check: 'text-amber-400', score: 'text-amber-600', bar: 'bg-amber-400' }
              : { check: 'text-rose-400',  score: 'text-rose-500',  bar: 'bg-rose-400'  }
            return (
              <div key={key}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <svg className={`w-3.5 h-3.5 shrink-0 ${color.check}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs text-slate-600 flex-1 leading-snug">{label}</span>
                  <span className={`text-xs font-semibold tabular-nums ${color.score}`}>{pct}%</span>
                </div>
                <div className="ml-5 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-1 rounded-full ${color.bar}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Case 2: only free-text reasoning — split into bullets
  if (match.reasoning) {
    const bullets = match.reasoning
      .split(/[.!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 15)
      .slice(0, 3)
    if (bullets.length > 0) {
      return (
        <div className="w-full">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Top reasons</p>
          <div className="space-y-1">
            {bullets.map((r, i) => <CheckBullet key={i} text={r} />)}
          </div>
        </div>
      )
    }
  }

  // Case 3: no data yet — show pending state
  return (
    <div className="w-full">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Top reasons</p>
      <div className="space-y-1.5">
        {Object.keys(DIMENSION_LABELS).slice(0, 3).map(key => (
          <div key={key}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="w-3.5 h-3.5 rounded-full bg-slate-200 shrink-0" />
              <span className="text-xs text-slate-400 flex-1">{DIMENSION_LABELS[key]}</span>
              <span className="text-xs text-slate-300">—</span>
            </div>
            <div className="ml-5 h-1 bg-slate-100 rounded-full" />
          </div>
        ))}
        <p className="text-[10px] text-slate-300 mt-1">Full analysis after LLM scoring</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Purple circle check (for insights)
// ---------------------------------------------------------------------------

function PurpleCheck() {
  return (
    <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
      <svg className="w-3 h-3 text-violet-600" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse flex items-center gap-3">
      <div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0" />
      <div className="flex-1">
        <div className="h-3 bg-slate-200 rounded w-20 mb-2" />
        <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
        <div className="flex gap-2">
          <div className="h-5 bg-slate-100 rounded-full w-16" />
          <div className="h-5 bg-slate-100 rounded-full w-20" />
        </div>
      </div>
      <div className="w-14 h-14 bg-slate-100 rounded-full shrink-0" />
      <div className="w-8 h-20 bg-slate-100 rounded-xl shrink-0" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Job Card (horizontal)
// ---------------------------------------------------------------------------

function JobCard({ match, userId, initialRating, removing, onReact, onOpenDrawer }) {
  const [saving, setSaving] = useState(false)
  const pct = Math.round((match.score || 0) * 100)

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

  return (
    <div
      className={`
        bg-white rounded-2xl border border-slate-200 overflow-hidden
        shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]
        hover:border-violet-200 transition-all duration-200 relative
        ${removing ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'}
      `}
      style={{ transition: removing ? 'all 200ms ease-out' : 'box-shadow 150ms, border-color 150ms, opacity 200ms, transform 200ms' }}
    >
      {isNew(match) && (
        <div className="absolute top-3 left-14 z-10">
          <span className="text-xs bg-violet-600 text-white px-2 py-0.5 rounded-full font-semibold">New</span>
        </div>
      )}

      <div className="p-4 flex items-center gap-3">
        {/* Company logo */}
        <div className="self-start mt-0.5">
          <CompanyLogo company={match.company} url={match.url} size="md" />
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-400 truncate">{match.company}</p>
          <h3 className="text-sm font-semibold text-slate-900 leading-snug truncate">{match.title}</h3>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {match.work_mode && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{match.work_mode}</span>
            )}
            {match.location_raw && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{match.location_raw}</span>
            )}
            {(match.salary_min || match.salary_max) && (
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                ${match.salary_min ? `${(match.salary_min / 1000).toFixed(0)}k` : '?'}
                {match.salary_max ? `–$${(match.salary_max / 1000).toFixed(0)}k` : '+'}
              </span>
            )}
            {match.sector && (
              <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{match.sector}</span>
            )}
          </div>
        </div>

        {/* Top reasons column — hidden on mobile */}
        <div className="hidden md:flex w-52 shrink-0 border-l border-slate-100 pl-4 self-stretch items-center">
          <TopReasons match={match} />
        </div>

        {/* Score ring */}
        <div className="shrink-0 flex items-center justify-center px-3 border-l border-slate-100">
          <ScoreRing pct={pct} />
        </div>

        {/* Actions */}
        <div className="shrink-0 flex flex-col items-center gap-1 border-l border-slate-100 pl-2">
          {initialRating ? (
            <span className={`text-base ${initialRating === 'thumbs_up' ? 'text-green-600' : 'text-rose-500'}`}>
              {initialRating === 'thumbs_up' ? '👍' : '👎'}
            </span>
          ) : (
            <>
              <button
                onClick={() => handleFeedback('thumbs_up')}
                disabled={saving}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-green-300 hover:text-green-600 hover:bg-green-50 transition-all disabled:opacity-50 text-sm"
                aria-label="Good fit"
              >👍</button>
              <button
                onClick={() => handleFeedback('thumbs_down')}
                disabled={saving}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 transition-all disabled:opacity-50 text-sm"
                aria-label="Not a fit"
              >👎</button>
            </>
          )}
          <button
            onClick={() => onOpenDrawer(match)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
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
  const clickRate = shown > 0 ? Math.round((reacted / shown) * 100) : 0
  const likeRate = reacted > 0 ? Math.round((liked / reacted) * 100) : 0

  if (shown === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-4">
        Your funnel will appear after you interact with your first few matches.
      </p>
    )
  }

  const steps = [
    {
      iconPath: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
      label: 'Shown',
      value: shown,
      rate: null,
    },
    {
      iconPath: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5',
      label: 'Clicked',
      value: reacted,
      rate: `${clickRate}% of shown`,
    },
    {
      iconPath: 'M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5',
      label: 'Reacted',
      value: liked + disliked,
      rate: `${likeRate}% liked`,
    },
  ]

  return (
    <div>
      <div className="space-y-1">
        {steps.map((step, i) => (
          <div key={i}>
            {i > 0 && <div className="w-px h-3 bg-slate-200 ml-5" />}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={step.iconPath} />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{step.label}</span>
                  <span className="text-sm font-semibold text-slate-900">{step.value}</span>
                </div>
                {step.rate && <p className="text-xs text-slate-400">{step.rate}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Liked / Disliked breakdown */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex gap-5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <span className="text-xs text-slate-500">Liked: <strong className="text-slate-700">{liked}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
          <span className="text-xs text-slate-500">Disliked: <strong className="text-slate-700">{disliked}</strong></span>
        </div>
      </div>

      {/* Purple insight */}
      <div className="mt-3 bg-violet-50 border border-violet-100 rounded-xl p-3">
        <p className="text-xs text-violet-700 leading-relaxed">
          Your matching algorithm is learning from your reactions and improving over time.
        </p>
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
      <div className="text-center py-4">
        <p className="text-sm text-slate-400 leading-relaxed">
          Interact with at least {MIN_INTERACTIONS} jobs to unlock personalized insights.
        </p>
        <p className="text-xs text-slate-300 mt-1">{feedback.length}/{MIN_INTERACTIONS} interactions so far</p>
      </div>
    )
  }

  const liked = feedback.filter(f => f.rating === 'thumbs_up')
  const insights = []

  const modes = {}
  for (const m of matches) {
    const fb = feedback.find(f => f.job_id === m.job_id)
    if (fb?.rating === 'thumbs_up' && m.work_mode) modes[m.work_mode] = (modes[m.work_mode] || 0) + 1
  }
  const topMode = Object.entries(modes).sort((a, b) => b[1] - a[1])[0]
  if (topMode) insights.push(`You prefer ${topMode[0].replace('_', '-')} roles`)

  const sectors = {}
  for (const m of matches) {
    const fb = feedback.find(f => f.job_id === m.job_id)
    if (fb?.rating === 'thumbs_up' && m.sector) sectors[m.sector] = (sectors[m.sector] || 0) + 1
  }
  const topSector = Object.entries(sectors).sort((a, b) => b[1] - a[1])[0]
  if (topSector) insights.push(`You engage most with ${topSector[0]} roles`)

  const likedScores = liked.map(f => matches.find(x => x.job_id === f.job_id)?.score || 0).filter(Boolean)
  if (likedScores.length > 0) {
    const avg = likedScores.reduce((s, v) => s + v, 0) / likedScores.length
    insights.push(`Jobs you like average ${Math.round(avg * 100)}% match score`)
  }

  if (feedback.length >= 10) {
    const rate = Math.round((liked.length / feedback.length) * 100)
    insights.push(`You like ${rate}% of the jobs shown to you`)
  }

  if (insights.length === 0) {
    return <p className="text-sm text-slate-400">Keep interacting with jobs to unlock insights.</p>
  }

  return (
    <div>
      <div className="space-y-3">
        {insights.slice(0, 4).map((insight, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <PurpleCheck />
            <p className="text-sm text-slate-700">{insight}</p>
          </div>
        ))}
      </div>
      <Link to="/matches" className="mt-4 inline-block text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors">
        See all insights →
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Missed Opportunities (carousel)
// ---------------------------------------------------------------------------

function MissedOpportunities({ matches, feedback }) {
  const [slide, setSlide] = useState(0)
  const reactedIds = new Set(feedback.map(f => f.job_id))
  const missed = matches
    .filter(m => (m.score || 0) >= 0.85 && !reactedIds.has(m.job_id))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 6)

  if (missed.length === 0) {
    return (
      <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-4">
        No missed opportunities — you're staying on top of your matches.
      </p>
    )
  }

  const perPage = 3
  const pageCount = Math.ceil(missed.length / perPage)
  const visible = missed.slice(slide * perPage, slide * perPage + perPage)

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {visible.map(m => {
          const pct = Math.round((m.score || 0) * 100)
          return (
            <div key={m.job_id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-violet-200 hover:bg-white transition-colors">
              <div className="flex items-start justify-between mb-2">
                <CompanyLogo company={m.company} url={m.url} size="sm" />
                <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">{pct}%</span>
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-0.5 leading-snug">{m.title}</p>
              <p className="text-xs text-slate-400 mb-3">{m.company}{m.location_raw ? ` · ${m.location_raw}` : ''}</p>
              {m.url ? (
                <a href={m.url} target="_blank" rel="noreferrer"
                  className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors">
                  Review →
                </a>
              ) : (
                <span className="text-xs text-slate-300">No link available</span>
              )}
            </div>
          )
        })}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1.5">
            {Array.from({ length: pageCount }).map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                className={`w-2 h-2 rounded-full transition-colors ${i === slide ? 'bg-violet-600' : 'bg-slate-200 hover:bg-slate-300'}`}
                aria-label={`Page ${i + 1}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSlide(s => Math.max(0, s - 1))}
              disabled={slide === 0}
              className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-300 disabled:opacity-40 transition-colors"
              aria-label="Previous"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setSlide(s => Math.min(pageCount - 1, s + 1))}
              disabled={slide === pageCount - 1}
              className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-300 disabled:opacity-40 transition-colors"
              aria-label="Next"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trophy card
// ---------------------------------------------------------------------------

function TrophyCard({ bestScore, avgScore }) {
  return (
    <div className="w-32 shrink-0 bg-violet-50 border border-violet-100 rounded-xl p-4 flex flex-col items-center text-center">
      <span className="text-3xl mb-1">🏆</span>
      <p className="text-2xl font-bold text-violet-700">{bestScore > 0 ? `${bestScore}%` : '—'}</p>
      <p className="text-xs text-violet-600 font-medium mt-0.5">Best match</p>
      {avgScore > 0 && (
        <div className="mt-3 pt-3 border-t border-violet-200 w-full">
          <p className="text-sm font-semibold text-slate-700">{avgScore}%</p>
          <p className="text-xs text-slate-400">Average</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score Trend Chart
// ---------------------------------------------------------------------------

function ScoreTrendChart({ matches }) {
  const [hovered, setHovered] = useState(null)

  const byDate = {}
  for (const m of matches) {
    const ts = m.emailed_at || m.created_at
    if (!ts || !m.score) continue
    const day = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (!byDate[day]) byDate[day] = []
    byDate[day].push(m.score)
  }

  const points = Object.entries(byDate)
    .slice(-30)
    .map(([date, scores]) => ({
      date,
      avg: scores.reduce((s, v) => s + v, 0) / scores.length,
    }))

  const bestScore = matches.length > 0 ? Math.round(Math.max(...matches.map(m => m.score || 0)) * 100) : 0
  const avgScore = matches.length > 0 ? Math.round(matches.reduce((s, m) => s + (m.score || 0), 0) / matches.length * 100) : 0

  if (points.length < 2) {
    return (
      <div className="flex gap-4 items-start">
        <div className="flex-1 h-32 flex items-center justify-center">
          <p className="text-sm text-slate-400">Your score trend will appear after 7 days of matches.</p>
        </div>
        <TrophyCard bestScore={bestScore} avgScore={avgScore} />
      </div>
    )
  }

  const W = 500, H = 120, PX = 8, PY = 10
  const YAXIS = 32
  const chartW = W - PX - YAXIS
  const xStep = chartW / Math.max(1, points.length - 1)

  const x = (i) => YAXIS + i * xStep
  const y = (v) => PY + (1 - v) * (H - PY * 2)

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${x(points.length - 1).toFixed(1)},${(H - PY).toFixed(1)} L${x(0).toFixed(1)},${(H - PY).toFixed(1)} Z`

  return (
    <div className="flex gap-4 items-start">
      <div className="flex-1">
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ height: '120px' }}
            role="img"
            aria-label="Match score trend"
          >
            <defs>
              <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Y-axis gridlines + labels */}
            {[0, 0.25, 0.5, 0.75, 1.0].map(t => {
              const yPos = y(t)
              return (
                <g key={t}>
                  <line x1={YAXIS} x2={W - PX} y1={yPos} y2={yPos} stroke="#f1f5f9" strokeWidth="1" />
                  <text x={YAXIS - 4} y={yPos + 3.5} textAnchor="end" fontSize="9" fill="#94a3b8">
                    {Math.round(t * 100)}%
                  </text>
                </g>
              )
            })}

            {/* Area fill */}
            <path d={areaD} fill="url(#scoreGrad)" />

            {/* Line */}
            <path d={pathD} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {/* Dots + hover targets */}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={x(i)} cy={y(p.avg)} r="3" fill="white" stroke="#7c3aed" strokeWidth="2" />
                <circle
                  cx={x(i)} cy={y(p.avg)} r="12" fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered({ i, ...p })}
                  onMouseLeave={() => setHovered(null)}
                />
              </g>
            ))}
          </svg>

          {hovered && (
            <div
              className="absolute bg-slate-900 text-white text-xs px-2 py-1 rounded-lg pointer-events-none z-10 -translate-x-1/2 whitespace-nowrap"
              style={{
                left: `${(hovered.i / Math.max(1, points.length - 1)) * 100}%`,
                top: '4px',
              }}
            >
              {hovered.date}: {Math.round(hovered.avg * 100)}%
            </div>
          )}
        </div>

        {/* X-axis labels */}
        <div className="flex justify-between mt-1" style={{ paddingLeft: `${YAXIS}px` }}>
          <span className="text-xs text-slate-400">{points[0]?.date}</span>
          <span className="text-xs text-slate-400">{points[points.length - 1]?.date}</span>
        </div>
      </div>

      <TrophyCard bestScore={bestScore} avgScore={avgScore} />
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
  const [displayed, setDisplayed] = useState([])
  const [queue, setQueue] = useState([])
  const [toasts, addToast] = useToasts()

  function buildDisplayState(matches, fb) {
    const reactedIds = new Set(fb.map(f => f.job_id))
    const unreacted = matches
      .filter(m => !reactedIds.has(m.job_id))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
    setDisplayed(unreacted.slice(0, 3).map(m => ({ match: m, removing: false })))
    setQueue(unreacted.slice(3))
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
    addToast(rating === 'thumbs_up' ? "Got it — we'll show more like this" : "Noted — we'll adjust your matches")
    setDisplayed(prev => prev.map(d => d.match.job_id === jobId ? { ...d, removing: true } : d))
    setTimeout(() => {
      setDisplayed(prev => {
        const filtered = prev.filter(d => d.match.job_id !== jobId)
        const next = queue[0]
        setQueue(q => q.slice(1))
        return next ? [...filtered, { match: next, removing: false }] : filtered
      })
    }, 220)
    setFeedback(prev => [...prev.filter(f => f.job_id !== jobId), { job_id: jobId, rating }])
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

  const name = firstName(userEmail)
  const feedbackMap = Object.fromEntries(feedback.map(f => [f.job_id, f]))

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {getGreeting()}{name ? `, ${name}` : ''}.
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Here are your top matches for today.</p>
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
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Today's Top Matches</h2>
            {!loading && allMatches.length > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">
                {displayed.length} shown · {allMatches.filter(m => !feedbackMap[m.job_id]).length} unreacted
              </p>
            )}
          </div>
          <Link to="/matches" className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors">
            View all matches →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : displayed.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <p className="text-sm font-medium text-slate-600 mb-1">
              {allMatches.length === 0
                ? "We're still finding your best matches. Check back soon or expand your preferences."
                : "You've reviewed all of today's matches. Come back tomorrow for new ones."}
            </p>
            <Link to="/profile" className="mt-3 inline-block text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors">
              Update preferences →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
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

      {/* ── Funnel + Insights ── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-6">
        <section className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-0.5">Match Funnel</h2>
          <p className="text-xs text-slate-400 mb-4">Your engagement flow</p>
          <MatchFunnel matches={allMatches} feedback={feedback} />
        </section>

        <section className="md:col-span-3 bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-0.5">Matching Insights</h2>
          <p className="text-xs text-slate-400 mb-4">What we've learned about your preferences</p>
          <MatchingInsights matches={allMatches} feedback={feedback} />
        </section>
      </div>

      {/* ── Missed Opportunities ── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-0.5">
          <h2 className="text-base font-semibold text-slate-900">Missed Opportunities</h2>
          <Link to="/matches" className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors">
            View all →
          </Link>
        </div>
        <p className="text-xs text-slate-400 mb-4">Strong matches you haven't reviewed yet</p>
        <MissedOpportunities matches={allMatches} feedback={feedback} />
      </section>

      {/* ── Score Trend ── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Average Match Score</h2>
            <p className="text-xs text-slate-400 mt-0.5">How your matches are trending</p>
          </div>
          <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full font-medium">Last 30 days</span>
        </div>
        <ScoreTrendChart matches={allMatches} />
      </section>

      {drawerJob && (
        <DetailsDrawer
          job={drawerJob}
          userId={userId}
          onClose={() => setDrawerJob(null)}
          onFeedback={(rating, jobId) => handleReact(rating, jobId)}
        />
      )}

      <Toast toasts={toasts} />
    </div>
  )
}
