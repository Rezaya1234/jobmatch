import { useState, useEffect, useRef } from 'react'
import {
  triggerCollect, triggerResetFilters, triggerTestEmail,
  triggerCompanyInsights, backfillLogos, getJobCount, getMatchCount,
  getPipelineStatus, triggerStepReset, triggerStepFilter, triggerStepCandidates,
  triggerStepScore, triggerStepDeliver,
} from '../api'

const STEP_META = [
  { id: 1, label: 'Search',      sub: 'Scrape 41 career pages'        },
  { id: 2, label: 'Hard Filter', sub: 'Job type, location, visa'       },
  { id: 3, label: 'Candidates',  sub: 'Soft + heuristic + embedding'  },
  { id: 4, label: 'LLM Score',   sub: 'Claude Haiku batch scoring'    },
  { id: 5, label: 'Deliver',     sub: 'Select top 3 → mark shown'     },
]

function Spinner({ size = 4 }) {
  return (
    <svg className={`animate-spin h-${size} w-${size}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

function StepCard({ meta, stepStatus, onClick, disabled }) {
  const { status, detail } = stepStatus
  const idle    = status === 'idle'
  const running = status === 'running'
  const done    = status === 'done'
  const error   = status === 'error'

  return (
    <button
      onClick={onClick}
      disabled={disabled || running}
      className={[
        'flex flex-col items-center p-3 rounded-xl border-2 text-center w-full transition-all',
        done    ? 'border-green-400 bg-green-50'                                    : '',
        error   ? 'border-red-300 bg-red-50'                                        : '',
        running ? 'border-indigo-300 bg-indigo-50 cursor-wait'                     : '',
        idle    ? 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50 cursor-pointer' : '',
        disabled && !running ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
    >
      {/* Badge */}
      <div className={[
        'w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center mb-2 shrink-0',
        done    ? 'bg-green-500 text-white'  : '',
        running ? 'bg-indigo-500 text-white' : '',
        error   ? 'bg-red-400 text-white'    : '',
        idle    ? 'bg-slate-100 text-slate-600' : '',
      ].join(' ')}>
        {done ? '✓' : running ? <Spinner size={3} /> : meta.id}
      </div>

      <div className="font-semibold text-xs text-slate-800 leading-tight">{meta.label}</div>
      <div className="text-xs text-slate-400 mt-0.5 leading-tight">{meta.sub}</div>

      {detail && (
        <div className={[
          'text-xs font-medium mt-2 px-2 py-0.5 rounded-full leading-tight',
          done  ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600',
        ].join(' ')}>
          {detail}
        </div>
      )}
    </button>
  )
}

export default function Pipeline() {
  const [pipeState, setPipeState] = useState({
    status: 'idle', step: '', new_jobs: 0, passed_filter: 0, scored: 0,
    error: '', started_at: '', finished_at: '', filter_warning: '',
  })
  const [totals, setTotals]           = useState({ jobs: 0, matches: 0 })
  const [emailStatus, setEmailStatus] = useState('')
  const [insightsStatus, setInsightsStatus] = useState('')
  const [logoStatus, setLogoStatus]   = useState('')

  const [stepState, setStepState] = useState({
    1: { status: 'idle', detail: '' },
    2: { status: 'idle', detail: '' },
    3: { status: 'idle', detail: '' },
    4: { status: 'idle', detail: '' },
    5: { status: 'idle', detail: '' },
  })
  const [runAllActive, setRunAllActive] = useState(false)
  const [resetState, setResetState] = useState({ status: 'idle', detail: '' })
  const pollRef = useRef(null)

  function uid() { return localStorage.getItem('userId') }

  async function fetchTotals() {
    try {
      const id = uid()
      const [{ count: jobs }, { count: matches }] = await Promise.all([
        getJobCount(),
        id ? getMatchCount(id) : Promise.resolve({ count: 0 }),
      ])
      setTotals({ jobs, matches })
    } catch {}
  }

  async function fetchPipeStatus() {
    try {
      const data = await getPipelineStatus()
      setPipeState(data)
      if (data.status !== 'running') {
        stopPolling()
        fetchTotals()
        // Sync step 1 if it was waiting on this poll
        setStepState(prev => {
          if (prev[1].status !== 'running') return prev
          return {
            ...prev,
            1: {
              status: data.status === 'complete' ? 'done' : 'error',
              detail: data.status === 'complete'
                ? `${data.new_jobs} new jobs`
                : (data.error || 'Failed'),
            },
          }
        })
      }
    } catch {}
  }

  function startPolling() {
    if (pollRef.current) return
    pollRef.current = setInterval(fetchPipeStatus, 2000)
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => {
    fetchPipeStatus()
    fetchTotals()
    return () => stopPolling()
  }, [])

  // ---- Reset handler ----

  async function handleReset() {
    const id = uid()
    if (!id) return
    setResetState({ status: 'running', detail: '' })
    setStepState({
      1: { status: 'idle', detail: '' },
      2: { status: 'idle', detail: '' },
      3: { status: 'idle', detail: '' },
      4: { status: 'idle', detail: '' },
      5: { status: 'idle', detail: '' },
    })
    try {
      const res = await triggerStepReset(id)
      setResetState({ status: res.status === 'error' ? 'error' : 'done', detail: res.detail })
      fetchTotals()
    } catch {
      setResetState({ status: 'error', detail: 'Failed' })
    }
  }

  // ---- Individual step handlers ----

  async function handleStep1() {
    setStepState(s => ({ ...s, 1: { status: 'running', detail: '' } }))
    try {
      await triggerCollect()
      setPipeState(s => ({ ...s, status: 'running', step: 'Fetching jobs...', error: '' }))
      startPolling()
    } catch {
      setStepState(s => ({ ...s, 1: { status: 'error', detail: 'Failed to start' } }))
    }
  }

  async function runStep(num, apiFn) {
    setStepState(s => ({ ...s, [num]: { status: 'running', detail: '' } }))
    try {
      const res = await apiFn()
      setStepState(s => ({
        ...s,
        [num]: { status: res.status === 'error' ? 'error' : 'done', detail: res.detail },
      }))
      if (res.status === 'error') throw new Error(res.detail)
    } catch (err) {
      setStepState(s => ({
        ...s,
        [num]: prev => prev[num].status === 'running'
          ? { status: 'error', detail: err.message || 'Failed' }
          : prev[num],
      }))
      throw err
    }
  }

  // ---- Run All ----

  async function handleRunAll() {
    const id = uid()
    if (!id) return
    setRunAllActive(true)
    setStepState({
      1: { status: 'idle', detail: '' },
      2: { status: 'idle', detail: '' },
      3: { status: 'idle', detail: '' },
      4: { status: 'idle', detail: '' },
      5: { status: 'idle', detail: '' },
    })

    try {
      // Step 1 — background + poll
      setStepState(s => ({ ...s, 1: { status: 'running', detail: '' } }))
      await triggerCollect()
      setPipeState(s => ({ ...s, status: 'running', step: 'Fetching jobs...', error: '' }))
      await new Promise((resolve, reject) => {
        const iv = setInterval(async () => {
          try {
            const data = await getPipelineStatus()
            setPipeState(data)
            if (data.status !== 'running') {
              clearInterval(iv)
              fetchTotals()
              if (data.status === 'complete') {
                setStepState(s => ({ ...s, 1: { status: 'done', detail: `${data.new_jobs} new jobs` } }))
                resolve()
              } else {
                setStepState(s => ({ ...s, 1: { status: 'error', detail: data.error || 'Failed' } }))
                reject(new Error('Step 1 failed'))
              }
            }
          } catch { clearInterval(iv); reject(new Error('Poll failed')) }
        }, 2000)
      })

      // Steps 2–5 — synchronous
      for (const [num, apiFn] of [
        [2, () => triggerStepFilter(id)],
        [3, () => triggerStepCandidates(id)],
        [4, () => triggerStepScore(id)],
        [5, () => triggerStepDeliver(id)],
      ]) {
        setStepState(s => ({ ...s, [num]: { status: 'running', detail: '' } }))
        const res = await apiFn()
        setStepState(s => ({
          ...s,
          [num]: { status: res.status === 'error' ? 'error' : 'done', detail: res.detail },
        }))
        if (res.status === 'error') break
      }
      fetchTotals()
    } catch {
      // error already set on the failing step card
    } finally {
      setRunAllActive(false)
    }
  }

  // ---- Utility handlers ----

  async function handleTestEmail() {
    const id = uid()
    if (!id) return
    setEmailStatus('sending')
    try {
      const res = await triggerTestEmail(id)
      setEmailStatus(res.status === 'sent' ? 'sent' : 'empty')
    } catch { setEmailStatus('error') }
    finally { setTimeout(() => setEmailStatus(''), 5000) }
  }

  async function handleCompanyInsights() {
    setInsightsStatus('running')
    try {
      await triggerCompanyInsights()
      setInsightsStatus('accepted')
    } catch { setInsightsStatus('error') }
    finally { setTimeout(() => setInsightsStatus(''), 5000) }
  }

  async function handleResetFilters() {
    const id = uid()
    if (!id) return
    try {
      await triggerResetFilters(id)
      setPipeState(s => ({ ...s, status: 'running', step: 'Resetting filters...', error: '' }))
      startPolling()
    } catch {}
  }

  async function handleBackfillLogos() {
    setLogoStatus('running')
    try {
      const res = await backfillLogos()
      setLogoStatus(res.detail || 'done')
    } catch { setLogoStatus('error') }
    finally { setTimeout(() => setLogoStatus(''), 6000) }
  }

  const anyStepRunning = Object.values(stepState).some(s => s.status === 'running') || runAllActive

  function fmt(iso) {
    return iso ? new Date(iso).toLocaleTimeString() : ''
  }

  const pipe = pipeState
  const isRunning = pipe.status === 'running'
  const isDone    = pipe.status === 'complete'
  const isError   = pipe.status === 'error'

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Pipeline</h1>
      <p className="text-slate-500 text-sm mb-6">
        Fetches jobs from 41 company career pages, then filters and scores them using Claude AI.
      </p>

      {/* ── Step-by-step testing ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-slate-800">Step-by-Step Testing</h2>
          {anyStepRunning && (
            <span className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
              <Spinner size={3} /> Running…
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Click each step in order, or run all at once. Completed steps stay green.
        </p>

        {/* Reset button */}
        <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <button
            onClick={handleReset}
            disabled={anyStepRunning || resetState.status === 'running'}
            className="shrink-0 bg-red-500 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            {resetState.status === 'running' ? <><Spinner size={3} /> Clearing…</> : '↺ Clear Matches'}
          </button>
          <span className={`text-xs ${resetState.status === 'done' ? 'text-green-600 font-medium' : resetState.status === 'error' ? 'text-red-600' : 'text-slate-400'}`}>
            {resetState.detail || 'Clear all match rows before running steps — required if you have existing matches'}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2 mb-3">
          {STEP_META.map(meta => (
            <StepCard
              key={meta.id}
              meta={meta}
              stepStatus={stepState[meta.id]}
              disabled={anyStepRunning && stepState[meta.id].status !== 'running'}
              onClick={() => {
                const id = uid()
                if (meta.id === 1) return handleStep1()
                if (meta.id === 2) return runStep(2, () => triggerStepFilter(id))
                if (meta.id === 3) return runStep(3, () => triggerStepCandidates(id))
                if (meta.id === 4) return runStep(4, () => triggerStepScore(id))
                if (meta.id === 5) return runStep(5, () => triggerStepDeliver(id))
              }}
            />
          ))}
        </div>

        {/* Results row */}
        {Object.values(stepState).some(s => s.status === 'done' || s.status === 'error') && (
          <div className="grid grid-cols-5 gap-2 mb-3">
            {STEP_META.map(meta => {
              const s = stepState[meta.id]
              if (s.status === 'idle' || s.status === 'running') return <div key={meta.id} />
              return (
                <div key={meta.id} className={`rounded-lg p-2 text-center text-xs ${s.status === 'done' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {s.detail || '—'}
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={handleRunAll}
          disabled={anyStepRunning}
          className="w-full bg-violet-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {runAllActive ? <><Spinner size={4} /> Running all steps…</> : '▶  Run All Steps  (1 → 5)'}
        </button>
      </div>

      {/* ── DB totals ── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
          <span className="text-sm text-slate-600 font-medium">Total jobs in database</span>
          <span className="text-2xl font-bold text-indigo-600">{totals.jobs.toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
          <span className="text-sm text-slate-600 font-medium">Your matches</span>
          <span className="text-2xl font-bold text-green-600">{totals.matches.toLocaleString()}</span>
        </div>
      </div>

      {/* ── Pipeline status display ── */}
      {(isRunning || isDone || isError) && (
        <div className={`rounded-xl border p-4 mb-6 ${isError ? 'bg-red-50 border-red-200' : isDone ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            {isRunning && <Spinner size={4} />}
            {isDone  && <span className="text-green-500 font-bold">✓</span>}
            {isError && <span className="text-red-500 font-bold">✗</span>}
            <span className={`text-sm font-medium ${isError ? 'text-red-700' : isDone ? 'text-green-700' : 'text-slate-700'}`}>
              {isError ? `Error: ${pipe.error}` : pipe.step || 'Starting…'}
            </span>
          </div>
          {(isDone || isRunning) && (
            <div className="grid grid-cols-3 gap-3 text-center">
              {[['New Jobs', pipe.new_jobs, 'indigo'], ['Passed Filter', pipe.passed_filter, 'purple'], ['Scored', pipe.scored, 'green']].map(([label, val, color]) => (
                <div key={label} className={`bg-${color}-50 rounded-lg p-3`}>
                  <div className={`text-2xl font-bold text-${color}-700`}>{val}</div>
                  <div className={`text-xs text-${color}-500 font-medium uppercase tracking-wide mt-0.5`}>{label}</div>
                </div>
              ))}
            </div>
          )}
          {pipe.started_at && (
            <p className="text-xs text-slate-400 mt-3">
              {fmt(pipe.started_at)}{pipe.finished_at && ` → ${fmt(pipe.finished_at)}`}
            </p>
          )}
        </div>
      )}

      {/* ── Utility controls ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Utilities</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleTestEmail}
            disabled={emailStatus === 'sending'}
            className="bg-green-600 text-white py-2 rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {emailStatus === 'sending' ? 'Sending…' : emailStatus === 'sent' ? '✓ Email sent!' : emailStatus === 'error' ? 'Failed' : 'Send Test Email'}
          </button>
          <button
            onClick={handleCompanyInsights}
            disabled={insightsStatus === 'running'}
            className="bg-violet-600 text-white py-2 rounded-lg font-medium text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {insightsStatus === 'running' ? 'Starting…' : insightsStatus === 'accepted' ? '✓ Started' : insightsStatus === 'error' ? 'Failed' : 'Refresh Insights'}
          </button>
          <button
            onClick={handleResetFilters}
            disabled={anyStepRunning}
            className="bg-amber-600 text-white py-2 rounded-lg font-medium text-sm hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            Reset Filters
            <span className="block text-xs opacity-70 font-normal">re-filter all jobs</span>
          </button>
          <button
            onClick={handleBackfillLogos}
            disabled={logoStatus === 'running'}
            className="bg-slate-600 text-white py-2 rounded-lg font-medium text-sm hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {logoStatus === 'running' ? 'Running…' : logoStatus === 'error' ? 'Failed' : logoStatus || 'Backfill Logos'}
          </button>
        </div>
      </div>

      {/* ── How it works ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-amber-800 mb-2">How it works</h3>
        <ol className="text-sm text-amber-700 space-y-1 list-decimal list-inside">
          <li>Scrapes open positions from 41 company career pages</li>
          <li>Hard filter — work mode, job type, location, visa, excluded companies</li>
          <li>Soft filter + heuristic keyword scoring + BGE embedding → top 15 candidates</li>
          <li>Claude Haiku scores each candidate 0–100% against your profile</li>
          <li>Top 3 jobs selected and marked as delivered in your dashboard</li>
        </ol>
      </div>
    </div>
  )
}
