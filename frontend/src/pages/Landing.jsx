import { Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const Icon = ({ path, className = 'w-6 h-6' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
)

const ICONS = {
  sparkle:    'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  chart:      'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  brain:      'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  target:     'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  building:   'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  resume:     'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  feedback:   'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  check:      'M5 13l4 4L19 7',
  arrow:      'M17 8l4 4m0 0l-4 4m4-4H3',
  path:       'M13 7l5 5m0 0l-5 5m5-5H6',
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="pt-20 pb-16 px-5 text-center">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          <Icon path={ICONS.sparkle} className="w-3.5 h-3.5" />
          AI-powered career guidance
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight tracking-tight mb-5">
          Stop applying blindly.{' '}
          <span className="text-violet-600">Start building your career.</span>
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed mb-8 max-w-2xl mx-auto">
          StellaPath uses AI to help you find real opportunities, understand your gaps,
          and focus on roles that actually move your career forward.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/signup"
            className="w-full sm:w-auto px-6 py-3 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors shadow-sm"
          >
            Get started — it's free
          </Link>
          <Link to="/signin"
            className="w-full sm:w-auto px-6 py-3 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
          >
            Sign in
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-400">No credit card required. Takes 5 minutes to set up.</p>
      </div>
    </section>
  )
}

function ValueProps() {
  const items = [
    {
      icon: ICONS.target,
      color: 'bg-violet-50 text-violet-600',
      title: 'Personalized recommendations',
      body: 'Every role is scored against your background, goals, and preferences — not just keywords.',
    },
    {
      icon: ICONS.brain,
      color: 'bg-blue-50 text-blue-600',
      title: 'Feedback-driven learning',
      body: 'Each thumbs up or down teaches StellaPath more about what fits you. Matches improve over time.',
    },
    {
      icon: ICONS.building,
      color: 'bg-emerald-50 text-emerald-600',
      title: 'Company insights',
      body: 'Understand hiring trends, team size, and culture signals before you commit your time.',
    },
    {
      icon: ICONS.chart,
      color: 'bg-amber-50 text-amber-600',
      title: 'Skill-gap guidance',
      body: 'See exactly where you fall short for a role, and what to do about it — specific, not generic.',
    },
    {
      icon: ICONS.path,
      color: 'bg-rose-50 text-rose-600',
      title: 'Career path thinking',
      body: 'Not just more listings. StellaPath shows you how roles connect to where you want to be.',
    },
  ]

  return (
    <section className="py-16 px-5 bg-slate-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">
            A smarter way to find your next role
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            StellaPath combines AI matching with real career intelligence so you can be intentional,
            not reactive.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map(({ icon, color, title, body }) => (
            <div key={title} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                <Icon path={icon} className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    {
      n: '1',
      icon: ICONS.resume,
      title: 'Upload your resume',
      body: 'Paste your resume or upload a PDF. StellaPath extracts your skills, experience, and background automatically.',
    },
    {
      n: '2',
      icon: ICONS.target,
      title: 'Tell us what you want',
      body: 'Describe your target roles, preferred work style, salary range, and sectors. Be as specific or broad as you like.',
    },
    {
      n: '3',
      icon: ICONS.feedback,
      title: 'Give feedback, get better matches',
      body: 'React to recommendations with a thumbs up or down. StellaPath learns your taste and improves with every signal.',
    },
  ]

  return (
    <section className="py-16 px-5">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">How it works</h2>
          <p className="text-slate-500">Three steps to smarter job search.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map(({ n, icon, title, body }) => (
            <div key={n} className="relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {n}
                </div>
                <div className="h-px flex-1 bg-slate-200 last:hidden" />
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mb-3">
                <Icon path={icon} className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Differentiation() {
  const points = [
    'Not a generic job board — every recommendation is scored against your actual background.',
    'Not keyword search — StellaPath understands context, seniority, and career direction.',
    'Learns from your behavior — each reaction makes future matches more relevant.',
    'Helps you build a path, not just find a job — connected to where you want to be next.',
  ]

  return (
    <section className="py-16 px-5 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
              Built differently, on purpose
            </h2>
            <p className="text-slate-500 mb-6 leading-relaxed">
              Most job sites give you a firehose of listings and hope something sticks.
              StellaPath is designed to help you be intentional — understanding fit, gaps,
              and path before you spend time applying.
            </p>
            <ul className="space-y-3">
              {points.map((p, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon path={ICONS.check} className="w-3 h-3" />
                  </div>
                  <span className="text-sm text-slate-600">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Simple visual card stack */}
          <div className="relative hidden md:block">
            <div className="absolute inset-0 flex flex-col gap-3 p-4 pointer-events-none" aria-hidden="true">
              {[
                { title: 'Staff ML Engineer', company: 'Anthropic', score: '94%', badge: 'Strong fit' },
                { title: 'Senior AI Engineer', company: 'Scale AI',  score: '88%', badge: 'Good fit' },
                { title: 'ML Platform Lead',  company: 'Databricks', score: '81%', badge: 'Good fit' },
              ].map(({ title, company, score, badge }, i) => (
                <div
                  key={title}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between"
                  style={{ opacity: 1 - i * 0.12, transform: `scale(${1 - i * 0.02})` }}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="text-xs text-slate-500">{company}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-violet-700">{score}</p>
                    <p className="text-xs text-green-600 font-medium">{badge}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="h-52" />
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Comparison section
// ---------------------------------------------------------------------------

const ROWS = [
  {
    feature: 'Career focus',
    stella:  'Built around your long-term career path',
    li:      'Job search + networking focused',
    indeed:  'Primarily job search',
    liTier:  'partial', indeedTier: 'no',
  },
  {
    feature: 'Learns and improves over time',
    stella:  'Adapts using your feedback and interactions',
    li:      'Based on profile and activity signals',
    indeed:  'Based on search and activity patterns',
    liTier:  'partial', indeedTier: 'partial',
  },
  {
    feature: 'Fit and gap clarity',
    stella:  'Explains why a role fits and highlights gaps for each opportunity',
    li:      'Limited insights, varies by feature',
    indeed:  'Limited',
    liTier:  'partial', indeedTier: 'partial',
  },
  {
    feature: 'Actionable guidance',
    stella:  'Specific suggestions to improve for roles like this',
    li:      'Limited guidance depending on feature',
    indeed:  'Not a core feature',
    liTier:  'partial', indeedTier: 'no',
  },
  {
    feature: 'How jobs reach you',
    stella:  'No endless scrolling. 3 highly curated roles delivered daily',
    li:      'Feed, search, and alerts',
    indeed:  'Search and alerts',
    liTier:  'partial', indeedTier: 'partial',
  },
  {
    feature: 'Personalized job memory',
    stella:  'Fresh opportunities prioritized based on what you\'ve already seen',
    li:      'Jobs may reappear based on reposts and ranking',
    indeed:  'Jobs may reappear across searches and alerts',
    liTier:  'partial', indeedTier: 'partial',
  },
  {
    feature: 'Company insights',
    stella:  'Structured, candidate-focused view of company context and hiring signals',
    li:      'Company pages with general information and activity',
    indeed:  'Basic company details and job-related information',
    liTier:  'partial', indeedTier: 'partial',
  },
  {
    feature: 'All-in-one experience',
    stella:  'Jobs, insights, and growth in a single, connected experience',
    li:      'Split across job search, networking, and learning experiences',
    indeed:  'Primarily job search',
    liTier:  'partial', indeedTier: 'no',
  },
]

const TIER_ICON = { yes: '✅', partial: '⚠️', no: '❌' }
const TIER_COLOR = {
  yes:     'text-green-700',
  partial: 'text-amber-600',
  no:      'text-rose-500',
}

function TierCell({ text, tier }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-sm leading-snug shrink-0 mt-0.5">{TIER_ICON[tier]}</span>
      <span className={`text-sm leading-snug ${TIER_COLOR[tier]}`}>{text}</span>
    </div>
  )
}

function Comparison() {
  return (
    <section className="py-20 px-5 bg-white">
      <div className="max-w-5xl mx-auto">

        {/* Headline + intro */}
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 leading-tight">
            Stop searching for jobs.<br className="hidden sm:block" />{' '}
            Start building the career you actually want.
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto leading-relaxed mb-4">
            Most platforms help you find opportunities. StellaPath helps you choose the right ones
            and become a stronger candidate for them.
          </p>
          <p className="text-slate-500 max-w-2xl mx-auto leading-relaxed text-sm">
            Today, job seekers spend hours scrolling through listings, applying to roles they were
            never truly a fit for, and getting rejected without knowing why. StellaPath does the
            work for you. Every morning, your most relevant opportunities are ready, along with
            clear insight into the role, the company, and how to move forward.
          </p>
        </div>

        {/* Section label */}
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest text-center mb-6">
          StellaPath vs Traditional Job Platforms
        </p>

        {/* Table */}
        <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-4 bg-slate-50 w-[22%]">
                    Feature
                  </th>
                  <th className="text-left text-xs font-semibold text-violet-700 uppercase tracking-wide px-5 py-4 bg-violet-50 w-[32%]">
                    StellaPath
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-4 bg-slate-50 w-[23%]">
                    LinkedIn
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-4 bg-slate-50 w-[23%]">
                    Indeed / ZipRecruiter
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-slate-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                  >
                    <td className="px-5 py-4 text-sm font-medium text-slate-800 align-top">
                      {row.feature}
                    </td>
                    <td className="px-5 py-4 bg-violet-50/60 align-top">
                      <div className="flex items-start gap-1.5">
                        <span className="text-sm leading-snug shrink-0 mt-0.5">✅</span>
                        <span className="text-sm font-medium text-slate-900 leading-snug">{row.stella}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <TierCell text={row.li} tier={row.liTier} />
                    </td>
                    <td className="px-5 py-4 align-top">
                      <TierCell text={row.indeed} tier={row.indeedTier} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-5 mt-4 justify-center text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span>✅</span> Full feature</span>
          <span className="flex items-center gap-1.5"><span>⚠️</span> Partial or limited</span>
          <span className="flex items-center gap-1.5"><span>❌</span> Not a core feature</span>
        </div>

        {/* Closing statement */}
        <p className="text-center text-base font-semibold text-slate-900 mt-10 max-w-2xl mx-auto leading-relaxed">
          Instead of applying to more jobs, StellaPath helps you apply to the right ones
          and become a stronger candidate for them.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <Link
            to="/signup"
            className="w-full sm:w-auto px-6 py-3 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors shadow-sm text-center"
          >
            Get started
          </Link>
          <Link
            to="/signin"
            className="w-full sm:w-auto px-6 py-3 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors text-center"
          >
            Sign in
          </Link>
        </div>

        {/* Legal disclaimer */}
        <p className="mt-8 text-xs text-slate-400 leading-relaxed text-center max-w-3xl mx-auto italic">
          Competitor features are based on publicly available information as of 2026 and may change
          without notice. Feature availability may vary by region, subscription level, or product
          updates. StellaPath features reflect capabilities available at launch. Career guidance,
          skill gap insights, company insights, and learning suggestions are provided for
          informational purposes only and do not guarantee job placement, interview selection,
          or hiring outcomes.
        </p>

      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="py-20 px-5 text-center">
      <div className="max-w-2xl mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center mx-auto mb-6">
          <Icon path={ICONS.sparkle} className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
          Start your career path with StellaPath
        </h2>
        <p className="text-slate-500 mb-8 leading-relaxed">
          Set up your profile in minutes and get personalized job recommendations that
          match your background and goals — not just your job title.
        </p>
        <Link to="/signup"
          className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors shadow-sm"
        >
          Get started free
          <Icon path={ICONS.arrow} className="w-4 h-4" />
        </Link>
        <p className="mt-4 text-xs text-slate-400">
          StellaPath provides guidance and recommendations, not employment guarantees.
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Landing() {
  const navigate = useNavigate()

  useEffect(() => {
    if (localStorage.getItem('userId')) navigate('/dashboard', { replace: true })
  }, [navigate])

  return (
    <div>
      <Hero />
      <ValueProps />
      <HowItWorks />
      <Differentiation />
      <Comparison />
      <FinalCTA />
    </div>
  )
}
