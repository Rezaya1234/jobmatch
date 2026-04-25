import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getMatches, submitFeedback, deleteFeedback, getFeedback, recordEngagement, getProfile } from '../api'
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
// Score Badge (compact number + label)
// ---------------------------------------------------------------------------

function ScoreBadge({ pct }) {
  const color = pct >= 85 ? 'text-violet-700' : pct >= 70 ? 'text-slate-700' : 'text-slate-500'
  return (
    <div className="flex flex-col items-center">
      <span className={`text-lg font-bold leading-none ${color}`}>{pct}%</span>
      <span className="text-[10px] text-slate-400 font-medium mt-0.5 tracking-wide uppercase">match</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Extract a 1-2 line "What you'll do" snippet from the job description
// ---------------------------------------------------------------------------

const RESP_HEADER_RE = /^(?:what you['']ll do|responsibilities|key responsibilities|your role|in this role|what you['']ll be doing|the role|day.to.day|what you['']ll own|what you['']ll build|what you['']ll lead|role overview)/i
const NEXT_SECTION_RE = /^(?:what you['']ll bring|requirements|qualifications|about us|benefits|who you are|you bring|you have|compensation|what we offer)/i

function parseResponsibilities(description) {
  if (!description) return []
  const lines = description.split(/\n/).map(l => l.trim()).filter(Boolean)
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const bare = lines[i].replace(/^[#*•\-:]+\s*/, '').trim()
    if (RESP_HEADER_RE.test(bare) && bare.length < 80) { start = i; break }
  }
  if (start === -1) return []
  const bullets = []
  for (let i = start + 1; i < Math.min(start + 10, lines.length) && bullets.length < 3; i++) {
    const bare = lines[i].replace(/^[#*•\-:]+\s*/, '').trim()
    if (NEXT_SECTION_RE.test(bare)) break
    const clean = bare.replace(/^[-•*\d.]+\s*/, '').trim()
    if (clean.length >= 20 && clean.length < 200) bullets.push(clean)
  }
  return bullets
}

function extractWhatYouDo(description) {
  const bullets = parseResponsibilities(description)
  if (bullets.length > 0) {
    // Take the first bullet; ensure it reads as a complete sentence
    const text = bullets[0]
    const sentence = text.charAt(0).toUpperCase() + text.slice(1)
    const ended = sentence.match(/[.!?]$/) ? sentence : sentence + '.'
    return ended.length > 150 ? ended.slice(0, 147) + '…' : ended
  }
  // Fallback: first substantive non-intro sentence
  if (!description) return null
  const skipRe = /^(?:about us|about the company|who we are|we are|we['']re|our company|join us)/i
  for (const sent of description.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)) {
    const clean = sent.trim()
    if (clean.length >= 40 && !skipRe.test(clean)) return clean.length > 150 ? clean.slice(0, 147) + '…' : clean
  }
  return null
}

// ---------------------------------------------------------------------------
// Signal bullets — concrete, 5-7 word max, sorted by dimension score
// ---------------------------------------------------------------------------

function buildSignals(match, profile) {
  const k = n => Math.round(n / 1000)
  const signals = []
  const added = new Set()

  function addSignal(s) {
    if (s && !added.has(s) && signals.length < 3) { added.add(s); signals.push(s) }
  }

  const scores = match.dimension_scores || {}
  const hasScores = Object.keys(scores).length > 0
  const dims = hasScores
    ? Object.entries(scores).filter(([, v]) => typeof v === 'number').sort(([, a], [, b]) => b - a).map(([d]) => d)
    : ['experience_level', 'salary', 'industry_alignment', 'function_type']

  for (const dim of dims) {
    if (signals.length >= 3) break
    const years = profile?.years_experience
    const level = profile?.seniority_level
    const sector = match.sector
    const preferred = profile?.preferred_sectors || []
    const sMin = match.salary_min, sMax = match.salary_max

    switch (dim) {
      case 'experience_level':
        if (years && level) addSignal(`${years}+ yrs · ${level}`)
        else if (years) addSignal(`${years}+ yrs experience`)
        else if (level) addSignal(`${level} level`)
        break
      case 'skills_match':
        if (match.reasoning) {
          const sents = match.reasoning.split(/(?<=[.!?])\s+/)
          for (const s of sents.slice(0, 3)) {
            const clean = s.trim()
            if (clean.length >= 15 && clean.length <= 65) { addSignal(clean); break }
            if (clean.length > 65) { addSignal(clean.slice(0, 60).replace(/\s\S*$/, '') + '…'); break }
          }
        }
        break
      case 'salary':
        if (sMin && sMax) addSignal(`$${k(sMin)}k–$${k(sMax)}k`)
        else if (sMin) addSignal(`From $${k(sMin)}k`)
        break
      case 'industry_alignment': {
        if (sector) {
          const pref = preferred.some(p =>
            p.toLowerCase().includes(sector.toLowerCase()) || sector.toLowerCase().includes(p.toLowerCase())
          )
          addSignal(pref ? `${sector} · preferred` : sector)
        }
        break
      }
      case 'function_type': {
        const stopWords = new Set(['and', 'or', 'of', 'the', 'a', 'for', 'in', 'at', '&', 'to', 'with'])
        const words = (match.title || '').split(/\s+/).filter(w => !stopWords.has(w.toLowerCase())).slice(0, 5).join(' ')
        if (words.length > 3) addSignal(words)
        break
      }
      case 'career_trajectory':
        if (level && sector) addSignal(`${level} ${sector} growth`)
        else if (level) addSignal(`${level} growth path`)
        break
    }
  }

  // Concrete fallbacks — never generic
  if (signals.length < 3 && match.work_mode) addSignal(match.work_mode)
  if (signals.length < 3 && match.salary_min && match.salary_max && !signals.some(s => s.includes('k')))
    addSignal(`$${k(match.salary_min)}k–$${k(match.salary_max)}k`)
  if (signals.length < 3 && match.sector && !signals.some(s => s.toLowerCase().includes((match.sector || '').toLowerCase())))
    addSignal(match.sector)
  if (signals.length < 3 && match.location_raw) addSignal(match.location_raw)

  return signals
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
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 animate-pulse flex items-center gap-3">
      <div className="w-9 h-9 bg-slate-100 rounded-lg shrink-0" />
      <div className="shrink-0" style={{ width: '220px' }}>
        <div className="h-3.5 bg-slate-200 rounded w-3/4 mb-1.5" />
        <div className="h-3 bg-slate-100 rounded w-1/2 mb-1.5" />
        <div className="flex gap-1">
          <div className="h-4 bg-slate-100 rounded w-12" />
          <div className="h-4 bg-slate-100 rounded w-16" />
        </div>
      </div>
      <div className="hidden md:flex flex-1 flex-col gap-1.5 border-l border-slate-100 pl-3">
        <div className="h-3 bg-slate-100 rounded w-4/5" />
        <div className="h-3 bg-slate-100 rounded w-3/5" />
        <div className="h-3 bg-slate-100 rounded w-2/5" />
      </div>
      <div className="shrink-0 flex flex-col items-center gap-2 pl-3 border-l border-slate-100">
        <div className="h-5 w-10 bg-slate-200 rounded" />
        <div className="flex gap-1">
          <div className="w-9 h-9 bg-slate-100 rounded-lg" />
          <div className="w-9 h-9 bg-slate-100 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Job Card (horizontal)
// ---------------------------------------------------------------------------

function JobCard({ match, userId, profile, initialRating, removing, onReact, onOpenDrawer }) {
  const [saving, setSaving] = useState(false)
  const [localRating, setLocalRating] = useState(null)
  const pct = Math.round((match.score || 0) * 100)
  const signals = buildSignals(match, profile)
  const rating = initialRating || localRating

  async function handleFeedback(r) {
    if (saving) return
    const current = initialRating || localRating
    const next = current === r ? null : r  // clicking same thumb cancels it
    setLocalRating(next)
    setSaving(true)
    try {
      if (next === null) {
        await deleteFeedback(userId, match.job_id)
      } else {
        await submitFeedback(userId, match.job_id, next, '', 2)
      }
      onReact(next, match.job_id)
    } catch {
      setLocalRating(current)
      setSaving(false)
    }
  }

  return (
    <div
      className={`
        bg-white rounded-xl border border-slate-200 overflow-hidden
        shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.07)]
        hover:border-slate-300 transition-all duration-150 relative
        ${removing ? 'opacity-0 -translate-y-1 pointer-events-none' : 'opacity-100 translate-y-0'}
      `}
      style={{ transition: removing ? 'all 200ms ease-out' : 'box-shadow 150ms, border-color 150ms, opacity 200ms, transform 200ms' }}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Logo */}
        <div className="shrink-0 self-start mt-0.5">
          <CompanyLogo company={match.company} url={match.url} size="sm" />
        </div>

        {/* LEFT: title + company + meta — wider to push "why you match" ~2in right */}
        <div className="min-w-0 shrink-0" style={{ width: '396px' }}>
          <h3 className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">{match.title}</h3>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{match.company}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {match.work_mode && (
              <span className="text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{match.work_mode}</span>
            )}
            {match.location_raw && (
              <span className="text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{match.location_raw}</span>
            )}
            {(match.salary_min || match.salary_max) && (
              <span className="text-[11px] text-slate-500 px-1.5 py-0.5">
                ${match.salary_min ? `${Math.round(match.salary_min / 1000)}k` : '?'}
                {match.salary_max ? `–${Math.round(match.salary_max / 1000)}k` : '+'}
              </span>
            )}
          </div>
        </div>

        {/* MIDDLE: what you'll do */}
        <div className="hidden md:flex flex-1 min-w-0 flex-col justify-center gap-1.5 border-l border-slate-100 pl-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">What you'll do</p>
          {extractWhatYouDo(match.description) ? (
            <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{extractWhatYouDo(match.description)}</p>
          ) : signals.length > 0 ? signals.map((s, i) => (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <span className="w-1 h-1 rounded-full bg-violet-300 shrink-0" />
              <span className="text-xs text-slate-600 leading-snug truncate">{s}</span>
            </div>
          )) : (
            <span className="text-xs text-slate-300 italic">Details loading…</span>
          )}
        </div>

        {/* RIGHT: score on top, then [👍 👎 →] in one row */}
        <div className="shrink-0 flex flex-col items-center gap-2 pl-3 border-l border-slate-100">
          <ScoreBadge pct={pct} />
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleFeedback('thumbs_up')}
              disabled={saving}
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all disabled:opacity-50 ${
                rating === 'thumbs_up'
                  ? 'border-green-300 text-green-600 bg-green-50'
                  : 'border-slate-200 text-slate-400 hover:border-green-300 hover:text-green-600 hover:bg-green-50'
              }`}
              aria-label="Good fit"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
              </svg>
            </button>
            <button
              onClick={() => handleFeedback('thumbs_down')}
              disabled={saving}
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all disabled:opacity-50 ${
                rating === 'thumbs_down'
                  ? 'border-rose-300 text-rose-500 bg-rose-50'
                  : 'border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50'
              }`}
              aria-label="Not a fit"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
              </svg>
            </button>
            <button
              onClick={() => onOpenDrawer(match)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-violet-500 hover:border-violet-200 hover:bg-violet-50 transition-colors"
              aria-label={`View details for ${match.title}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
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

  if (shown === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-4">
        Your funnel will appear after you interact with your first few matches.
      </p>
    )
  }

  const clickRate = Math.round((reacted / shown) * 100)
  const likeRate = reacted > 0 ? Math.round(((liked + disliked) / reacted) * 100) : 0

  // Inset values as % of height (0 = full height edge, 50 = zero height)
  // Each stage's right edge = next stage's left edge → seamless connected funnel
  const i0 = 0                                                          // left edge of stage 1 (full height)
  const i1 = Math.max(8,  Math.min(40, (1 - reacted / shown) * 44))    // join between stage 1→2
  const i2 = Math.max(i1 + 6, Math.min(44, (1 - (liked + disliked) / shown) * 44)) // join between stage 2→3
  const i3 = Math.min(47, i2 + 4)                                       // right edge of stage 3

  const stages = [
    { value: shown,            label: 'Jobs shown',   sub: null,                color: '#7c3aed', l: i0, r: i1 },
    { value: reacted,          label: 'Jobs opened',  sub: `${clickRate}% of shown`, color: '#8b5cf6', l: i1, r: i2 },
    { value: liked + disliked, label: 'Reactions',    sub: `${likeRate}% of opened`, color: '#a78bfa', l: i2, r: i3 },
  ]

  return (
    <div>
      {/* Trapezoid funnel — clip-path creates connected narrowing shape */}
      <div className="flex gap-1" style={{ height: 72 }}>
        {stages.map((s, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              backgroundColor: s.color,
              clipPath: `polygon(0% ${s.l}%, 100% ${s.r}%, 100% ${100 - s.r}%, 0% ${100 - s.l}%)`,
            }}
          />
        ))}
      </div>

      {/* Counts + labels below each stage */}
      <div className="flex gap-1 mt-3">
        {stages.map((s, i) => (
          <div key={i} className="flex-1 text-center">
            <p className="text-2xl font-bold text-slate-800 leading-none">{s.value}</p>
            <p className="text-xs font-medium text-slate-600 mt-0.5">{s.label}</p>
            {s.sub && <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>}
            {i === 2 && (
              <div className="mt-2 pt-2 border-t border-slate-100 flex flex-row gap-3 justify-center">
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-green-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                  </svg>
                  <span className="text-xs text-slate-600 font-medium">{liked}</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
                  </svg>
                  <span className="text-xs text-slate-600 font-medium">{disliked}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Insight */}
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
    if (rating === null) {
      setFeedback(prev => prev.filter(f => f.job_id !== jobId))
      return
    }
    addToast(rating === 'thumbs_up' ? "Got it — we'll show more like this" : "Noted — we'll adjust your matches")
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
                {displayed.length} of {allMatches.filter(m => !feedbackMap[m.job_id]).length}
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
                profile={profile}
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
          profile={profile}
          currentRating={feedbackMap[drawerJob.job_id]?.rating || null}
          onClose={() => setDrawerJob(null)}
          onFeedback={(rating, jobId) => handleReact(rating, jobId)}
        />
      )}

      <Toast toasts={toasts} />
    </div>
  )
}
