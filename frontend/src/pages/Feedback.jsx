import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFeedbackSummary } from '../api'

const DAYS_OPTIONS = [
  { value: 30,  label: 'Last 30 days' },
  { value: 60,  label: 'Last 60 days' },
  { value: 90,  label: 'Last 90 days' },
  { value: 365, label: 'All time' },
]

const LEARNING_STAGE_INDEX = {
  'Early stage':            0,
  'Building understanding': 1,
  'Good understanding':     2,
  'Strong understanding':   3,
}

const LEARNING_BADGE = {
  'Early stage':            'bg-slate-100 text-slate-600',
  'Building understanding': 'bg-amber-100 text-amber-700',
  'Good understanding':     'bg-blue-100 text-blue-700',
  'Strong understanding':   'bg-green-100 text-green-700',
}

const LEARNING_BAR_GRADIENT = {
  'Early stage':            'from-slate-300 to-slate-400',
  'Building understanding': 'from-amber-300 to-amber-500',
  'Good understanding':     'from-blue-400 to-blue-600',
  'Strong understanding':   'from-green-400 to-green-600',
}

const LEARNING_STAGES = [
  { label: 'Early',    sub: '0 signals' },
  { label: 'Building', sub: '5+ signals' },
  { label: 'Good',     sub: '10+' },
  { label: 'Strong',   sub: '20+' },
]

const EVENT_META = {
  thumbs_up:         { icon: '👍', label: 'Liked',              color: 'text-green-600' },
  thumbs_down:       { icon: '👎', label: 'Disliked',           color: 'text-red-500' },
  link_click:        { icon: '🔗', label: 'Clicked',            color: 'text-blue-500' },
  email_thumbs_up:   { icon: '📧', label: 'Liked via email',    color: 'text-green-600' },
  email_thumbs_down: { icon: '📧', label: 'Disliked via email', color: 'text-red-500' },
  applied:           { icon: '✅', label: 'Applied',            color: 'text-violet-600' },
  interview:         { icon: '🎯', label: 'Interview',          color: 'text-amber-600' },
}

const LIKED_TYPES    = new Set(['thumbs_up', 'email_thumbs_up'])
const DISLIKED_TYPES = new Set(['thumbs_down', 'email_thumbs_down'])

const LEVEL_STYLE = {
  beginner:     'bg-green-100 text-green-700',
  intermediate: 'bg-amber-100 text-amber-700',
  advanced:     'bg-red-100 text-red-700',
}

// ---------------------------------------------------------------------------
// Small atoms
// ---------------------------------------------------------------------------

function Skeleton({ className }) {
  return <div className={`animate-pulse bg-slate-100 rounded-lg ${className}`} />
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
      {children}
    </p>
  )
}

