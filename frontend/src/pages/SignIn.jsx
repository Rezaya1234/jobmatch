import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authLogin, authResendVerification, getProfile } from '../api'

const PREVIEW_JOBS = [
  { title: 'Senior ML Engineer',     company: 'Anthropic',  location: 'Remote · USA',         salary: '$180k – $240k', match: 96 },
  { title: 'Staff Software Engineer', company: 'Databricks', location: 'Remote · USA',         salary: '$200k – $260k', match: 91 },
  { title: 'AI Product Manager',      company: 'OpenAI',     location: 'San Francisco, CA',    salary: '$170k – $220k', match: 88 },
]

export default function SignIn() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [unverified, setUnverified] = useState(false)
  const [resentOk,   setResentOk]  = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const resetSuccess = searchParams.get('reset') === '1'

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !password) return
    setLoading(true)
    setError('')
    setUnverified(false)
    setResentOk(false)
    try {
      const user = await authLogin(trimmed, password)
      localStorage.setItem('userId', user.id)
      localStorage.setItem('userEmail', trimmed)
      localStorage.setItem('userRole', user.role || 'user')

      try {
        const profile = await getProfile(user.id)
        if (profile?.profile_complete) {
          localStorage.setItem('profileComplete', 'true')
        } else {
          localStorage.removeItem('profileComplete')
        }
      } catch {
        localStorage.removeItem('profileComplete')
      }

      navigate('/dashboard')
    } catch (err) {
      const status = err.response?.status
      if (status === 403) {
        setUnverified(true)
      } else if (status === 401) {
        setError("Incorrect email or password. If you haven't set a password yet, use Forgot Password below.")
      } else {
        setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!email.trim()) return
    setResentOk(false)
    try {
      await authResendVerification(email.trim().toLowerCase())
      setResentOk(true)
    } catch {
      setResentOk(true)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">

      {/* ── Left: form ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 lg:max-w-[480px] lg:border-r lg:border-slate-100">
        <div className="w-full max-w-sm">

          {/* Brand */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <span className="text-lg font-bold text-slate-900">StellaPath</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="text-slate-500 text-sm mt-1">Sign in to see your latest matches.</p>
          </div>

          {resetSuccess && (
            <div className="mb-4 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              Password updated — sign in with your new password.
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-700">Password</label>
                  <Link to="/forgot-password" className="text-xs text-violet-600 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Your password"
                    required
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPw
                      ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
              </div>

              {unverified && (
                <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
                  <p className="font-semibold mb-1">Email not verified</p>
                  <p className="mb-2">Check your inbox for the verification link we sent when you signed up.</p>
                  {resentOk
                    ? <p className="text-green-700 font-medium">Verification email resent — check your inbox.</p>
                    : <button type="button" onClick={handleResend} className="underline font-medium hover:text-amber-900">
                        Resend verification email
                      </button>
                  }
                </div>
              )}

              {error && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-5">
            New to StellaPath?{' '}
            <Link to="/signup" className="text-violet-600 font-medium hover:underline">Create an account</Link>
          </p>

          {/* Mobile-only value props */}
          <ul className="lg:hidden mt-8 space-y-3">
            {[
              'AI-matched jobs, updated daily',
              'Company hiring signals before you apply',
              'Built for engineers targeting top tech companies',
            ].map(text => (
              <li key={text} className="flex items-start gap-2.5 text-sm text-slate-600">
                <svg className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Right: product preview (desktop only) ──────────────── */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-violet-950 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Background glow blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-md">
          <p className="text-violet-400 text-xs font-semibold uppercase tracking-widest mb-2">Your daily feed</p>
          <h2 className="text-white font-bold text-2xl mb-1">Jobs matched to you</h2>
          <p className="text-slate-400 text-sm mb-7">AI-curated roles that fit your profile, refreshed every day.</p>

          {/* Fake job cards */}
          <div className="space-y-3 mb-5">
            {PREVIEW_JOBS.map((job, i) => (
              <div
                key={i}
                className={`bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex items-center gap-3 transition-opacity ${i === 2 ? 'opacity-50' : ''}`}
              >
                <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                  <span className="text-white text-sm font-bold">{job.company[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white text-sm font-semibold truncate">{job.title}</span>
                    <span className="text-xs font-bold text-violet-300 bg-violet-500/25 px-2 py-0.5 rounded-full shrink-0">
                      {job.match}%
                    </span>
                  </div>
                  <div className="text-slate-400 text-xs mt-0.5">{job.company} · {job.location}</div>
                  <div className="text-slate-300 text-xs mt-0.5">{job.salary}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Modal overlay card */}
          <div className="bg-white rounded-2xl shadow-2xl p-5 border border-slate-100">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                <span className="text-violet-700 font-bold text-sm">A</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm">Senior ML Engineer</p>
                <p className="text-xs text-slate-500">Anthropic · Remote · USA</p>
              </div>
              <span className="text-sm font-bold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full shrink-0">
                96% match
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 rounded-lg px-2 py-2 text-center">
                <p className="text-xs text-slate-400 mb-0.5">Salary</p>
                <p className="text-xs font-semibold text-slate-800">$180k–$240k</p>
              </div>
              <div className="bg-violet-50 rounded-lg px-2 py-2 text-center">
                <p className="text-xs text-violet-400 mb-0.5">Hiring</p>
                <p className="text-xs font-semibold text-violet-700">Growing ↑</p>
              </div>
              <div className="bg-emerald-50 rounded-lg px-2 py-2 text-center">
                <p className="text-xs text-emerald-500 mb-0.5">Mode</p>
                <p className="text-xs font-semibold text-emerald-700">Remote</p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
