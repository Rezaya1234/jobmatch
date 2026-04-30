import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createUser, upsertProfile, getProfile, parseProfile, triggerOnDemandMatch } from '../api'

// ── Constants ────────────────────────────────────────────────────────────────

const WORK_MODES = [
  { value: 'remote',  label: 'Remote' },
  { value: 'hybrid',  label: 'Hybrid' },
  { value: 'onsite',  label: 'Onsite' },
]
const JOB_TYPES = [
  { value: 'full_time',  label: 'Full time' },
  { value: 'part_time',  label: 'Part time' },
  { value: 'contract',   label: 'Contract' },
  { value: 'internship', label: 'Internship' },
]

// Values match filter_agent._PROFILE_SENIORITY_RANK keys
const SENIORITY_LEVELS = [
  { value: 'junior',    label: 'Entry Level' },
  { value: 'mid',       label: 'Mid Level' },
  { value: 'senior',    label: 'Senior' },
  { value: 'manager',   label: 'Manager' },
  { value: 'director',  label: 'Director' },
  { value: 'executive', label: 'Executive' },
]

const VISA_OPTIONS = [
  { value: 'no_sponsorship', label: 'Authorized to work',  sub: 'US Citizen, Green Card, or EAD' },
  { value: 'h1b',            label: 'H-1B Visa',           sub: 'Transfer or new cap sponsorship' },
  { value: 'opt_cpt',        label: 'OPT / CPT',           sub: 'F-1 student or recent grad' },
  { value: 'tn_e3',          label: 'TN / E-3',            sub: 'Canadian or Australian citizen' },
]

const STEPS = [
  { n: 1, label: 'Account',       sub: 'Sign in or create' },
  { n: 2, label: 'What you want', sub: 'Role & resume' },
  { n: 3, label: 'Preferences',   sub: 'Filters & constraints' },
  { n: 4, label: 'Review',        sub: 'AI profile' },
]

