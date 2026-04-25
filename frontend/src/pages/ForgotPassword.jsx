import { Link } from 'react-router-dom'

export default function ForgotPassword() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Account recovery</h1>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
          StellaPath uses your email address as your account identifier. If you don't remember
          which email you used, contact us and we'll help you recover access.
        </p>
        <a
          href="mailto:support@stellapath.ai?subject=Account recovery"
          className="inline-block w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors mb-3"
        >
          Email support
        </a>
        <Link to="/signin" className="block text-xs text-slate-400 hover:text-slate-600 transition-colors">
          ← Back to sign in
        </Link>
      </div>
    </div>
  )
}
