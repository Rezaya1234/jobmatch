import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Setup from './pages/Setup'
import Jobs from './pages/Jobs'
import Dashboard from './pages/Dashboard'
import Pipeline from './pages/Pipeline'
import Architecture from './pages/Architecture'
import QA from './pages/QA'
import Matches from './pages/Matches'
import Sidebar from './components/Sidebar'
import './index.css'

function TopBar() {
  const email = localStorage.getItem('userEmail') || ''
  const initial = email ? email[0].toUpperCase() : '?'
  const displayName = email
    ? email.split('@')[0].split(/[._]/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
    : 'Account'

  return (
    <header className="h-24 bg-white border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
      {/* Logo — shown only on mobile */}
      <div className="md:hidden">
        <img src="/logo.png" alt="Stellapath" style={{ height: '96px', width: 'auto' }} />
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
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">2</span>
        </button>
        {/* User avatar + name */}
        <button
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
          aria-label="Account menu"
          title={email}
        >
          <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 text-sm font-bold flex items-center justify-center shrink-0">
            {initial}
          </div>
          <span className="hidden md:block text-sm font-medium text-slate-700">{displayName}</span>
          <svg className="hidden md:block w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </header>
  )
}

// Coming soon stub for unbuilt pages
function ComingSoon({ title }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-lg font-semibold text-slate-600 mb-1">{title}</p>
        <p className="text-sm text-slate-400">This section is coming soon.</p>
      </div>
    </div>
  )
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-white overflow-hidden">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto bg-slate-50 pb-16 md:pb-0">
            <div className="max-w-[1200px] mx-auto px-6 py-6">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/positions" element={<Jobs />} />
                <Route path="/matches" element={<Matches />} />
                <Route path="/profile" element={<Setup />} />
                <Route path="/pipeline" element={<Pipeline />} />
                <Route path="/architecture" element={<Architecture />} />
                <Route path="/qa" element={<QA />} />
                <Route path="/insights" element={<ComingSoon title="Company Insights" />} />
                <Route path="/resources" element={<ComingSoon title="Resources" />} />
                <Route path="/settings" element={<ComingSoon title="Settings" />} />
                <Route path="/applications" element={<ComingSoon title="Applications" />} />
                <Route path="/feedback" element={<ComingSoon title="Feedback" />} />
                {/* Legacy redirects */}
                <Route path="/setup" element={<Navigate to="/profile" />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