const EXAMPLE_CHIPS = [
  {
    icon: '🔮', label: 'AI/ML engineer',
    text: "I'm a senior ML engineer with 7 years of experience looking for a remote AI role at a growth-stage startup in the US. I specialize in LLMs, MLOps, and distributed systems.",
  },
  {
    icon: '🎯', label: 'Remote startup',
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

  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 200)
    .slice(0, 8)
  return [{ title: 'Your profile', icon: '⭐', negative: false, items: sentences }]
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Pill({ label, selected, onClick }) {
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

function PillWithSub({ label, sub, selected, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all text-left ${
        selected
          ? 'border-violet-500 text-violet-700 bg-violet-50'
          : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300 hover:text-slate-700'
      }`}
    >
      <span className={`mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
        selected ? 'border-violet-500 bg-violet-500' : 'border-slate-300'
      }`}>
        {selected && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </span>
      <span>
        <span className="block leading-snug">{label}</span>
        {sub && <span className="block text-xs font-normal text-slate-400 mt-0.5">{sub}</span>}
      </span>
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

function StepNav({ current, step2done = false, step3done = false, step4done = false, onStepClick }) {
  return (
    <nav className="flex flex-col pt-1">
      {STEPS.map((s, i) => {
        const active = s.n === current
        const done = (s.n < current)
          || (s.n === 2 && step2done)
          || (s.n === 3 && step3done)
          || (s.n === 4 && step4done)
        const clickable = done && !active && onStepClick
        return (
          <div
            key={s.n}
            className={`flex gap-3 ${clickable ? 'cursor-pointer' : ''}`}
            onClick={() => clickable && onStepClick(s.n)}
          >
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-all"
                style={
                  done   ? { background: '#5B4FE8', borderColor: '#5B4FE8', color: '#fff' }
                  : active ? { background: '#fff', borderColor: '#5B4FE8', color: '#5B4FE8' }
                  : { background: '#fff', borderColor: '#e2e8f0', color: '#94a3b8' }
                }
              >
                {done ? (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : s.n}
              </div>
              {i < STEPS.length - 1 && (
                <div className="w-px flex-1 my-1 min-h-[32px]" style={{ background: done ? '#c4b5fd' : '#f1f5f9' }} />
              )}
            </div>
            <div className="pb-8">
              <p className={`text-sm font-semibold leading-snug ${done ? 'text-slate-700' : active ? 'text-slate-700' : 'text-slate-400'}`}>
                {s.label}
              </p>
              <p className={`text-xs mt-0.5 ${active ? 'text-slate-500' : 'text-slate-400'}`}>{s.sub}</p>
            </div>
          </div>
        )
      })}
    </nav>
  )
}

function ProfileBlocks({ aiProfile }) {
  const blocks = parseProfileBlocks(aiProfile)
  return (
    <div className="space-y-3">
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
  )
}

function AIProfilePreview({ aiProfile, generating }) {
  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1.5">
          <svg className="w-4 h-4 text-violet-600" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
          <span className="text-sm font-semibold text-slate-800">AI-Generated Profile</span>
          <span className="ml-auto text-[11px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-medium">
            {aiProfile ? 'Ready' : 'Preview'}
          </span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          {aiProfile
            ? "Here's what we've understood about you."
            : 'Complete your preferences to generate your profile.'}
        </p>
      </div>
      <div className="px-5 py-4">
        {generating ? (
          <div className="space-y-3 animate-pulse">
            {[100, 83, 67, 90, 75].map((w, i) => (
              <div key={i} className="h-2.5 bg-slate-200 rounded" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : aiProfile ? (
          <ProfileBlocks aiProfile={aiProfile} />
        ) : (
          <p className="text-xs text-slate-400 text-center py-6">
            Your profile will appear here after generation.
          </p>
        )}
      </div>
      {aiProfile && (
        <div className="px-5 pb-4 pt-1 flex items-start gap-2 border-t border-slate-100">
          <svg className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Your information is used only to find relevant matches. You control everything.
          </p>
        </div>
      )}
    </div>
  )
}

// Shared back/next footer
function StepFooter({ onBack, onNext, nextLabel = 'Next →', nextDisabled = false, nextLoading = false }) {
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? (
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      ) : <div />}
      {onNext && (
        <button type="button" onClick={onNext} disabled={nextDisabled || nextLoading}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {nextLoading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Generating…
            </>
          ) : nextLabel}
        </button>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Setup() {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const statusTimer = useRef(null)

  const saveDebounce = useRef(null)

  const [email, setEmail]           = useState('')
  const [userId, setUserId]         = useState(() => localStorage.getItem('userId') || '')
  const [status, setStatus]         = useState(null)
  const [generating, setGenerating] = useState(false)
  const [profileGenerated, setProfileGenerated] = useState(false)
  const [dragOver, setDragOver]     = useState(false)
  const [titleExpanded, setTitleExpanded] = useState(false)
  const [autoSaved, setAutoSaved]   = useState(false)

  // Start at step 2 if already logged in (skip account creation)
  const [currentStep, setCurrentStep] = useState(() =>
    localStorage.getItem('userId') ? 2 : 1
  )

  const [aiText, setAiText]         = useState('')
  const [resumeFile, setResumeFile] = useState(null)
  const [aiProfile, setAiProfile]   = useState('')

  const [profile, setProfile] = useState({
    work_modes:          ['remote', 'hybrid', 'onsite'],
    job_types:           ['full_time'],
    seniority_levels:    [],
    locations:           ['United States'],
    visa_types:          ['no_sponsorship'],
    sectors:             [],
    companies:           [],
    min_salary:          '',
    max_salary:          '',
    title_include:       [],
    title_exclude:       [],
    open_to_relocation:  true,
  })

  function showStatus(msg, error = false) {
    setStatus({ msg, error })
    clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(null), 4000)
  }

  function set(key, val) { setProfile(p => ({ ...p, [key]: val })) }
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
        work_modes:         p.work_modes          || ['remote', 'hybrid', 'onsite'],
        job_types:          p.job_types           || ['full_time'],
        seniority_levels:   p.seniority_level     ? [p.seniority_level] : [],
        locations:          p.locations           || ['United States'],
        sectors:            p.preferred_sectors   || [],
        companies:          p.preferred_companies || [],
        min_salary:         p.salary_min          || '',
        max_salary:         p.salary_max          || '',
        title_include:      p.title_include        || [],
        title_exclude:      p.title_exclude        || [],
        visa_types:         p.visa_types           || ['no_sponsorship'],
        open_to_relocation: p.open_to_relocation !== undefined ? p.open_to_relocation : true,
      })
      if (p.role_description) {
        setAiProfile(p.role_description)
        setProfileGenerated(true)
      }
      // Sync localStorage so route guard is accurate
      if (p.profile_complete) {
        localStorage.setItem('profileComplete', 'true')
      }
    }).catch(() => {})
  }, [userId])

  async function handleCreateUser(e) {
    e.preventDefault()
    try {
      const user = await createUser(email)
      if (!user.is_new) {
        showStatus('That email already has an account — please sign in instead.', true)
        return
      }
      localStorage.setItem('userId', user.id)
      localStorage.setItem('userEmail', email)
      setUserId(user.id)
      showStatus('Account created!')
      setCurrentStep(2)
    } catch (err) {
      showStatus(err.response?.data?.detail || 'Error creating account', true)
    }
  }

  // Returns true on success so the caller can advance the step
  async function handleGenerate() {
    if (!aiText.trim() && !resumeFile) {
      showStatus("Please describe what you're looking for or upload your resume.", true)
      return false
    }
    setGenerating(true)
    try {
      const extracted = await parseProfile(userId, aiText, resumeFile)
      const needsSponsorship = profile.visa_types.length > 0 &&
        !profile.visa_types.includes('no_sponsorship')

      const saved = await upsertProfile(userId, {
        work_modes:                  profile.work_modes,
        job_types:                   profile.job_types,
        locations:                   profile.locations,
        seniority_level:             profile.seniority_levels[0] || null,
        preferred_sectors:           profile.sectors,
        preferred_companies:         profile.companies,
        salary_min:                  parseSalary(profile.min_salary) || null,
        salary_max:                  parseSalary(profile.max_salary) || null,
        goals_text:                  aiText || null,
        role_description:            extracted.role_description || null,
        original_role_description:   extracted.original_role_description || extracted.role_description || null,
        title_include:               profile.title_include,
        title_exclude:               profile.title_exclude,
        visa_types:                  profile.visa_types,
        visa_sponsorship_required:   needsSponsorship,
        open_to_relocation:          profile.open_to_relocation,
      })
      setProfile(p => ({
        ...p,
        work_modes:       saved.work_modes          || p.work_modes,
        job_types:        saved.job_types           || p.job_types,
        seniority_levels: saved.seniority_level     ? [saved.seniority_level] : p.seniority_levels,
        locations:        saved.locations           || p.locations,
        sectors:          saved.preferred_sectors   || p.sectors,
        companies:        saved.preferred_companies || p.companies,
        min_salary:       saved.salary_min          || p.min_salary,
        max_salary:       saved.salary_max          || p.max_salary,
        title_include:    saved.title_include        || p.title_include,
        title_exclude:    saved.title_exclude        || p.title_exclude,
        visa_types:       saved.visa_types           || p.visa_types,
      }))
      if (extracted.role_description) setAiProfile(extracted.role_description)
      setProfileGenerated(true)
      showStatus('Profile generated!')
      return true
    } catch (err) {
      showStatus(err.response?.data?.detail || err.message || 'Error generating profile', true)
      return false
    } finally {
      setGenerating(false)
    }
  }

  async function handleGenerateAndNext() {
    const ok = await handleGenerate()
    if (ok) setCurrentStep(4)
  }

  async function handleLooksGood() {
    // Derive visa_sponsorship_required: true if user needs employer sponsorship
    const needsSponsorship = profile.visa_types.length > 0 &&
      !profile.visa_types.includes('no_sponsorship')

    try {
      await upsertProfile(userId, {
        work_modes:                  profile.work_modes,
        job_types:                   profile.job_types,
        locations:                   profile.locations,
        seniority_level:             profile.seniority_levels[0] || null,
        preferred_sectors:           profile.sectors,
        preferred_companies:         profile.companies,
        salary_min:                  parseSalary(profile.min_salary) || null,
        salary_max:                  parseSalary(profile.max_salary) || null,
        goals_text:                  aiText || null,
        role_description:            aiProfile || aiText || null,
        title_include:               profile.title_include,
        title_exclude:               profile.title_exclude,
        visa_types:                  profile.visa_types,
        visa_sponsorship_required:   needsSponsorship,
        open_to_relocation:          profile.open_to_relocation,
        profile_complete:            true,
      })
      localStorage.setItem('profileComplete', 'true')
      // Fire on-demand matching in the background so new users get matches quickly
      triggerOnDemandMatch(userId).catch(() => {})
      navigate('/dashboard')
    } catch (err) {
      showStatus('Error saving profile — please try again', true)
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
          <p className="text-sm text-slate-500 mt-1">
            Help us understand you so we can find the right opportunities.
          </p>
        </div>
        {/* Mobile step indicator */}
        <div className="lg:hidden flex items-center gap-1.5">
          {STEPS.map(s => (
            <div
              key={s.n}
              className="w-2 h-2 rounded-full transition-all"
              style={{
                width: s.n === currentStep ? '16px' : '8px',
                background: s.n < currentStep ? '#5B4FE8' : s.n === currentStep ? 'transparent' : '#e2e8f0',
                border: s.n === currentStep ? '2px solid #5B4FE8' : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex gap-6 items-start">

        {/* LEFT: step nav (desktop) */}
        <div className="shrink-0 hidden lg:block" style={{ width: '160px' }}>
          <StepNav
            current={currentStep}
            step2done={!!aiText.trim() || !!resumeFile}
            step3done={profileGenerated}
            step4done={false}
            onStepClick={n => n < currentStep && setCurrentStep(n)}
          />
        </div>

        {/* CENTER: step content */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Progress bar */}
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-1 rounded-full transition-all duration-300" style={{ background: '#5B4FE8' }}
              style={{ width: `${currentStep * 25}%` }}
            />
          </div>

          {/* ── STEP 1: Account ──────────────────────────────────────────── */}
          {currentStep === 1 && (
            <>
              {!userId ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h2 className="text-base font-bold text-slate-900 mb-1">Create your account</h2>
                  <p className="text-sm text-slate-500 mb-4">Enter your email to get started — no password needed.</p>
                  <form onSubmit={handleCreateUser} className="flex gap-3">
                    <input type="email" required placeholder="you@email.com" value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
                    <button type="submit"
                      className="bg-violet-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors">
                      Continue →
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <svg className="w-4 h-4 text-green-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-sm font-medium text-green-700">Logged in</span>
                    <code className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded font-mono">{userId.slice(0, 8)}…</code>
                    <button type="button"
                      onClick={() => {
                        localStorage.removeItem('userId')
                        localStorage.removeItem('userEmail')
                        localStorage.removeItem('profileComplete')
                        setUserId('')
                      }}
                      className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors">
                      Switch account
                    </button>
                  </div>
                  <StepFooter onNext={() => setCurrentStep(2)} nextLabel="Continue →" />
                </>
              )}
            </>
          )}

          {/* ── STEP 2: What you want ────────────────────────────────────── */}
          {currentStep === 2 && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                <div>
                  <h2 className="text-base font-bold text-slate-900">What are you looking for?</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Upload your resume and describe what you want — roles, companies, work style.</p>
                </div>

                {/* Resume dropzone */}
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
                        className="text-xs text-red-400 hover:text-red-600 transition-colors">Remove</button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-9 h-9 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm text-slate-500">
                        <span className="text-violet-600 font-medium">Upload your resume</span>
                        <span className="text-slate-400"> (optional but recommended)</span>
                      </p>
                      <p className="text-xs text-slate-400">Drag & drop or browse · PDF only</p>
                    </div>
                  )}
                </div>

                {/* Description textarea */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1">
                    Describe what you're looking for <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-xs text-slate-400 mb-2">
                    Roles, problems you want to solve, companies you like, work style. Your own words.
                  </p>
                  <div className="relative">
                    <textarea rows={5} value={aiText}
                      onChange={e => {
                        const val = e.target.value.slice(0, 1000)
                        setAiText(val)
                        setAutoSaved(false)
                        if (userId) {
                          clearTimeout(saveDebounce.current)
                          saveDebounce.current = setTimeout(() => {
                            upsertProfile(userId, {
                              goals_text: val,
                              work_modes: profile.work_modes,
                              job_types: profile.job_types,
                              locations: profile.locations,
                            }).then(() => setAutoSaved(true)).catch(() => {})
                          }, 500)
                        }
                      }}
                      placeholder="I'm a senior ML engineer with 5 years of experience looking for a remote role at a growth-stage startup focused on AI infrastructure..."
                      style={{ color: '#374151' }}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm placeholder:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      {autoSaved && <span className="text-[11px] text-green-500">Saved</span>}
                      <span className="text-[11px] text-slate-300">{aiText.length}/1000</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 mb-2">Or try an example</p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_CHIPS.map(c => (
                      <button key={c.label} type="button" onClick={() => setAiText(c.text)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-full text-xs text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors">
                        <span>{c.icon}</span>{c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {!aiText.trim() && !resumeFile && (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm text-amber-700">Adding a description or resume helps StellaPath find better matches for you.</p>
                </div>
              )}
              <StepFooter
                onBack={() => setCurrentStep(1)}
                onNext={() => setCurrentStep(3)}
                nextLabel="Next →"
              />
            </>
          )}

          {/* ── STEP 3: Preferences ──────────────────────────────────────── */}
          {currentStep === 3 && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Your preferences</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Set your must-haves — these drive your daily matches.</p>
                </div>

                {/* Work setup + Job type */}
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Work setup</label>
                    <div className="flex flex-wrap gap-2">
                      {WORK_MODES.map(m => (
                        <Pill key={m.value} label={m.label}
                          selected={profile.work_modes.includes(m.value)}
                          onClick={() => toggleArr('work_modes', m.value)} />
                      ))}
                    </div>
                    {profile.work_modes.includes('onsite') && (
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => setProfile(p => ({ ...p, open_to_relocation: !p.open_to_relocation }))}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 ${
                            profile.open_to_relocation ? 'bg-violet-600' : 'bg-slate-200'
                          }`}
                          role="switch"
                          aria-checked={profile.open_to_relocation}
                        >
                          <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                            profile.open_to_relocation ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </button>
                        <span className="text-sm text-slate-600">Open to relocation</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Job type</label>
                    <div className="flex flex-wrap gap-2">
                      {JOB_TYPES.map(t => (
                        <Pill key={t.value} label={t.label}
                          selected={profile.job_types.includes(t.value)}
                          onClick={() => toggleArr('job_types', t.value)} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Seniority */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Seniority level</label>
                  <p className="text-xs text-slate-400 mb-2">Select one or more — leave blank to see all levels.</p>
                  <div className="flex flex-wrap gap-2">
                    {SENIORITY_LEVELS.map(s => (
                      <Pill key={s.value} label={s.label}
                        selected={profile.seniority_levels.includes(s.value)}
                        onClick={() => toggleArr('seniority_levels', s.value)} />
                    ))}
                  </div>
                </div>

                {/* Locations */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Locations</label>
                  <TagInput tags={profile.locations} onChange={v => set('locations', v)} placeholder="Add locations" />
                </div>

                {/* Work authorization */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Work authorization</label>
                  <p className="text-xs text-slate-400 mb-2">Select all that apply — we use this to filter sponsorship requirements.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {VISA_OPTIONS.map(o => (
                      <PillWithSub
                        key={o.value}
                        label={o.label}
                        sub={o.sub}
                        selected={profile.visa_types.includes(o.value)}
                        onClick={() => toggleArr('visa_types', o.value)}
                      />
                    ))}
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
                  <label className="block text-sm font-medium text-slate-700 mb-2">Salary range (USD, optional)</label>
                  <div className="flex items-center gap-3">
                    <input type="text" placeholder="Min salary" value={fmtSalary(profile.min_salary)}
                      onChange={e => set('min_salary', parseSalary(e.target.value))}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
                    <span className="text-slate-400 shrink-0">—</span>
                    <input type="text" placeholder="Max salary" value={fmtSalary(profile.max_salary)}
                      onChange={e => set('max_salary', parseSalary(e.target.value))}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
                  </div>
                </div>
              </div>

              <StepFooter
                onBack={() => setCurrentStep(2)}
                onNext={handleGenerateAndNext}
                nextLabel={generating ? 'Generating…' : 'Generate my profile →'}
                nextLoading={generating}
              />
            </>
          )}

          {/* ── STEP 4: Review ───────────────────────────────────────────── */}
          {currentStep === 4 && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-5 h-5 text-violet-600" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                    <h2 className="text-base font-bold text-slate-900">Your AI-Generated Profile</h2>
                    <span className="ml-auto text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Ready</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    Here's what we've understood about you. Edit preferences if anything looks off.
                  </p>
                </div>
                <div className="px-6 py-5">
                  {aiProfile
                    ? <ProfileBlocks aiProfile={aiProfile} />
                    : <p className="text-sm text-slate-400 text-center py-8">No profile generated yet — go back to step 3.</p>
                  }
                </div>
                <div className="px-6 pb-5 flex items-start gap-2 border-t border-slate-100 pt-4">
                  <svg className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Your information is used only to find relevant matches. You control everything and can update anytime.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={() => setCurrentStep(3)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Edit preferences
                </button>
                <button type="button" onClick={handleLooksGood}
                  className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  Looks good — go to dashboard
                </button>
              </div>
            </>
          )}

        </div>

        {/* RIGHT: AI profile preview (steps 2–3, desktop) */}
        {currentStep >= 2 && currentStep <= 3 && (
          <div className="shrink-0 hidden xl:block sticky top-6" style={{ width: '264px' }}>
            <AIProfilePreview aiProfile={aiProfile} generating={generating} />
          </div>
        )}

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
