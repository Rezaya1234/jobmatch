import { useState, useRef, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'

// App pages
import Setup from './pages/Setup'
import Jobs from './pages/Jobs'
import Dashboard from './pages/Dashboard'
import Pipeline from './pages/Pipeline'
import Architecture from './pages/Architecture'
import QA from './pages/QA'
import Admin from './pages/Admin'
import AdminDebug from './pages/AdminDebug'
import Matches from './pages/Matches'
import CompanyInsights from './pages/CompanyInsights'
import CompanyDetail from './pages/CompanyDetail'
import Feedback from './pages/Feedback'
import Settings from './pages/Settings'
import Applications from './pages/Applications'
import Sidebar from './components/Sidebar'

// Public pages
import PublicLayout from './components/PublicLayout'
import Landing from './pages/Landing'
import About from './pages/About'
import Contact from './pages/Contact'
import Help from './pages/Help'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'

import './index.css'

// ---------------------------------------------------------------------------
// Route guard — requires completed profile
// ---------------------------------------------------------------------------
function RequireProfile({ children }) {
  const userId = localStorage.getItem('userId')
  if (!userId) return <Navigate to="/signup" replace />
  if (localStorage.getItem('profileComplete') !== 'true') return <Navigate to="/profile" replace />
  return children
}

// ---------------------------------------------------------------------------
// Account menu dropdown
// ---------------------------------------------------------------------------
function AccountMenu({ email, onClose }) {
  const navigate = useNavigate()
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  function signOut() {
    localStorage.removeItem('userId')
    localStorage.removeItem('userEmail')
    localStorage.removeItem('profileComplete')
    onClose()
    navigate('/')
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50"
    >
      <div className="px-3 py-2 border-b border-slate-100">
        <p className="text-xs text-slate-400 truncate">{email}</p>
      </div>
      {[
        { label: 'Profile',   path: '/profile' },
        { label: 'Settings',  path: '/settings' },
      ].map(({ label, path }) => (
        <button
          key={path}
          onClick={() => { navigate(path); onClose() }}
          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          {label}
        </button>
      ))}
      <div className="border-t border-slate-100 mt-1" />
      <button
        onClick={signOut}
        className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
      >
        Sign out
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------
function TopBar() {
  const email = localStorage.getItem('userEmail') || ''
  const initial = email ? email[0].toUpperCase() : '?'
  const displayName = email
    ? email.split('@')[0].split(/[._]/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
    : 'Account'
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="h-24 bg-white border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
      {/* Logo — mobile only */}
      <div className="md:hidden">
        <img src="/logo.png" alt="StellaPath" style={{ height: '96px', width: 'auto' }} />
      </div>
      <div className="hidden md:block" />

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button
          className="relative p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
          aria-label="Notifications"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        {/* User avatar + dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 text-sm font-bold flex items-center justify-center shrink-0">
              {initial}
            </div>
            <span className="hidden md:block text-sm font-medium text-slate-700">{displayName}</span>
            <svg className="hidden md:block w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {menuOpen && (
            <AccountMenu email={email} onClose={() => setMenuOpen(false)} />
          )}
        </div>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Polished coming-soon stub
// ---------------------------------------------------------------------------
function ComingSoon({ title, description, action }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-base font-semibold text-slate-700 mb-2">{title}</p>
        <p className="text-sm text-slate-400 leading-relaxed">
          {description || 'This feature is coming soon.'}
        </p>
        {action && (
          <a href={action.href} className="mt-4 inline-block text-sm text-violet-600 font-medium hover:underline">
            {action.label}
          </a>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Authenticated app shell
// ---------------------------------------------------------------------------
function AppShell() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-slate-50 pb-16 md:pb-0">
          <div className="max-w-[1200px] mx-auto px-6 py-6">
            <Routes>
              <Route path="/dashboard"    element={<RequireProfile><Dashboard /></RequireProfile>} />
              <Route path="/positions"    element={<RequireProfile><Jobs /></RequireProfile>} />
              <Route path="/matches"      element={<RequireProfile><Matches /></RequireProfile>} />
              <Route path="/profile"      element={<Setup />} />
              <Route path="/pipeline"     element={<Pipeline />} />
              <Route path="/architecture" element={<Architecture />} />
              <Route path="/qa"           element={<QA />} />
              <Route path="/insights"     element={<RequireProfile><CompanyInsights /></RequireProfile>} />
              <Route path="/insights/:slug" element={<RequireProfile><CompanyDetail /></RequireProfile>} />
              <Route path="/feedback"     element={<RequireProfile><Feedback /></RequireProfile>} />
              <Route path="/settings"     element={<Settings />} />
              <Route path="/applications" element={<RequireProfile><Applications /></RequireProfile>} />
              <Route path="/resources"    element={
                <ComingSoon
                  title="Resources"
                  description="Courses, guides, and templates to help you land the role."
                />
              } />
              {/* Legacy redirects */}
              <Route path="/setup" element={<Navigate to="/profile" />} />
              {/* Fallback to dashboard */}
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Routes>
          </div>

          {/* App footer */}
          <footer className="hidden md:flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-white shrink-0">
            <span className="text-xs text-slate-400">© {new Date().getFullYear()} StellaPath</span>
            <nav className="flex gap-4">
              {[
                { to: '/about',   label: 'About' },
                { to: '/help',    label: 'Help' },
                { to: '/contact', label: 'Contact' },
                { to: '/privacy', label: 'Privacy' },
                { to: '/terms',   label: 'Terms' },
              ].map(({ to, label }) => (
                <a key={to} href={to} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">
                  {label}
                </a>
              ))}
            </nav>
          </footer>
        </main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root — redirect based on auth state
// ---------------------------------------------------------------------------
function Root() {
  return localStorage.getItem('userId')
    ? <Navigate to="/dashboard" replace />
    : <PublicLayout><Landing /></PublicLayout>
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public pages */}
        <Route path="/"                element={<Root />} />
        <Route path="/about"           element={<PublicLayout><About /></PublicLayout>} />
        <Route path="/contact"         element={<PublicLayout><Contact /></PublicLayout>} />
        <Route path="/help"            element={<PublicLayout><Help /></PublicLayout>} />
        <Route path="/privacy"         element={<PublicLayout><Privacy /></PublicLayout>} />
        <Route path="/terms"           element={<PublicLayout><Terms /></PublicLayout>} />
        <Route path="/signin"          element={<PublicLayout><SignIn /></PublicLayout>} />
        <Route path="/signup"          element={<PublicLayout><SignUp /></PublicLayout>} />
        <Route path="/forgot-password" element={<PublicLayout><ForgotPassword /></PublicLayout>} />

        {/* Admin — own layout, no sidebar, access guarded in component */}
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/debug" element={<AdminDebug />} />

        {/* Authenticated app shell — handles all /dashboard, /positions, etc. */}
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  )
}
