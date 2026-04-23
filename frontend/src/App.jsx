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
      <div className="flex items-center py-2 mr-6 shrink-0">
        <div className="bg-white rounded-lg px-2 py-1">
          <img src="/logo.png" alt="Stellapath" className="h-7 w-auto" />
        </div>
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
