export default function Contact() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-16">
      <div className="mb-10">
        <p className="text-xs font-semibold text-violet-600 uppercase tracking-widest mb-3">Contact</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Get in touch</h1>
        <p className="text-slate-500 leading-relaxed">
          We're a small team and we read every message. Reach out about anything —
          questions, feedback, or issues.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5 mb-10">
        {[
          {
            title: 'General questions',
            desc: 'Questions about how StellaPath works, features, or your account.',
            email: 'hello@stellapath.ai',
          },
          {
            title: 'Support',
            desc: 'Something not working? Report a bug or get help with your account.',
            email: 'support@stellapath.ai',
          },
        ].map(({ title, desc, email }) => (
          <div key={title} className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-1.5">{title}</h3>
            <p className="text-sm text-slate-500 mb-3 leading-relaxed">{desc}</p>
            <a
              href={`mailto:${email}`}
              className="text-sm font-medium text-violet-600 hover:underline"
            >
              {email}
            </a>
          </div>
        ))}
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-1.5">Report an issue</h3>
        <p className="text-sm text-slate-500 mb-3 leading-relaxed">
          If you encounter a bug, inaccurate data, or unexpected behavior, please send a
          brief description to our support team and we'll investigate promptly.
        </p>
        <a
          href="mailto:support@stellapath.ai?subject=Issue report"
          className="inline-block px-4 py-2 bg-white border border-slate-200 text-sm font-medium text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
        >
          Report an issue →
        </a>
      </div>
    </div>
  )
}
