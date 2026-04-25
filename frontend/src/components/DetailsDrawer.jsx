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

const SKILL_DISPLAY_NAMES = {
  python:           'Python',
  machine_learning: 'machine learning',
  deep_learning:    'deep learning',
  llm:              'LLM / generative AI',
  nlp:              'NLP',
  mlops:            'MLOps',
  data_engineering: 'data engineering',
  sql:              'SQL',
  aws:              'cloud (AWS)',
  kubernetes:       'Kubernetes',
  docker:           'Docker / containerisation',
  react:            'React',
  typescript:       'TypeScript',
  system_design:    'system design',
  analytics:        'data analytics',
}

function extractSeniority(title) {
  const t = (title || '').toLowerCase()
  if (t.includes('principal') || t.includes('staff')) return 'principal / staff'
  if (t.includes('senior') || t.includes('sr.') || / sr /.test(t)) return 'senior'
  if (t.includes('lead')) return 'lead'
  if (t.includes('director')) return 'director'
  if (t.includes('manager')) return 'manager'
  if (t.includes('junior') || t.includes('jr.')) return 'junior'
  return null
}

function buildFitBullets(job, topDims, detectedSkills, requirements, profile) {
  const sector    = job.sector
  const seniority = extractSeniority(job.title)
  const skill0    = SKILL_DISPLAY_NAMES[detectedSkills[0]] || null
  const skill1    = SKILL_DISPLAY_NAMES[detectedSkills[1]] || null
  const k         = n => Math.round(n / 1000)
  const yrs       = profile?.years_experience
  const lvl       = profile?.seniority_level

  return topDims.slice(0, 3).map(([key]) => {
    const reqText = findReqFor(requirements, key)

    switch (key) {
      case 'skills_match':
        if (reqText && skill0) return `They need ${trim80(reqText).toLowerCase()} — your ${skill0} background covers this.`
        if (reqText)           return `They need ${trim80(reqText).toLowerCase()} — your background covers this.`
        if (skill0 && skill1)  return `This role centres on ${skill0} and ${skill1} — your profile covers both.`
        if (skill0)            return `The ${skill0} focus here is a direct match with your background.`
        return 'Your technical skills are a solid match for what this role requires.'

      case 'experience_level':
        if (reqText && yrs) return `They ask for ${trim80(reqText).toLowerCase()} — you have ${yrs} years, which covers that.`
        if (reqText)        return `${trim80(reqText)} — your experience is a match here.`
        if (yrs && seniority) return `You have ${yrs} years at ${seniority} level — that's exactly what this role is looking for.`
        if (seniority)        return `You're at ${seniority} level, which is what this role requires.`
        return 'Your experience level is a strong match for this role.'

      case 'industry_alignment':
        if (reqText && sector) return `They want ${trim80(reqText).toLowerCase()} — your ${sector} background is a direct fit.`
        if (sector)            return `Your background in ${sector} is exactly the domain this role operates in.`
        return 'Your industry background aligns with what this role needs.'

      case 'salary':
        if (job.salary_min && job.salary_max) return `The range ($${k(job.salary_min)}k–$${k(job.salary_max)}k) is in line with your target.`
        return 'The compensation is in line with your target range.'

      case 'function_type': {
        if (reqText) return `They require ${trim80(reqText).toLowerCase()} — that's a clear match with your qualifications.`
        const fn = job.title.split(/\s+/).slice(0, 4).join(' ')
        return `The type of work — ${fn} — is consistent with your recent experience.`
      }

      case 'career_trajectory':
        if (reqText && lvl) return `They want ${trim80(reqText).toLowerCase()} — at ${lvl} level, this is a natural next move for you.`
        if (reqText)        return `They want ${trim80(reqText).toLowerCase()} — that aligns with where you're heading.`
        if (seniority)      return `A ${seniority} role here is a natural progression from where you are now.`
        return 'This role is a logical step forward from your current position.'

      default:
        return 'This area is a strong match with your background.'
    }
  })
}

