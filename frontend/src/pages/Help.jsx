import { useState } from 'react'
import { Link } from 'react-router-dom'

const FAQS = [
  {
    q: 'How does StellaPath match jobs to me?',
    a: 'StellaPath scores each job against your profile using an AI model that evaluates multiple dimensions: skills alignment, experience level, industry background, career trajectory, salary fit, and work mode. You see a match score and a breakdown explaining why the role is or isn\'t a strong fit.',
  },
  {
    q: 'Does StellaPath apply to jobs for me?',
    a: 'No. StellaPath helps you identify and evaluate opportunities — the actual application is always done by you, directly on the employer\'s site. We surface and rank roles; you decide which ones to pursue.',
  },
  {
    q: 'How does feedback improve my results?',
    a: 'When you react to a recommendation (thumbs up or down), StellaPath records that signal and uses it to adjust how future roles are scored for you. Over time, the system learns your preferences — sector, company size, role type, culture signals — and weights matches accordingly.',
  },
  {
    q: 'What data does StellaPath use?',
    a: 'StellaPath uses the resume text you provide, the profile preferences you set, and your feedback reactions (thumbs up/down, clicks, applies). Job data is collected from public sources and employer job boards. We don\'t access your email, calendar, or external accounts unless you explicitly connect them.',
  },
  {
    q: 'How often are job matches updated?',
    a: 'New jobs are collected regularly and matched against user profiles. You\'ll receive email digests when strong new matches are found. You can also refresh your matches at any time from the dashboard.',
  },
  {
    q: 'How often are company insights updated?',
    a: 'Company insights are refreshed weekly based on job posting activity, hiring signals, and public data. The "last updated" timestamp on each company page shows when the data was last refreshed.',
  },
  {
    q: 'Are job matches guaranteed?',
    a: 'No. StellaPath provides recommendations based on the information you share and the AI\'s assessment of fit. Match scores are guidance, not guarantees. Hiring decisions are made by employers, not by StellaPath.',
  },
  {
    q: 'Can I trust the skill-gap analysis?',
    a: 'Skill gap analysis is based on comparing your profile text to the job description requirements. It\'s a useful signal, not a definitive assessment. Use it as a starting point for thinking about how to position yourself — not as a final verdict.',
  },
  {
    q: 'How do I update my profile?',
    a: 'Go to Profile in the sidebar at any time. You can re-upload your resume, update your role preferences, change salary expectations, and edit your description. StellaPath will use the updated profile for future matches.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Email support@stellapath.ai and we\'ll delete your account and all associated data within 5 business days.',
  },
]

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left flex items-start justify-between gap-4 py-4 hover:text-violet-700 transition-colors focus:outline-none"
      >
        <span className="text-sm font-medium text-slate-800">{q}</span>
        <svg
          className={`w-4 h-4 text-slate-400 shrink-0 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <p className="text-sm text-slate-500 leading-relaxed pb-4 pr-8">{a}</p>
      )}
    </div>
  )
}

export default function Help() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-16">
      <div className="mb-10">
        <p className="text-xs font-semibold text-violet-600 uppercase tracking-widest mb-3">Help</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Frequently asked questions</h1>
        <p className="text-slate-500 leading-relaxed">
          Common questions about how StellaPath works.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 px-6 mb-8">
        {FAQS.map(faq => (
          <FAQItem key={faq.q} {...faq} />
        ))}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center">
        <p className="text-sm text-slate-600 mb-3">
          Didn't find what you were looking for?
        </p>
        <Link
          to="/contact"
          className="inline-block px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors"
        >
          Contact us
        </Link>
      </div>
    </div>
  )
}
