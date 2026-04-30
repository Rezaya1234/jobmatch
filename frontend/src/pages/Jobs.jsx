import { useState, useEffect, useCallback, useRef } from 'react'
import { listJobs, getJobCount, submitFeedback, deleteFeedback, getFeedback } from '../api'

// slug → domain for Clearbit logo lookup
const SLUG_DOMAIN = {
  anthropic: 'anthropic.com', scaleai: 'scale.ai', togetherai: 'together.ai',
  gleanwork: 'glean.com', gongio: 'gong.com', intercom: 'intercom.com',
  databricks: 'databricks.com', mistral: 'mistral.ai', palantir: 'palantir.com',
  openai: 'openai.com', cohere: 'cohere.com', writer: 'writer.com',
  runway: 'runwayml.com', pinecone: 'pinecone.io', perplexity: 'perplexity.ai',
  elevenlabs: 'elevenlabs.io', cursor: 'cursor.sh', harvey: 'harvey.ai',
  sierra: 'sierra.ai', google: 'google.com', amazon: 'amazon.com',
  exxonmobil: 'exxonmobil.com', chevron: 'chevron.wd5.myworkdayjobs.com',
  conocophillips: 'conocophillips.com', eogresources: 'eoginc.com',
  devonenergy: 'devonenergy.com', diamondbackenergy: 'diamondbackenergy.com',
  apacorp: 'apacorp.com', coterra: 'coterra.com', occidental: 'oxy.com',
  expandenergy: 'expandenergy.com', slb: 'slb.com', halliburton: 'halliburton.com',
  bakerhughes: 'bakerhughes.com', technipfmc: 'technipfmc.com', novinc: 'nov.com',
  weatherford: 'weatherford.com', tenaris: 'tenaris.com', archrock: 'archrock.com',
  newpark: 'newpark.com', pattersonuti: 'patenergy.com',
}

const SOURCE_SECTOR = {
  anthropic: 'Technology', scaleai: 'Technology', togetherai: 'Technology',
  gleanwork: 'Technology', gongio: 'Technology', intercom: 'Technology',
  databricks: 'Technology', mistral: 'Technology', palantir: 'Technology',
  openai: 'Technology', cohere: 'Technology', writer: 'Technology',
  runway: 'Technology', pinecone: 'Technology', perplexity: 'Technology',
  elevenlabs: 'Technology', cursor: 'Technology', harvey: 'Technology',
  sierra: 'Technology', google: 'Technology', amazon: 'Technology',
  exxonmobil: 'Upstream Oil and Gas', chevron: 'Upstream Oil and Gas',
  conocophillips: 'Upstream Oil and Gas', eogresources: 'Upstream Oil and Gas',
  devonenergy: 'Upstream Oil and Gas', diamondbackenergy: 'Upstream Oil and Gas',
  apacorp: 'Upstream Oil and Gas', coterra: 'Upstream Oil and Gas',
  occidental: 'Upstream Oil and Gas', expandenergy: 'Upstream Oil and Gas',
  slb: 'Oilfield Services', halliburton: 'Oilfield Services',
  bakerhughes: 'Oilfield Services', technipfmc: 'Oilfield Services',
  novinc: 'Oilfield Services', weatherford: 'Oilfield Services',
  tenaris: 'Oilfield Services', archrock: 'Oilfield Services',
  newpark: 'Oilfield Services', pattersonuti: 'Oilfield Services',
}

function CompanyLogo({ slug, company }) {
  const [failed, setFailed] = useState(false)
  const domain = SLUG_DOMAIN[slug]
  if (!domain || failed) {
    return (
      <div className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-xs font-bold text-slate-500">
        {(company || '?')[0].toUpperCase()}
      </div>
    )
  }
  return (
    <img
      src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
      alt={company}
      onError={() => setFailed(true)}
      className="w-7 h-7 rounded-md border border-slate-100 object-contain shrink-0 bg-white"
    />
  )
}

const PAGE_SIZE = 25

const SORT_OPTIONS = [
  { value: 'relevance',   label: 'Relevance' },
  { value: 'date_desc',   label: 'Newest first' },
  { value: 'date_asc',    label: 'Oldest first' },
  { value: 'company_asc', label: 'Company A–Z' },
  { value: 'title_asc',   label: 'Title A–Z' },
]

