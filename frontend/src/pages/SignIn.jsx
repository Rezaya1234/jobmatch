import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authLogin, authResendVerification, getProfile } from '../api'

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
        setError('Incorrect email or password. If you haven't set a password yet, use Forgot Password below.')
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
      // silently ignore — endpoint always returns ok
      setResentOk(true)
    }
  }

  return (
    <div className="px-5 py-16 max-w-sm mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome back</h1>
        <p className="text-slate-500 text-sm">Sign in to your StellaPath account.</p>
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
    </div>
  )
}