function buildGapBullets(job, gaps, detectedSkills, requirements, profile) {
  const sector = job.sector
  const seniority = extractSeniority(job.title)
  const k = n => Math.round(n / 1000)
  const yrs = profile?.years_experience
  const lvl = profile?.seniority_level

  return gaps.map(({ key }) => {
    const reqText = findReqFor(requirements, key)

    switch (key) {
      case 'skills_match': {
        const named = detectedSkills.slice(0, 2).map(s => SKILL_DISPLAY_NAMES[s]).filter(Boolean)
        if (reqText && named.length >= 1) return `Requires ${trim80(reqText).toLowerCase()} — ${named[0]} isn't currently prominent on your profile.`
        if (reqText)       return `Requires ${trim80(reqText).toLowerCase()} — not clearly represented on your current profile.`
        if (named.length >= 2) return `Requires ${named[0]} and ${named[1]} — not a current strength on your profile.`
        if (named.length === 1) return `Requires solid ${named[0]} — not currently a visible part of your profile.`
        return 'Some specific technical requirements here aren\'t clearly visible on your profile.'
      }

      case 'experience_level': {
        const yearsReq = reqText?.match(/(\d+)\+?\s*(?:to\s*\d+\s*)?years?/i)?.[0]
        if (yearsReq && yrs) return `Asks for ${yearsReq} — you have ${yrs}. Lead with scope and impact, not tenure.`
        if (reqText && yrs)  return `Asks for ${trim80(reqText).toLowerCase()} — you have ${yrs} years. Emphasise outcomes over titles.`
        if (reqText)         return `Asks for ${trim80(reqText).toLowerCase()} — lean into impact and scope in your application.`
        if (seniority && lvl) return `${seniority}-level role — you're at ${lvl}. Lean into impact and scope.`
        return 'Seniority bar is a stretch — lead with scope and impact, not job titles.'
      }

      case 'industry_alignment':
        if (sector) return `Your background isn't primarily in ${sector} — make the connection explicit in your application.`
        return 'Industry background is a mismatch — make your relevance explicit, don\'t leave it to be inferred.'

      case 'salary':
        if (job.salary_min && job.salary_max) return `Posted range is $${k(job.salary_min)}k–$${k(job.salary_max)}k — check that against your target.`
        return 'Check the compensation range against your target before going further.'

      case 'function_type': {
        if (reqText) return `Requires ${trim80(reqText).toLowerCase()} — not currently a strong part of your profile.`
        const fn = job.title.split(/\s+/).slice(0, 3).join(' ')
        return `Primarily a ${fn} role — a shift from your recent work.`
      }

      case 'career_trajectory':
        if (reqText && lvl) return `Wants ${trim80(reqText).toLowerCase()} — at ${lvl} level, that's a stretch.`
        if (reqText)        return `Wants ${trim80(reqText).toLowerCase()} — a stretch from your current direction.`
        return 'A pivot from your recent direction — you\'ll need a clear narrative for the move.'

      default:
        return 'An area worth addressing before you apply.'
    }
  })
}

function trim80(text) {
  const t = text.replace(/\.$/, '').trim()
  return t.length > 90 ? t.slice(0, 87) + '…' : t
}

const COURSE_OUTCOMES = {
  python:           "Useful if you want to round out your Python for data or ML work.",
  machine_learning: "Good for building credibility in ML engineering roles.",
  deep_learning:    "Helpful if you're moving toward AI research or applied ML.",
  llm:              "Worth it if you want to work on AI-native products.",
  nlp:              "Relevant for NLP and text-heavy engineering roles.",
  mlops:            "Directly applicable if production ML is part of this role.",
  data_engineering: "Useful for data infrastructure and pipeline-heavy roles.",
  sql:              "Helpful for any role where data analysis is expected.",
  aws:              "Good for cloud-heavy roles — most of them require this now.",
  kubernetes:       "Worth it for infrastructure or platform engineering roles.",
  docker:           "Increasingly expected in backend or ML engineering roles.",
  react:            "Good if you need to show frontend depth.",
  typescript:       "Worth adding if full-stack or frontend is part of the picture.",
  system_design:    "Useful if this role expects strong architectural thinking.",
  analytics:        "Good foundation for data or product analytics roles.",
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
  python:           { skill: 'python',           name: 'Python for Data Science & AI',      provider: 'Coursera' },
  machine_learning: { skill: 'machine_learning', name: 'ML Specialization (Andrew Ng)',      provider: 'Coursera' },
  deep_learning:    { skill: 'deep_learning',    name: 'Deep Learning Specialization',       provider: 'Coursera' },
  llm:              { skill: 'llm',              name: 'LangChain & LLM Development',        provider: 'DeepLearning.AI' },
  nlp:              { skill: 'nlp',              name: 'NLP with Transformers',              provider: 'Hugging Face' },
  mlops:            { skill: 'mlops',            name: 'MLOps Specialization',               provider: 'Coursera' },
  data_engineering: { skill: 'data_engineering', name: 'Data Engineering Fundamentals',      provider: 'dbt Labs' },
  sql:              { skill: 'sql',              name: 'SQL for Data Analysis',              provider: 'Coursera' },
  aws:              { skill: 'aws',              name: 'AWS Cloud Practitioner',             provider: 'AWS' },
  kubernetes:       { skill: 'kubernetes',       name: 'Kubernetes for Developers',          provider: 'Udemy' },
  docker:           { skill: 'docker',           name: 'Docker Mastery',                     provider: 'Udemy' },
  react:            { skill: 'react',            name: 'React — The Complete Guide',         provider: 'Udemy' },
  typescript:       { skill: 'typescript',       name: 'TypeScript Masterclass',             provider: 'Udemy' },
  system_design:    { skill: 'system_design',    name: 'Grokking System Design',             provider: 'Educative' },
  analytics:        { skill: 'analytics',        name: 'Google Data Analytics Certificate',  provider: 'Coursera' },
}