const WORK_MODE_BORDER = {
  remote: 'border-l-violet-400',
  hybrid: 'border-l-amber-400',
  onsite: 'border-l-slate-300',
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatLocation(raw) {
  if (!raw) return '—'
  const lower = raw.toLowerCase().trim()
  if (['remote', 'worldwide', 'anywhere', 'global', 'distributed'].some(w => lower.includes(w))) return 'Remote'
  const parts = raw.split(',').map(p => p.trim())
  const skip = ['usa', 'us', 'united states', 'america']
  const filtered = parts.filter(p => !skip.includes(p.toLowerCase()))
  return (filtered.length ? filtered : parts).slice(0, 2).join(', ')
}

function formatSalary(min, max) {
  if (!min && !max) return null
  const fmt = n => `$${(n / 1000).toFixed(0)}k`
  if (min && max) return `${fmt(min)}–${fmt(max)}`
  if (min) return `${fmt(min)}+`
  return `up to ${fmt(max)}`
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null

  const pages = []
  const delta = 2
  const left = Math.max(1, page - delta)
  const right = Math.min(totalPages, page + delta)

  if (left > 1) { pages.push(1); if (left > 2) pages.push('…') }
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < totalPages) { if (right < totalPages - 1) pages.push('…'); pages.push(totalPages) }

  const btn = 'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors'
  const active = `${btn} bg-violet-600 text-white`
  const inactive = `${btn} text-slate-600 hover:bg-slate-100 border border-slate-200`
  const disabled = `${btn} text-slate-300 border border-slate-100 cursor-not-allowed`

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button onClick={() => onChange(page - 1)} disabled={page === 1} className={page === 1 ? disabled : inactive}>
        ← Prev
      </button>
      {pages.map((p, i) =>
        p === '…'
          ? <span key={`e-${i}`} className="px-2 text-slate-400">…</span>
          : <button key={p} onClick={() => onChange(p)} className={p === page ? active : inactive}>{p}</button>
      )}
      <button onClick={() => onChange(page + 1)} disabled={page === totalPages} className={page === totalPages ? disabled : inactive}>
        Next →
      </button>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 border-l-4 border-l-slate-200 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-slate-200 rounded-md shrink-0" />
            <div className="h-3 bg-slate-200 rounded w-20" />
            <div className="h-3 bg-slate-100 rounded-full w-12" />
          </div>
          <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
          <div className="h-3 bg-slate-100 rounded w-full mb-1" />
          <div className="h-3 bg-slate-100 rounded w-4/5 mb-2" />
          <div className="flex gap-2">
            <div className="h-3 bg-slate-100 rounded w-16" />
            <div className="h-3 bg-slate-100 rounded w-20" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="h-3 bg-slate-100 rounded w-16" />
          <div className="h-6 w-6 bg-slate-100 rounded" />
        </div>
      </div>
    </div>
  )
}

