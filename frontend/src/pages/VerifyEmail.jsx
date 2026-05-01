import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authVerifyEmail, authResendVerification } from '../api'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [status,  setStatus]  = useState('loading') // loading | success | error | no-token
  const [email,   setEmail]   = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [resentOk,    setResentOk]   = useState(false)
  const [resending,   setResending]  = useState(false)

  useEffect(() => {
    if (!token) { setStatus('no-token'); return }
    authVerifyEmail(token)
      .then(data => { setEmail(data.email || ''); setStatus('success') })
      .catch(err => {
        const detail = err.response?.data?.detail || ''
        setStatus(detail.includes('expired') ? 'expired' : 'error')
      })
  }, [token])

  async function handleResend(e) {
    e.preventDefault()
    const trimmed = resendEmail.trim().toLowerCase()
    if (!trimmed) return
    setResending(true)
    try { await authResendVerification(trimmed) } catch { /* always ok */ }
    setResending(false)
    setResentOk(true)
  }

  const iconCls = 'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5'

  if (status === 'loading') {
    return (
      <div className="px-5 py-16 max-w-sm mx-auto text-center">
        <div className={`${iconCls} bg-slate-100`}>
          <svg className="w-7 h-7 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
        <p className="text-slate-500 text-sm">Verifying your email…</p>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="px-5 py-16 max-w-sm mx-auto text-center">
        <div className={`${iconCls} bg-green-100`}>
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Email verified!</h1>
        <p className="text-slate-500 text-sm mb-6">
          {email ? <><strong className="text-slate-700">{email}</strong> is now verified. </> : ''}
          You can sign in to your account.
        </p>
        <Link
          to="/signin"
          className="inline-block w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors text-center"
        >
          Sign in →
        </Link>
      </div>
    )
  }

  // expired or error — show resend form
  return (
    <div className="px-5 py-16 max-w-sm mx-auto text-center">
      <div className={`${iconCls} bg-amber-100`}>
        <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-slate-900 mb-2">
        {status === 'expired' ? 'Link expired' : 'Invalid link'}
      </h1>
      <p className="text-slate-500 text-sm mb-6 leading-relaxed">
        {status === 'expired'
          ? 'This verification link has expired. Enter your email to get a fresh one.'
          : 'This verification link is invalid or has already been used.'}
      </p>

      {!resentOk ? (
        <form onSubmit={handleResend} className="space-y-3 text-left">
          <input
            type="email"
            value={resendEmail}
            onChange={e => setResendEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
          />
          <button
            type="submit"
            disabled={resending || !resendEmail.trim()}
            className="w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {resending ? 'Sending…' : 'Resend verification email'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          Verification email sent — check your inbox.
        </p>
      )}

      <Link to="/signin" className="block text-xs text-slate-400 hover:text-slate-600 mt-5 transition-colors">
        ← Back to sign in
      </Link>
    </div>
  )
}
