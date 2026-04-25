import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createUser } from '../api'

export default function SignUp() {
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
      const user = await createUser(trimmed)
      localStorage.setItem('userId', user.id)
      localStorage.setItem('userEmail', trimmed)
      navigate('/profile')
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Create your account</h1>
          <p className="text-slate-500 text-sm">
            Start getting personalized job recommendations in minutes.
          </p>
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
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating account…' : 'Get started'}
            </button>
          </form>

          <p className="text-xs text-slate-400 mt-4 text-center leading-relaxed">
            By continuing, you agree to our{' '}
            <Link to="/terms" className="underline hover:text-slate-600">Terms</Link>
            {' '}and{' '}
            <Link to="/privacy" className="underline hover:text-slate-600">Privacy Policy</Link>.
          </p>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          Already have an account?{' '}
          <Link to="/signin" className="text-violet-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