function JobCard({ job, userId, feedbackMap, onFeedback }) {
  const existing = feedbackMap[job.id]
  const [vote, setVote] = useState(existing?.rating ?? null) // 'thumbs_up' | 'thumbs_down' | null
  const borderColor = WORK_MODE_BORDER[job.work_mode] || 'border-l-slate-200'

  function handleLinkClick() {
    if (!userId || existing) return
    submitFeedback(userId, job.id, 'thumbs_up', '', 1).catch(() => {})
  }

  async function handleVote(rating) {
    if (!userId) return
    const next = vote === rating ? null : rating
    const prev = vote
    setVote(next)
    try {
      if (next === null) {
        await deleteFeedback(userId, job.id)
      } else {
        await submitFeedback(userId, job.id, next, '', 2)
      }
      onFeedback()
    } catch {
      setVote(prev)
    }
  }

  const salary = formatSalary(job.salary_min, job.salary_max)

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${borderColor} p-4 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <CompanyLogo slug={job.source} company={job.company} />
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{job.company}</p>
            {job.work_mode && (
              <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{job.work_mode}</span>
            )}
            {job.job_type && job.job_type !== 'full_time' && (
              <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">{job.job_type.replace('_', ' ')}</span>
            )}
          </div>

          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              onClick={handleLinkClick}
              className="text-sm font-semibold text-slate-900 hover:text-violet-700 transition-colors leading-snug block mt-0.5"
            >
              {job.title}
            </a>
          ) : (
            <p className="text-sm font-semibold text-slate-900 leading-snug mt-0.5">{job.title}</p>
          )}

          {job.description && (
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
              {job.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
            {job.location_raw && <span className="text-xs text-slate-500">{formatLocation(job.location_raw)}</span>}
            {salary && <span className="text-xs text-emerald-600 font-semibold">{salary}</span>}
            {(job.sector || SOURCE_SECTOR[job.source]) && (
              <span className="text-xs text-purple-500">{job.sector || SOURCE_SECTOR[job.source]}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <p className="text-xs text-slate-400 whitespace-nowrap">{formatDate(job.posted_at || job.created_at)}</p>
          {userId && (
            <div className="flex gap-1">
              <button
                onClick={() => handleVote('thumbs_up')}
                title="Good fit"
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all ${
                  vote === 'thumbs_up'
                    ? 'border-green-300 text-green-600 bg-green-50'
                    : 'border-slate-200 text-slate-400 hover:border-green-300 hover:text-green-600 hover:bg-green-50'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                </svg>
              </button>
              <button
                onClick={() => handleVote('thumbs_down')}
                title="Not a fit"
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all ${
                  vote === 'thumbs_down'
                    ? 'border-rose-300 text-rose-500 bg-rose-50'
                    : 'border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Jobs() {
  const userId = localStorage.getItem('userId')

  const [jobs, setJobs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [workMode, setWorkMode] = useState('')
  const [jobType, setJobType] = useState('')
  const [sector, setSector] = useState('')
  const [sortBy, setSortBy] = useState('relevance')
  const [feedbackMap, setFeedbackMap] = useState({})

  const searchTimer = useRef(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  function handleSearchChange(val) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(val), 350)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const buildParams = useCallback((p) => ({
    search: debouncedSearch,
    work_mode: workMode,
    job_type: jobType,
    sector,
    sort_by: sortBy,
    user_id: sortBy === 'relevance' ? (userId || '') : '',
    limit: PAGE_SIZE,
    offset: (p - 1) * PAGE_SIZE,
  }), [debouncedSearch, workMode, jobType, sector, sortBy, userId])

  async function load(p) {
    setLoading(true)
    try {
      const params = buildParams(p)
      const [data, countData, fb] = await Promise.all([
        listJobs(params),
        getJobCount({ search: params.search, work_mode: params.work_mode, job_type: params.job_type, sector: params.sector }),
        userId ? getFeedback(userId).catch(() => []) : Promise.resolve([]),
      ])
      setJobs(data)
      setTotal(countData.count)
      const map = {}
      for (const f of fb) map[f.job_id] = f
      setFeedbackMap(map)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    load(1)
  }, [debouncedSearch, workMode, jobType, sector, sortBy])

  useEffect(() => {
    load(page)
  }, [page])

  function goToPage(p) {
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleFilter(setter, current, val) {
    setter(current === val ? '' : val)
    setPage(1)
  }

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setWorkMode('')
    setJobType('')
    setSector('')
    setSortBy('relevance')
    setPage(1)
  }

  const hasFilters = debouncedSearch || workMode || jobType || sector
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Open Positions</h1>
          {!loading && total > 0 && (
            <p className="text-sm text-slate-500 mt-1">
              Showing {from}–{to} of <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> positions
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by title or company…"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setPage(1) }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white text-slate-700"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Mode:</span>
          {['remote', 'hybrid', 'onsite'].map(m => (
            <button key={m} onClick={() => toggleFilter(setWorkMode, workMode, m)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors capitalize ${workMode === m ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400 hover:text-violet-600'}`}>
              {m}
            </button>
          ))}
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <span className="text-xs text-slate-400 font-medium">Type:</span>
          {['full_time', 'part_time', 'contract'].map(t => (
            <button key={t} onClick={() => toggleFilter(setJobType, jobType, t)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${jobType === t ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400 hover:text-violet-600'}`}>
              {t.replace('_', ' ')}
            </button>
          ))}
          {hasFilters && (
            <button onClick={clearFilters} className="px-3 py-1 rounded-full text-xs font-semibold text-rose-500 border border-rose-200 hover:bg-rose-50 ml-auto">
              Clear all
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Sector:</span>
          {['Technology', 'Upstream Oil and Gas', 'Oilfield Services'].map(s => (
            <button key={s} onClick={() => { toggleFilter(setSector, sector, s); }}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${sector === s ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400 hover:text-violet-600'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-base font-semibold text-slate-600 mb-1">No positions found</p>
          {hasFilters
            ? <button onClick={clearFilters} className="text-sm text-violet-600 hover:underline">Clear filters</button>
            : <p className="text-sm text-slate-500">Try adjusting your search.</p>
          }
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {jobs.map(j => (
              <JobCard
                key={j.id}
                job={j}
                userId={userId}
                feedbackMap={feedbackMap}
                onFeedback={() => {}}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
        </>
      )}
    </div>
  )
}
