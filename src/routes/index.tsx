import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-dvh">
      <Nav />
      <Hero />
      <HowItWorks />
      <Industries />
      <Signup />
      <Footer />
    </div>
  );
}

/* ── Nav ─────────────────────────────────────────────────── */

function Nav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#" className="flex items-center gap-2 font-bold text-lg tracking-tight text-white">
          <ShieldIcon />
          Regula AI
        </a>
        <div className="flex items-center gap-2">
           <a
             href="/login"
             className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300
                        transition hover:text-white hover:bg-gray-800"
           >
             Sign In
           </a>
           <a
             href="/signup"
             className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                        transition hover:bg-indigo-500 active:scale-[0.98]"
           >
             Get Started
           </a>
         </div>
        </div>
    </nav>
  );
}

/* ── Hero ────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-center px-4 pt-16 text-center">
      {/* subtle gradient glow */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(99,102,241,0.12),transparent)]"
        aria-hidden="true"
      />
      <div className="relative z-10 max-w-3xl">
        <span className="mb-4 inline-block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-sm font-medium text-indigo-300">
          Now accepting beta users
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
          AI-Powered Regulatory
          <br />
          <span className="bg-gradient-to-r from-indigo-400 to-blue-400 bg-clip-text text-transparent">
            Compliance Monitoring
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-400">
          Continuous monitoring of documents, communications, and AI model outputs —
          with explainable alerts and immutable audit trails purpose-built for heavily
          regulated industries.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href="#signup"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white
                       transition hover:bg-indigo-500 active:scale-[0.98]"
          >
            Get Early Access
            <ArrowRight />
          </a>
          <a
            href="#how-it-works"
            className="rounded-lg px-6 py-3 text-base font-medium text-gray-300 transition hover:text-white"
          >
            How it works →
          </a>
        </div>
        <div className="mt-8 text-sm text-gray-600">
          SOC 2 · Zero-trust architecture · Audit-ready by default
        </div>
      </div>
    </section>
  );
}

/* ── How it works ────────────────────────────────────────── */

const STEPS = [
  {
    num: "01",
    title: "Monitor",
    desc: "AI continuously scans documents, emails, chat transcripts, and model outputs in real time — across every communication channel your teams use.",
    highlight: "Continuous, real-time scanning",
  },
  {
    num: "02",
    title: "Alert",
    desc: "When a potential violation is detected, Regula AI generates an explainable alert with the specific regulation cited, the offending passage, and a risk score.",
    highlight: "Explainable, contextual alerts",
  },
  {
    num: "03",
    title: "Audit",
    desc: "Every detection, review decision, and remediation action is recorded in an immutable audit trail — ready for SEC, FINRA, FDA, or HIPAA regulators at a moment's notice.",
    highlight: "Immutable audit trails",
  },
];

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-6xl px-4 py-24 sm:px-6"
    >
      <div className="text-center">
        <span className="text-sm font-semibold uppercase tracking-widest text-indigo-400">
          How it works
        </span>
        <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
          Monitor → Alert → Audit
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-gray-400">
          Three pillars that give compliance teams confidence their AI systems — and
          human processes — stay audit-ready at all times.
        </p>
      </div>

      <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-gray-800 bg-gray-800/60 lg:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.num}
            className="relative bg-gray-900 p-8 lg:p-10"
          >
            <span className="text-5xl font-extrabold text-gray-800">
              {step.num}
            </span>
            <h3 className="mt-4 text-xl font-semibold text-white">
              {step.title}
            </h3>
            <p className="mt-3 text-gray-400 leading-relaxed">{step.desc}</p>
            <div className="mt-6 inline-block rounded-full border border-indigo-500/20 bg-indigo-500/5 px-3 py-1 text-xs font-medium text-indigo-400">
              {step.highlight}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Industries ──────────────────────────────────────────── */

const INDUSTRIES = [
  {
    name: "Banking",
    desc: "Capital markets, retail banking, wealth management, and fintech platforms deploying AI.",
    badges: ["SEC", "FINRA", "OCC"],
  },
  {
    name: "Insurance",
    desc: "Underwriting automation, claims processing AI, and customer-facing chatbots under tight consumer protection rules.",
    badges: ["GDPR", "NAIC", "CCPA"],
  },
  {
    name: "Pharma & Life Sciences",
    desc: "AI-driven drug discovery, clinical trial analysis, promotional material review, and pharmacovigilance.",
    badges: ["FDA", "HIPAA", "EMA"],
  },
];

function Industries() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="text-center">
        <span className="text-sm font-semibold uppercase tracking-widest text-indigo-400">
          Industries
        </span>
        <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
          Built for regulated enterprises
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-gray-400">
          Purpose-built for organizations under the strictest regulatory oversight,
          where explainability and auditability are non-negotiable.
        </p>
      </div>

      <div className="mt-16 grid gap-6 lg:grid-cols-3">
        {INDUSTRIES.map((ind) => (
          <div
            key={ind.name}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-8 transition hover:border-gray-700"
          >
            <h3 className="text-lg font-semibold text-white">{ind.name}</h3>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              {ind.desc}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {ind.badges.map((b) => (
                <span
                  key={b}
                  className="rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-300"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Beta Signup ─────────────────────────────────────────── */

function Signup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
      };

      if (res.ok && data.success) {
        setStatus("success");
        setMessage("You're on the list. We'll be in touch soon.");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(
          data.error ?? "Something went wrong. Please try again.",
        );
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <section id="signup" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="rounded-3xl border border-gray-800 bg-gradient-to-b from-gray-900 to-gray-950 px-6 py-16 sm:px-12 lg:px-20">
        <div className="mx-auto max-w-xl text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-indigo-400">
            Early Access
          </span>
          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            Join the Regula AI beta
          </h2>
          <p className="mt-4 text-gray-400">
            Be among the first compliance teams to deploy AI-powered monitoring.
            No spam, and you can unsubscribe anytime.
          </p>

          <form onSubmit={handleSubmit} className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                placeholder="work@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white
                           placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1
                           focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white
                           transition hover:bg-indigo-500 disabled:opacity-60 active:scale-[0.98]"
              >
                {status === "loading" ? "Submitting…" : "Join the Beta"}
              </button>
            </div>
            {message && (
              <p
                className={`mt-4 text-sm ${
                  status === "success" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {message}
              </p>
            )}
          </form>

          <p className="mt-4 text-xs text-gray-600">
            Your email is stored securely and never shared. We'll reach out with
            beta onboarding details.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ──────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-gray-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-8 text-sm text-gray-500 sm:px-6">
        <div className="flex items-center gap-2 font-semibold text-gray-400">
          <ShieldIcon />
          Regula AI
        </div>
        <p>&copy; {new Date().getFullYear()} Regula AI. All rights reserved.</p>
      </div>
    </footer>
  );
}

/* ── Icons (inline SVGs) ────────────────────────────────── */

function ShieldIcon() {
  return (
    <svg
      className="h-5 w-5 text-indigo-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
