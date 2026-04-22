import { useState, useEffect, useRef } from 'react'
import { triggerDailyPipeline, triggerCollect, triggerResetFilters, triggerTestEmail, getJobCount, getMatchCount } from '../api'
import axios from 'axios'

const getPipelineStatus = () => axios.get('/api/pipeline/status').then(r => r.data)

function StatusIcon({ status }) {
  if (status === 'complete') return <span className="text-green-500 text-xl">✓</span>
  if (status === 'error') return <span className="text-red-500 text-xl">✗</span>
  if (status === 'running') return (
    <svg className="animate-spin h-5 w-5 text-indigo-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  )
  return null
}

function StatBox({ label, value, color = 'slate' }) {
  const colors = {
    slate: 'bg-slate-50 text-slate-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
  }
  return (
    <div className={`rounded-xl p-4 text-center ${colors[color]}`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs mt-1 font-medium uppercase tracking-wide opacity-70">{label}</div>
    </div>
  )
}

export default function Pipeline() {
  const [state, setState] = useState({ status: 'idle', step: '', new_jobs: 0, passed_filter: 0, scored: 0, error: '', started_at: '', finished_at: '', filter_warning: '' })
  const [totals, setTotals] = useState({ jobs: 0, matches: 0 })
  const [triggering, setTriggering] = useState(false)
  const [emailStatus, setEmailStatus] = useState('')
  const pollRef = useRef(null)

  async function fetchTotals() {
    try {
      const userId = localStorage.getItem('userId')
      const [{ count: jobs }, { count: matches }] = await Promise.all([
        getJobCount(),
        userId ? getMatchCount(userId) : Promise.resolve({ count: 0 }),
      ])
      setTotals({ jobs, matches })
    } catch {}
  }

  async function fetchStatus() {
    try {
      const data = await getPipelineStatus()
      setState(data)
      if (data.status !== 'running') {
        stopPolling()
        fetchTotals()
      }
    } catch {}
  }

  function startPolling() {
    if (pollRef.current) return
    pollRef.current = setInterval(fetchStatus, 2000)
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => {
    fetchStatus()
    fetchTotals()
    return () => stopPolling()
  }, [])

  async function handleCollect() {
    setTriggering(true)
    try {
      await triggerCollect()
      setState(s => ({ ...s, status: 'running', step: 'Fetching jobs from all boards...', error: '', filter_warning: '' }))
      startPolling()
    } catch (err) {
      setState(s => ({ ...s, status: 'error', error: err.response?.data?.detail || 'Failed to start collection' }))
    } finally {
      setTriggering(false)
    }
  }

  async function handleRun() {
    setTriggering(true)
    try {
      await triggerDailyPipeline()
      setState(s => ({ ...s, status: 'running', step: 'Starting...', error: '' }))
      startPolling()
    } catch (err) {
      setState(s => ({ ...s, status: 'error', error: err.response?.data?.detail || 'Failed to start pipeline' }))
    } finally {
      setTriggering(false)
    }
  }

  async function handleTestEmail() {
    const userId = localStorage.getItem('userId')
    if (!userId) return
    setEmailStatus('sending')
    try {
      const res = await triggerTestEmail(userId)
      setEmailStatus(res.status === 'sent' ? 'sent' : 'empty')
    } catch {
      setEmailStatus('error')
    } finally {
      setTimeout(() => setEmailStatus(''), 5000)
    }
  }

  async function handleResetFilters() {
    const userId = localStorage.getItem('userId')
    if (!userId) return
    setTriggering(true)
    try {
      await triggerResetFilters(userId)
      setState(s => ({ ...s, status: 'running', step: 'Resetting filters and re-matching...', error: '' }))
      startPolling()
    } catch (err) {
      setState(s => ({ ...s, status: 'error', error: err.response?.data?.detail || 'Failed to reset filters' }))
    } finally {
      setTriggering(false)
    }
  }

  const isRunning = state.status === 'running'
  const isDone = state.status === 'complete'
  const isError = state.status === 'error'

  function formatTime(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Pipeline</h1>
      <p className="text-slate-500 text-sm mb-8">
        Fetches open positions directly from 21 company career pages, then filters and scores matches using Claude AI.
      </p>

      {/* DB totals */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
          <span className="text-sm text-slate-600 font-medium">Total jobs in database</span>
          <span className="text-2xl font-bold text-indigo-600">{totals.jobs.toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
          <span className="text-sm text-slate-600 font-medium">Total matches</span>
          <span className="text-2xl font-bold text-green-600">{totals.matches.toLocaleString()}</span>
        </div>
      </div>

      {/* Run button */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Daily Pipeline</h2>
            {state.started_at && (
              <p className="text-xs text-slate-400 mt-1">
                Last run: {formatTime(state.started_at)}
                {state.finished_at && ` → ${formatTime(state.finished_at)}`}
              </p>
            )}
          </div>
          <StatusIcon status={state.status} />
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">

            <button onClick={handleCollect} disabled={isRunning || triggering}
              className="bg-slate-700 text-white py-2.5 rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm">
              Collect New Jobs
              <div className="text-xs opacity-70 font-normal mt-0.5">free — no AI</div>
            </button>
            <button onClick={handleRun} disabled={isRunning || triggering}
              className="bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm">
              {isRunning ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Running...
                </span>
              ) : (
                <>
                  Run Full Pipeline
                  <div className="text-xs opacity-70 font-normal mt-0.5">collect + score</div>
                </>
              )}
            </button>
            <button onClick={handleResetFilters} disabled={isRunning || triggering}
              className="bg-amber-600 text-white py-2.5 rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm">
              Reset Filters
              <div className="text-xs opacity-70 font-normal mt-0.5">re-filter all jobs</div>
            </button>
          </div>
          <button onClick={handleTestEmail} disabled={isRunning || triggering || emailStatus === 'sending'}
            className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm">
            {emailStatus === 'sending' ? 'Sending...' : emailStatus === 'sent' ? '✓ Email sent! Check your inbox' : emailStatus === 'empty' ? 'No matches to email yet' : emailStatus === 'error' ? 'Failed — check SENDGRID_API_KEY' : 'Send Test Email'}
          </button>
        </div>
      </div>

      {/* Progress */}
      {(isRunning || isDone || isError) && (
        <div className={`rounded-xl border p-5 mb-6 ${isError ? 'bg-red-50 border-red-200' : isDone ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3 mb-4">
            <StatusIcon status={state.status} />
            <span className={`font-medium text-sm ${isError ? 'text-red-700' : isDone ? 'text-green-700' : 'text-slate-700'}`}>
              {isError ? `Error: ${state.error}` : state.step || 'Starting...'}
            </span>
          </div>

          {(isDone || isRunning) && (
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="New Jobs" value={state.new_jobs} color="indigo" />
              <StatBox label="Passed Filter" value={state.passed_filter} color="purple" />
              <StatBox label="Scored" value={state.scored} color="green" />
            </div>
          )}
        </div>
      )}

      {/* Filter warning */}
      {state.filter_warning && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-amber-500 text-xl">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">{state.filter_warning}</p>
            <a href="/profile" className="text-xs text-amber-700 underline mt-1 inline-block">
              Go to Profile to tighten your filters →
            </a>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-amber-800 mb-2">How it works</h3>
        <ol className="text-sm text-amber-700 space-y-1 list-decimal list-inside">
          <li>Fetches open positions from 21 company career pages (Greenhouse, Lever, Ashby APIs)</li>
          <li>Deduplicates by URL — no repeat listings</li>
          <li>Filters by your hard constraints (work mode, job type, location)</li>
          <li>Scores remaining jobs 0–100% using Claude AI</li>
          <li>Results appear in Jobs and Matches tabs</li>
        </ol>
      </div>
    </div>
  )
}
