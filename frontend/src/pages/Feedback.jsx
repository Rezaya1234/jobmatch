import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFeedbackSummary } from '../api'

const DAYS_OPTIONS = [
  { value: 30,  label: 'Last 30 days' },
  { value: 60,  label: 'Last 60 days' },
  { value: 90,  label: 'Last 90 days' },
  { value: 365, label: 'All time' },
]

function MetricCard({ label, value, sublabel, color = 'slate' }) {
  const colorMap = {
    slate:  'bg-white border-slate-200 text-slate-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    red:    'bg-red-50 border-red-200 text-red-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
  }
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${colorMap[color]}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-sm font-medium">{label}</span>
      {sublabel && <span className="text-xs opacity-60">{sublabel}</span>}
    </div>
  )
}

function InsightRow({ text }) {
  return (
    <div className="flex items-start gap-2 text-sm text-slate-700">
      <span className="mt-0.5 shrink-0 text-violet-500">•</span>
      <span>{text}</span>
    </div>
  )
}

function PrefChip({ label }) {
  return (
    <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{label}</span>
  )
}

function CourseCard({ course }) {
  const levelColor = {
    beginner:     'bg-green-100 text-green-700',
    intermediate: 'bg-amber-100 text-amber-700',
    advanced:     'bg-red-100 text-red-700',
  }
  return (
    <a
      href={course.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-violet-200 transition-all duration-150"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-sm font-semibold text-slate-900 leading-snug">{course.title}</h4>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 capitalize ${levelColor[course.level] || 'bg-slate-100 text-slate-500'}`}>
          {course.level}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-2 line-clamp-2">{course.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{course.provider}</span>
        <span className="text-xs text-violet-600 font-medium">View course →</span>
      </div>
    </a>
  )
}

function ActivityRow({ item }) {
  const icons = {
    thumbs_up:        { icon: '👍', label: 'Liked', color: 'text-green-600' },
    thumbs_down:      { icon: '👎', label: 'Disliked', color: 'text-red-500' },
    link_click:       { icon: '🔗', label: 'Opened', color: 'text-blue-500' },
    email_thumbs_up:  { icon: '📧', label: 'Liked via email', color: 'text-green-600' },
    email_thumbs_down:{ icon: '📧', label: 'Disliked via email', color: 'text-red-500' },
    applied:          { icon: '✅', label: 'Applied', color: 'text-violet-600' },
    interview:        { icon: '🎯', label: 'Interview', color: 'text-amber-600' },
    click:            { icon: '👀', label: 'Viewed', color: 'text-slate-500' },
  }
  const meta = icons[item.event_type] || { icon: '•', label: item.event_type, color: 'text-slate-400' }
  const ts = new Date(item.created_at)
  const dateStr = ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-base leading-none mt-0.5 shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
        {item.job_title && (
          <span className="text-xs text-slate-700"> — {item.job_title}</span>
        )}
        {item.company && (
          <span className="text-xs text-slate-400"> at {item.company}</span>
        )}
      </div>
      <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">
        {dateStr} {timeStr}
      </span>
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-4">{title}</h2>
      {children}
    </div>
  )
}

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

  const prefs = data?.preferences || {}
  const prefChips = [
    ...(prefs.work_modes || []).map(m => ({ label: m.replace('_', '-') })),
    prefs.seniority_level && { label: prefs.seniority_level },
    ...(prefs.preferred_sectors || []).map(s => ({ label: s })),
    ...(prefs.preferred_company_sizes || []).map(s => ({ label: s })),
    ...(prefs.locations || []).map(l => ({ label: l })),
    ...(prefs.title_include || []).map(t => ({ label: `+${t}` })),
    ...(prefs.title_exclude || []).map(t => ({ label: `-${t}`, muted: true })),
    prefs.salary_min && { label: `$${(prefs.salary_min / 1000).toFixed(0)}k+` },
    prefs.visa_sponsorship_required && { label: 'Visa sponsorship' },
  ].filter(Boolean)

  const displayedCourses = showAllCourses ? data?.all_courses : data?.courses
  const displayedActivity = showAllActivity ? data?.all_activity : data?.recent_activity

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Feedback</h1>
          <p className="text-sm text-slate-500 mt-1">
            What you liked, what you skipped, and how to improve your matches.
          </p>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        >
          {DAYS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          Could not load feedback data. Try again later.
        </div>
      ) : (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Liked" value={data.liked_count} color="green"
              sublabel="thumbs up" />
            <MetricCard label="Disliked" value={data.disliked_count} color="red"
              sublabel="thumbs down" />
            <MetricCard label="Viewed" value={data.viewed_count} color="blue"
              sublabel="jobs opened" />
            <MetricCard label="Rated" value={data.feedback_count} color="violet"
              sublabel="total feedback" />
          </div>

          {/* Middle row: What we learned + Your preferences */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="What we learned">
              {data.insights.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Rate a few jobs to unlock personalized insights.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {data.insights.map((text, i) => (
                    <InsightRow key={i} text={text} />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Your preferences">
              {prefChips.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No preferences set yet.{' '}
                  <button onClick={() => navigate('/profile')} className="text-violet-600 underline">
                    Update your profile →
                  </button>
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {prefChips.map((c, i) => (
                      <PrefChip key={i} label={c.label} />
                    ))}
                  </div>
                  <button
                    onClick={() => navigate('/profile')}
                    className="mt-3 text-xs text-violet-600 hover:text-violet-700 font-medium"
                  >
                    Edit preferences →
                  </button>
                </>
              )}
            </SectionCard>
          </div>

          {/* Bottom row: Courses + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Ways to improve your matches">
              {!displayedCourses || displayedCourses.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Like a few jobs to get personalized course recommendations.
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {displayedCourses.map(c => (
                      <CourseCard key={c.id} course={c} />
                    ))}
                  </div>
                  {!showAllCourses && (data.all_courses?.length || 0) > (data.courses?.length || 0) && (
                    <button
                      onClick={() => setShowAllCourses(true)}
                      className="mt-3 text-xs text-violet-600 hover:text-violet-700 font-medium"
                    >
                      View {data.all_courses.length - data.courses.length} more courses →
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

            <SectionCard title="Recent activity">
              {!displayedActivity || displayedActivity.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No activity yet. Browse jobs to get started.
                </p>
              ) : (
                <>
                  <div>
                    {displayedActivity.map((item, i) => (
                      <ActivityRow key={i} item={item} />
                    ))}
                  </div>
                  {!showAllActivity && (data.all_activity?.length || 0) > (data.recent_activity?.length || 0) && (
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
          </div>
        </>
      )}
    </div>
  )
}
