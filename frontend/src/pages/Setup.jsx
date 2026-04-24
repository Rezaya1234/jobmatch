import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createUser, upsertProfile, getProfile, parseProfile } from '../api'

// ── Constants ────────────────────────────────────────────────────────────────

const WORK_MODES = [
  { value: 'remote',   label: 'Remote' },
  { value: 'hybrid',   label: 'Hybrid' },
  { value: 'onsite',   label: 'Onsite' },
]
const JOB_TYPES = [
  { value: 'full_time',   label: 'Full time' },
  { value: 'part_time',   label: 'Part time' },
  { value: 'contract',    label: 'Contract' },
  { value: 'internship',  label: 'Internship' },
]
const SENIORITY_LEVELS = [
  { value: 'junior',    label: 'Junior' },
  { value: 'mid',       label: 'Mid' },
  { value: 'senior',    label: 'Senior' },
  { value: 'lead',      label: 'Lead' },
  { value: 'principal', label: 'Principal' },
  { value: 'staff',     label: 'Staff' },
]
const VISA_OPTIONS = [
  'Authorized to work in the US',
  'Requires H1B sponsorship',
  'Requires OPT / CPT',
  'Authorized to work in EU',
  'Open to any',
]
const STEPS = [
  { n: 1, label: 'Basics',         sub: 'Account & resume' },
  { n: 2, label: 'What you want',  sub: 'Your goals' },
  { n: 3, label: 'Preferences',    sub: 'Filters & constraints' },
  { n: 4, label: 'Review',         sub: 'AI profile' },
]
const EXAMPLE_CHIPS = [
  {
    icon: '🔮', label: 'AI/ML engineer roles',
    text: "I'm a senior ML engineer with 7 years of experience looking for a remote AI role at a growth-stage startup in the US. I specialize in LLMs, MLOps, and distributed systems.",
  },
  {
    icon: '🎯', label: 'Remote startup roles',
    text: "I'm a full-stack engineer with 5 years of experience seeking remote-first opportunities at product-led startups. I love building from 0 to 1 and wear many hats.",
  },
  {
    icon: '⚡', label: 'Enterprise leadership',
    text: "I'm a VP of Engineering with 15 years of experience looking for executive or director-level roles at enterprise companies. I've led teams of 50+ engineers across multiple time zones.",
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtSalary(v) {
  if (!v) return ''
  return Number(String(v).replace(/\D/g, '')).toLocaleString()
}

function parseSalary(v) {
  const n = parseInt(String(v).replace(/\D/g, ''), 10)
  return isNaN(n) ? '' : n
}

function parseProfileBlocks(text) {
  if (!text) return []
  const headings = [
    { re: /you[''']?re?\s+targeting[:.\s]/i, title: "You're targeting", icon: '🎯', negative: false },
    { re: /you\s+bring[:.\s]/i,              title: 'You bring',         icon: '💼', negative: false },
    { re: /you\s+prefer[:.\s]/i,             title: 'You prefer',        icon: '❤️', negative: false },
    { re: /not\s+interested\s+in[:.\s]/i,    title: 'Not interested in', icon: '🚫', negative: true  },
  ]
  const found = headings
    .map(h => ({ ...h, m: text.match(h.re) }))
    .filter(h => h.m)
    .sort((a, b) => a.m.index - b.m.index)

  if (found.length >= 2) {
    return found.map((h, i) => {
      const start = h.m.index + h.m[0].length
      const end = found[i + 1]?.m.index ?? text.length
      const items = text.slice(start, end)
        .split(/\n|[•·-]|\.\s+/)
        .map(s => s.trim().replace(/^[,;:\s]+/, ''))
        .filter(s => s.length > 8 && !headings.some(hh => hh.re.test(s)))
        .slice(0, 5)
      return { title: h.title, icon: h.icon, negative: h.negative, items }
    })
  }

  // Fallback: sentences as a single block
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 200)
    .slice(0, 8)
  return [{ title: 'Your profile', icon: '⭐', negative: false, items: sentences }]
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Pill({ label, selected, onClick, variant = 'outline' }) {
  if (variant === 'fill') {
    return (
      <button type="button" onClick={onClick}
        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
          selected
            ? 'bg-violet-600 text-white border-violet-600'
            : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300 hover:text-slate-700'
        }`}
      >{label}</button>
    )
  }
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
        selected
          ? 'border-violet-500 text-violet-700 bg-violet-50'
          : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300 hover:text-slate-700'
      }`}
    >
      {selected && (
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
      {label}
    </button>
  )
}

function TagInput({ tags, onChange, placeholder = 'Add…' }) {
  const [input, setInput] = useState('')
  function add(val) {
    const v = val.trim().replace(/,$/, '')
    if (v && !tags.includes(v)) onChange([...tags, v])
    setInput('')
  }
  function onKey(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input) }
    else if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1))
  }
  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-slate-200 rounded-lg min-h-[42px] focus-within:ring-2 focus-within:ring-violet-400 focus-within:border-transparent bg-white cursor-text">
      {tags.map(t => (
        <span key={t} className="flex items-center gap-1 bg-slate-100 text-slate-700 text-sm px-2 py-0.5 rounded-md">
          {t}
          <button type="button" onClick={() => onChange(tags.filter(x => x !== t))}
            className="text-slate-400 hover:text-slate-600 leading-none">
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </span>
      ))}
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
        onBlur={() => { if (input.trim()) add(input) }}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] text-sm outline-none bg-transparent placeholder:text-slate-300" />
    </div>
  )
}

function StepNav({ current }) {
  return (
    <nav className="flex flex-col pt-1">
      {STEPS.map((s, i) => {
        const active = s.n === current
        const done   = s.n < current
        return (
          <div key={s.n} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                active ? 'bg-violet-600 border-violet-600 text-white'
                : done  ? 'bg-violet-100 border-violet-400 text-violet-600'
                : 'bg-white border-slate-200 text-slate-400'
              }`}>
                {done ? (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : s.n}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-px flex-1 my-1 min-h-[32px] ${active || done ? 'bg-violet-200' : 'bg-slate-100'}`} />
              )}
            </div>
            <div className="pb-8">
              <p className={`text-sm font-semibold leading-snug ${active ? 'text-violet-700' : done ? 'text-slate-600' : 'text-slate-400'}`}>
                {s.label}
              </p>
              <p className={`text-xs mt-0.5 ${active ? 'text-violet-500' : 'text-slate-400'}`}>{s.sub}</p>
            </div>
          </div>
        )
      })}
    </nav>
  )
}

function RightPanel({ aiProfile, generating, onLooksGood }) {
  if (generating) {
    return (
      <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-4 h-4 text-violet-600 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <span className="text-sm font-semibold text-violet-700">Generating your profile…</span>
        </div>
        <div className="space-y-3 animate-pulse">
          {[100, 83, 67, 90, 75].map((w, i) => (
            <div key={i} className="h-2.5 bg-slate-200 rounded" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (!aiProfile) {
    return (
      <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-violet-400" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
          <span className="text-sm font-semibold text-slate-700">AI-Generated Profile</span>
          <span className="ml-auto text-[11px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-medium">Preview</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Upload your resume and describe what you're looking for to generate your profile.
        </p>
      </div>
    )
  }

  const blocks = parseProfileBlocks(aiProfile)

  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1.5">
          <svg className="w-4 h-4 text-violet-600" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
          <span className="text-sm font-semibold text-slate-800">AI-Generated Profile</span>
          <span className="ml-auto text-[11px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-medium">Preview</span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Here's what we've understood about you based on your resume and preferences.
        </p>
      </div>

      {/* Blocks */}
      <div className="px-5 py-4 space-y-3">
        {blocks.map((block, i) => (
          <div key={i} className="bg-white rounded-xl p-3.5 border border-slate-100">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-base leading-none">{block.icon}</span>
              <p className="text-xs font-semibold text-slate-700">{block.title}</p>
            </div>
            <div className="space-y-1.5">
              {block.items.map((item, j) => (
                <div key={j} className="flex items-start gap-2">
                  {block.negative ? (
                    <svg className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                    </svg>
                  )}
                  <span className="text-xs text-slate-600 leading-snug">{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Does this look right */}
      <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
        <div>
          <p className="text-sm font-semibold text-slate-700">Does this look right?</p>
          <p className="text-xs text-slate-400 mt-0.5">You can edit anything before we start matching.</p>
        </div>
        <div className="flex gap-2">
          <button type="button"
            className="flex-1 py-2 text-sm font-medium border border-violet-300 text-violet-700 rounded-lg hover:bg-violet-50 transition-colors">
            Edit profile
          </button>
          <button type="button" onClick={onLooksGood}
            className="flex-1 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
            Looks good →
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pb-4 flex items-start gap-2">
        <svg className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
        </svg>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          We use your information only to find relevant job matches. You're in control and can update this anytime.
        </p>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Setup() {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const statusTimer = useRef(null)

  const [email, setEmail]       = useState('')
  const [userId, setUserId]     = useState(() => localStorage.getItem('userId') || '')
  const [status, setStatus]     = useState(null)
  const [generating, setGenerating] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [titleExpanded, setTitleExpanded] = useState(true)
  const [currentStep, setCurrentStep]     = useState(1)

  const [aiText, setAiText]         = useState('')
  const [resumeFile, setResumeFile] = useState(null)
  const [aiProfile, setAiProfile]   = useState('')

  const [profile, setProfile] = useState({
    work_modes:       ['remote'],
    job_types:        ['full_time'],
    seniority_levels: ['senior'],
    locations:        ['United States'],
    sectors:          [],
    companies:        [],
    min_salary:       '',
    max_salary:       '',
    title_include:    [],
    title_exclude:    [],
    visa:             'Authorized to work in the US',
  })

  function showStatus(msg, error = false) {
    setStatus({ msg, error })
    clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(null), 4000)
  }

  function set(key, val) {
    setProfile(p => ({ ...p, [key]: val }))
  }

  function toggleArr(key, val) {
    setProfile(p => ({
      ...p,
      [key]: p[key].includes(val) ? p[key].filter(v => v !== val) : [...p[key], val],
    }))
  }

  useEffect(() => {
    if (!userId) return
    getProfile(userId).then(p => {
      setProfile({
        work_modes:       p.work_modes        || ['remote'],
        job_types:        p.job_types         || ['full_time'],
        seniority_levels: p.seniority_level   ? [p.seniority_level] : ['senior'],
        locations:        p.locations         || ['United States'],
        sectors:          p.preferred_sectors || [],
        companies:        p.preferred_companies || [],
        min_salary:       p.salary_min        || '',
        max_salary:       p.salary_max        || '',
        title_include:    p.title_include      || [],
        title_exclude:    p.title_exclude      || [],
        visa:             'Authorized to work in the US',
      })
      if (p.role_description) {
        setAiProfile(p.role_description)
        setAiText(p.role_description)
      }
    }).catch(() => {})
  }, [userId])

  async function handleCreateUser(e) {
    e.preventDefault()
    try {
      const user = await createUser(email)
      localStorage.setItem('userId', user.id)
      localStorage.setItem('userEmail', email)
      setUserId(user.id)
      showStatus('Account created!')
    } catch (err) {
      showStatus(err.response?.data?.detail || 'Error creating account', true)
    }
  }

  async function handleGenerate() {
    if (!aiText.trim() && !resumeFile) {
      showStatus("Please describe what you're looking for or upload your resume.", true)
      return
    }
    setGenerating(true)
    try {
      const extracted = await parseProfile(userId, aiText, resumeFile)
      const saved = await upsertProfile(userId, {
        work_modes:           profile.work_modes,
        job_types:            profile.job_types,
        locations:            profile.locations,
        seniority_level:      profile.seniority_levels[0] || null,
        preferred_sectors:    profile.sectors,
        preferred_companies:  profile.companies,
        salary_min:           parseSalary(profile.min_salary) || null,
        salary_max:           parseSalary(profile.max_salary) || null,
        role_description:     extracted.role_description || null,
        original_role_description: extracted.original_role_description || extracted.role_description || null,
        title_include:        profile.title_include,
        title_exclude:        profile.title_exclude,
      })
      setProfile(p => ({
        ...p,
        work_modes:       saved.work_modes         || p.work_modes,
        job_types:        saved.job_types          || p.job_types,
        seniority_levels: saved.seniority_level    ? [saved.seniority_level] : p.seniority_levels,
        locations:        saved.locations          || p.locations,
        sectors:          saved.preferred_sectors  || p.sectors,
        companies:        saved.preferred_companies || p.companies,
        min_salary:       saved.salary_min         || p.min_salary,
        max_salary:       saved.salary_max         || p.max_salary,
        title_include:    saved.title_include       || p.title_include,
        title_exclude:    saved.title_exclude       || p.title_exclude,
      }))
      if (extracted.role_description) setAiProfile(extracted.role_description)
      showStatus('Profile generated!')
    } catch (err) {
      showStatus(err.response?.data?.detail || err.message || 'Error generating profile', true)
    } finally {
      setGenerating(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file?.type === 'application/pdf') setResumeFile(file)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Account Setup</h1>
          <p className="text-sm text-slate-500 mt-1">Help us understand you better so we can find the right opportunities.</p>
        </div>
        <button className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors mt-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Need help?
        </button>
      </div>

      {/* 3-column layout */}
      <div className="flex gap-6 items-start">

        {/* ── LEFT: step nav ───────────────────────────────────────────────── */}
        <div className="shrink-0 hidden lg:block" style={{ width: '160px' }}>
          <StepNav current={currentStep} />
        </div>

        {/* ── CENTER: form ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Account (if not logged in) */}
          {!userId && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="text-base font-bold text-slate-900 mb-1">Your account</h2>
              <p className="text-sm text-slate-500 mb-4">Enter your email to get started.</p>
              <form onSubmit={handleCreateUser} className="flex gap-3">
                <input type="email" required placeholder="you@email.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
                <button type="submit"
                  className="bg-violet-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors">
                  Continue
                </button>
              </form>
            </div>
          )}

          {/* Logged-in badge */}
          {userId && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
              <svg className="w-4 h-4 text-green-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
              </svg>
              <span className="text-sm font-medium text-green-700">Logged in</span>
              <code className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded font-mono">{userId.slice(0, 8)}…</code>
              <button type="button" onClick={() => { localStorage.removeItem('userId'); localStorage.removeItem('userEmail'); setUserId('') }}
                className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors">
                Switch account
              </button>
            </div>
          )}

          {/* ── SECTION 1: Basics ─────────────────────────────────────────── */}
          {userId && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">1. Basics</h2>
                <p className="text-sm text-slate-500 mt-0.5">Upload your resume and tell us a bit about what you're looking for.</p>
              </div>

              {/* Resume dropzone */}
              <div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    dragOver ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50'
                  }`}
                >
                  <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                    onChange={e => setResumeFile(e.target.files?.[0] || null)} />
                  {resumeFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm font-medium text-slate-700">{resumeFile.name}</p>
                      <button type="button" onClick={e => { e.stopPropagation(); setResumeFile(null); fileRef.current.value = '' }}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-9 h-9 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm text-slate-500">
                        <span className="text-violet-600 font-medium">Upload your resume</span>
                      </p>
                      <p className="text-xs text-slate-400">Drag & drop or browse files · PDF only</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Your resume helps Claude build an accurate profile for better matches.
                </p>
              </div>

              {/* Description textarea */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Describe what you're looking for <span className="text-rose-500">*</span>
                </label>
                <p className="text-xs text-slate-400 mb-2">
                  In your own words — roles, problems you want to solve, companies you like, work style, etc.
                </p>
                <div className="relative">
                  <textarea rows={5} value={aiText} onChange={e => setAiText(e.target.value.slice(0, 1000))}
                    placeholder="Example: I'm a senior ML engineer with 7 years of experience looking for a remote AI role at a growth-stage startup in the US."
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
                  <span className="absolute bottom-3 right-3 text-[11px] text-slate-300">
                    {aiText.length}/1000
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2 mb-2">Or choose an example to get started</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_CHIPS.map(c => (
                    <button key={c.label} type="button" onClick={() => setAiText(c.text)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-full text-xs text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors">
                      <span>{c.icon}</span>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION 2: Preferences ────────────────────────────────────── */}
          {userId && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">2. Preferences</h2>
                <p className="text-sm text-slate-500 mt-0.5">Tell us your must-haves. These will be used as hard filters.</p>
              </div>

              {/* Work setup + Job type */}
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Work setup</label>
                  <div className="flex flex-wrap gap-2">
                    {WORK_MODES.map(m => (
                      <Pill key={m.value} label={m.label} variant="outline"
                        selected={profile.work_modes.includes(m.value)}
                        onClick={() => toggleArr('work_modes', m.value)} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Job type</label>
                  <div className="flex flex-wrap gap-2">
                    {JOB_TYPES.map(t => (
                      <Pill key={t.value} label={t.label} variant="fill"
                        selected={profile.job_types.includes(t.value)}
                        onClick={() => toggleArr('job_types', t.value)} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Seniority */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Seniority level</label>
                <div className="flex flex-wrap gap-2">
                  {SENIORITY_LEVELS.map(s => (
                    <Pill key={s.value} label={s.label} variant="outline"
                      selected={profile.seniority_levels.includes(s.value)}
                      onClick={() => toggleArr('seniority_levels', s.value)} />
                  ))}
                </div>
              </div>

              {/* Locations + Visa */}
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Locations</label>
                  <TagInput tags={profile.locations} onChange={v => set('locations', v)} placeholder="Add locations" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Visa / Work authorization</label>
                  <select value={profile.visa} onChange={e => set('visa', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent bg-white appearance-none bg-[url('data:image/svg+xml;utf8,<svg fill=\"none\" stroke=\"%23999\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M19 9l-7 7-7-7\"/></svg>')] bg-no-repeat bg-[right_12px_center] bg-[length:16px]">
                    {VISA_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              {/* Sectors + Companies */}
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Industries / Sectors</label>
                  <TagInput tags={profile.sectors} onChange={v => set('sectors', v)} placeholder="Add sectors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Target companies <span className="text-slate-400 font-normal text-xs">(optional)</span>
                  </label>
                  <TagInput tags={profile.companies} onChange={v => set('companies', v)} placeholder="Add companies" />
                </div>
              </div>

              {/* Title filters (collapsible) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button type="button" onClick={() => setTitleExpanded(e => !e)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                  <span>Refine job titles <span className="text-slate-400 font-normal">(optional)</span></span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${titleExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {titleExpanded && (
                  <div className="px-4 pb-4 pt-1 grid grid-cols-2 gap-4 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Must include</label>
                      <TagInput tags={profile.title_include} onChange={v => set('title_include', v)} placeholder="engineer, scientist…" />
                      <p className="text-[11px] text-slate-400 mt-1">Keywords that must appear in job titles</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Must exclude</label>
                      <TagInput tags={profile.title_exclude} onChange={v => set('title_exclude', v)} placeholder="intern, director…" />
                      <p className="text-[11px] text-slate-400 mt-1">Keywords to exclude from job titles</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Salary */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Salary range (USD)</label>
                <div className="flex items-center gap-3">
                  <input type="text" placeholder="Min salary" value={fmtSalary(profile.min_salary)}
                    onChange={e => set('min_salary', parseSalary(e.target.value))}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
                  <span className="text-slate-400 shrink-0">—</span>
                  <input type="text" placeholder="Max salary" value={fmtSalary(profile.max_salary)}
                    onChange={e => set('max_salary', parseSalary(e.target.value))}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
                  <span className="text-xs text-slate-400 shrink-0">Optional</span>
                </div>
              </div>

              {/* Generate button */}
              <button type="button" onClick={handleGenerate} disabled={generating}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {generating ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Generating your profile…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                    Generate my profile
                  </>
                )}
              </button>
              <div className="flex items-center justify-center gap-1.5 -mt-2">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-xs text-slate-400">Your data is private and secure</span>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: AI profile panel ──────────────────────────────────────── */}
        <div className="shrink-0 hidden xl:block sticky top-6" style={{ width: '264px' }}>
          <RightPanel
            aiProfile={aiProfile}
            generating={generating}
            onLooksGood={() => navigate('/dashboard')}
          />
        </div>

      </div>

      {/* Toast */}
      {status && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          status.error ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
        }`}>
          {status.msg}
        </div>
      )}
    </div>
  )
}
