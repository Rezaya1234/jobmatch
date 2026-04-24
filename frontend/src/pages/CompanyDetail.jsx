import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getCompany, getCompanyJobs } from '../api'

// ---------------------------------------------------------------------------
// Shared atoms
// ---------------------------------------------------------------------------

function OutlookBadge({ outlook }) {
  if (!outlook) return null
  const map = {
    growing: 'bg-green-100 text-green-700',
    stable:  'bg-blue-100 text-blue-700',
    slowing: 'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`text-sm font-semibold px-3 py-1 rounded-full capitalize ${map[outlook] || 'bg-slate-100 text-slate-500'}`}>
      {outlook}
    </span>
  )
}

function SignalTypeBadge({ type }) {
  const map = {
    hiring_surge: 'bg-green-100 text-green-700',
    expansion:    'bg-blue-100 text-blue-700',
    tech_stack:   'bg-violet-100 text-violet-700',
    culture:      'bg-amber-100 text-amber-700',
    leadership:   'bg-rose-100 text-rose-700',
  }
  const labels = {
    hiring_surge: 'Hiring surge',
    expansion:    'Expansion',
    tech_stack:   'Tech stack',
    culture:      'Culture',
    leadership:   'Leadership',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[type] || 'bg-slate-100 text-slate-500'}`}>
      {labels[type] || type}
    </span>
  )
}

function Stars({ rating }) {
  if (rating == null) return null
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`w-4 h-4 ${i <= full ? 'text-amber-400' : i === full + 1 && half ? 'text-amber-300' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1 text-sm font-semibold text-slate-700">{rating.toFixed(1)}</span>
    </div>
  )
}

