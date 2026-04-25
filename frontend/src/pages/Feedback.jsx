import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFeedbackSummary } from '../api'

const DAYS_OPTIONS = [
  { value: 30,  label: 'Last 30 days' },
  { value: 60,  label: 'Last 60 days' },
  { value: 90,  label: 'Last 90 days' },
  { value: 365, label: 'All time' },
]

const LEARNING_STATUS_COLOR = {
  'Early stage':          'bg-slate-100 text-slate-600',
  'Building understanding': 'bg-amber-100 text-amber-700',
  'Good understanding':   'bg-blue-100 text-blue-700',
  'Strong understanding': 'bg-green-100 text-green-700',
}

const LEARNING_BAR_COLOR = {
  'Early stage':          'bg-slate-400',
  'Building understanding': 'bg-amber-400',
  'Good understanding':   'bg-blue-500',
  'Strong understanding': 'bg-green-500',
}

const EVENT_META = {
  thumbs_up:         { icon: '👍', label: 'Liked',            color: 'text-green-600 font-semibold' },
  thumbs_down:       { icon: '👎', label: 'Disliked',         color: 'text-red-500 font-semibold' },
  link_click:        { icon: '🔗', label: 'Clicked',          color: 'text-blue-500' },
  email_thumbs_up:   { icon: '📧', label: 'Liked via email',  color: 'text-green-600' },
  email_thumbs_down: { icon: '📧', label: 'Disliked via email', color: 'text-red-500' },
  applied:           { icon: '✅', label: 'Applied',          color: 'text-violet-600 font-semibold' },
  interview:         { icon: '🎯', label: 'Interview',        color: 'text-amber-600 font-semibold' },
}

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

