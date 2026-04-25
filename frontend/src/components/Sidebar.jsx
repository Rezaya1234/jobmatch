import { NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getProfile } from '../api'

// ---------------------------------------------------------------------------
// Icons (inline SVG — no external dep)
// ---------------------------------------------------------------------------
const Icon = ({ path, className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
)

const ICONS = {
  dashboard:    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  positions:    'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  saved:        'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z',
  applications: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  feedback:     'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  insights:     'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  profile:      'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  settings:     'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  qa:           'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  architecture: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
  pipeline:     'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
  chevron:      'M9 5l7 7-7 7',
  star:         'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
}

const PRIMARY_NAV = [
  { to: '/dashboard',    label: 'Dashboard',        icon: 'dashboard' },
  { to: '/positions',    label: 'Open Positions',    icon: 'positions' },
  { to: '/matches',      label: 'Saved Jobs',        icon: 'saved' },
  { to: '/applications', label: 'Applications',      icon: 'applications', soon: true },
  { to: '/feedback',     label: 'Feedback',          icon: 'feedback' },
  { to: '/insights',     label: 'Company Insights',  icon: 'insights' },
]

const SECONDARY_NAV = [
  { to: '/profile',      label: 'Profile',           icon: 'profile' },
  { to: '/settings',     label: 'Settings',          icon: 'settings',     soon: true },
]

const ADMIN_NAV = [
  { to: '/qa',           label: 'QA',                icon: 'qa' },
  { to: '/architecture', label: 'Architecture',      icon: 'architecture' },
  { to: '/pipeline',     label: 'Pipeline',          icon: 'pipeline' },
]

// ---------------------------------------------------------------------------
// Profile completion
// ---------------------------------------------------------------------------
function completionPct(profile) {
  if (!profile) return 0
  let score = 0
  if (profile.role_description) score += 25
  if (profile.salary_min) score += 20
  if (profile.preferred_sectors?.length) score += 20
  if (profile.seniority_level) score += 20
  if (profile.work_modes?.length) score += 15
  return score
}

// ---------------------------------------------------------------------------
// Nav item
// ---------------------------------------------------------------------------
function NavItem({ item, collapsed }) {
  const cls = ({ isActive }) => [
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative',
    isActive
      ? 'bg-violet-50 text-violet-700'
      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
    item.soon ? 'opacity-50 pointer-events-none' : '',
  ].join(' ')

  return (
    <NavLink to={item.to} className={cls} title={collapsed ? item.label : undefined}>
      {({ isActive }) => (
        <>
          <span className={`shrink-0 ${isActive ? 'text-violet-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
            <Icon path={ICONS[item.icon]} />
          </span>
          {!collapsed && (
            <span className="flex-1 truncate">{item.label}</span>
          )}
          {!collapsed && item.soon && (
            <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded font-medium">Soon</span>
          )}
          {isActive && !collapsed && (
            <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-violet-600" />
          )}
        </>
      )}
    </NavLink>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
export default function Sidebar({ collapsed, onToggle }) {
  const userId = localStorage.getItem('userId')
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (userId) getProfile(userId).then(setProfile).catch(() => {})
  }, [userId])

  const pct = completionPct(profile)

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col h-screen bg-white border-r border-slate-200 transition-all duration-200 shrink-0 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Logo */}
        <div className={`flex items-center h-24 border-b border-slate-100 shrink-0 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
          {collapsed ? (
            <Icon path={ICONS.star} className="w-8 h-8 text-violet-600" />
          ) : (
            <img src="/logo.png" alt="Stellapath" style={{ height: '96px', width: 'auto' }} />
          )}
        </div>

        {/* Scrollable nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {PRIMARY_NAV.map(item => <NavItem key={item.to} item={item} collapsed={collapsed} />)}

          <div className="my-3 border-t border-slate-100" />

          {SECONDARY_NAV.map(item => <NavItem key={item.to} item={item} collapsed={collapsed} />)}

          <div className="my-3 border-t border-slate-100" />

          {!collapsed && (
            <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Admin</p>
          )}
          {ADMIN_NAV.map(item => <NavItem key={item.to} item={item} collapsed={collapsed} />)}
        </nav>

        {!collapsed && pct < 100 && (
          <div className="p-3 shrink-0">
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
                  <Icon path={ICONS.star} className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-xs font-semibold text-violet-800 leading-snug">Improve your matches</p>
              </div>
              <p className="text-xs text-violet-600 mb-2.5 leading-relaxed">
                A complete profile means better, more relevant job matches.
              </p>
              {/* Progress bar */}
              <div className="mb-2.5">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span className="font-medium">{pct}% complete</span>
                </div>
                <div className="h-1.5 bg-violet-100 rounded-full">
                  <div className="h-1.5 bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <NavLink
                to="/profile"
                className="block text-center text-xs font-semibold text-violet-700 bg-white border border-violet-200 rounded-lg py-1.5 hover:bg-violet-600 hover:text-white transition-colors"
              >
                Improve now →
              </NavLink>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="flex items-center justify-center h-10 border-t border-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon
            path={ICONS.chevron}
            className={`w-4 h-4 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          />
        </button>
      </aside>

      {/* Mobile bottom tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 flex h-16">
        {[
          { to: '/dashboard', label: 'Home',      icon: 'dashboard' },
          { to: '/positions', label: 'Positions',  icon: 'positions' },
          { to: '/matches',   label: 'Saved',      icon: 'saved' },
          { to: '/qa',        label: 'Activity',   icon: 'qa' },
          { to: '/profile',   label: 'Profile',    icon: 'profile' },
        ].map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium min-h-[44px] ${
                isActive ? 'text-violet-600' : 'text-slate-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon path={ICONS[item.icon]} className={`w-5 h-5 ${isActive ? 'text-violet-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
