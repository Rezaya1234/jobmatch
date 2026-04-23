import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Setup from './pages/Setup'
import Jobs from './pages/Jobs'
import Dashboard from './pages/Dashboard'
import Pipeline from './pages/Pipeline'
import Architecture from './pages/Architecture'
import './index.css'

const NAV_ITEMS = [
  { to: '/profile',      label: 'Profile' },
  { to: '/dashboard',    label: 'Dashboard' },
  { to: '/positions',    label: 'Open Positions' },
  { to: '/architecture', label: 'Architecture' },
  { to: '/pipeline',     label: 'Pipeline' },
]

function Nav() {
  const cls = ({ isActive }) => isActive
    ? 'px-4 py-5 text-sm font-medium text-white border-b-2 border-indigo-400 transition-colors whitespace-nowrap'
    : 'px-4 py-5 text-sm font-medium text-slate-400 hover:text-slate-200 border-b-2 border-transparent transition-colors whitespace-nowrap'

  return (
    <nav className="bg-slate-900 px-6 flex items-center sticky top-0 z-50 shadow-lg">
      <div className="flex items-center gap-2.5 py-3 mr-6 shrink-0">
        <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
            <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
          </svg>
        </div>
        <span className="text-white font-bold text-sm tracking-tight">JobMatch</span>
      </div>
      {NAV_ITEMS.map(item => (
        <NavLink key={item.to} to={item.to} className={cls}>{item.label}</NavLink>
      ))}
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        <Nav />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" />} />
            <Route path="/profile" element={<Setup />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/positions" element={<Jobs />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/architecture" element={<Architecture />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