function MetricCard({ icon, label, value, color }) {
  const styles = {
    green:  'bg-green-50 border-green-200',
    red:    'bg-red-50 border-red-200',
    blue:   'bg-blue-50 border-blue-200',
    violet: 'bg-violet-50 border-violet-200',
  }
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${styles[color]}`}>
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-2xl font-bold text-slate-900">{value}</span>
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
    </div>
  )
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
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
  const statusCls = LEARNING_STATUS_COLOR[status] || 'bg-slate-100 text-slate-600'
  const barCls = LEARNING_BAR_COLOR[status] || 'bg-slate-400'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-lg">🧠</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-800">Profile learning status</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>{status}</span>
          </div>
          {impact && (
            <p className="text-xs text-green-600 font-medium mt-0.5">{impact}</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${barCls}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <p className="text-sm text-slate-600">{message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// What we learned
// ---------------------------------------------------------------------------

function InsightRow({ text }) {
  const [main, action] = text.includes(' → ') ? text.split(' → ') : [text, null]
  return (
    <div className="flex items-start gap-2 py-2 border-b border-slate-50 last:border-0">
      <span className="text-violet-400 mt-0.5 shrink-0 text-sm">›</span>
      <span className="text-sm text-slate-700 leading-snug">
        {main}
        {action && (
          <>
            <span className="text-slate-400"> → </span>
            <span className="text-violet-700 font-medium">{action}</span>
          </>
        )}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// What to do next
// ---------------------------------------------------------------------------

function NextStepCard({ index, text }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
      <div className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {index + 1}
      </div>
      <span className="text-sm text-slate-700 leading-snug">{text}</span>
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
      className="block rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-violet-200 transition-all duration-150 bg-white"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="text-sm font-semibold text-slate-900 leading-snug">{course.title}</h4>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 capitalize ${LEVEL_STYLE[course.level] || 'bg-slate-100 text-slate-500'}`}>
          {course.level}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-2 line-clamp-2">{course.description}</p>
      {course.gap_reason && (
        <p className="text-xs text-violet-600 mb-2 font-medium">{course.gap_reason}</p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{course.provider}</span>
        <span className="text-xs text-violet-600 font-medium">View →</span>
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
  const workModes = (prefs.work_modes || []).map(m => modeLabels[m] || m)
  const seniority = prefs.seniority_level ? [prefs.seniority_level] : []
  const sectors = prefs.preferred_sectors || []
  const sizes = (prefs.preferred_company_sizes || []).map(s => sizeLabels[s] || s)
  const locations = prefs.locations || []
  const titleInclude = (prefs.title_include || []).map(t => `+${t}`)
  const titleExclude = prefs.title_exclude || []
  const salaryChips = prefs.salary_min
    ? [`${prefs.salary_currency || 'USD'} ${Math.round(prefs.salary_min / 1000)}k+`]
    : []

  return (
    <div>
      <PrefGroup label="Work mode" chips={workModes} />
      <PrefGroup label="Seniority" chips={seniority} />
      <PrefGroup label="Industries" chips={sectors} />
      <PrefGroup label="Company size" chips={sizes} />
      <PrefGroup label="Locations" chips={locations} />
      <PrefGroup label="Title must include" chips={titleInclude} />
      <PrefGroup label="Title must exclude" chips={titleExclude} muted />
      <PrefGroup label="Salary" chips={salaryChips} />
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
// Activity row
// ---------------------------------------------------------------------------

function ActivityRow({ item }) {
  const meta = EVENT_META[item.event_type] || { icon: '•', label: item.event_type, color: 'text-slate-400' }
  const ts = new Date(item.created_at)
  const dateStr = ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  const hasJob = item.job_title || item.company

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-base leading-none mt-0.5 shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0 text-sm">
        <span className={meta.color}>{meta.label}</span>
        {item.job_title && <span className="text-slate-700">: {item.job_title}</span>}
        {item.company && <span className="text-slate-400"> @ {item.company}</span>}
        {!hasJob && <span className="text-slate-400"> — no details</span>}
      </div>
      <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">{dateStr} {timeStr}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Feedback() {
  const navigate = useNavigate()
  const userId = localStorage.getItem('userId')
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAllCourses, setShowAllCourses] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)

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
  const displayedActivity = showAllActivity ? data?.all_activity : data?.recent_activity
  const extraCourses = (data?.all_courses?.length || 0) - (data?.courses?.length || 0)
  const extraActivity = (data?.all_activity?.length || 0) - (data?.recent_activity?.length || 0)

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Feedback</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your activity is shaping better job recommendations</p>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        >
          {DAYS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-28" />
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
            <MetricCard icon="👍" label="Liked" value={data.liked_count} color="green" />
            <MetricCard icon="👎" label="Disliked" value={data.disliked_count} color="red" />
            <MetricCard icon="🔗" label="Clicked" value={data.viewed_count} color="blue" />
            <MetricCard icon="💬" label="Feedback given" value={data.feedback_count} color="violet" />
          </div>

          {/* ── Learning status ── */}
          <LearningStatus
            status={data.learning_status}
            progress={data.learning_progress}
            message={data.learning_message}
            impact={data.impact_message}
          />

          {/* ── What we learned + What to do next ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard
              title="What we learned"
              subtitle="Patterns from your activity"
              action={
                <button
                  onClick={() => navigate('/profile')}
                  className="text-xs text-violet-600 hover:text-violet-700 font-medium whitespace-nowrap"
                >
                  Update filters →
                </button>
              }
            >
              {!(data.insights?.length) ? (
                <p className="text-xs text-slate-400">Rate a few jobs to unlock personalized insights.</p>
              ) : (
                <div>
                  {data.insights.map((text, i) => <InsightRow key={i} text={text} />)}
                </div>
              )}
            </SectionCard>

            <SectionCard title="🎯 What to do next" subtitle="Your highest-impact next actions">
              {!(data.next_steps?.length) ? (
                <p className="text-xs text-slate-400">
                  {data.feedback_count === 0
                    ? 'Rate jobs from the Open Positions tab to get personalised next steps.'
                    : 'Keep rating jobs — next steps will appear once patterns emerge.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {data.next_steps.map((step, i) => <NextStepCard key={i} index={i} text={step} />)}
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Course recommendations + Preferences ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

            <SectionCard title="Your preferences (inferred)" subtitle="Based on your profile and activity">
              <PreferencesPanel prefs={data.preferences} navigate={navigate} />
            </SectionCard>
          </div>

          {/* ── Recent activity ── */}
          <SectionCard title="Recent activity" subtitle="Your last interactions with the system">
            {!displayedActivity || displayedActivity.length === 0 ? (
              <p className="text-xs text-slate-400">No activity yet. Browse jobs to get started.</p>
            ) : (
              <>
                <div>
                  {displayedActivity.map((item, i) => <ActivityRow key={i} item={item} />)}
                </div>
                {!showAllActivity && extraActivity > 0 && (
                  <button
                    onClick={() => setShowAllActivity(true)}
                    className="mt-2 text-xs text-violet-600 hover:text-violet-700 font-medium"
                  >
                    See all {data.all_activity.length} events →
                  </button>
                )}
                {showAllActivity && (
                  <button
                    onClick={() => setShowAllActivity(false)}
                    className="mt-2 text-xs text-slate-400 hover:text-slate-600 font-medium"
                  >
                    Show less
                  </button>
                )}
              </>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}
