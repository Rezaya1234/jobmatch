import { useState, useEffect } from 'react'
import { listJobs, submitFeedback, getFeedback } from '../api'

function formatDate(dateStr) {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatLocation(raw) {
  if (!raw) return '—'
  const lower = raw.toLowerCase().trim()
  const remoteWords = ['remote', 'worldwide', 'anywhere', 'global', 'distributed', 'work from home']
  if (remoteWords.some(w => lower === w || lower.includes(w))) return 'Remote'
  const parts = raw.split(',').map(p => p.trim())
  const countryWords = ['usa', 'us', 'united states', 'america']
  const filtered = parts.filter(p => !countryWords.includes(p.toLowerCase()))
  if (filtered.length === 0) return 'USA'
  return filtered.slice(0, 2).join(', ')
}

const STATE_MAP = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
  'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
  'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
  'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
  'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
}

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'company_asc', label: 'Company A–Z' },
  { value: 'title_asc', label: 'Title A–Z' },
]

function sortJobs(jobs, sortKey) {
  const sorted = [...jobs]
  switch (sortKey) {
    case 'date_desc': return sorted.sort((a, b) => new Date(b.posted_at || b.created_at) - new Date(a.posted_at || a.created_at))
    case 'date_asc':  return sorted.sort((a, b) => new Date(a.posted_at || a.created_at) - new Date(b.posted_at || b.created_at))
    case 'company_asc': return sorted.sort((a, b) => (a.company || '').localeCompare(b.company || ''))
    case 'title_asc':   return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    default: return sorted
  }
}

function JobCard({ job, userId, feedbackMap, onFeedback }) {
  const existing = feedbackMap[job.id]
  const [liked, setLiked] = useState(existing?.rating === 'thumbs_up')

  function handleLinkClick() {
    if (!userId || existing) return
    submitFeedback(userId, job.id, 'thumbs_up', '', 1).catch(() => {})
  }

  async function handleThumbsUp() {
    if (!userId) return
    try {
      await submitFeedback(userId, job.id, 'thumbs_up', '', 2)
      setLiked(true)
      onFeedback()
    } catch {}
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-xs font-semibold text-slate-400">{job.company}</p>
            {job.work_mode && (
              <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">{job.work_mode}</span>
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
              className="text-base font-semibold text-slate-900 hover:text-indigo-700 transition-colors leading-snug block"
            >
              {job.title}
            </a>
          ) : (
            <p className="text-base font-semibold text-slate-900 leading-snug">{job.title}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {job.location_raw && (
              <span className="text-xs text-slate-500">{formatLocation(job.location_raw)}</span>
            )}
            {job.salary_min && (
              <span className="text-xs text-emerald-600 font-medium">
                ${(job.salary_min / 1000).toFixed(0)}k{job.salary_max ? `–$${(job.salary_max / 1000).toFixed(0)}k` : '+'}
              </span>
            )}
            {job.sector && (
              <span className="text-xs text-purple-600">{job.sector}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <p className="text-xs text-slate-400">{formatDate(job.posted_at || job.created_at)}</p>
          {userId && (
            <button
              onClick={handleThumbsUp}
              title={liked ? 'Liked' : 'Like this job'}
              className={`text-lg hover:scale-110 transition-transform ${liked ? 'opacity-100' : 'opacity-40 hover:opacity-80'}`}
            >
              👍
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Jobs() {
  const userId = localStorage.getItem('userId')
  const [jobs, setJobs] = useState([])
  const [feedbackMap, setFeedbackMap] = useState({})
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('date_desc')
  const [filters, setFilters] = useState({ work_mode: '', job_type: '', sector: '' })
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [data, fb] = await Promise.all([
        listJobs('', 10000),
        userId ? getFeedback(userId).catch(() => []) : Promise.resolve([]),
      ])
      setJobs(data)
      const map = {}
      for (const f of fb) map[f.job_id] = f
      setFeedbackMap(map)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId])

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase()
    if (q && !j.title?.toLowerCase().includes(q) && !j.company?.toLowerCase().includes(q) && !j.location_raw?.toLowerCase().includes(q)) return false
    if (filters.work_mode && j.work_mode !== filters.work_mode) return false
    if (filters.job_type && j.job_type !== filters.job_type) return false
    if (filters.sector && j.sector !== filters.sector) return false
    return true
  })

  const sorted = sortJobs(filtered, sortKey)
  const sectors = [...new Set(jobs.map(j => j.sector).filter(Boolean))].sort()

  function setFilter(key, val) {
    setFilters(f => ({ ...f, [key]: f[key] === val ? '' : val }))
  }

  function clearFilters() {
    setFilters({ work_mode: '', job_type: '', sector: '' })
    setSearch('')
  }

  const hasFilters = search || Object.values(filters).some(Boolean)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Open Positions</h1>
          <p className="text-sm text-slate-500 mt-1">{sorted.length} of {jobs.length} positions</p>
        </div>
        <button onClick={load} className="text-sm text-indigo-600 hover:underline font-medium">Refresh</button>
      </div>

      {/* Search + sort + filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by title, company, or location..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {['remote', 'hybrid', 'onsite'].map(m => (
            <button key={m} onClick={() => setFilter('work_mode', m)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filters.work_mode === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
              {m}
            </button>
          ))}
          <div className="w-px bg-slate-200 mx-1" />
          {['full_time', 'part_time', 'contract'].map(t => (
            <button key={t} onClick={() => setFilter('job_type', t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filters.job_type === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
              {t.replace('_', ' ')}
            </button>
          ))}
          {sectors.length > 0 && <div className="w-px bg-slate-200 mx-1" />}
          {sectors.map(s => (
            <button key={s} onClick={() => setFilter('sector', s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filters.sector === s ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-300 hover:border-purple-400'}`}>
              {s}
            </button>
          ))}
          {hasFilters && (
            <button onClick={clearFilters} className="px-3 py-1 rounded-full text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50">
              Clear all
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg mb-2">No positions match your filters.</p>
          <button onClick={clearFilters} className="text-sm text-indigo-600 hover:underline">Clear filters</button>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(j => (
            <JobCard
              key={j.id}
              job={j}
              userId={userId}
              feedbackMap={feedbackMap}
              onFeedback={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}
