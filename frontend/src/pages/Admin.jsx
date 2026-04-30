import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  adminCheck,
  adminPipelineStatus,
  adminRecommendedActions,
  adminTestAgentMetrics,
  adminAgentLogs,
  adminPipelineFunnel,
  adminSourceHealth,
  adminAlerts,
  adminDismissAlert,
  adminUserActivity,
  adminJobScoring,
  adminWeightEvolution,
  adminMatchQualityCharts,
  adminGetThresholds,
  adminUpdateThresholds,
  adminRunTestAgent,
} from '../api'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_COLORS = {
  'Search Agent':        'bg-blue-100 text-blue-700',
  'Matching Agent':      'bg-violet-100 text-violet-700',
  'Feedback Agent':      'bg-green-100 text-green-700',
  'Orchestration Agent': 'bg-orange-100 text-orange-700',
  'Test Agent':          'bg-rose-100 text-rose-700',
  'Insights Agent':      'bg-teal-100 text-teal-700',
  'Email Agent':         'bg-slate-100 text-slate-600',
  'Vector Index':        'bg-violet-100 text-violet-700',
}

const SEV_COLORS = {
  CRITICAL: 'bg-rose-100 text-rose-700 border-rose-200',
  WARNING:  'bg-amber-100 text-amber-700 border-amber-200',
  INFO:     'bg-sky-100 text-sky-700 border-sky-200',
}

const METRIC_COLORS = {
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  red:   'text-rose-600',
  gray:  'text-slate-400',
}

const DIM_COLORS = {
  skills_match:        '#7c3aed',
  industry_alignment:  '#10B981',
  experience_level:    '#8B5CF6',
  function_type:       '#F59E0B',
  salary:              '#14B8A6',
  career_trajectory:   '#EF4444',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTs(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  })
}

function fmtPct(v, decimals = 1) {
  if (v == null) return '—'
  return (v * 100).toFixed(decimals) + '%'
}

function fmtNum(v) {
  if (v == null) return '—'
  return typeof v === 'number' ? v.toLocaleString() : v
}

