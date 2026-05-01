import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { lookupUserByEmail, getProfile } from '../api'

export default function SignIn() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setLoading(true)
    setError('')
    try {
      const user = await lookupUserByEmail(trimmed)
      localStorage.setItem('userId', user.id)
      localStorage.setItem('userEmail', trimmed)
      localStorage.setItem('userRole', user.role || 'user')

      // Sync profileComplete so RequireProfile guard works for returning users
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
      if (status === 404) {
        setError("No account found for that email. Did you mean to sign up?")
      } else {
        setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-5 py-16 max-w-sm mx-auto">
      <div className="w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome back</h1>
          <p className="text-slate-500 text-sm">Enter your email to sign in.</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email address
              </label>
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

            {error && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}{' '}
                {error.includes('sign up') && (
                  <Link to="/signup" className="font-semibold underline">Create account →</Link>
                )}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          New to StellaPath?{' '}
          <Link to="/signup" className="text-violet-600 font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
