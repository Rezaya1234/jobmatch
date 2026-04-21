import { useState, useEffect, useRef } from 'react'
import { createUser, upsertProfile, getProfile, parseProfile } from '../api'

const WORK_MODES = ['remote', 'hybrid', 'onsite']
const JOB_TYPES = ['full_time', 'part_time', 'contract', 'internship']
const SENIORITY = ['junior', 'mid', 'senior', 'lead', 'principal', 'staff']

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
  const [status, setStatus] = useState(null)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState({
    work_modes: ['remote'],
    job_types: ['full_time'],
    locations: 'United States',
    seniority_levels: ['senior'],
    sectors: '',
    companies: '',
    min_salary: '',
    max_salary: '',
    title_include: '',
    title_exclude: '',
  })
  const [aiText, setAiText] = useState('')
  const [aiProfile, setAiProfile] = useState('')
  const [resumeFile, setResumeFile] = useState(null)
  const fileRef = useRef(null)
  const statusTimer = useRef(null)

  function showStatus(msg, error = false) {
    setStatus({ msg, error })
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(null), 4000)
  }

  useEffect(() => {
    if (userId) {
      getProfile(userId)
        .then(p => {
          setProfile({
            work_modes: p.work_modes || ['remote'],
            job_types: p.job_types || ['full_time'],
            locations: (p.locations || []).join(', '),
            seniority_levels: p.seniority_level ? [p.seniority_level] : ['senior'],
            sectors: (p.preferred_sectors || []).join(', '),
            companies: (p.preferred_companies || []).join(', '),
            min_salary: p.salary_min || '',
            max_salary: p.salary_max || '',
            title_include: (p.title_include || []).join(', '),
            title_exclude: (p.title_exclude || []).join(', '),
          })
          if (p.role_description) {
            setAiText(p.role_description)
            setAiProfile(p.role_description)
          }
        })
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
      showStatus(err.response?.data?.detail || 'Error creating account', true)
    }
  }

  async function handleSave() {
    if (!aiText.trim() && !resumeFile) {
      showStatus('Please describe what you are looking for before saving.', true)
      return
    }
    setSaving(true)
    try {
      const extracted = await parseProfile(userId, aiText, resumeFile)

      const saved = await upsertProfile(userId, {
        work_modes: profile.work_modes,
        job_types: profile.job_types,
        locations: profile.locations.split(',').map(s => s.trim()).filter(Boolean),
        seniority_level: profile.seniority_levels[0] || null,
        preferred_sectors: String(profile.sectors || '').split(',').map(s => s.trim()).filter(Boolean),
        preferred_companies: String(profile.companies || '').split(',').map(s => s.trim()).filter(Boolean),
        salary_min: profile.min_salary ? parseInt(profile.min_salary) : null,
        salary_max: profile.max_salary ? parseInt(profile.max_salary) : null,
        role_description: extracted.role_description || null,
        original_role_description: extracted.original_role_description || extracted.role_description || null,
        title_include: String(profile.title_include || '').split(',').map(s => s.trim()).filter(Boolean),
        title_exclude: String(profile.title_exclude || '').split(',').map(s => s.trim()).filter(Boolean),
      })

      setProfile({
        work_modes: saved.work_modes || ['remote'],
        job_types: saved.job_types || ['full_time'],
        locations: (saved.locations || []).join(', '),
        seniority_levels: saved.seniority_level ? [saved.seniority_level] : [],
        sectors: (saved.preferred_sectors || []).join(', '),
        companies: (saved.preferred_companies || []).join(', '),
        min_salary: saved.salary_min || '',
        max_salary: saved.salary_max || '',
        title_include: (saved.title_include || []).join(', '),
        title_exclude: (saved.title_exclude || []).join(', '),
      })
      if (extracted.role_description) setAiProfile(extracted.role_description)
      showStatus('Profile saved!')
    } catch (err) {
      showStatus(err.response?.data?.detail || err.message || 'Error saving profile', true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Account Setup</h1>

      {/* Login */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">1. Account</h2>
        {userId ? (
          <div className="flex items-center gap-3">
            <span className="text-green-600 font-medium">✓ Logged in</span>
            <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">{userId}</code>
            <button
              type="button"
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

      {userId && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-slate-800">2. Your Profile</h2>

          {/* AI description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Describe what you're looking for <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-slate-400 mb-2">Claude will use this to understand your background and match you to jobs.</p>
            <textarea
              rows={4}
              placeholder='e.g. "I am a senior ML engineer with 7 years of experience. Looking for a remote AI role at a growth-stage startup in the US."'
              value={aiText}
              onChange={e => setAiText(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Resume */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-600 font-medium">Resume (PDF, optional):</label>
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

          {/* Hard filters */}
          <div className="border-t border-slate-100 pt-5">
            <p className="text-sm font-semibold text-slate-700 mb-4">Job Filters</p>
            <Toggle label="Work Mode" value={profile.work_modes} options={WORK_MODES} onChange={v => setProfile(p => ({ ...p, work_modes: v }))} />
            <Toggle label="Job Type" value={profile.job_types} options={JOB_TYPES} onChange={v => setProfile(p => ({ ...p, job_types: v }))} />
            <Toggle label="Seniority" value={profile.seniority_levels} options={SENIORITY} onChange={v => setProfile(p => ({ ...p, seniority_levels: v }))} />

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Locations (comma-separated)</label>
              <input type="text" value={profile.locations}
                onChange={e => setProfile(p => ({ ...p, locations: e.target.value }))}
                placeholder="United States, Canada"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Sectors (comma-separated)</label>
              <input type="text" value={profile.sectors}
                onChange={e => setProfile(p => ({ ...p, sectors: e.target.value }))}
                placeholder="Fintech, SaaS, Healthcare"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Target Companies <span className="text-xs text-slate-400 font-normal">(comma-separated, leave empty for all)</span>
              </label>
              <input type="text" value={profile.companies}
                onChange={e => setProfile(p => ({ ...p, companies: e.target.value }))}
                placeholder="Google, OpenAI, Anthropic"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div className="mb-4 border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Title Keyword Filters</p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Must include</label>
                <input type="text" value={profile.title_include}
                  onChange={e => setProfile(p => ({ ...p, title_include: e.target.value }))}
                  placeholder="engineer, scientist, manager"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Must exclude</label>
                <input type="text" value={profile.title_exclude}
                  onChange={e => setProfile(p => ({ ...p, title_exclude: e.target.value }))}
                  placeholder="intern, director"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Min Salary (USD)</label>
                <input type="number" value={profile.min_salary}
                  onChange={e => setProfile(p => ({ ...p, min_salary: e.target.value }))}
                  placeholder="150000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Max Salary (USD)</label>
                <input type="number" value={profile.max_salary}
                  onChange={e => setProfile(p => ({ ...p, max_salary: e.target.value }))}
                  placeholder="300000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Saving...
              </>
            ) : 'Save Profile'}
          </button>
          {aiProfile && (
            <div className="border border-purple-200 bg-purple-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-2">AI-Generated Job Seeker Profile</p>
              <p className="text-sm text-purple-800 leading-relaxed">{aiProfile}</p>
            </div>
          )}
        </div>
      )}

      {status && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${status.error ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {status.msg}
        </div>
      )}
    </div>
  )
}
