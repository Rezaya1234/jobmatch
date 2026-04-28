import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCompany } from '../api'
import { SLUG_DOMAINS } from '../utils/companyDomains'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseResponseRatePct(str) {
  if (!str) return null
  const n = parseFloat(str.replace(/[~%\s]/g, ''))
  return isNaN(n) ? null : Math.max(0, Math.min(100, n))
}

function parseTimeToHirePos(str) {
  if (!str) return null
  const nums = (str.match(/\d+/g) || []).map(Number)
  if (!nums.length) return null
  const avg = nums.length === 1 ? nums[0] : (nums[0] + nums[nums.length - 1]) / 2
  return Math.max(0, Math.min(100, ((12 - avg) / 11) * 100))
}

// ---------------------------------------------------------------------------
// Atoms
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

function DifficultyPill({ level }) {
  if (level == null) return <span className="text-slate-400 text-sm">—</span>
  if (level <= 2) return <span className="text-sm font-bold px-3 py-1 rounded-full bg-green-500 text-white">Easy</span>
  if (level === 3) return <span className="text-sm font-bold px-3 py-1 rounded-full bg-amber-500 text-white">Moderate</span>
  if (level === 4) return <span className="text-sm font-bold px-3 py-1 rounded-full bg-red-500 text-white">Hard</span>
  return <span className="text-sm font-bold px-3 py-1 rounded-full bg-red-600 text-white">Very Hard</span>
}

