import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Setup from './pages/Setup'
import Jobs from './pages/Jobs'
import Dashboard from './pages/Dashboard'
import Pipeline from './pages/Pipeline'
import Architecture from './pages/Architecture'
import './index.css'

function Nav() {
  const base = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors'
  const active = `${base} bg-indigo-600 text-white`
  const inactive = `${base} text-slate-600 hover:bg-slate-100`
  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
      <span className="text-indigo-600 font-bold text-lg mr-4">JobMatch</span>
      <NavLink to="/profile" className={({ isActive }) => isActive ? active : inactive}>Profile</NavLink>
      <NavLink to="/dashboard" className={({ isActive }) => isActive ? active : inactive}>Dashboard</NavLink>
      <NavLink to="/positions" className={({ isActive }) => isActive ? active : inactive}>Open Positions</NavLink>
      <NavLink to="/architecture" className={({ isActive }) => isActive ? active : inactive}>Architecture</NavLink>
      <NavLink to="/pipeline" className={({ isActive }) => isActive ? active : inactive}>Pipeline</NavLink>
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
