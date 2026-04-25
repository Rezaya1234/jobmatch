import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCompanies } from '../api'

// Known domains keyed by company insight slug (derived from company display name)
const SLUG_DOMAINS = {
  'anthropic':   'anthropic.com',
  'scale-ai':    'scale.ai',
  'together-ai': 'together.ai',
  'glean':       'glean.com',
  'gong':        'gong.com',
  'intercom':    'intercom.com',
  'databricks':  'databricks.com',
  'mistral-ai':  'mistral.ai',
  'palantir':    'palantir.com',
  'openai':      'openai.com',
  'cohere':      'cohere.com',
  'writer':      'writer.com',
  'runway':      'runwayml.com',
  'pinecone':    'pinecone.io',
  'perplexity':  'perplexity.ai',
  'elevenlabs':  'elevenlabs.io',
  'cursor':      'cursor.sh',
  'harvey-ai':   'harvey.ai',
  'sierra-ai':   'sierra.ai',
  'google':      'google.com',
  'amazon':      'amazon.com',
}

function getDomain(url) {
  if (!url) return null
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] }
}

function CompanyLogo({ name, website, slug, cls = 'w-12 h-12' }) {
  const [attempt, setAttempt] = useState(0)
  const domain = getDomain(website) || SLUG_DOMAINS[slug] || null
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
  const colors = ['bg-violet-100 text-violet-700','bg-blue-100 text-blue-700','bg-emerald-100 text-emerald-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700','bg-cyan-100 text-cyan-700']

  const sources = domain ? [
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ] : []

  if (attempt < sources.length) {
    return <img src={sources[attempt]} alt={name} className={`${cls} rounded-xl object-contain border border-slate-100 bg-white p-1 shrink-0`} onError={() => setAttempt(a => a + 1)} />
  }
  return (
    <div className={`${cls} rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${colors[name.charCodeAt(0) % colors.length]}`}>
      {initials}
    </div>
  )
}

function OutlookBadge({ outlook }) {
  if (!outlook) return null
  const map = {
    growing: 'bg-green-100 text-green-700',
    stable:  'bg-blue-100 text-blue-700',
    slowing: 'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${map[outlook] || 'bg-slate-100 text-slate-500'}`}>
      {outlook}
    </span>
  )
}

function TrendArrow({ trend }) {
  if (trend === 'up') return <span className="text-green-500 font-bold">↑</span>
  if (trend === 'down') return <span className="text-red-400 font-bold">↓</span>
  return <span className="text-slate-400 font-bold">→</span>
}

function CompanyCard({ company, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:shadow-md hover:border-violet-200 transition-all duration-150 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <CompanyLogo name={company.company_name} website={company.website} slug={company.slug} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="font-semibold text-slate-900 text-sm truncate">{company.company_name}</h3>
            <TrendArrow trend={company.hiring_trend} />
          </div>
          {company.sector && (
            <p className="text-xs text-slate-400 truncate">{company.sector}</p>
          )}
        </div>
        <OutlookBadge outlook={company.hiring_outlook} />
      </div>

      {company.summary && (
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{company.summary}</p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{company.active_job_count}</span> open role{company.active_job_count !== 1 ? 's' : ''}
        </span>
        {company.overall_rating && (
          <span className="text-xs text-slate-500">
            ★ <span className="font-semibold text-slate-700">{company.overall_rating.toFixed(1)}</span>
          </span>
        )}
      </div>

      {company.hiring_areas?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {company.hiring_areas.slice(0, 3).map(area => (
            <span key={area} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{area}</span>
          ))}
          {company.hiring_areas.length > 3 && (
            <span className="text-xs text-slate-400">+{company.hiring_areas.length - 3}</span>
          )}
        </div>
      )}
    </button>
  )
}

const OUTLOOK_FILTERS = [
  { value: '', label: 'All' },
  { value: 'growing', label: 'Growing' },
  { value: 'stable', label: 'Stable' },
  { value: 'slowing', label: 'Slowing' },
]

export default function CompanyInsights() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [outlook, setOutlook] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    listCompanies({ q: query || undefined, outlook: outlook || undefined })
      .then(setCompanies)
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false))
  }, [query, outlook])

  function handleSearch(e) {
    e.preventDefault()
    setQuery(search.trim())
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Company Insights</h1>
        <p className="text-sm text-slate-500 mt-1">
          Hiring intelligence for every company in our job pool — updated weekly.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <input
            type="text"
            placeholder="Search companies..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            Search
          </button>
        </form>
        <div className="flex gap-1.5">
          {OUTLOOK_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setOutlook(f.value)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                outlook === f.value
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse h-44" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-sm">
            {query || outlook
              ? 'No companies match your filters.'
              : 'No company insights yet. Run the insights pipeline from the Pipeline admin page.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">{companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map(c => (
              <CompanyCard
                key={c.slug}
                company={c}
                onClick={() => navigate(`/insights/${c.slug}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
