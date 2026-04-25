import { useState, useEffect } from 'react'
import { submitFeedback, deleteFeedback } from '../api'
import CompanyLogo from './CompanyLogo'

const DIMENSIONS = [
  { key: 'skills_match',       label: 'Skills match' },
  { key: 'experience_level',   label: 'Experience level' },
  { key: 'industry_alignment', label: 'Industry alignment' },
  { key: 'salary',             label: 'Salary fit' },
  { key: 'function_type',      label: 'Function type' },
  { key: 'career_trajectory',  label: 'Career trajectory' },
]
const DIM_LABELS = Object.fromEntries(DIMENSIONS.map(d => [d.key, d.label]))

const GAP_COACHING = {
  skills_match:       'Highlight matching skills more prominently in your profile and cover note',
  experience_level:   'Emphasize project outcomes that demonstrate the required seniority',
  industry_alignment: 'Tailor your summary to surface relevant domain experience',
  salary:             'Your expected range may differ — review the posting for flexibility signals',
  function_type:      'This role has a different focus than your current trajectory',
  career_trajectory:  'Frame your career story to align with this direction',
}

const SKILL_KEYWORDS_JS = {
  python:           ['python', 'pytorch', 'pandas', 'numpy', 'fastapi', 'django'],
  machine_learning: ['machine learning', 'scikit', 'xgboost', 'gradient boost', 'ml engineer'],
  deep_learning:    ['deep learning', 'neural network', 'pytorch', 'tensorflow', 'transformer'],
  llm:              ['llm', 'large language model', 'langchain', 'rag', 'embedding', 'openai'],
  nlp:              ['nlp', 'natural language', 'bert', 'text classification'],
  mlops:            ['mlops', 'model deploy', 'model serving', 'mlflow', 'kubeflow'],
  data_engineering: ['data pipeline', 'etl', 'data warehouse', 'airflow', 'dagster'],
  sql:              ['sql', 'postgresql', 'mysql', 'snowflake', 'bigquery'],
  aws:              ['aws', 'amazon web services', 'sagemaker', 's3', 'ec2'],
  kubernetes:       ['kubernetes', 'k8s', 'helm'],
  docker:           ['docker', 'dockerfile', 'container'],
  react:            ['react', 'reactjs', 'redux'],
  typescript:       ['typescript', 'nextjs', 'angular'],
  system_design:    ['system design', 'distributed system', 'microservice', 'scalab'],
  analytics:        ['analytics', 'tableau', 'looker', 'a/b test', 'power bi'],
}

const SKILL_COURSES = {
  python:           { name: 'Python for Data Science & AI', provider: 'Coursera' },
  machine_learning: { name: 'ML Specialization (Andrew Ng)', provider: 'Coursera' },
  deep_learning:    { name: 'Deep Learning Specialization', provider: 'Coursera' },
  llm:              { name: 'LangChain & LLM Development', provider: 'DeepLearning.AI' },
  nlp:              { name: 'NLP with Transformers', provider: 'Hugging Face' },
  mlops:            { name: 'MLOps Specialization', provider: 'Coursera' },
  data_engineering: { name: 'Data Engineering Fundamentals', provider: 'dbt Labs' },
  sql:              { name: 'SQL for Data Analysis', provider: 'Coursera' },
  aws:              { name: 'AWS Cloud Practitioner', provider: 'AWS' },
  kubernetes:       { name: 'Kubernetes for Developers', provider: 'Udemy' },
  docker:           { name: 'Docker Mastery', provider: 'Udemy' },
  react:            { name: 'React — The Complete Guide', provider: 'Udemy' },
  typescript:       { name: 'TypeScript Masterclass', provider: 'Udemy' },
  system_design:    { name: 'Grokking System Design', provider: 'Educative' },
  analytics:        { name: 'Google Data Analytics Certificate', provider: 'Coursera' },
}

function detectSkillsFromText(text) {
  if (!text) return []
  const lower = text.toLowerCase()
  return Object.entries(SKILL_KEYWORDS_JS)
    .filter(([, patterns]) => patterns.some(p => lower.includes(p)))
    .map(([skill]) => skill)
}