function MetricCard({ icon, label, value, color }) {
  const styles = {
    green:  'bg-green-50 border-green-200',
    red:    'bg-red-50 border-red-200',
    blue:   'bg-blue-50 border-blue-200',
    violet: 'bg-violet-50 border-violet-200',
  }
  return (
    <div className={`rounded-xl border shadow-sm p-4 flex flex-col gap-2 ${styles[color]}`}>
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-2xl font-bold text-slate-900">{value}</span>
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
    </div>
  )
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {subtitle && <p className="text-xs text-slate-400 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Learning status
// ---------------------------------------------------------------------------

function LearningStatus({ status, progress, message, impact }) {
  const safeStatus   = status || 'Early stage'
  const safeProgress = progress || 0
  const activeIndex  = LEARNING_STAGE_INDEX[safeStatus] ?? 0
  const badgeCls     = LEARNING_BADGE[safeStatus] || 'bg-slate-100 text-slate-600'
  const barGradient  = LEARNING_BAR_GRADIENT[safeStatus] || 'from-slate-300 to-slate-400'

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">🧠</span>
          <h2 className="text-sm font-semibold text-slate-900">Your profile learning status</h2>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${badgeCls}`}>
          {safeStatus}
        </span>
      </div>

      <div className="mb-4">
        <div className="h-3.5 bg-slate-100 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-700`}
            style={{ width: `${Math.max(safeProgress, 4)}%` }}
          />
        </div>

        <div className="flex justify-between">
          {LEARNING_STAGES.map((stage, i) => {
            const isActive = i === activeIndex
            const isPast   = i < activeIndex
            return (
              <div
                key={i}
                className={`flex flex-col gap-0.5 ${i === 0 ? 'items-start' : i === LEARNING_STAGES.length - 1 ? 'items-end' : 'items-center'}`}
              >
                <span className={`text-xs font-semibold ${isActive ? 'text-slate-800' : isPast ? 'text-slate-400' : 'text-slate-300'}`}>
                  {stage.label}
                </span>
                <span className={`text-xs ${isActive ? 'text-slate-500' : isPast ? 'text-slate-300' : 'text-slate-200'}`}>
                  {stage.sub}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-sm font-medium text-slate-700">{message}</p>

      {impact && (
        <p className="flex items-center gap-1.5 text-xs text-green-600 font-medium mt-2">
          <span className="text-green-500">↑</span>
          {impact}
        </p>
      )}

      <p className="text-xs text-slate-500 mt-3">
        We continuously update your recommendations as you provide feedback.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// What we learned
// ---------------------------------------------------------------------------

function InsightRow({ text }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="text-slate-300 mt-1 shrink-0 leading-none text-xs">•</span>
      <span className="text-xs text-slate-600 leading-relaxed">{text}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// What to do next
// ---------------------------------------------------------------------------

const CATEGORY_STYLE = {
  'Filter optimization': { badge: 'bg-blue-100 text-blue-700',    bar: 'bg-blue-500'   },
  'Skill improvement':   { badge: 'bg-violet-100 text-violet-700', bar: 'bg-violet-500' },
  'Focus strategy':      { badge: 'bg-amber-100 text-amber-700',   bar: 'bg-amber-500'  },
}

function NextStepCard({ index, step }) {
  const text     = typeof step === 'string' ? step : step.text
  const subtext  = typeof step === 'string' ? null  : (step.subtext || null)
  const category = typeof step === 'string' ? null  : step.category
  const styles   = CATEGORY_STYLE[category] || { badge: 'bg-slate-100 text-slate-500', bar: 'bg-slate-400' }

  return (
    <div className="flex items-start gap-3.5 p-4 rounded-xl border border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm transition-all duration-150">
      <div className={`w-7 h-7 rounded-full ${styles.bar} text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5`}>
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        {category && (
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1.5 ${styles.badge}`}>
            {category}
          </span>
        )}
        <p className="text-sm text-slate-800 leading-snug font-medium">{text}</p>
        {subtext && (
          <p className="text-xs text-slate-400 mt-0.5 leading-snug">{subtext}</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Course card
// ---------------------------------------------------------------------------

function CourseCard({ course }) {
  return (
    <a
      href={course.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-blue-200 transition-all duration-150 bg-white"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-slate-900 leading-snug">{course.title}</h4>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 capitalize ${LEVEL_STYLE[course.level] || 'bg-slate-100 text-slate-500'}`}>
          {course.level}
        </span>
      </div>
      {course.gap_reason && (
        <p className="text-xs text-blue-600 mb-3 font-medium leading-snug">{course.gap_reason}</p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{course.provider}</span>
        <span className="text-xs text-blue-600 font-semibold">View →</span>
      </div>
    </a>
  )
}

// ---------------------------------------------------------------------------
// Preferences — grouped chips
// ---------------------------------------------------------------------------

function PrefGroup({ label, chips, muted }) {
  if (!chips || chips.length === 0) return null
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip, i) => (
          <span
            key={i}
            className={`text-xs px-2.5 py-1 rounded-full ${muted ? 'bg-red-50 text-red-500 line-through' : 'bg-slate-100 text-slate-700'}`}
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  )
}

function PreferencesPanel({ prefs, navigate }) {
  if (!prefs || Object.keys(prefs).length === 0) {
    return (
      <p className="text-xs text-slate-400">
        No preferences set.{' '}
        <button onClick={() => navigate('/profile')} className="text-violet-600 underline">Set up your profile →</button>
      </p>
    )
  }

  const modeLabels = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }
  const sizeLabels = { startup: 'Startup', small: 'Small', medium: 'Mid-size', large: 'Large' }
  const workModes     = (prefs.work_modes || []).map(m => modeLabels[m] || m)
  const seniority     = prefs.seniority_level ? [prefs.seniority_level] : []
  const sectors       = prefs.preferred_sectors || []
  const sizes         = (prefs.preferred_company_sizes || []).map(s => sizeLabels[s] || s)
  const locations     = prefs.locations || []
  const titleInclude  = (prefs.title_include || []).map(t => `+${t}`)
  const titleExclude  = prefs.title_exclude || []
  const salaryChips   = prefs.salary_min
    ? [`${prefs.salary_currency || 'USD'} ${Math.round(prefs.salary_min / 1000)}k+`]
    : []

  return (
    <div>
      <PrefGroup label="Work mode"          chips={workModes} />
      <PrefGroup label="Seniority"           chips={seniority} />
      <PrefGroup label="Industries"          chips={sectors} />
      <PrefGroup label="Company size"        chips={sizes} />
      <PrefGroup label="Locations"           chips={locations} />
      <PrefGroup label="Title must include"  chips={titleInclude} />
      <PrefGroup label="Title must exclude"  chips={titleExclude} muted />
      <PrefGroup label="Salary"              chips={salaryChips} />
      <button
        onClick={() => navigate('/profile')}
        className="mt-1 text-xs text-violet-600 hover:text-violet-700 font-medium"
      >
        Edit preferences →
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity helpers
// ---------------------------------------------------------------------------

function toDayLabel(dateStr) {
  const now       = new Date()
  const d         = new Date(dateStr)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)

  if (d.toDateString() === now.toDateString())       return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  if (d >= weekAgo)                                  return 'Earlier this week'
  return 'Older'
}

// Merge multiple events for the same job into one row (newest-first input).
function collapseActivity(items) {
  const seenKeys = new Map()
  const result   = []

  for (const item of items) {
    const key = item.job_title && item.company
      ? `${item.job_title}|||${item.company}`
      : null

    if (key && seenKeys.has(key)) {
      result[seenKeys.get(key)]._allEvents.push(item.event_type)
    } else {
      const entry = { ...item, _allEvents: [item.event_type] }
      if (key) seenKeys.set(key, result.length)
      result.push(entry)
    }
  }

  return result.map(entry => {
    const evts        = entry._allEvents
    const hasLiked    = evts.some(e => LIKED_TYPES.has(e))
    const hasDisliked = evts.some(e => DISLIKED_TYPES.has(e))

    if (hasLiked && hasDisliked) {
      const firstDislikedIdx = evts.findIndex(e => DISLIKED_TYPES.has(e))
      const firstLikedIdx    = evts.findIndex(e => LIKED_TYPES.has(e))
      // newer-first: smaller index = more recent → if dislike is more recent, user liked first
      const combinedLabel = firstDislikedIdx < firstLikedIdx ? 'Liked, then Disliked' : 'Disliked, then Liked'
      return { ...entry, _combined: true, _combinedLabel: combinedLabel }
    }
    return entry
  })
}

function groupByDay(items) {
  const ORDER  = ['Today', 'Yesterday', 'Earlier this week', 'Older']
  const groups = new Map(ORDER.map(l => [l, []]))
  for (const item of items) groups.get(toDayLabel(item.created_at))?.push(item)
  return ORDER.map(l => ({ label: l, items: groups.get(l) })).filter(g => g.items.length > 0)
}

function generatePatternHint(allActivity) {
  if (!allActivity?.length) return null
  const liked    = allActivity.filter(a => LIKED_TYPES.has(a.event_type))
  const disliked = allActivity.filter(a => DISLIKED_TYPES.has(a.event_type))
  const total    = liked.length + disliked.length
  if (total < 3) return null

  const PATTERNS = [
    { keywords: ['operations', 'ops', 'supply chain', 'logistics', 'warehouse', 'area manager'], label: 'operations' },
    { keywords: ['software engineer', 'backend', 'frontend', 'developer', 'swe', 'fullstack', 'full stack'], label: 'engineering' },
    { keywords: ['data', 'analyst', 'analytics', ' bi '], label: 'data/analytics' },
    { keywords: [' ai ', ' ml ', 'machine learning', 'llm', 'deep learning'], label: 'AI/ML' },
    { keywords: ['product manager', 'product owner', 'strategy', 'growth', 'program manager'], label: 'product/strategy' },
  ]

  const likedText    = liked.map(a => ` ${(a.job_title || '').toLowerCase()} `).join(' ')
  const dislikedText = disliked.map(a => ` ${(a.job_title || '').toLowerCase()} `).join(' ')

  let topLiked = null, topDisliked = null, maxL = 0, maxD = 0
  for (const p of PATTERNS) {
    const lScore = p.keywords.filter(k => likedText.includes(k)).length
    const dScore = p.keywords.filter(k => dislikedText.includes(k)).length
    if (lScore > maxL) { maxL = lScore; topLiked = p.label }
    if (dScore > maxD) { maxD = dScore; topDisliked = p.label }
  }

  if (topLiked && topDisliked && topLiked !== topDisliked && maxL >= 1 && maxD >= 1) {
    return `You tend to skip ${topDisliked} roles and prefer ${topLiked} roles`
  }
  if (topLiked && maxL >= 1) {
    return `You consistently engage with ${topLiked} roles`
  }

  const likedPct = Math.round(liked.length / total * 100)
  if (likedPct >= 70) return 'You approve most roles you see — try narrowing your match filters'
  if (likedPct <= 30) return 'You skip most roles — your match criteria may need recalibration'
  return null
}

// ---------------------------------------------------------------------------
// Activity row
// ---------------------------------------------------------------------------

function ActivityRow({ item, isRecent }) {
  const meta    = EVENT_META[item.event_type] || { icon: '•', label: item.event_type, color: 'text-slate-400' }
  const timeStr = new Date(item.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const hasJob  = item.job_title || item.company

  let actionEl
  if (item._combined) {
    const positive = item._combinedLabel === 'Disliked, then Liked'
    actionEl = (
      <span className={`font-semibold ${positive ? 'text-green-600' : 'text-amber-600'}`}>
        {item._combinedLabel}
      </span>
    )
  } else {
    actionEl = <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
  }

  return (
    <div className={`flex items-start gap-3 py-2 border-b border-slate-50 last:border-0 rounded-lg transition-colors ${isRecent ? 'bg-slate-50 px-2 -mx-2' : ''}`}>
      <span className="text-sm leading-none mt-0.5 shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0 text-xs">
        {actionEl}
        {item.job_title && <span className="font-semibold text-slate-800"> · {item.job_title}</span>}
        {item.company   && <span className="font-normal text-slate-500"> @ {item.company}</span>}
        {!hasJob        && <span className="text-slate-500"> — no details</span>}
      </div>
      <span className="text-[11px] text-slate-300 shrink-0 whitespace-nowrap">{timeStr}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity section (self-contained state)
// ---------------------------------------------------------------------------

const ACTIVITY_LIMIT = 8

function ActivitySection({ allActivity }) {
  const [showAll, setShowAll] = useState(false)
  const [filter,  setFilter]  = useState('all')

  const raw = allActivity || []
  const filtered = filter === 'liked'
    ? raw.filter(a => LIKED_TYPES.has(a.event_type))
    : filter === 'disliked'
    ? raw.filter(a => DISLIKED_TYPES.has(a.event_type))
    : raw

  const collapsed   = collapseActivity(filtered)
  const visible     = showAll ? collapsed : collapsed.slice(0, ACTIVITY_LIMIT)
  const grouped     = groupByDay(visible)
  const patternHint = generatePatternHint(raw)
  const hasMore     = collapsed.length > ACTIVITY_LIMIT

  const FilterBtn = ({ val, label }) => (
    <button
      onClick={() => { setFilter(val); setShowAll(false) }}
      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
        filter === val
          ? 'bg-slate-800 text-white'
          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  )

  let recentCount = 0

  return (
    <SectionCard
      title="Recent activity"
      subtitle={patternHint || undefined}
      action={
        <div className="flex gap-1 shrink-0">
          <FilterBtn val="all"      label="All"      />
          <FilterBtn val="liked"    label="Liked"    />
          <FilterBtn val="disliked" label="Disliked" />
        </div>
      }
    >
      {grouped.length === 0 ? (
        <p className="text-xs text-slate-400">
          {filter === 'all'
            ? 'No activity yet. Browse jobs to get started.'
            : `No ${filter} activity in this period.`}
        </p>
      ) : (
        <>
          <div>
            {grouped.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest pt-3 pb-1 first:pt-0">
                  {group.label}
                </p>
                {group.items.map((item, i) => {
                  const isRecent = recentCount++ < 2
                  return <ActivityRow key={`${item.created_at}-${i}`} item={item} isRecent={isRecent} />
                })}
              </div>
            ))}
          </div>

          {!showAll && hasMore && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-3 text-xs text-violet-600 hover:text-violet-700 font-medium"
            >
              👉 View all {collapsed.length} activities
            </button>
          )}
          {showAll && (
            <button
              onClick={() => setShowAll(false)}
              className="mt-3 text-xs text-slate-400 hover:text-slate-600 font-medium"
            >
              Show less
            </button>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Feedback() {
  const navigate = useNavigate()
  const userId   = localStorage.getItem('userId')
  const [days, setDays]       = useState(30)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAllCourses, setShowAllCourses] = useState(false)

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    getFeedbackSummary(userId, days)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [userId, days])

  if (!userId) {
    return (
      <div className="text-center py-16 text-slate-500 text-sm">
        Set up your account to track feedback.
      </div>
    )
  }

  const displayedCourses = showAllCourses ? data?.all_courses : data?.courses
  const extraCourses     = (data?.all_courses?.length || 0) - (data?.courses?.length || 0)

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Feedback</h1>
          <p className="text-sm text-slate-600 mt-0.5">Your activity is shaping better job recommendations</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/positions')}
            className="text-sm font-semibold bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 active:bg-violet-800 transition-colors shadow-sm"
          >
            Explore better matches
          </button>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            {DAYS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-36" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          Could not load feedback data. Try again later.
        </div>
      ) : (
        <>
          {/* ── Metric cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard icon="👍" label="Liked"          value={data.liked_count}    color="green"  />
            <MetricCard icon="👎" label="Disliked"        value={data.disliked_count} color="red"    />
            <MetricCard icon="🔗" label="Clicked"         value={data.viewed_count}   color="blue"   />
            <MetricCard icon="💬" label="Feedback given"  value={data.feedback_count} color="violet" />
          </div>

          {/* ── Learning status ── */}
          <LearningStatus
            status={data.learning_status}
            progress={data.learning_progress}
            message={data.learning_message}
            impact={data.impact_message}
          />

          {/* ── Insights + Actions ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <SectionLabel>Insights</SectionLabel>
              <SectionCard title="What we learned" subtitle="Patterns from your activity">
                {!(data.insights?.length) ? (
                  <p className="text-xs text-slate-400">Rate a few jobs to unlock personalized insights.</p>
                ) : (
                  <div>
                    {data.insights.map((text, i) => <InsightRow key={i} text={text} />)}
                  </div>
                )}
              </SectionCard>
            </div>

            <div>
              <SectionLabel>Actions</SectionLabel>
              <SectionCard title="🎯 What to do next" subtitle="Your highest-impact next actions">
                {!(data.next_steps?.length) ? (
                  <p className="text-xs text-slate-400">
                    {data.feedback_count === 0
                      ? 'Rate jobs from the Open Positions tab to get personalised next steps.'
                      : 'Keep rating jobs — next steps will appear once patterns emerge.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.next_steps.map((step, i) => <NextStepCard key={i} index={i} step={step} />)}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>

          {/* ── Course recommendations + Preferences ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <SectionLabel>Improvement</SectionLabel>
              <SectionCard title="Ways to improve your matches" subtitle="Skill gaps in roles you engage with">
                {!displayedCourses || displayedCourses.length === 0 ? (
                  <p className="text-xs text-slate-400">Like a few jobs to get personalised course recommendations.</p>
                ) : (
                  <>
                    <div className="space-y-3">
                      {displayedCourses.map(c => <CourseCard key={c.id} course={c} />)}
                    </div>
                    {!showAllCourses && extraCourses > 0 && (
                      <button
                        onClick={() => setShowAllCourses(true)}
                        className="mt-3 text-xs text-violet-600 hover:text-violet-700 font-medium"
                      >
                        View {extraCourses} more course{extraCourses !== 1 ? 's' : ''} →
                      </button>
                    )}
                    {showAllCourses && (
                      <button
                        onClick={() => setShowAllCourses(false)}
                        className="mt-3 text-xs text-slate-400 hover:text-slate-600 font-medium"
                      >
                        Show less
                      </button>
                    )}
                  </>
                )}
              </SectionCard>
            </div>

            <div>
              <SectionLabel>&nbsp;</SectionLabel>
              <SectionCard title="Your preferences (inferred)" subtitle="Based on your behavior and profile">
                <PreferencesPanel prefs={data.preferences} navigate={navigate} />
              </SectionCard>
            </div>
          </div>

          {/* ── Recent activity ── */}
          <ActivitySection key={days} allActivity={data?.all_activity} />

          {/* ── Motivational footer ── */}
          <p className="text-center text-xs text-slate-400 pb-2">
            You're focusing on the right opportunities — keep going.
          </p>
        </>
      )}
    </div>
  )
}