function GradientBar({ position, label }) {
  const pos = Math.max(0, Math.min(100, position ?? 50))
  const dotColor = pos < 33 ? '#EF4444' : pos < 66 ? '#F59E0B' : '#22C55E'
  return (
    <div className="mt-3 mb-7">
      <div className="relative">
        <div
          className="h-1.5 rounded-full w-full"
          style={{ background: 'linear-gradient(to right, #EF4444, #F59E0B, #22C55E)' }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow"
          style={{ left: `calc(${pos}% - 7px)`, backgroundColor: dotColor }}
        />
      </div>
      {label && (
        <div className="relative mt-2">
          <span
            className="absolute -translate-x-1/2 text-xs text-slate-500 whitespace-nowrap"
            style={{ left: `${pos}%` }}
          >
            {label}
          </span>
        </div>
      )}
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    getCompany(slug)
      .then(c => setCompany(c))
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

  if (error || !company) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-sm mb-4">{error || 'Company data could not be loaded.'}</p>
        <button onClick={() => navigate('/insights')} className="text-sm text-violet-600 hover:underline">
          ← Back to Company Insights
        </button>
      </div>
    )
  }

  const sizeLabels = { startup: '1–50', small: '51–200', medium: '201–1,000', large: '1,001+' }
  const responseRatePos = parseResponseRatePct(company.response_rate)
  const timeToHirePos = parseTimeToHirePos(company.time_to_hire)
  const sentimentPos = company.overall_rating != null ? (company.overall_rating / 5) * 100 : null
  const hv = company.hiring_velocity
  const signalDotColors = {
    hiring_surge: '#22C55E',
    expansion:    '#3B82F6',
    tech_stack:   '#5B4FE8',
    culture:      '#F59E0B',
    leadership:   '#6B7280',
  }

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
          <CompanyLogo name={company.company_name} website={company.website} slug={company.slug} />
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
          {company.active_job_count > 0 && (
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
        {!company.summary && !company.hiring_outlook && (
          <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
            <p className="text-xs text-amber-700">Insights for this company haven't been generated yet. Go to <a href="/pipeline" className="underline font-medium">Pipeline → Refresh Insights</a> to generate them.</p>
          </div>
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

          {/* Hiring Momentum */}
          <Section title="Hiring Momentum">
            {!hv?.data_available ? (
              <div className="border border-dashed border-slate-200 rounded-lg p-5 text-center">
                <p className="text-sm text-slate-400 leading-relaxed">
                  Hiring momentum data will appear after our next pipeline run — check back tomorrow.
                </p>
              </div>
            ) : (
              <>
                {/* Velocity strip */}
                <div className="mb-5">
                  <span className="text-3xl font-bold text-slate-900">{hv.jobs_today}</span>
                  <span className="ml-2 text-sm text-slate-400">active open roles</span>

                  <div className={`text-sm font-medium mt-2 ${hv.week_change > 0 ? 'text-green-600' : hv.week_change < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                    {hv.week_change > 0 ? '↑' : hv.week_change < 0 ? '↓' : '→'}{' '}
                    {hv.week_change === 0
                      ? 'No change this week'
                      : `${hv.week_change > 0 ? '+' : ''}${hv.week_change} this week (${hv.week_change > 0 ? '+' : ''}${hv.week_change_pct}%)`
                    }
                  </div>

                  <div className={`text-sm font-medium mt-1 ${hv.month_change > 0 ? 'text-green-600' : hv.month_change < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                    {hv.month_change > 0 ? '↑' : hv.month_change < 0 ? '↓' : '→'}{' '}
                    {hv.month_change === 0
                      ? 'No change this month'
                      : `${hv.month_change > 0 ? '+' : ''}${hv.month_change} this month (${hv.month_change > 0 ? '+' : ''}${hv.month_change_pct}%)`
                    }
                  </div>
                </div>

                {/* Department breakdown */}
                {company.department_breakdown?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-3">Where they are hiring</p>
                    <div className="space-y-1.5">
                      {company.department_breakdown.map(d => (
                        <div key={d.department} className="flex items-center gap-2">
                          <span className="text-sm text-slate-500 w-28 shrink-0 truncate">{d.department}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                            <div
                              className="h-5 rounded-full"
                              style={{ width: `${d.pct}%`, backgroundColor: '#5B4FE8' }}
                            />
                          </div>
                          <span className="text-xs font-bold text-violet-700 w-10 text-right shrink-0">{d.pct}%</span>
                          <span className="text-xs text-slate-400 w-8 text-right shrink-0">{d.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Last updated */}
                {hv.snapshot_date && (
                  <p className="text-xs text-slate-400 mt-4">Last updated: {hv.snapshot_date}</p>
                )}

                {/* Link */}
                <a
                  href={`/positions?company=${encodeURIComponent(company.company_name)}`}
                  className="block mt-4 text-sm font-medium text-violet-600 hover:underline"
                >
                  View open positions →
                </a>
              </>
            )}
          </Section>

          {/* What to Expect */}
          {(company.interview_difficulty != null || company.response_rate || company.time_to_hire || company.overall_rating != null) && (
            <Section title={
              <span className="flex items-center gap-1.5">
                What to Expect
                <span className="relative group">
                  <span className="text-slate-400 font-normal cursor-help text-xs">ⓘ</span>
                  <span className="absolute left-0 bottom-full mb-2 w-64 bg-slate-800 text-white text-xs rounded-lg p-2.5 z-10 leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity block">
                    These metrics are estimated from industry data and job posting signals. They will be updated with real figures as Stellapath users report their experiences.
                  </span>
                </span>
              </span>
            }>
              <div className="space-y-4">
                {company.interview_difficulty != null && (
                  <div>
                    <p className="text-sm text-slate-500 mb-2">Interview Difficulty</p>
                    <DifficultyPill level={company.interview_difficulty} />
                  </div>
                )}

                {company.response_rate && responseRatePos !== null && (
                  <div>
                    <p className="text-sm text-slate-500">Response Rate</p>
                    <GradientBar position={responseRatePos} label={company.response_rate} />
                  </div>
                )}
                {company.response_rate && responseRatePos === null && (
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Response Rate</p>
                    <p className="text-base font-bold text-slate-800">{company.response_rate}</p>
                  </div>
                )}

                {company.time_to_hire && timeToHirePos !== null && (
                  <div>
                    <p className="text-sm text-slate-500">Time to Hire</p>
                    <GradientBar position={timeToHirePos} label={company.time_to_hire} />
                  </div>
                )}
                {company.time_to_hire && timeToHirePos === null && (
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Time to Hire</p>
                    <p className="text-base font-bold text-slate-800">{company.time_to_hire}</p>
                  </div>
                )}

                {sentimentPos !== null && (
                  <div>
                    <p className="text-sm text-slate-500">Employee Sentiment</p>
                    <GradientBar position={sentimentPos} label={`${company.overall_rating.toFixed(1)} / 5.0`} />
                  </div>
                )}

                <p className="text-xs italic text-slate-400 pt-1">
                  {(company.user_feedback_count || 0) >= 10
                    ? `Based on ${company.user_feedback_count} Stellapath users`
                    : 'ⓘ Estimated from industry data'}
                </p>
              </div>
            </Section>
          )}

          {/* Employee Sentiment — pros / cons */}
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

          {/* Recent Signals — vertical timeline */}
          {company.signals?.length > 0 && (
            <Section title="Recent Signals">
              <div>
                {company.signals.map((s, i) => {
                  const dotColor = signalDotColors[s.type] || '#6B7280'
                  const isLast = i === company.signals.length - 1
                  return (
                    <div key={i} className="flex gap-3 relative">
                      {/* Date */}
                      <div className="w-14 shrink-0 text-right pt-0.5">
                        {s.date && <span className="text-xs text-slate-400">{s.date}</span>}
                      </div>
                      {/* Dot + connecting line */}
                      <div className="flex flex-col items-center shrink-0">
                        <div
                          className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                          style={{ backgroundColor: dotColor }}
                        />
                        {!isLast && <div className="w-px flex-1 bg-slate-200 my-1" style={{ minHeight: '20px' }} />}
                      </div>
                      {/* Content */}
                      <div className={`flex-1 min-w-0 ${!isLast ? 'pb-4' : ''}`}>
                        <SignalTypeBadge type={s.type} />
                        <p className="text-sm font-semibold text-slate-700 mt-1">{s.title}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
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

          {/* View all open positions */}
          <a
            href={`/positions?company=${encodeURIComponent(company.company_name)}`}
            className="block text-sm font-medium text-violet-600 hover:underline px-1"
          >
            View all open positions →
          </a>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CompanyLogo
// ---------------------------------------------------------------------------

function getDomain(url) {
  if (!url) return null
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] }
}

function CompanyLogo({ name, website, slug }) {
  const [attempt, setAttempt] = useState(0)
  const domain = getDomain(website) || SLUG_DOMAINS[slug] || null
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
  const colors = ['bg-violet-100 text-violet-700','bg-blue-100 text-blue-700','bg-emerald-100 text-emerald-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700','bg-cyan-100 text-cyan-700']

  const sources = domain ? [
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ] : []

  if (attempt < sources.length) {
    return <img src={sources[attempt]} alt={name} className="w-14 h-14 rounded-xl object-contain border border-slate-100 bg-white p-1.5 shrink-0" onError={() => setAttempt(a => a + 1)} />
  }
  return (
    <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold shrink-0 ${colors[name.charCodeAt(0) % colors.length]}`}>
      {initials}
    </div>
  )
}
