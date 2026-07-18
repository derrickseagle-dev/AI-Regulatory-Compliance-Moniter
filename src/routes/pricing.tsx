import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

interface TierCard {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  priceIdEnv: string;
}

const TIERS: TierCard[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$49",
    period: "/month",
    description: "For small compliance teams getting started with AI monitoring.",
    features: [
      "100 documents/month",
      "3 rule sets",
      "5 rules per set",
      "1 user",
      "Email support",
      "Basic audit trail",
      "GDPR & HIPAA frameworks",
    ],
    cta: "Start Free Trial",
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
  },
  {
    id: "professional",
    name: "Professional",
    price: "$249",
    period: "/month",
    description: "For growing teams that need deeper monitoring and API access.",
    features: [
      "1,000 documents/month",
      "10 rule sets",
      "20 rules per set",
      "5 users",
      "Priority support",
      "API access",
      "All regulatory frameworks",
      "Advanced audit trail",
      "Custom rule templates",
    ],
    cta: "Start Free Trial",
    highlighted: true,
    priceIdEnv: "STRIPE_PROFESSIONAL_PRICE_ID",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations with complex compliance requirements.",
    features: [
      "Unlimited documents",
      "Unlimited rule sets",
      "Unlimited rules",
      "Unlimited users",
      "Dedicated support",
      "SSO / SAML",
      "On-premises deployment option",
      "Custom framework support",
      "SLA guarantees",
      "Quarterly audit reports",
    ],
    cta: "Contact Sales",
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
  },
];

function PricingPage() {
  const handleSubscribe = async (tier: TierCard) => {
    if (tier.id === "enterprise") {
      window.location.href = "mailto:sales@regula.ai?subject=Enterprise%20Plan%20Inquiry";
      return;
    }

    try {
      const res = await fetch("/api/v1/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: tier.id,
          successUrl: `${window.location.origin}/app/settings?checkout=success`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Could not start checkout. Stripe may not be configured yet.");
      }
    } catch {
      alert("Network error. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <Link to="/" className="flex items-center gap-2">
          <svg className="h-8 w-8 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="text-xl font-bold text-white">Regula AI</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm text-gray-400 hover:text-white">Sign In</Link>
          <Link to="/signup" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Header */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-400">
          Choose the plan that fits your compliance monitoring needs. All plans include explainable alerts, immutable audit trails, and continuous monitoring.
        </p>
      </section>

      {/* Tiers */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-8 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`relative rounded-2xl border p-8 flex flex-col ${
                tier.highlighted
                  ? "border-indigo-500/40 bg-indigo-500/5 ring-1 ring-indigo-500/20"
                  : "border-gray-800 bg-gray-900/50"
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
                  Most Popular
                </div>
              )}
              <div>
                <h3 className="text-xl font-semibold text-white">{tier.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">{tier.price}</span>
                  {tier.period && <span className="text-gray-400">{tier.period}</span>}
                </div>
                <p className="mt-3 text-sm text-gray-400">{tier.description}</p>
              </div>
              <ul className="mt-8 flex-1 space-y-3">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-300">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSubscribe(tier)}
                className={`mt-8 w-full rounded-lg px-4 py-3 text-sm font-semibold transition ${
                  tier.highlighted
                    ? "bg-indigo-600 text-white hover:bg-indigo-500"
                    : "bg-gray-800 text-gray-200 hover:bg-gray-700"
                }`}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            All plans include a 14-day free trial. No credit card required.{" "}
            <Link to="/signup" className="text-indigo-400 hover:text-indigo-300">Get started now</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
