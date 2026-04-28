import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getProfile, upsertProfile, getNotificationPrefs, updateNotificationPrefs } from '../api'

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0 border-b border-slate-50 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
          checked ? 'bg-violet-600' : 'bg-slate-200'
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  )
}

function Field({ label, description, children }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0 border-b border-slate-50 last:border-0">
      <div className="flex items-start justify-between gap-4 mb-1.5">
        <div>
          <p className="text-sm font-medium text-slate-800">{label}</p>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const navigate  = useNavigate()
  const userId    = localStorage.getItem('userId')
  const userEmail = localStorage.getItem('userEmail') || ''

  const [linkedinUrl,  setLinkedinUrl]  = useState('')
  const [saving,       setSaving]       = useState(false)
  const [savedMsg,     setSavedMsg]     = useState('')

  const [notifs, setNotifs] = useState({ weekly_recap: true, new_matches: true, product_updates: false })
  const [notifsSaving, setNotifsSaving] = useState(false)

  useEffect(() => {
    if (!userId) return
    getProfile(userId).then(p => {
      if (p.linkedin_url) setLinkedinUrl(p.linkedin_url)
    }).catch(() => {})
    getNotificationPrefs(userId).then(p => setNotifs(p)).catch(() => {})
  }, [userId])

  async function setNotif(key, val) {
    const next = { ...notifs, [key]: val }
    setNotifs(next)
    setNotifsSaving(true)
    try {
      await updateNotificationPrefs(userId, next)
    } catch {}
    finally { setNotifsSaving(false) }
  }

  async function saveLinkedin(e) {
    e.preventDefault()
    if (!userId) return
    setSaving(true)
    setSavedMsg('')
    try {
      await upsertProfile(userId, { linkedin_url: linkedinUrl.trim() || null })
      setSavedMsg('Saved')
      setTimeout(() => setSavedMsg(''), 2500)
    } catch {
      setSavedMsg('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function signOut() {
    localStorage.removeItem('userId')
    localStorage.removeItem('userEmail')
    navigate('/')
  }

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <p className="text-slate-600 font-medium">You're not signed in.</p>
        <Link to="/signin" className="text-sm text-violet-600 hover:underline font-medium">Sign in →</Link>
      </div>
    )
  }

  const displayName = userEmail
    ? userEmail.split('@')[0].split(/[._]/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
    : 'Your account'

  return (
    <div className="max-w-2xl space-y-5">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-600 mt-0.5">Manage your account and preferences.</p>
      </div>

      {/* Account */}
      <Section title="Account">
        <Field label="Name" description="Derived from your email">
          <p className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">{displayName}</p>
        </Field>
        <Field label="Email" description="Your account identifier">
          <p className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg font-mono">{userEmail}</p>
        </Field>
        <Field label="User ID" description="Used for support requests">
          <p className="text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg font-mono">{userId}</p>
        </Field>
        <div className="pt-3">
          <Link to="/profile" className="text-sm text-violet-600 hover:underline font-medium mr-4">
            Edit profile →
          </Link>
          <button onClick={signOut} className="text-sm text-rose-500 hover:text-rose-700 font-medium transition-colors">
            Sign out
          </button>
        </div>
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <p className="text-xs text-slate-500 mb-4">
          Email preferences. Changes take effect on your next notification cycle.
          {notifsSaving && <span className="ml-2 text-violet-500">Saving…</span>}
        </p>
        <ToggleRow
          label="Weekly recap"
          description="A summary of your top matches and activity every week"
          checked={notifs.weekly_recap ?? true}
          onChange={v => setNotif('weekly_recap', v)}
        />
        <ToggleRow
          label="New job recommendations"
          description="When StellaPath finds strong new matches for you"
          checked={notifs.new_matches ?? true}
          onChange={v => setNotif('new_matches', v)}
        />
        <ToggleRow
          label="Product updates"
          description="New features and improvements"
          checked={notifs.product_updates ?? false}
          onChange={v => setNotif('product_updates', v)}
        />
      </Section>

      {/* Connected sources */}
      <Section title="Connected sources">
        <p className="text-xs text-slate-500 mb-4">
          Connect your LinkedIn profile to help StellaPath surface warm introductions.
          StellaPath works without this — it's an optional enhancement.
        </p>
        <form onSubmit={saveLinkedin} className="flex gap-2">
          <input
            type="url"
            value={linkedinUrl}
            onChange={e => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/in/your-profile"
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-slate-300"
          />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
        {savedMsg && (
          <p className={`text-xs mt-2 ${savedMsg === 'Saved' ? 'text-green-600' : 'text-rose-500'}`}>
            {savedMsg}
          </p>
        )}
      </Section>

      {/* Privacy & data */}
      <Section title="Privacy & data">
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            <strong className="text-slate-800">Resume & profile data</strong> — Your resume and preferences are stored securely and used only to generate job recommendations.
          </p>
          <p>
            <strong className="text-slate-800">Feedback signals</strong> — Thumbs up/down reactions teach StellaPath your preferences. This data is private to your account.
          </p>
          <p>
            <strong className="text-slate-800">Job interaction data</strong> — Which jobs you click, save, or apply to helps improve future recommendations.
          </p>
          <p className="text-xs text-slate-400 pt-1">
            You can <Link to="/privacy" className="underline">read our full privacy policy</Link> for details.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            disabled
            className="px-4 py-2 border border-slate-200 text-slate-400 text-sm rounded-lg cursor-not-allowed"
            title="Coming soon"
          >
            Export my data
          </button>
          <button
            disabled
            className="px-4 py-2 border border-rose-200 text-rose-400 text-sm rounded-lg cursor-not-allowed"
            title="Contact support to delete your account"
          >
            Delete account
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          To delete your account, contact <a href="mailto:support@stellapath.ai" className="underline">support@stellapath.ai</a>.
        </p>
      </Section>
    </div>
  )
}
