import { Link } from 'react-router-dom'

const UPDATED = 'April 2025'

export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <div className="mb-10">
        <p className="text-xs font-semibold text-violet-600 uppercase tracking-widest mb-3">Legal</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-xs text-slate-400">Last updated: {UPDATED}</p>
      </div>

      <div className="space-y-8 text-sm text-slate-600 leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Acceptance</h2>
          <p>
            By using StellaPath, you agree to these terms. If you do not agree, do not use the service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">What StellaPath provides</h2>
          <p>
            StellaPath is a career guidance and job matching platform. We provide recommendations,
            fit assessments, skill-gap analysis, and company insights to help you make more informed
            career decisions. We are not an employer, a recruiter, or an employment agency.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">No employment guarantees</h2>
          <p>
            StellaPath provides guidance and recommendations, not employment guarantees. Match scores
            and fit assessments are informational. Hiring decisions are made entirely by employers,
            not by StellaPath. We make no representations about your likelihood of being hired for
            any role.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">External job links</h2>
          <p>
            Job listings on StellaPath may link to third-party websites (employer career pages, job
            boards, applicant tracking systems). StellaPath is not responsible for the content,
            accuracy, or availability of these external sites. Applying to a job takes you off
            StellaPath and onto a third-party platform.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Company insights</h2>
          <p>
            Company insights on StellaPath are informational and based on publicly available data
            and job activity signals. They are not investment advice, and should not be used as
            the sole basis for major career decisions. Accuracy is not guaranteed.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Your responsibilities</h2>
          <ul className="space-y-2 list-none">
            {[
              'Provide accurate profile information to receive relevant recommendations.',
              'Make your own informed decisions about which roles to apply for.',
              'Review job descriptions and employer terms independently before applying.',
              'Do not use StellaPath for any unlawful purpose.',
            ].map((item, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Limitation of liability</h2>
          <p>
            StellaPath is provided "as is". We are not liable for any employment outcome, missed
            opportunity, or career decision made based on information from the platform.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Changes to terms</h2>
          <p>
            We may update these terms from time to time. Continued use of StellaPath after changes
            constitutes acceptance of the updated terms.
          </p>
        </section>

        <div className="border-t border-slate-100 pt-6 flex gap-4 text-xs text-slate-400">
          <Link to="/privacy" className="hover:text-slate-600 underline">Privacy Policy</Link>
          <Link to="/contact" className="hover:text-slate-600 underline">Contact us</Link>
        </div>
      </div>
    </div>
  )
}
