import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authForgotPassword } from '../api'

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setLoading(true)
    try {
      await authForgotPassword(trimmed)
    } catch {
      // Always show success to prevent email enumeration
    } finally {
      setLoading(false)
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="px-5 py-16 max-w-sm mx-auto text-center">
        <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Check your inbox</h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-6">
          If <strong className="text-slate-700">{email}</strong> is registered, we've sent a password reset link. It expires in 1 hour.
        </p>
        <Link
          to="/signin"
          className="block text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="px-5 py-16 max-w-sm mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Forgot your password?</h1>
        <p className="text-slate-500 text-sm">Enter your email and we'll send you a reset link.</p>
      </div>

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

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-slate-400 mt-5">
        <Link to="/signin" className="text-violet-600 font-medium hover:underline">← Back to sign in</Link>
      </p>
    </div>
  )
}
