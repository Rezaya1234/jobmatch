import { useState, useEffect } from 'react'
import { listJobs } from '../api'

function sourceLabel(source) {
  const map = { remoteok: 'RemoteOK', arbeitnow: 'Arbeitnow', jobicy: 'Jobicy', indeed: 'Indeed' }
  return map[source] || source
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function getHostname(url) {
  try { return new URL(url).hostname.replace('www.', '') }
  catch { return '' }
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
  'district of columbia':'DC','washington dc':'DC','washington d.c.':'DC',
}

function formatLocation(raw) {
  if (!raw) return '—'
  const lower = raw.toLowerCase().trim()
  const remoteWords = ['remote', 'worldwide', 'anywhere', 'global', 'distributed', 'work from home']
  if (remoteWords.some(w => lower === w)) return 'Remote'

  // Split on comma
  const parts = raw.split(',').map(p => p.trim())

  // Strip trailing country identifiers
  const countryWords = ['usa', 'us', 'united states', 'america']
  const filtered = parts.filter(p => !countryWords.includes(p.toLowerCase()))

  if (filtered.length === 0) return 'USA'
  if (filtered.length === 1) {
    const single = filtered[0].toLowerCase()
    if (remoteWords.some(w => single.includes(w))) return 'Remote'
    // It's just a city or state
    const abbr = STATE_MAP[single]
    return abbr ? abbr : filtered[0]
  }

  // City + State
  const city = filtered[0]
  const stateRaw = filtered[1].toLowerCase().trim()
  const stateAbbr = STATE_MAP[stateRaw] || filtered[1].toUpperCase().slice(0, 2)
  return `${city}, ${stateAbbr}`
}

function JobRow({ job, index }) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="py-3 px-4 text-sm font-medium text-slate-900 max-w-xs">
        <div className="truncate" title={job.title}>{job.title}</div>
      </td>
      <td className="py-3 px-4 text-sm text-slate-600 whitespace-nowrap">{job.company}</td>
      <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">{formatLocation(job.location_raw)}</td>
      <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">
          {sourceLabel(job.source)}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">{formatDate(job.posted_at || job.created_at)}</td>
      <td className="py-3 px-4 text-sm whitespace-nowrap">
        {job.url ? (
          <a href={job.url} target="_blank" rel="noreferrer"
            className="text-indigo-600 hover:underline font-medium flex items-center gap-1">
            {getHostname(job.url)}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : '—'}
      </td>
    </tr>
  )
}

export default function Jobs() {
  const [jobs, setJobs] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ work_mode: '', job_type: '', source: '', sector: '' })

  async function load() {
    setLoading(true)
    try {
      const data = await listJobs('', 10000)
      setJobs(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase()
    if (q && !j.title?.toLowerCase().includes(q) && !j.company?.toLowerCase().includes(q) && !j.location_raw?.toLowerCase().includes(q)) return false
    if (filters.work_mode && j.work_mode !== filters.work_mode) return false
    if (filters.job_type && j.job_type !== filters.job_type) return false
    if (filters.source && j.source !== filters.source) return false
    if (filters.sector && j.sector !== filters.sector) return false
    return true
  })

  // Unique values for filter dropdowns
  const sources = [...new Set(jobs.map(j => j.source).filter(Boolean))]
  const sectors = [...new Set(jobs.map(j => j.sector).filter(Boolean))].sort()

  function setFilter(key, val) {
    setFilters(f => ({ ...f, [key]: f[key] === val ? '' : val }))
  }

  function clearFilters() {
    setFilters({ work_mode: '', job_type: '', source: '', sector: '' })
    setSearch('')
  }

  const hasFilters = search || Object.values(filters).some(Boolean)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All Jobs</h1>
          <p className="text-sm text-slate-500 mt-1">{filtered.length} of {jobs.length} jobs</p>
        </div>
        <button onClick={load} className="text-sm text-indigo-600 hover:underline font-medium">Refresh</button>
      </div>

      {/* Search + filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 space-y-3">
        <input
          type="text"
          placeholder="Search by title, company, or location..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="flex flex-wrap gap-2">
          {/* Work mode */}
          {['remote', 'hybrid', 'onsite'].map(m => (
            <button key={m} onClick={() => setFilter('work_mode', m)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filters.work_mode === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
              {m}
            </button>
          ))}
          <div className="w-px bg-slate-200 mx-1" />
          {/* Job type */}
          {['full_time', 'part_time', 'contract'].map(t => (
            <button key={t} onClick={() => setFilter('job_type', t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filters.job_type === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
              {t.replace('_', ' ')}
            </button>
          ))}
          <div className="w-px bg-slate-200 mx-1" />
          {/* Sources */}
          {sources.map(s => (
            <button key={s} onClick={() => setFilter('source', s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filters.source === s ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
              {sourceLabel(s)}
            </button>
          ))}
          {sectors.length > 0 && <div className="w-px bg-slate-200 mx-1" />}
          {/* Sectors */}
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg mb-2">No jobs match your filters.</p>
          <button onClick={clearFilters} className="text-sm text-indigo-600 hover:underline">Clear filters</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Company</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Posted</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Link</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j, i) => <JobRow key={j.id} job={j} index={i} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