function DeltaBadge({ delta }) {
  if (delta == null) return null
  const positive = delta >= 0
  return (
    <span className={`text-xs font-medium ml-1 ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
      {positive ? '+' : ''}{(delta * 100).toFixed(1)}%
    </span>
  )
}

function Spinner() {
  return <div className="animate-spin w-5 h-5 border-2 border-violet-300 border-t-violet-600 rounded-full" />
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      {message}
    </div>
  )
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 1 — Pipeline Status Bar
// ---------------------------------------------------------------------------

function PipelineStatusBar({ data, loading }) {
  if (loading) return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
      <Spinner /><span className="text-sm text-slate-500">Loading pipeline status…</span>
    </div>
  )

  const statusIcon = data?.status === 'healthy' ? '🟢' : data?.status === 'degraded' ? '🟡' : '🔴'
  const statusLabel = data?.status === 'healthy' ? 'Healthy' : data?.status === 'degraded' ? 'Degraded' : 'Failed'

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg">{statusIcon}</span>
        <span className="text-sm font-semibold text-slate-800">{statusLabel}</span>
      </div>
      <div className="text-xs text-slate-500">
        Last run: <span className="text-slate-700 font-medium">{fmtTs(data?.last_run_at)}</span>
      </div>
      <div className="flex gap-6 ml-auto text-xs text-slate-500">
        <div>Users processed: <span className="font-semibold text-slate-800">{fmtNum(data?.users_processed)}</span></div>
        {data?.avg_match_score != null && (
          <div>Avg score: <span className="font-semibold text-slate-800">{data.avg_match_score}%</span></div>
        )}
        <div>LLM cost today: <span className="font-semibold text-slate-800">${(data?.total_llm_cost_today || 0).toFixed(3)}</span></div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 2 — Recommended Actions
// ---------------------------------------------------------------------------

function RecommendedActions({ data, loading, onDismiss }) {
  if (loading) return null
  if (!data || data.length === 0) return <EmptyState message="All systems nominal — no actions required" />

  return (
    <div className="grid gap-3">
      {data.map((card, i) => (
        <div key={i} className={`border rounded-xl p-4 ${SEV_COLORS[card.severity] || 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wide">{card.severity}</span>
                {card.metric_name && (
                  <span className="text-xs opacity-70">{card.metric_name}: {card.metric_value != null ? fmtPct(card.metric_value) : '—'}</span>
                )}
              </div>
              <p className="text-sm font-semibold">{card.title}</p>
              <p className="text-xs mt-1 opacity-80">{card.description}</p>
              <div className="mt-2 text-xs space-y-0.5 opacity-90">
                <p><span className="font-medium">Root cause:</span> {card.root_cause}</p>
                <p><span className="font-medium">Action:</span> {card.recommended_action}</p>
              </div>
            </div>
            {card.alert_id && (
              <button
                onClick={() => onDismiss(card.alert_id)}
                className="shrink-0 text-xs px-2 py-1 rounded-lg hover:bg-white/40 transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 3 — Metric Cards
// ---------------------------------------------------------------------------

function MetricCard({ title, primary, secondary, color, detail }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${METRIC_COLORS[color] || 'text-slate-800'}`}>{primary}</p>
      {secondary && <p className="text-xs text-slate-400 mt-1">{secondary}</p>}
      {detail && <p className="text-xs text-slate-500 mt-2">{detail}</p>}
    </div>
  )
}

function MetricCards({ testMetrics, sourceHealth, userActivity, loading }) {
  if (loading) return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-24 animate-pulse bg-slate-50" />
      ))}
    </div>
  )

  const p50 = testMetrics?.precision_at_50
  const healthyCount = sourceHealth?.filter(s => s.status === 'Healthy').length ?? 0
  const totalSources = sourceHealth?.length ?? 0
  const sourceColor = healthyCount === totalSources ? 'green' : (totalSources - healthyCount) <= 2 ? 'amber' : 'red'

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <MetricCard
        title="Match Quality"
        primary={p50 ? fmtPct(p50.today) : '—'}
        secondary={p50?.baseline_7day ? `7d avg: ${fmtPct(p50.baseline_7day)}` : 'No baseline yet'}
        color={p50?.color || 'gray'}
      />
      <MetricCard
        title="Precision@50"
        primary={p50 ? fmtPct(p50.today) : '—'}
        secondary={p50?.delta != null ? `${p50.delta > 0 ? '+' : ''}${(p50.delta * 100).toFixed(1)}% vs baseline` : '—'}
        color={p50?.color || 'gray'}
      />
      <MetricCard
        title="LLM Cost Today"
        primary="$0.00"
        secondary="No runs yet"
        color="green"
      />
      <MetricCard
        title="Source Health"
        primary={`${healthyCount}/${totalSources}`}
        secondary={`${totalSources - healthyCount > 0 ? `${totalSources - healthyCount} issues` : 'All healthy'}`}
        color={sourceColor}
      />
      <MetricCard
        title="Users Active"
        primary={fmtNum(userActivity?.total_active_users)}
        secondary={`${fmtNum(userActivity?.feedback_signals_today)} signals today`}
        color="green"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 4 — Test Agent Evaluation
// ---------------------------------------------------------------------------

function MetricRow({ label, snap }) {
  if (!snap) return null
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-3">
        <span className={`text-sm font-semibold ${METRIC_COLORS[snap.color] || 'text-slate-800'}`}>
          {snap.today != null ? fmtPct(snap.today) : '—'}
        </span>
        <span className="text-xs text-slate-400 w-20 text-right">
          {snap.baseline_7day != null ? `7d: ${fmtPct(snap.baseline_7day)}` : '—'}
        </span>
        <DeltaBadge delta={snap.delta} />
      </div>
    </div>
  )
}

function TestAgentSection({ data, loading, onRun }) {
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)

  async function handleRun() {
    setRunning(true)
    setRunResult(null)
    try {
      const res = await adminRunTestAgent()
      setRunResult({ ok: true, msg: `Done — sample: ${res.sample_size ?? 0}, p@50: ${res.precision_at_50 != null ? (res.precision_at_50 * 100).toFixed(1) + '%' : 'n/a'}` })
      if (onRun) onRun()
    } catch {
      setRunResult({ ok: false, msg: 'Run failed — check logs' })
    } finally {
      setRunning(false)
    }
  }

  if (loading) return <div className="h-48 animate-pulse bg-slate-50 rounded-xl" />

  return (
    <SectionCard
      title="Test Agent Evaluation"
      subtitle={data?.run_date ? `Last run: ${data.run_date}` : 'Pipeline quality metrics'}
      action={
        <button
          onClick={handleRun}
          disabled={running}
          className="text-xs font-semibold text-violet-600 hover:text-violet-800 disabled:opacity-40 transition-colors"
        >
          {running ? 'Running…' : 'Run now'}
        </button>
      }
    >
      {runResult && (
        <div className={`text-xs rounded-lg px-3 py-2 mb-4 ${runResult.ok ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-700'}`}>
          {runResult.msg}
        </div>
      )}
      {!data?.has_data ? (
        <EmptyState message="No evaluation data yet — click Run now to compute metrics" />
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <MetricRow label="Precision@50" snap={data.precision_at_50} />
            <MetricRow label="Precision@15" snap={data.precision_at_15} />
            <MetricRow label="Recall@50 (est.)" snap={data.recall_at_50} />
            <MetricRow label="NDCG" snap={data.ndcg} />
            <MetricRow label="Coverage" snap={data.coverage} />
            <MetricRow label="False Positive Rate" snap={data.false_positive_rate} />
            {data.sample_size != null && (
              <p className="text-xs text-slate-400 mt-3">
                Sample: {data.sample_size.toLocaleString()} labeled jobs
                {data.confidence_score != null && ` · confidence ${(data.confidence_score * 100).toFixed(0)}%`}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Drift Alerts</p>
            {data.drift_flags?.length > 0
              ? data.drift_flags.map((msg, i) => (
                  <div key={i} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-2">
                    {msg}
                  </div>
                ))
              : <EmptyState message="No drift detected" />
            }
            {data.label_sources && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-600 mb-1">Label Sources</p>
                {Object.entries(data.label_sources).map(([k, v]) => (
                  <p key={k} className="text-xs text-slate-500">{k.replace(/_/g, ' ')}: <span className="font-medium text-slate-700">{v}</span></p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Section 5 — Pipeline Funnel + Activity Log
// ---------------------------------------------------------------------------

function PipelineFunnel({ data, loading }) {
  if (loading || !data?.stages) return <div className="h-40 animate-pulse bg-slate-50 rounded-xl" />

  const max = Math.max(...data.stages.map(s => s.count), 1)

  return (
    <div>
      {data.stages.map((stage, i) => (
        <div key={i} className="mb-3">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
            <span>{stage.label}</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800">{stage.count.toLocaleString()}</span>
              {stage.drop_pct != null && (
                <span className="text-rose-500">↓ {stage.drop_pct}%</span>
              )}
            </div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all"
              style={{ width: `${(stage.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ActivityLog({ data, loading }) {
  if (loading) return <div className="h-48 animate-pulse bg-slate-50 rounded-xl" />
  if (!data || data.length === 0) return <EmptyState message="No agent activity yet" />

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
      {data.map(entry => {
        const agentColor = AGENT_COLORS[entry.agent_name] || 'bg-slate-100 text-slate-600'
        const levelColor = entry.log_level === 'ERROR' ? 'text-rose-600' : entry.log_level === 'WARNING' ? 'text-amber-600' : 'text-slate-600'
        return (
          <div key={entry.id} className="flex gap-2 text-xs">
            <span className="text-slate-400 shrink-0 w-24 pt-0.5">{new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium h-fit ${agentColor}`}>{entry.agent_name}</span>
            <span className={`flex-1 ${levelColor}`}>{entry.message}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 7 — Source Health Table
// ---------------------------------------------------------------------------

function SourceHealthTable({ data, loading }) {
  if (loading) return <div className="h-32 animate-pulse bg-slate-50 rounded-xl" />
  if (!data || data.length === 0) return <EmptyState message="No scraper data yet" />

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            {['Source', 'Jobs Today', '% Change', 'Trust', 'Status', 'Last Scrape'].map(h => (
              <th key={h} className="pb-2 pr-4 font-medium text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.source_slug} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-4 font-medium text-slate-700">{row.source_slug}</td>
              <td className="py-2 pr-4">{row.jobs_today.toLocaleString()}</td>
              <td className="py-2 pr-4">
                {row.pct_change != null ? (
                  <span className={row.pct_change >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {row.pct_change > 0 ? '+' : ''}{row.pct_change}%
                  </span>
                ) : '—'}
              </td>
              <td className="py-2 pr-4">
                <span className={`font-semibold ${METRIC_COLORS[row.trust_color]}`}>
                  {row.trust_score.toFixed(2)}
                </span>
              </td>
              <td className="py-2 pr-4">
                <span className={`px-2 py-0.5 rounded-full font-medium ${
                  row.status === 'Healthy' ? 'bg-emerald-100 text-emerald-700' :
                  row.status === 'Degraded' ? 'bg-amber-100 text-amber-700' :
                  'bg-rose-100 text-rose-700'
                }`}>
                  {row.status}
                </span>
              </td>
              <td className="py-2 text-slate-400">{row.last_scrape_at ? new Date(row.last_scrape_at).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 8 — Alerts
// ---------------------------------------------------------------------------

function AlertsSection({ data, loading, onDismiss }) {
  if (loading) return null
  if (!data || data.length === 0) return <EmptyState message="No active alerts — pipeline is healthy" />

  return (
    <div className="space-y-3">
      {data.map(alert => (
        <div key={alert.id} className={`border rounded-xl p-4 ${SEV_COLORS[alert.severity] || 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase">{alert.severity}</span>
                <span className="text-xs opacity-60">{fmtTs(alert.triggered_at)}</span>
              </div>
              <p className="text-sm font-semibold">{alert.title}</p>
              <p className="text-xs mt-1 opacity-80">{alert.description}</p>
              {alert.baseline_comparison && (
                <p className="text-xs mt-1 opacity-70 italic">{alert.baseline_comparison}</p>
              )}
            </div>
            <button
              onClick={() => onDismiss(alert.id)}
              className="shrink-0 text-xs px-2 py-1 rounded-lg hover:bg-white/40 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 9 — User Activity Summary
// ---------------------------------------------------------------------------

function StatBox({ label, value, change }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <p className="text-2xl font-bold text-slate-800">{fmtNum(value)}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  )
}

function UserActivitySection({ data, loading }) {
  if (loading) return <div className="h-24 animate-pulse bg-slate-50 rounded-xl" />
  if (!data) return null

  const stats = [
    { label: 'Total active users', value: data.total_active_users },
    { label: 'New profiles today', value: data.new_profiles_today },
    { label: 'Feedback signals today', value: data.feedback_signals_today },
    { label: 'Cold start graduations', value: data.cold_start_graduations_today },
    { label: 'Applied signals', value: data.applied_signals_today },
    { label: 'Interview signals', value: data.interview_signals_today },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map(s => <StatBox key={s.label} {...s} />)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 10 — Job Scoring Explorer
// ---------------------------------------------------------------------------

function JobScoringExplorer({ loading }) {
  const [rows, setRows] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [fetching, setFetching] = useState(false)

  const load = useCallback(async () => {
    setFetching(true)
    try {
      const data = await adminJobScoring()
      setRows(data || [])
    } catch {}
    finally { setFetching(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const reactionIcon = r => ({ thumbs_up: '👍', thumbs_down: '👎' }[r] || '⏳')

  if (fetching) return <div className="h-32 animate-pulse bg-slate-50 rounded-xl" />
  if (rows.length === 0) return <EmptyState message="No jobs scored today yet" />

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            {['User', 'Job', 'Company', 'Score', 'Top 15?', 'Rejection', 'Reaction'].map(h => (
              <th key={h} className="pb-2 pr-3 font-medium text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <>
              <tr
                key={i}
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                onClick={() => setExpanded(expanded === i ? null : i)}
              >
                <td className="py-2 pr-3 text-slate-600 max-w-[120px] truncate">{row.user_email}</td>
                <td className="py-2 pr-3 font-medium text-slate-800 max-w-[160px] truncate">{row.job_title}</td>
                <td className="py-2 pr-3 text-slate-500">{row.company}</td>
                <td className={`py-2 pr-3 font-semibold ${
                  row.match_score >= 0.85 ? 'text-emerald-600' :
                  row.match_score >= 0.70 ? 'text-amber-600' : 'text-slate-500'
                }`}>
                  {row.match_score != null ? fmtPct(row.match_score) : '—'}
                </td>
                <td className="py-2 pr-3">
                  {row.in_top_15
                    ? <span className="text-emerald-600 font-medium">Yes</span>
                    : <span className="text-slate-400">No</span>}
                </td>
                <td className="py-2 pr-3 text-slate-500 max-w-[140px] truncate">{row.rejection_stage || '—'}</td>
                <td className="py-2">{reactionIcon(row.reaction)}</td>
              </tr>
              {expanded === i && row.dimension_scores && (
                <tr key={`${i}-exp`}>
                  <td colSpan={7} className="pb-3 px-0">
                    <div className="bg-slate-50 rounded-xl p-4 mt-1 space-y-2">
                      <p className="text-xs font-semibold text-slate-600 mb-2">Dimension Scores</p>
                      {Object.entries(row.dimension_scores).map(([dim, score]) => (
                        <div key={dim} className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-40">{dim.replace(/_/g, ' ')}</span>
                          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(score?.score ?? 0) * 100}%`,
                                backgroundColor: DIM_COLORS[dim] || '#6366F1',
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-700 w-10 text-right">
                            {score?.score != null ? fmtPct(score.score) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 11 — Weight Evolution
// ---------------------------------------------------------------------------

function WeightEvolutionSection() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [emailSearch, setEmailSearch] = useState('')

  const load = useCallback(async (email) => {
    setLoading(true)
    try {
      const d = await adminWeightEvolution(email ? { target_user_email: email } : {})
      setData(d)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="h-32 animate-pulse bg-slate-50 rounded-xl" />

  const latest = data?.platform_avg?.slice(-1)[0]
  const dims = latest ? Object.keys(latest.weights) : []

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <input
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="Search user by email…"
          value={emailSearch}
          onChange={e => setEmailSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(emailSearch)}
        />
        <button
          onClick={() => load(emailSearch)}
          className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
        >
          Search
        </button>
      </div>

      {latest ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 mb-3">Platform Average — Latest</p>
          {dims.map(dim => (
            <div key={dim} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-40">{dim.replace(/_/g, ' ')}</span>
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(latest.weights[dim] || 0) * 100}%`,
                    backgroundColor: DIM_COLORS[dim] || '#6366F1',
                  }}
                />
              </div>
              <span className="text-xs font-medium text-slate-700 w-10 text-right">
                {fmtPct(latest.weights[dim])}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No weight data yet — data will appear after first pipeline run with feedback" />
      )}

      {data?.user_data?.[0] && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-slate-600 mb-3">Individual User — {emailSearch}</p>
          {Object.entries(data.user_data[0].weights).map(([dim, val]) => (
            <div key={dim} className="flex items-center gap-3 mb-2">
              <span className="text-xs text-slate-500 w-40">{dim.replace(/_/g, ' ')}</span>
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${val * 100}%`, backgroundColor: DIM_COLORS[dim] || '#6366F1' }}
                />
              </div>
              <span className="text-xs font-medium text-slate-700 w-10 text-right">{fmtPct(val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 6 — Match Quality Charts
// ---------------------------------------------------------------------------

function MatchQualityCharts() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminMatchQualityCharts()
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="h-48 animate-pulse bg-slate-50 rounded-xl" />
      <div className="h-48 animate-pulse bg-slate-50 rounded-xl" />
    </div>
  )

  if (!data || (data.trend.length === 0 && data.distribution.every(b => b.count === 0))) {
    return <EmptyState message="No scored matches yet — charts will appear after first pipeline run" />
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* 30-day average score trend */}
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-3">30-Day Average Score Trend</p>
        {data.trend.length === 0 ? (
          <EmptyState message="No trend data yet" />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickFormatter={d => d.slice(5)}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickFormatter={v => `${Math.round(v * 100)}%`}
              />
              <Tooltip
                formatter={(v) => [`${(v * 100).toFixed(1)}%`, 'Avg score']}
                labelFormatter={l => `Date: ${l}`}
                contentStyle={{ fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="avg_score"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Score distribution */}
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-3">Score Distribution (All Time)</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data.distribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip
              formatter={(v) => [v.toLocaleString(), 'Matches']}
              contentStyle={{ fontSize: 11 }}
            />
            <Bar dataKey="count" fill="#7c3aed" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Threshold Settings Modal
// ---------------------------------------------------------------------------

function ThresholdModal({ onClose }) {
  const [thresholds, setThresholds] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminGetThresholds().then(d => { setThresholds(d.thresholds || {}); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    try {
      await adminUpdateThresholds(thresholds)
      onClose()
    } catch {}
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">Alert Threshold Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-3 max-h-96 overflow-y-auto">
          {loading ? <Spinner /> : Object.entries(thresholds).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between">
              <label className="text-xs text-slate-600">{key.replace(/_/g, ' ')}</label>
              <input
                type="number"
                step="0.01"
                value={val}
                onChange={e => setThresholds(t => ({ ...t, [key]: parseFloat(e.target.value) }))}
                className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-200">
          <button onClick={onClose} className="flex-1 text-sm px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 text-sm px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// UTC Clock
// ---------------------------------------------------------------------------

function UtcClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="text-xs text-slate-500 font-mono">
      {time.toISOString().slice(11, 19)} UTC
    </span>
  )
}

// ---------------------------------------------------------------------------
// Admin page
// ---------------------------------------------------------------------------

export default function Admin() {
  const navigate = useNavigate()
  const [authorized, setAuthorized] = useState(null)
  const [showThresholds, setShowThresholds] = useState(false)

  // Data state
  const [pipelineStatus, setPipelineStatus] = useState(null)
  const [actions, setActions] = useState([])
  const [testMetrics, setTestMetrics] = useState(null)
  const [logs, setLogs] = useState([])
  const [funnel, setFunnel] = useState(null)
  const [sourceHealth, setSourceHealth] = useState([])
  const [alerts, setAlerts] = useState([])
  const [userActivity, setUserActivity] = useState(null)
  const [loading, setLoading] = useState(true)

  // Auth check
  useEffect(() => {
    const uid = localStorage.getItem('userId')
    if (!uid) { navigate('/signin', { replace: true }); return }
    adminCheck().then(d => {
      if (!d.is_admin) navigate('/dashboard', { replace: true })
      else setAuthorized(true)
    }).catch(() => navigate('/dashboard', { replace: true }))
  }, [navigate])

  const loadAll = useCallback(async () => {
    try {
      const [ps, ac, tm, lg, fn, sh, al, ua] = await Promise.allSettled([
        adminPipelineStatus(),
        adminRecommendedActions(),
        adminTestAgentMetrics(),
        adminAgentLogs({ limit: 50 }),
        adminPipelineFunnel(),
        adminSourceHealth(),
        adminAlerts(),
        adminUserActivity(),
      ])
      if (ps.status === 'fulfilled') setPipelineStatus(ps.value)
      if (ac.status === 'fulfilled') setActions(ac.value)
      if (tm.status === 'fulfilled') setTestMetrics(tm.value)
      if (lg.status === 'fulfilled') setLogs(lg.value)
      if (fn.status === 'fulfilled') setFunnel(fn.value)
      if (sh.status === 'fulfilled') setSourceHealth(sh.value)
      if (al.status === 'fulfilled') setAlerts(al.value)
      if (ua.status === 'fulfilled') setUserActivity(ua.value)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authorized) return
    loadAll()
    const t = setInterval(loadAll, 60_000)
    return () => clearInterval(t)
  }, [authorized, loadAll])

  async function dismissAlert(id) {
    await adminDismissAlert(id)
    setAlerts(a => a.filter(x => x.id !== id))
    setActions(a => a.filter(x => x.alert_id !== id))
  }

  if (authorized === null) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Spinner />
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {showThresholds && <ThresholdModal onClose={() => setShowThresholds(false)} />}

      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Stellapath" style={{ height: '36px', width: 'auto' }} />
          <span className="text-xs font-bold px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <UtcClock />
          <a href="/admin/debug" className="text-xs text-slate-500 hover:text-slate-700 transition-colors font-medium">Pipeline Inspector</a>
          <a href="/dashboard" className="text-xs text-slate-500 hover:text-slate-700 transition-colors">← Back to app</a>
          <button
            onClick={() => setShowThresholds(true)}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
            title="Alert threshold settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">

        {/* Status bar */}
        <PipelineStatusBar data={pipelineStatus} loading={loading} />

        {/* Recommended Actions */}
        {(actions.length > 0 || loading) && (
          <SectionCard title="Recommended Actions" subtitle="Sorted by severity">
            <RecommendedActions data={actions} loading={loading} onDismiss={dismissAlert} />
          </SectionCard>
        )}

        {/* Metric cards */}
        <MetricCards testMetrics={testMetrics} sourceHealth={sourceHealth} userActivity={userActivity} loading={loading} />

        {/* Test Agent Evaluation */}
        <TestAgentSection data={testMetrics} loading={loading} onRun={async () => {
          const tm = await adminTestAgentMetrics().catch(() => null)
          if (tm) setTestMetrics(tm)
        }} />

        {/* Funnel + Activity Log */}
        <div className="grid md:grid-cols-5 gap-6">
          <div className="md:col-span-2">
            <SectionCard title="Pipeline Funnel" subtitle={`Today — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}>
              <PipelineFunnel data={funnel} loading={loading} />
            </SectionCard>
          </div>
          <div className="md:col-span-3">
            <SectionCard title="Agent Activity Log" subtitle="Last 50 entries — auto-refreshes every 60s">
              <ActivityLog data={logs} loading={loading} />
            </SectionCard>
          </div>
        </div>

        {/* Source Health */}
        <SectionCard title="Scraper Source Health" subtitle="Updated daily at 3:00 AM UTC">
          <SourceHealthTable data={sourceHealth} loading={loading} />
        </SectionCard>

        {/* Alerts */}
        <SectionCard title="Test Agent Alerts">
          <AlertsSection data={alerts} loading={loading} onDismiss={dismissAlert} />
        </SectionCard>

        {/* User Activity */}
        <SectionCard title="User Activity" subtitle="Today">
          <UserActivitySection data={userActivity} loading={loading} />
        </SectionCard>

        {/* Match Quality Charts */}
        <SectionCard title="Match Quality Charts" subtitle="30-day trend and score distribution">
          <MatchQualityCharts />
        </SectionCard>

        {/* Job Scoring Explorer */}
        <SectionCard title="Daily Job Scoring Explorer" subtitle="Top matches today">
          <JobScoringExplorer loading={loading} />
        </SectionCard>

        {/* Weight Evolution */}
        <SectionCard title="Weight Evolution" subtitle="Platform average — last 30 days">
          <WeightEvolutionSection />
        </SectionCard>

      </main>
    </div>
  )
}
