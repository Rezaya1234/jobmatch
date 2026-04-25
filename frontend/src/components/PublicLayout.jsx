import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 shrink-0">
      <img src="/logo.png" alt="StellaPath" style={{ height: '48px', width: 'auto' }} />
    </Link>
  )
}

export function PublicNav() {
  const [open, setOpen] = useState(false)
  const userId = localStorage.getItem('userId')
  const navigate = useNavigate()

  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-6">
        <Logo />

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {[
            { to: '/about', label: 'About' },
            { to: '/help',  label: 'Help' },
          ].map(({ to, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'text-violet-700 bg-violet-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {userId ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors"
            >
              Go to dashboard →
            </button>
          ) : (
            <>
              <Link to="/signin"
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Sign in
              </Link>
              <Link to="/signup"
                className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className="bg-white border-t border-slate-100 mt-auto">
      <div className="max-w-6xl mx-auto px-5 py-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <Logo />
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            <Link to="/about"   className="hover:text-slate-800 transition-colors">About</Link>
            <Link to="/contact" className="hover:text-slate-800 transition-colors">Contact</Link>
            <Link to="/help"    className="hover:text-slate-800 transition-colors">Help</Link>
            <Link to="/privacy" className="hover:text-slate-800 transition-colors">Privacy</Link>
            <Link to="/terms"   className="hover:text-slate-800 transition-colors">Terms</Link>
            <Link to="/signin"  className="hover:text-slate-800 transition-colors">Sign in</Link>
          </nav>
        </div>
        <p className="mt-6 text-xs text-slate-400">
          © {new Date().getFullYear()} StellaPath. Career guidance, not guarantees.
        </p>
      </div>
    </footer>
  )
}

export default function PublicLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <PublicNav />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  )
}
