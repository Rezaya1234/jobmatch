import { Link } from 'react-router-dom'

export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <div className="mb-12">
        <p className="text-xs font-semibold text-violet-600 uppercase tracking-widest mb-3">About</p>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
          Why job search needs to change
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed">
          Most job seekers apply broadly, get little feedback, and have no idea whether
          a role is actually right for them. StellaPath is built to fix that.
        </p>
      </div>

      <div className="space-y-10">
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-3">Our mission</h2>
          <p className="text-slate-600 leading-relaxed">
            StellaPath helps candidates be more intentional about their career. Instead of
            flooding inboxes with applications and hoping something sticks, we help you
            understand exactly where you fit, where you fall short, and how to close the gap.
          </p>
          <p className="text-slate-600 leading-relaxed mt-3">
            Good career decisions require good information. We think every candidate deserves
            to know — before applying — whether a role is actually suited to their background
            and goals.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-3">The problem with job search today</h2>
          <ul className="space-y-3">
            {[
              'Job boards surface listings based on keywords, not fit.',
              "Candidates apply to dozens of roles they're underqualified or overqualified for.",
              "There's no signal about why applications fail or what to do differently.",
              "Career path thinking is absent — it's just a list of open positions.",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-slate-600">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-3">How StellaPath helps</h2>
          <ul className="space-y-3">
            {[
              'Every recommendation is scored against your actual background — not just title keywords.',
              "Fit and gap analysis tells you exactly where you match and where you'd need to grow.",
              'Feedback signals teach the system your taste, so results improve over time.',
              'Company insights give you real context before you invest time in an application.',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-slate-600">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-6 text-center">
          <p className="text-slate-700 font-medium mb-4">
            Ready to be more intentional about your job search?
          </p>
          <Link
            to="/signup"
            className="inline-block px-5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors"
          >
            Get started
          </Link>
        </div>
      </div>
    </div>
  )
}
