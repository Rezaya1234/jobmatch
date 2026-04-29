import { useState, useEffect } from 'react'
import { getApplications } from '../api'

const STATUS_META = {
  applied:   { label: 'Applied',   dot: 'bg-violet-500', text: 'text-violet-700', bg: 'bg-violet-50'  },
  interview: { label: 'Interview', dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50'   },
}

function StatusBadge({ type }) {
  const m = STATUS_META[type] || STATUS_META.applied
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${m.bg} ${m.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Applications() {
  const userId = localStorage.getItem('userId')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    getApplications(userId)
      .then(data => setItems(data))
      .catch(() => setError('Could not load applications.'))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-slate-100 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Applications</h1>
        <p className="text-sm text-slate-500 mt-0.5">Jobs you've applied to or reached interview stage.</p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {!error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-700">No applications yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            When you mark a job as applied or reach an interview, it will appear here.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Company</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={`${item.job_id}-${item.signal_type}`} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-slate-800 hover:text-violet-700 transition-colors line-clamp-1"
                    >
                      {item.title}
                    </a>
                    <p className="text-xs text-slate-400 mt-0.5 sm:hidden">{item.company}</p>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 hidden sm:table-cell">{item.company}</td>
                  <td className="px-5 py-3.5">
                    <StatusBadge type={item.signal_type} />
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 hidden md:table-cell">{fmt(item.applied_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
