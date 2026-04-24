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

  return (
    <header className="h-24 bg-white border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
      {/* Logo — shown only on mobile (sidebar handles desktop) */}
      <div className="md:hidden">
        <img src="/logo.png" alt="Stellapath" className="h-8 w-auto" />
      </div>
      {/* Spacer on desktop */}
      <div className="hidden md:block" />
      {/* Right side */}
      <div className="flex items-center gap-3">
        <button
          className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 text-sm font-bold flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-violet-500 hover:bg-violet-200 transition-colors"
          aria-label="Account"
          title={email}
        >
          {initial}
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
