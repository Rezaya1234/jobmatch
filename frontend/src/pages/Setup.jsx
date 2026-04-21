import { useState, useEffect, useRef } from 'react'
import { createUser, upsertProfile, getProfile, parseProfile } from '../api'

const WORK_MODES = ['remote', 'hybrid', 'onsite']
const JOB_TYPES = ['full_time', 'part_time', 'contract', 'internship']
const SENIORITY = ['junior', 'mid', 'senior', 'lead', 'principal', 'staff']

function ResultRow({ label, value }) {
  return (
    <div className="bg-slate-50 rounded px-3 py-2">
      <span className="text-slate-500 text-xs uppercase tracking-wide">{label}: </span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  )
}

function Toggle({ label, value, options, onChange }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              value.includes(opt)
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
            }`}
          >
            {opt.replace('_', ' ')}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Setup() {
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState(() => localStorage.getItem('userId') || '')
  const [status, setStatus] = useState('')
  const [profile, setProfile] = useState({
    work_modes: ['remote'],
    job_types: ['full_time'],
    locations: ['United States'],
    seniority_levels: ['senior'],
    sectors: '',
    companies: '',
    min_salary: '',
    max_salary: '',
    role_description: '',
    original_role_description: '',
    title_include: '',
    title_exclude: '',
  })
  const [aiText, setAiText] = useState('')
  const [resumeFile, setResumeFile] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const fileRef = useRef(null)
  const statusTimer = useRef(null)

  function showStatus(msg) {
    setStatus(msg)
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(''), 4000)
  }

  useEffect(() => {
    if (userId) {
      getProfile(userId)
        .then(p => setProfile({
          work_modes: p.work_modes || ['remote'],
          job_types: p.job_types || ['full_time'],
          locations: (p.locations || []).join(', '),
          seniority_levels: p.seniority_level ? [p.seniority_level] : ['senior'],
          sectors: (p.preferred_sectors || []).join(', '),
          companies: (p.preferred_companies || []).join(', '),
          min_salary: p.salary_min || '',
          max_salary: p.salary_max || '',
          role_description: p.role_description || '',
          original_role_description: p.original_role_description || '',
          title_include: (p.title_include || []).join(', '),
          title_exclude: (p.title_exclude || []).join(', '),
        }))
        .catch(() => {})
    }
  }, [userId])

  async function handleCreateUser(e) {
    e.preventDefault()
    try {
      const user = await createUser(email)
      localStorage.setItem('userId', user.id)
      setUserId(user.id)
      showStatus('Logged in!')
    } catch (err) {
      setStatus(err.response?.data?.detail || 'Error')
    }
  }

  async function handleGenerate() {
    if (!aiText.trim() && !resumeFile) return
    setParsing(true)
    setStatus('')
    try {
      const extracted = await parseProfile(userId, aiText, resumeFile)
      setAiResult(extracted)
      setProfile({
        work_modes: extracted.work_modes || ['remote'],
        job_types: extracted.job_types || ['full_time'],
        locations: (extracted.locations || []).join(', '),
        seniority_levels: extracted.seniority_level ? [extracted.seniority_level] : [],
        sectors: (extracted.preferred_sectors || []).join(', '),
        min_salary: extracted.salary_min || '',
        max_salary: extracted.salary_max || '',
        companies: (extracted.preferred_companies || []).join(', '),
        role_description: extracted.role_description || '',
        original_role_description: extracted.original_role_description || extracted.role_description || '',
      })
      showStatus('Profile generated — review and save below.')
    } catch (err) {
      showStatus(err.response?.data?.detail || 'Failed to generate profile')
    } finally {
      setParsing(false)
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    try {
      await upsertProfile(userId, {
        work_modes: profile.work_modes,
        job_types: profile.job_types,
        locations: typeof profile.locations === 'string'
          ? profile.locations.split(',').map(s => s.trim()).filter(Boolean)
          : profile.locations,
        seniority_level: profile.seniority_levels[0] || null,
        preferred_sectors: profile.sectors.split(',').map(s => s.trim()).filter(Boolean),
        preferred_companies: profile.companies.split(',').map(s => s.trim()).filter(Boolean),
        salary_min: profile.min_salary ? parseInt(profile.min_salary) : null,
        salary_max: profile.max_salary ? parseInt(profile.max_salary) : null,
        role_description: profile.role_description || null,
        title_include: profile.title_include.split(',').map(s => s.trim()).filter(Boolean),
        title_exclude: profile.title_exclude.split(',').map(s => s.trim()).filter(Boolean),
      })
      showStatus('Profile saved!')
    } catch (err) {
      showStatus(err.response?.data?.detail || 'Error saving profile')
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Account Setup</h1>

      {/* User creation */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">1. Create Account</h2>
        {userId ? (
          <div className="flex items-center gap-3">
            <span className="text-green-600 font-medium">✓ Logged in</span>
            <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">{userId}</code>
            <button
              onClick={() => { localStorage.removeItem('userId'); setUserId('') }}
              className="text-xs text-slate-400 hover:text-red-500"
            >
              Switch account
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateUser} className="flex gap-3">
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              Create
            </button>
          </form>
        )}
      </div>

      {/* Profile */}
      {userId && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">2. Generate with AI</h2>
          <p className="text-sm text-slate-500 mb-4">Describe what you're looking for, upload your resume, or both — Claude will fill in your profile.</p>
          <textarea
            rows={3}
            placeholder='e.g. "I am looking for an applied AI role at a large corporation, senior level, remote, in the US"'
            value={aiText}
            onChange={e => setAiText(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
          />
          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm text-slate-600 font-medium">Resume (PDF):</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              onChange={e => setResumeFile(e.target.files?.[0] || null)}
              className="text-sm text-slate-500"
            />
            {resumeFile && (
              <button type="button" onClick={() => { setResumeFile(null); fileRef.current.value = '' }}
                className="text-xs text-red-400 hover:text-red-600">Remove</button>
            )}
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={parsing || (!aiText.trim() && !resumeFile)}
            className="w-full bg-purple-600 text-white py-2.5 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {parsing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Generating...
              </>
            ) : 'Generate Profile with AI'}
          </button>

          {aiResult && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">What AI extracted</p>
              <div className="space-y-2 text-sm">
                {aiResult.role_description && (
                  <div className="bg-purple-50 rounded-lg px-3 py-2">
                    <span className="font-medium text-purple-800">Summary: </span>
                    <span className="text-purple-700">{aiResult.role_description}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <ResultRow label="Work mode" value={(aiResult.work_modes || []).join(', ')} />
                  <ResultRow label="Job type" value={(aiResult.job_types || []).join(', ')} />
                  <ResultRow label="Seniority" value={aiResult.seniority_level || '—'} />
                  <ResultRow label="Location" value={(aiResult.locations || []).join(', ')} />
                  <ResultRow label="Sectors" value={(aiResult.preferred_sectors || []).join(', ') || '—'} />
                  <ResultRow label="Company size" value={(aiResult.preferred_company_sizes || []).join(', ') || '—'} />
                  <ResultRow label="Min salary" value={aiResult.salary_min ? `$${aiResult.salary_min.toLocaleString()}` : '—'} />
                  <ResultRow label="Max salary" value={aiResult.salary_max ? `$${aiResult.salary_max.toLocaleString()}` : '—'} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {userId && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">3. Job Preferences</h2>
            <button
              type="button"
              onClick={async () => {
                const cleared = { work_modes: [], job_types: [], seniority_levels: [], locations: '', companies: '', sectors: '', min_salary: '', max_salary: '' }
                setProfile(p => ({ ...p, ...cleared }))
                try {
                  await upsertProfile(userId, { work_modes: [], job_types: [], locations: [], preferred_sectors: [], preferred_companies: [], seniority_level: null, salary_min: null, salary_max: null })
                  showStatus('All filters cleared and saved.')
                } catch { showStatus('Cleared locally — click Save to persist.') }
              }}
              className="text-xs text-red-500 border border-red-200 px-3 py-1 rounded-full hover:bg-red-50 transition-colors"
            >
              Clear all filters
            </button>
          </div>
          <form onSubmit={handleSaveProfile} className="space-y-2">
            {(profile.original_role_description || profile.role_description) && (
              <div className="space-y-3 mb-4">
                {profile.original_role_description && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Original Profile (from resume)</p>
                    <p className="text-sm text-slate-700">{profile.original_role_description}</p>
                  </div>
                )}
                {profile.role_description && profile.role_description !== profile.original_role_description && (
                  <div className="bg-purple-50 border border-purple-300 rounded-lg p-3">
                    <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Evolving Profile (refined by feedback)</p>
                    <p className="text-sm text-purple-800">{profile.role_description}</p>
                  </div>
                )}
                {profile.role_description && profile.role_description === profile.original_role_description && (
                  <p className="text-xs text-slate-400 italic">Evolving profile matches original — rate more jobs to refine it.</p>
                )}
              </div>
            )}
            <Toggle label="Work Mode" value={profile.work_modes} options={WORK_MODES} onChange={v => setProfile(p => ({ ...p, work_modes: v }))} />
            <Toggle label="Job Type" value={profile.job_types} options={JOB_TYPES} onChange={v => setProfile(p => ({ ...p, job_types: v }))} />
            <Toggle label="Seniority" value={profile.seniority_levels} options={SENIORITY} onChange={v => setProfile(p => ({ ...p, seniority_levels: v }))} />

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Locations (comma-separated)</label>
              <input
                type="text"
                value={profile.locations}
                onChange={e => setProfile(p => ({ ...p, locations: e.target.value }))}
                placeholder="United States, Canada"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Sectors (comma-separated)</label>
              <input
                type="text"
                value={profile.sectors}
                onChange={e => setProfile(p => ({ ...p, sectors: e.target.value }))}
                placeholder="Fintech, SaaS, Healthcare"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Target Companies (comma-separated)
                <span className="ml-2 text-xs text-slate-400 font-normal">leave empty to match all companies</span>
              </label>
              <input
                type="text"
                value={profile.companies}
                onChange={e => setProfile(p => ({ ...p, companies: e.target.value }))}
                placeholder="Google, OpenAI, Anthropic"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="mb-4 border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Title Keyword Filters</p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Must include <span className="text-xs text-slate-400 font-normal">— title must contain at least one</span>
                </label>
                <input
                  type="text"
                  value={profile.title_include}
                  onChange={e => setProfile(p => ({ ...p, title_include: e.target.value }))}
                  placeholder="engineer, scientist, manager"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Must exclude <span className="text-xs text-slate-400 font-normal">— title must NOT contain any</span>
                </label>
                <input
                  type="text"
                  value={profile.title_exclude}
                  onChange={e => setProfile(p => ({ ...p, title_exclude: e.target.value }))}
                  placeholder="intern, director, data scientist"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Min Salary (USD)</label>
                <input
                  type="number"
                  value={profile.min_salary}
                  onChange={e => setProfile(p => ({ ...p, min_salary: e.target.value }))}
                  placeholder="150000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Max Salary (USD)</label>
                <input
                  type="number"
                  value={profile.max_salary}
                  onChange={e => setProfile(p => ({ ...p, max_salary: e.target.value }))}
                  placeholder="300000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              Save Preferences
            </button>
          </form>
        </div>
      )}

      {status && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-green-600 text-white rounded-xl shadow-lg text-sm font-medium">
          {status}
        </div>
      )}
    </div>
  )
}
