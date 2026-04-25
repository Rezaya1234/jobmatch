import { Link } from 'react-router-dom'

const UPDATED = 'April 2025'

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <div className="mb-10">
        <p className="text-xs font-semibold text-violet-600 uppercase tracking-widest mb-3">Legal</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-xs text-slate-400">Last updated: {UPDATED}</p>
      </div>

      <div className="space-y-8 text-sm text-slate-600 leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Overview</h2>
          <p>
            StellaPath ("we", "us", "our") provides an AI-powered job matching and career guidance platform.
            This policy explains what data we collect, how we use it, and your rights regarding your data.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Data we collect</h2>
          <ul className="space-y-2 list-none">
            {[
              ['Resume & profile data', 'Your resume text, work experience, skills, and the preferences you set during onboarding. Used to generate and rank job recommendations.'],
              ['Feedback signals', 'Thumbs up/down reactions, clicks, and application events. Used to improve match quality over time.'],
              ['Job interaction data', 'Which roles you view, save, or apply to. Used to personalize future recommendations.'],
              ['Contact information', 'Your email address, used as your account identifier and for sending match digests.'],
              ['Connected network data (optional)', 'If you choose to connect a LinkedIn URL, it is stored against your profile. We do not access your LinkedIn data without explicit permission.'],
            ].map(([title, desc]) => (
              <li key={title} className="flex gap-3 items-start">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                <span><strong className="text-slate-800">{title}</strong> — {desc}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">How we use your data</h2>
          <p>
            We use your data solely to provide and improve the StellaPath service: generating match
            scores, personalizing recommendations, and sending email digests. We do not sell your
            data to third parties. We do not use your resume to train AI models without explicit consent.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Data retention</h2>
          <p>
            Your data is retained as long as your account is active. If you delete your account,
            we will remove your profile, resume, and feedback data within 5 business days.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Your rights</h2>
          <p>
            You can request a copy of your data, correct inaccurate information, or request deletion
            at any time. Contact <a href="mailto:support@stellapath.ai" className="text-violet-600 underline">support@stellapath.ai</a> to exercise these rights.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Cookies & local storage</h2>
          <p>
            StellaPath uses browser local storage to maintain your session (your user ID and email).
            We do not use third-party advertising or tracking cookies.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Changes to this policy</h2>
          <p>
            We may update this policy from time to time. Material changes will be communicated
            via email or an in-app notice before they take effect.
          </p>
        </section>

        <div className="border-t border-slate-100 pt-6 flex gap-4 text-xs text-slate-400">
          <Link to="/terms" className="hover:text-slate-600 underline">Terms of Service</Link>
          <Link to="/contact" className="hover:text-slate-600 underline">Contact us</Link>
        </div>
      </div>
    </div>
  )
}