function DifficultyDots({ level }) {
  if (level == null) return <span className="text-slate-400 text-sm">—</span>
  const labels = ['', 'Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard']
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className={`w-3 h-3 rounded-full ${i <= level ? 'bg-violet-500' : 'bg-slate-200'}`} />
        ))}
      </div>
      <span className="text-sm text-slate-600">{labels[level] || level}</span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function MetaRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs font-medium text-slate-700">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CompanyDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [company, setCompany] = useState(null)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([getCompany(slug), getCompanyJobs(slug)])
      .then(([c, j]) => { setCompany(c); setJobs(j) })
      .catch(err => {
        if (err.response?.status === 404) setError('Company not found.')
        else setError('Failed to load company data.')
      })
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-28 bg-white rounded-xl border border-slate-200" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-white rounded-xl border border-slate-200" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-sm mb-4">{error}</p>
        <button onClick={() => navigate('/insights')} className="text-sm text-violet-600 hover:underline">
          ← Back to Company Insights
        </button>
      </div>
    )
  }

  const sizeLabels = { startup: '1–50', small: '51–200', medium: '201–1,000', large: '1,001+' }

  return (
    <div className="space-y-5">
      {/* Back */}
      <button
        onClick={() => navigate('/insights')}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Company Insights
      </button>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <CompanyInitials name={company.company_name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-slate-900">{company.company_name}</h1>
              <OutlookBadge outlook={company.hiring_outlook} />
            </div>
            <div className="flex items-center gap-3 flex-wrap text-sm text-slate-500">
              {company.sector && <span>{company.sector}</span>}
              {company.hq_location && <><span>·</span><span>{company.hq_location}</span></>}
              <span>·</span>
              <span className="font-medium text-slate-700">{company.active_job_count} open role{company.active_job_count !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {jobs.length > 0 && (
            <a
              href={`/positions?company=${encodeURIComponent(company.company_name)}`}
              className="hidden sm:flex items-center gap-2 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-4 py-2 hover:bg-violet-600 hover:text-white transition-colors shrink-0"
            >
              View open positions
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          )}
        </div>
        {company.summary && (
          <p className="mt-4 text-sm text-slate-600 leading-relaxed">{company.summary}</p>
        )}
        {company.generated_at && (
          <p className="mt-3 text-xs text-slate-400">
            Last updated {new Date(company.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Hiring Outlook */}
          {company.hiring_outlook && (
            <Section title="Hiring Outlook">
              <div className="flex items-center gap-3 mb-2">
                <OutlookBadge outlook={company.hiring_outlook} />
                {company.hiring_trend && (
                  <span className={`text-sm font-medium ${company.hiring_trend === 'up' ? 'text-green-600' : company.hiring_trend === 'down' ? 'text-red-500' : 'text-slate-500'}`}>
                    {company.hiring_trend === 'up' ? '↑ Trending up' : company.hiring_trend === 'down' ? '↓ Trending down' : '→ Flat'}
                  </span>
                )}
              </div>
              {company.hiring_outlook_reason && (
                <p className="text-sm text-slate-600 leading-relaxed">{company.hiring_outlook_reason}</p>
              )}
            </Section>
          )}

          {/* What to Expect */}
          {(company.interview_difficulty || company.response_rate || company.time_to_hire) && (
            <Section title="What to Expect">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-2">Interview Difficulty</p>
                  <DifficultyDots level={company.interview_difficulty} />
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-1">Response Rate</p>
                  <p className="text-lg font-bold text-slate-800">{company.response_rate || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-1">Time to Hire</p>
                  <p className="text-lg font-bold text-slate-800">{company.time_to_hire || '—'}</p>
                </div>
              </div>
            </Section>
          )}

          {/* Employee Sentiment */}
          {(company.overall_rating || company.pros?.length || company.cons?.length) && (
            <Section title="Employee Sentiment">
              {company.overall_rating && (
                <div className="mb-4">
                  <Stars rating={company.overall_rating} />
                  {company.rating_source && (
                    <p className="text-xs text-slate-400 mt-1">{company.rating_source}</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {company.pros?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-700 mb-2">Pros</p>
                    <ul className="space-y-1.5">
                      {company.pros.map((p, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-600">
                          <span className="text-green-500 shrink-0">✓</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {company.cons?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-600 mb-2">Cons</p>
                    <ul className="space-y-1.5">
                      {company.cons.map((c, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-600">
                          <span className="text-red-400 shrink-0">–</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Recent Signals */}
          {company.signals?.length > 0 && (
            <Section title="Recent Signals">
              <ul className="space-y-3">
                {company.signals.map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <SignalTypeBadge type={s.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700">{s.title}</p>
                    </div>
                    {s.date && (
                      <span className="text-xs text-slate-400 shrink-0">{s.date}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Risks */}
          {company.risks?.length > 0 && (
            <Section title="Risks & Considerations">
              <ul className="space-y-2">
                {company.risks.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600">
                    <span className="text-amber-400 shrink-0">⚠</span>
                    {r}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Company Snapshot */}
          <Section title="Company Snapshot">
            <MetaRow label="Size" value={company.company_size ? `${company.company_size.charAt(0).toUpperCase() + company.company_size.slice(1)} (${sizeLabels[company.company_size] || company.company_size})` : null} />
            <MetaRow label="Type" value={company.company_type ? company.company_type.charAt(0).toUpperCase() + company.company_type.slice(1) : null} />
            <MetaRow label="HQ" value={company.hq_location} />
            <MetaRow label="Sector" value={company.sector} />
            {company.website && (
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-slate-400">Website</span>
                <a href={company.website} target="_blank" rel="noreferrer" className="text-xs font-medium text-violet-600 hover:underline truncate max-w-[140px]">
                  {company.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
          </Section>

          {/* Where Hiring */}
          {company.hiring_areas?.length > 0 && (
            <Section title="Where Hiring">
              <div className="flex flex-wrap gap-2">
                {company.hiring_areas.map(area => (
                  <span key={area} className="text-xs bg-violet-50 text-violet-700 border border-violet-100 px-2.5 py-1 rounded-full">
                    {area}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Open positions */}
          {jobs.length > 0 && (
            <Section title={`Open Positions (${jobs.length})`}>
              <ul className="space-y-2">
                {jobs.slice(0, 5).map(j => (
                  <li key={j.id}>
                    <a
                      href={j.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block group"
                    >
                      <p className="text-sm font-medium text-slate-700 group-hover:text-violet-600 transition-colors line-clamp-1">{j.title}</p>
                      <p className="text-xs text-slate-400">{j.location_raw || j.work_mode || 'Remote'}</p>
                    </a>
                  </li>
                ))}
                {jobs.length > 5 && (
                  <li>
                    <Link to={`/positions`} className="text-xs text-violet-600 hover:underline">
                      +{jobs.length - 5} more →
                    </Link>
                  </li>
                )}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function CompanyInitials({ name }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('')
  const colors = [
    'bg-violet-100 text-violet-700',
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
  ]
  const idx = name.charCodeAt(0) % colors.length
  return (
    <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold shrink-0 ${colors[idx]}`}>
      {initials}
    </div>
  )
}
