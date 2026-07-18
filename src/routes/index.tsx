import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <svg className="h-8 w-8 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="text-xl font-bold text-white">Regula AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm text-gray-400 hover:text-white">Sign In</Link>
          <Link to="/signup" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="mx-auto max-w-5xl px-6 py-24 text-center">
        <div className="mb-6 inline-flex items-center rounded-full bg-indigo-500/10 px-4 py-1.5 text-sm font-medium text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
          AI-Powered Regulatory Compliance
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
          Continuous compliance monitoring for regulated industries
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400">
          Regula AI monitors your documents, communications, and AI model outputs for regulatory violations — with explainable alerts and immutable audit trails. Built for banks, insurers, and pharmaceutical companies.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link to="/signup" className="rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-500">
            Start Free Trial
          </Link>
          <Link to="/login" className="rounded-lg bg-gray-800 px-6 py-3 text-base font-semibold text-gray-300 hover:bg-gray-700">
            Sign In
          </Link>
        </div>
      </main>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            { title: "Automated Monitoring", desc: "Continuously scan documents, emails, and AI outputs against regulatory frameworks like SEC, FINRA, FDA, GDPR, and HIPAA." },
            { title: "Explainable Alerts", desc: "Every alert cites the specific rule violated, the exact text, and the reasoning — no black-box decisions." },
            { title: "Immutable Audit Trail", desc: "Cryptographically chained audit log that proves compliance to regulators. Tamper-evident and exportable." },
          ].map(f => (
            <div key={f.title} className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <h3 className="text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