function buildWhyWorthIt(job) {
  const scores = job.dimension_scores || {}
  const topDims = Object.entries(scores)
    .filter(([, v]) => typeof v === 'number' && v >= 0.7)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
  return { reasoning: job.reasoning, topDims }
}

function buildGaps(job) {
  const scores = job.dimension_scores || {}
  return Object.entries(scores)
    .filter(([, v]) => typeof v === 'number' && v < 0.65)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 3)
    .map(([key, val]) => ({ key, label: DIM_LABELS[key] || key.replace(/_/g, ' '), val }))
}

export default function DetailsDrawer({ job, userId, currentRating, onClose, onFeedback }) {
  const [localRating, setLocalRating] = useState(currentRating || null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setLocalRating(currentRating || null) }, [currentRating, job?.job_id])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  if (!job) return null

  const pct = Math.round((job.score || 0) * 100)
  const scoreColor = pct >= 85 ? 'text-green-600 bg-green-50 border-green-200'
    : pct >= 70 ? 'text-amber-600 bg-amber-50 border-amber-200'
    : 'text-slate-500 bg-slate-50 border-slate-200'

  const { reasoning, topDims } = buildWhyWorthIt(job)
  const gaps = buildGaps(job)
  const detectedSkills = detectSkillsFromText(job.description)
  const suggestedCourses = detectedSkills.map(s => SKILL_COURSES[s]).filter(Boolean).slice(0, 2)

  async function applyRating(newRating) {
    if (saving) return
    const next = localRating === newRating ? null : newRating
    const prev = localRating
    setLocalRating(next)
    setSaving(true)
    try {
      if (next === null) {
        await deleteFeedback(userId, job.job_id)
      } else {
        await submitFeedback(userId, job.job_id, next, '', 2)
      }
      onFeedback?.(next, job.job_id)
    } catch {
      setLocalRating(prev)
    } finally {
      setSaving(false)
    }
  }

  async function handleApply() {
    if (job.url) window.open(job.url, '_blank', 'noreferrer')
    if (localRating !== 'thumbs_up') {
      setLocalRating('thumbs_up')
      try {
        await submitFeedback(userId, job.job_id, 'thumbs_up', '', 2)
        onFeedback?.('thumbs_up', job.job_id)
      } catch { /* silent */ }
    }
    onClose()
  }

  async function handleNotInterested() {
    setLocalRating('thumbs_down')
    try {
      await submitFeedback(userId, job.job_id, 'thumbs_down', 'not_interested', 2)
      onFeedback?.('thumbs_down', job.job_id)
    } catch { /* silent */ }
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" onClick={onClose} aria-hidden="true" />

      <div
        className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-white z-50 shadow-2xl flex flex-col animate-[slideInRight_200ms_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-label={`Job details: ${job.title}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <CompanyLogo company={job.company} url={job.url} size="md" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 leading-snug">{job.title}</h2>
              <p className="text-sm text-slate-500">{job.company}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ml-2 shrink-0 focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Close drawer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Meta chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${scoreColor}`}>
              {pct}% match
            </span>
            {job.work_mode && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{job.work_mode}</span>
            )}
            {job.location_raw && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{job.location_raw}</span>
            )}
            {(job.salary_min || job.salary_max) && (
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                ${job.salary_min ? `${Math.round(job.salary_min / 1000)}k` : '?'}
                {job.salary_max ? `–$${Math.round(job.salary_max / 1000)}k` : '+'}
              </span>
            )}
          </div>

          {/* 1. Why it's worth your time */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2.5">Why it's worth your time</p>
            {reasoning && (
              <p className="text-sm text-slate-700 leading-relaxed mb-3">{reasoning}</p>
            )}
            {topDims.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {topDims.map(([key, val]) => (
                  <span key={key} className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-100 px-2.5 py-1 rounded-full">
                    <svg className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {DIM_LABELS[key] || key} · {Math.round(val * 100)}%
                  </span>
                ))}
              </div>
            )}
            {!reasoning && topDims.length === 0 && (
              <p className="text-sm text-slate-400">Analysis in progress.</p>
            )}
          </div>

          {/* 2. What might hold you back */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2.5">What might hold you back</p>
            {gaps.length === 0 ? (
              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
                <svg className="w-4 h-4 text-green-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-green-700 font-medium">No significant gaps — you're a strong candidate for this role.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {gaps.map(({ key, label, val }) => (
                  <div key={key} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-amber-800">{label}</span>
                      <span className="text-xs text-amber-600 font-mono">{Math.round(val * 100)}%</span>
                    </div>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      {GAP_COACHING[key] || 'Consider how to address this gap in your application'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Company snapshot */}
          {(job.sector || job.company_size || job.work_mode || job.location_raw) && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2.5">Company snapshot</p>
              <div className="grid grid-cols-2 gap-2">
                {job.sector && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Sector</p>
                    <p className="text-sm font-medium text-slate-700">{job.sector}</p>
                  </div>
                )}
                {job.company_size && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Company size</p>
                    <p className="text-sm font-medium text-slate-700">{job.company_size}</p>
                  </div>
                )}
                {job.work_mode && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Work mode</p>
                    <p className="text-sm font-medium text-slate-700">{job.work_mode}</p>
                  </div>
                )}
                {job.location_raw && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Location</p>
                    <p className="text-sm font-medium text-slate-700">{job.location_raw}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. How to improve your chances */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2.5">How to improve your chances</p>
            {suggestedCourses.length > 0 ? (
              <div className="space-y-2">
                {suggestedCourses.map((course, i) => (
                  <div key={i} className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                    <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-blue-700 truncate">{course.name}</p>
                      <p className="text-[10px] text-blue-500">{course.provider}</p>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-slate-400 pt-0.5">
                  <a href="/feedback" className="text-violet-600 hover:underline font-medium">See all recommendations →</a>
                </p>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-sm text-slate-500">
                  Visit{' '}
                  <a href="/feedback" className="text-violet-600 font-medium hover:underline">Feedback & Insights</a>
                  {' '}for personalized learning recommendations based on all your activity.
                </p>
              </div>
            )}
          </div>

          {/* 5. People in your network */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2.5">People in your network</p>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
              <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm text-slate-500 mb-2">Connect your LinkedIn in Profile to see who you know at {job.company}.</p>
              <a href="/profile" className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors">Connect LinkedIn →</a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 shrink-0">
          <div className="flex gap-3 mb-3">
            <button
              onClick={handleApply}
              disabled={saving}
              className={`flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 min-h-[44px] disabled:opacity-50 ${
                localRating === 'thumbs_up'
                  ? 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500'
                  : 'bg-violet-600 hover:bg-violet-700 text-white focus:ring-violet-500'
              }`}
            >
              {localRating === 'thumbs_up' ? 'Applied ✓' : 'Apply →'}
            </button>
            <button
              onClick={handleNotInterested}
              disabled={saving}
              className={`text-sm font-medium px-4 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 min-h-[44px] disabled:opacity-50 ${
                localRating === 'thumbs_down'
                  ? 'text-rose-600 border-rose-300 bg-rose-50'
                  : 'text-slate-500 hover:text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              {localRating === 'thumbs_down' ? 'Skipped' : 'Not interested'}
            </button>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => applyRating('thumbs_up')}
              disabled={saving}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 ${
                localRating === 'thumbs_up'
                  ? 'border-green-300 text-green-600 bg-green-50'
                  : 'border-slate-200 text-slate-400 hover:border-green-300 hover:text-green-600 hover:bg-green-50'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
              </svg>
              Good fit
            </button>
            <button
              onClick={() => applyRating('thumbs_down')}
              disabled={saving}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 ${
                localRating === 'thumbs_down'
                  ? 'border-rose-300 text-rose-500 bg-rose-50'
                  : 'border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
              </svg>
              Not a fit
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
