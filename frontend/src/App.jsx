import { useState, useRef, useEffect, useCallback } from 'react'
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

import { getNotifications } from './api'
import './index.css'

// ---------------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------------
function RequireProfile({ children }) {
  const userId = localStorage.getItem('userId')
  if (!userId) return <Navigate to="/signup" replace />
  if (localStorage.getItem('profileComplete') !== 'true') return <Navigate to="/profile" replace />
  return children
}

function RequireAdmin({ children }) {
  const userId = localStorage.getItem('userId')
  if (!userId) return <Navigate to="/signin" replace />
  if (localStorage.getItem('userRole') !== 'admin') return <Navigate to="/dashboard" replace />
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
    localStorage.removeItem('userRole')
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
// Notification bell
// ---------------------------------------------------------------------------
const TYPE_ICON = {
  match:    <svg className="w-4 h-4 text-violet-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" /></svg>,
  tip:      <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  action:   <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>,
  reminder: <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  info:     <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
}

function NotificationBell() {
  const userId = localStorage.getItem('userId')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`notif_dismissed_${userId}`) || '[]')) }
    catch { return new Set() }
  })
  const ref = useRef(null)
  const navigate = useNavigate()

  const saveDismissed = useCallback((set) => {
    localStorage.setItem(`notif_dismissed_${userId}`, JSON.stringify([...set]))
    setDismissed(new Set(set))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    getNotifications(userId).then(setItems).catch(() => {})
  }, [userId])

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!userId) return null

  const visible = items.filter(n => !dismissed.has(n.id))
  const unreadCount = visible.length

  function dismiss(id) {
    const next = new Set(dismissed)
    next.add(id)
    saveDismissed(next)
  }

  function clearAll() {
    saveDismissed(new Set(items.map(n => n.id)))
    setOpen(false)
  }

  function handleClick(item) {
    dismiss(item.id)
    setOpen(false)
    if (item.href) navigate(item.href)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            {visible.length > 0 && (
              <button onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                Clear all
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-slate-400">You're all caught up!</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
              {visible.map(n => (
                <li key={n.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => handleClick(n)}>
                  <div className="mt-0.5">{TYPE_ICON[n.type] || TYPE_ICON.info}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 leading-snug">{n.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{n.message}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); dismiss(n.id) }}
                    className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100 mt-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
        <NotificationBell />

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
              <Route path="/pipeline"     element={<RequireAdmin><Pipeline /></RequireAdmin>} />
              <Route path="/architecture" element={<RequireAdmin><Architecture /></RequireAdmin>} />
              <Route path="/qa"           element={<RequireAdmin><QA /></RequireAdmin>} />
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

        {/* Admin — own layout, no sidebar */}
        <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="/admin/debug" element={<RequireAdmin><AdminDebug /></RequireAdmin>} />

        {/* Authenticated app shell — handles all /dashboard, /positions, etc. */}
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  )
}
