import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-gray-400">Manage your plan, billing, and account preferences.</p>
      </div>
      <PlanSection />
      <UsageSection />
      <BillingHistorySection />
      <PreferencesSection />
    </div>
  );
}

// ── Plan Section ─────────────────────────────────────────────

function PlanSection() {
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    fetch("/api/v1/billing/plan")
      .then((r) => r.json())
      .then((data) => setPlan(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/v1/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/app/settings`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Could not open billing portal.");
      }
    } catch {
      alert("Network error.");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleUpgrade = async (tier: string) => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/v1/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          successUrl: `${window.location.origin}/app/settings?checkout=success`,
          cancelUrl: `${window.location.origin}/app/settings`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Could not start checkout.");
      }
    } catch {
      alert("Network error.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <Section title="Current Plan">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 rounded bg-gray-800" />
          <div className="h-4 w-48 rounded bg-gray-800" />
        </div>
      </Section>
    );
  }

  const tier = plan?.tier || "starter";
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  const subscriptionStatus = plan?.subscriptionStatus || "inactive";
  const stripeCustomerId = plan?.stripeCustomerId;

  const statusBadge = {
    active: "bg-green-500/10 text-green-400 ring-green-500/20",
    past_due: "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20",
    canceled: "bg-red-500/10 text-red-400 ring-red-500/20",
    incomplete: "bg-gray-500/10 text-gray-400 ring-gray-500/20",
    inactive: "bg-gray-500/10 text-gray-400 ring-gray-500/20",
  }[subscriptStatus] || "bg-gray-500/10 text-gray-400 ring-gray-500/20";

  return (
    <Section title="Current Plan">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold text-white">{tierLabel}</span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadge}`}>
              {subscriptStatus.replace("_", " ")}
            </span>
          </div>
          <p className="text-sm text-gray-400">
            {tier === "starter" && "$49/month — 100 docs, 3 rule sets, 1 user"}
            {tier === "professional" && "$249/month — 1,000 docs, 10 rule sets, 5 users, API access"}
            {tier === "enterprise" && "Custom pricing — unlimited everything, dedicated support"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stripeCustomerId && (
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-50"
            >
              {portalLoading ? "Loading…" : "Manage Subscription"}
            </button>
          )}
          {tier === "starter" && (
            <button
              onClick={() => handleUpgrade("professional")}
              disabled={checkoutLoading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {checkoutLoading ? "Loading…" : "Upgrade to Pro"}
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}

// ── Usage Section ────────────────────────────────────────────

function UsageSection() {
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/dashboard/summary")
      .then((r) => r.json())
      .then((data) => setUsage(data.usage || data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Section title="Usage This Month">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-24 rounded bg-gray-800" />
                <div className="h-4 w-16 rounded bg-gray-800" />
              </div>
              <div className="h-2 rounded-full bg-gray-800" />
            </div>
          ))}
        </div>
      </Section>
    );
  }

  const metrics = [
    { label: "Documents", key: "documents", current: usage?.documents?.current ?? 0, limit: usage?.documents?.limit ?? 100, pct: usage?.documents?.pct ?? 0 },
    { label: "Rule Sets", key: "ruleSets", current: usage?.ruleSets?.current ?? 0, limit: usage?.ruleSets?.limit ?? 3, pct: usage?.ruleSets?.pct ?? 0 },
    { label: "Rules", key: "rules", current: usage?.rules?.current ?? 0, limit: usage?.rules?.limit ?? 15, pct: usage?.rules?.pct ?? 0 },
  ];

  const tierLabel = usage?.tierLabel || "Starter";

  return (
    <Section title="Usage This Month">
      <div className="space-y-5">
        {metrics.map((m) => {
          const nearLimit = m.pct >= 80 && m.limit > 0;
          const atLimit = m.pct >= 100 && m.limit > 0;
          return (
            <div key={m.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-300">{m.label}</span>
                <span className="text-sm text-gray-400">
                  {m.current}{m.limit > 0 ? ` / ${m.limit}` : " / ∞"}
                  {nearLimit && !atLimit && (
                    <span className="ml-2 text-xs text-yellow-400">Near limit</span>
                  )}
                  {atLimit && (
                    <span className="ml-2 text-xs text-red-400">Limit reached</span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    atLimit ? "bg-red-500" : nearLimit ? "bg-yellow-500" : "bg-indigo-500"
                  }`}
                  style={{ width: `${Math.min(m.pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {metrics.some((m) => m.pct >= 80 && m.limit > 0) && tierLabel === "Starter" && (
        <div className="mt-5 rounded-xl border border-indigo-500/30 bg-indigo-600/10 px-4 py-3">
          <p className="text-sm text-indigo-300">
            You're approaching your {tierLabel} limits.{" "}
            <button
              onClick={() => {
                const btn = document.querySelector('[data-upgrade-btn]') as HTMLButtonElement;
                btn?.click();
              }}
              className="font-semibold text-indigo-200 underline hover:text-white"
            >
              Upgrade to Professional
            </button>{" "}
            for higher limits and more features.
          </p>
        </div>
      )}
    </Section>
  );
}

// ── Billing History ──────────────────────────────────────────

function BillingHistorySection() {
  return (
    <Section title="Billing History">
      <div className="rounded-lg border border-dashed border-gray-700 px-4 py-8 text-center">
        <p className="text-sm text-gray-500">
          Billing history will appear here once your subscription is active.
        </p>
        <p className="mt-1 text-xs text-gray-600">
          Manage invoices and payment methods from the{" "}
          <span className="text-indigo-400">Stripe Billing Portal</span>.
        </p>
      </div>
    </Section>
  );
}

// ── Preferences ──────────────────────────────────────────────

function PreferencesSection() {
  const [pref, setPref] = useState("daily");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.digestPreference) {
          setPref(data.user.digestPreference);
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/v1/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digestPreference: pref }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Email Preferences">
      <div className="flex items-center gap-4 flex-wrap">
        <label className="text-sm text-gray-300">Digest frequency:</label>
        <select
          value={pref}
          onChange={(e) => setPref(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="off">Off</option>
        </select>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </button>
      </div>
    </Section>
  );
}

// ── Section wrapper ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}