// ---------------------------------------------------------------------------
// Parse job description into responsibilities + requirements sections
// ---------------------------------------------------------------------------

function stripHtml(html) {
  if (!html) return ''
  const withBreaks = html.replace(/<\/?(li|p|div|br|h[1-6]|tr)[^>]*>/gi, '\n')
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html')
  return doc.body.textContent || ''
}

const _RESP_RE = /^(?:what you['']ll do|responsibilities|key responsibilities|your role|in this role|what you['']ll be doing|the role|day.to.day|what you['']ll own|what you['']ll build|role overview)/i
const _REQ_RE  = /^(?:what you['']ll bring|requirements|qualifications|what we['']re looking for|you have|you bring|must.have|required|who you are|what you need|minimum qualifications|basic qualifications|about you|ideal candidate|your background|you offer)/i
const _STOP_RE = /^(?:benefits|compensation|what we offer|perks|about us|about the company|our company|why join)/i

function parseJobSections(description) {
  if (!description) return { responsibilities: [], requirements: [] }
  const lines = stripHtml(description).split(/\n/).map(l => l.trim()).filter(Boolean)
  const resp = [], reqs = []
  let mode = null
  for (const line of lines) {
    const bare = line.replace(/^[#*•\-:]+\s*/, '').trim()
    if (_RESP_RE.test(bare) && bare.length < 80)  { mode = 'resp'; continue }
    if (_REQ_RE.test(bare)  && bare.length < 80)  { mode = 'reqs'; continue }
    if (_STOP_RE.test(bare) && bare.length < 80)  { mode = null;   continue }
    if (!mode) continue
    const clean = bare.replace(/^[-•*\d.]+\s*/, '').trim()
    if (clean.length < 15) continue
    if (mode === 'resp' && resp.length < 4) resp.push(clean)
    if (mode === 'reqs' && reqs.length < 6) reqs.push(clean)
  }
  return { responsibilities: resp, requirements: reqs }
}

function findReqFor(requirements, dimension) {
  if (!requirements.length) return null
  const matchers = {
    experience_level: r => /\d+\+?\s*(?:to\s*\d+\s*)?years?\s*(?:of\s*)?(?:experience|exp\b)/i.test(r),
    skills_match:     r => /(python|sql|aws|cloud|react|typescript|ml\b|ai\b|llm|data|java\b|golang|kubernetes|docker|spark|dbt|airflow)/i.test(r),
    industry_alignment: r => /(industry|sector|domain|background in|experience in)/i.test(r),
    career_trajectory:  r => /(leadership|management|strategy|roadmap|stakeholder|director|vp\b|c-level|cross.functional)/i.test(r),
    function_type:      r => /(degree|bachelor|master|phd|b\.s\.|m\.s\.|engineering|computer science)/i.test(r),
    salary:             r => /(\$[\d,]+|salary|compensation|pay range|\bk\b)/i.test(r),
  }
  const match = matchers[dimension]
  return match ? (requirements.find(match) || null) : null
}

function detectSkillsFromText(text) {
  if (!text) return []
  const lower = stripHtml(text).toLowerCase()
  return Object.entries(SKILL_KEYWORDS_JS)
    .filter(([, patterns]) => patterns.some(p => lower.includes(p)))
    .map(([skill]) => skill)
}

function buildWhyWorthIt(job) {
  const scores = job.dimension_scores || {}
  const numeric = Object.entries(scores)
    .filter(([, v]) => typeof v === 'number')
    .sort(([, a], [, b]) => b - a)
  // Always take top 3 dims as strengths — these are matched roles, show what's working
  const topDims = numeric.slice(0, 3)
  return { reasoning: job.reasoning, topDims }
}

function buildGaps(job) {
  const scores = job.dimension_scores || {}
  const all = Object.entries(scores)
    .filter(([, v]) => typeof v === 'number')
    .sort(([, a], [, b]) => a - b)
  // Only flag genuine gaps (< 0.75), max 2 — fit section must always be longer
  return all
    .filter(([, v]) => v < 0.75)
    .slice(0, 2)
    .map(([key, val]) => ({
      key,
      label: DIM_LABELS[key] || key.replace(/_/g, ' '),
      val,
      severe: val < 0.60,
    }))
}

function buildSummary(pct, gaps) {
  if (pct >= 85 && gaps.length === 0) return "This looks like a genuinely strong fit."
  if (pct >= 85 && gaps.length > 0)  return "This looks like a strong fit overall, with a couple of areas worth tightening up."
  if (pct >= 70 && gaps.length <= 1) return "This is a solid match — there's one area you'd want to address."
  if (pct >= 70)                      return "A reasonable fit, but there are a few areas you'd need to work on."
  if (pct >= 55)                      return "There are some gaps here, but it could still be worth a look."
  return "This is a stretch role — but sometimes those are the most interesting ones."
}

function scoreLabel(pct) {
  if (pct >= 85) return 'Strong fit'
  if (pct >= 70) return 'Good fit'
  if (pct >= 55) return 'Moderate fit'
  return 'Partial fit'
}

export default function DetailsDrawer({ job, userId, profile, currentRating, onClose, onFeedback }) {
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
  const { requirements } = parseJobSections(job.description)
  const suggestedCourses = detectedSkills.map(s => SKILL_COURSES[s]).filter(Boolean).slice(0, 2)
  const fitBullets = buildFitBullets(job, topDims, detectedSkills, requirements, profile)
  const gapBullets = buildGapBullets(job, gaps, detectedSkills, requirements, profile)

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
              <p className="text-sm text-slate-600">{job.company}</p>
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
              {scoreLabel(pct)}
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

          {/* 1. Why this could be a good fit */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2.5">Why this could be a good fit</p>
            {reasoning && (
              <p className="text-sm text-slate-700 leading-relaxed mb-3">{reasoning}</p>
            )}
            {fitBullets.length > 0 && (
              <div className="space-y-2">
                {fitBullets.map((text, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <svg className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-700">{text}</span>
                  </div>
                ))}
              </div>
            )}
            {!reasoning && fitBullets.length === 0 && (
              <p className="text-sm text-slate-400">Analysis in progress.</p>
            )}
          </div>

          {/* 2. Where you might need to stretch */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2.5">Where you might need to stretch</p>
            {gapBullets.length === 0 ? (
              Object.keys(job.dimension_scores || {}).length === 0
                ? <p className="text-sm text-slate-400">Detailed breakdown not available for this role yet.</p>
                : <div className="flex items-start gap-2">
                    <svg className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-slate-700">Nothing stands out as a major gap. You look well-positioned for this one.</p>
                  </div>
            ) : (
              <div className="space-y-2">
                {gapBullets.map((text, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-2" />
                    <span className="text-sm text-slate-700 leading-relaxed">{text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. How to get closer to roles like this */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2.5">How to get closer to roles like this</p>
            <div className="space-y-2">
              {suggestedCourses.map((course, i) => (
                <div key={i} className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                  <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-blue-700 truncate">{course.name}</p>
                    <p className="text-xs text-blue-600 mt-0.5 leading-snug">{COURSE_OUTCOMES[course.skill] || ''}</p>
                  </div>
                </div>
              ))}
              {suggestedCourses.length === 0 && (
                <p className="text-sm text-slate-600">No specific courses detected for this role.</p>
              )}
              <p className="text-xs text-slate-400 pt-0.5">
                <a href="/feedback" className="text-violet-600 hover:underline font-medium">See all learning recommendations →</a>
              </p>
            </div>
          </div>

          {/* 5. People in your network */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2.5">People in your network</p>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
              <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm text-slate-600 mb-2">Connect your LinkedIn in Profile to see who you know at {job.company}.</p>
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
