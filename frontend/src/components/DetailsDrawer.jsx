import { useEffect } from 'react'
import { submitFeedback } from '../api'

const DIMENSIONS = [
  { key: 'skills_match',       label: 'Skills match' },
  { key: 'experience_level',   label: 'Experience level' },
  { key: 'industry_alignment', label: 'Industry alignment' },
  { key: 'salary',             label: 'Salary fit' },
  { key: 'function_type',      label: 'Function type' },
  { key: 'career_trajectory',  label: 'Career trajectory' },
]

function ScoreBar({ value }) {
  const pct = Math.round((value ?? 0.5) * 100)
  const color = pct >= 70 ? 'bg-green-400' : pct >= 45 ? 'bg-amber-400' : 'bg-rose-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

function PlaceholderSection({ title, hint }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
      <p className="text-sm text-slate-400 leading-relaxed">{hint}</p>
    </div>
  )
}

export default function DetailsDrawer({ job, userId, onClose, onFeedback }) {
  // ESC key
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  if (!job) return null

  const pct = Math.round((job.score || 0) * 100)
  const scoreColor = pct >= 85 ? 'text-green-600 bg-green-50 border-green-200'
    : pct >= 70 ? 'text-amber-600 bg-amber-50 border-amber-200'
    : 'text-slate-500 bg-slate-50 border-slate-200'

  async function handleApply() {
    if (job.url) window.open(job.url, '_blank', 'noreferrer')
    try {
      await submitFeedback(userId, job.job_id, 'thumbs_up', '', 1)
      onFeedback?.('thumbs_up', job.job_id)
    } catch { /* silent */ }
    onClose()
  }

  async function handleNotInterested() {
    try {
      await submitFeedback(userId, job.job_id, 'thumbs_down', '', 2)
      onFeedback?.('thumbs_down', job.job_id)
    } catch { /* silent */ }
    onClose()
  }

  const initials = (job.company || '?').slice(0, 2).toUpperCase()

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-white z-50 shadow-2xl flex flex-col
                   animate-[slideInRight_200ms_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-label={`Job details: ${job.title}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-bold shrink-0">
              {initials}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 leading-snug">{job.title}</h2>
              <p className="text-sm text-slate-500">{job.company}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ml-2 shrink-0 focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Close drawer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Score + meta */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${scoreColor}`}
              aria-label={`Match score: ${pct} percent`}>
              {pct}% match
            </span>
            {job.work_mode && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{job.work_mode}</span>
            )}
            {job.location_raw && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{job.location_raw}</span>
            )}
            {(job.salary_min || job.salary_max) && (
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                ${job.salary_min ? `${(job.salary_min/1000).toFixed(0)}k` : '?'}
                {job.salary_max ? `–$${(job.salary_max/1000).toFixed(0)}k` : '+'}
              </span>
            )}
          </div>

          {/* Why you match */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Why you match</p>
            {job.reasoning ? (
              <p className="text-sm text-slate-700 leading-relaxed">{job.reasoning}</p>
            ) : (
              <p className="text-sm text-slate-400">Analysis in progress.</p>
            )}
          </div>

          {/* Dimension scores */}
          {job.dimension_scores && Object.keys(job.dimension_scores).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Score breakdown</p>
              <div className="space-y-2">
                {DIMENSIONS.map(d => (
                  <div key={d.key}>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>{d.label}</span>
                    </div>
                    <ScoreBar value={job.dimension_scores[d.key]} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gap analysis */}
          <PlaceholderSection
            title="Gap analysis"
            hint="We'll highlight where your profile diverges from this role's requirements — coming soon."
          />

          {/* Company insights */}
          <PlaceholderSection
            title="Company insights"
            hint="Response rates, interview stages, and culture signals will appear here as the community contributes."
          />

          {/* Learning resources */}
          <PlaceholderSection
            title="Learning resources"
            hint="Relevant courses and certifications to bridge skill gaps — coming soon."
          />

          {/* People in network */}
          <PlaceholderSection
            title="People in your network"
            hint="Connect your LinkedIn in Profile to see who you know at this company."
          />
        </div>

        {/* Footer actions */}
        <div className="p-5 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            onClick={handleApply}
            className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 min-h-[44px]"
          >
            Apply →
          </button>
          <button
            onClick={handleNotInterested}
            className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 min-h-[44px]"
          >
            Not interested
          </button>
        </div>
      </div>
    </>
  )
}
