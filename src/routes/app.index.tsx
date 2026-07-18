import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/app/")({
  component: DashboardHome,
});

function DashboardHome() {
  const [stats, setStats] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    // Fetch dashboard summary
    fetch("/api/v1/dashboard/summary")
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(() => setError("Could not load dashboard data. Is DATABASE_URL configured?"));
    
    // Fetch recent alerts
    fetch("/api/v1/alerts?limit=5&sort=-createdAt")
      .then(r => r.json())
      .then(data => setAlerts(data.data || []))
      .catch(() => {});
  }, []);

  // Helper cards even without DB data
  const statCards = stats ? [
    { label: "Documents", value: stats.totalDocuments || 0, change: stats.documentsThisWeek ? `+${stats.documentsThisWeek} this week` : "" },
    { label: "Open Alerts", value: stats.openAlerts || 0, color: stats.openAlerts > 0 ? "text-red-400" : "text-green-400" },
    { label: "Active Rules", value: stats.activeRules || 0, change: "" },
    { label: "Evaluations Run", value: stats.evaluationsRun || 0, change: "today" },
  ] : [
    { label: "Documents", value: "—", change: "Connect DB" },
    { label: "Open Alerts", value: "—", change: "Connect DB" },
    { label: "Active Rules", value: "—", change: "Connect DB" },
    { label: "Evaluations Run", value: "—", change: "Connect DB" },
  ];

  // Pass/fail/warning health data
  const ruleHealth = stats?.ruleHealth || { pass: 0, fail: 0, warning: 0 };
  const healthTotal = ruleHealth.pass + ruleHealth.fail + ruleHealth.warning || 1;

  // Usage stats
  const usage = stats?.usage;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      {error && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(s => (
          <div key={s.label} className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <p className="text-sm text-gray-400">{s.label}</p>
            <p className={`mt-1 text-3xl font-bold ${s.color || "text-white"}`}>{s.value}</p>
            {s.change && <p className="mt-1 text-xs text-gray-500">{s.change}</p>}
          </div>
        ))}
      </div>

      {/* Usage Bar */}
      {usage && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Plan Usage</h2>
            <span className="rounded-full bg-indigo-900/40 border border-indigo-700/50 px-3 py-0.5 text-xs font-medium text-indigo-400">{usage.tierLabel}</span>
          </div>
          <div className="space-y-4">
            {/* Documents */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Documents this month</span>
                <span className="text-gray-300">
                  {usage.documents.current}
                  {usage.documents.limit > 0 ? ` / ${usage.documents.limit}` : " / ∞"}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-800">
                <div
                  className={`h-2 rounded-full transition-all ${usage.documents.pct >= 90 ? "bg-red-500" : usage.documents.pct >= 70 ? "bg-amber-500" : "bg-indigo-500"}`}
                  style={{ width: `${usage.documents.limit > 0 ? Math.min(usage.documents.pct, 100) : 0}%` }}
                />
              </div>
            </div>
            {/* Rules */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Rules</span>
                <span className="text-gray-300">
                  {usage.rules.current}
                  {usage.rules.limit > 0 ? ` / ${usage.rules.limit}` : " / ∞"}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-800">
                <div
                  className={`h-2 rounded-full transition-all ${usage.rules.pct >= 90 ? "bg-red-500" : usage.rules.pct >= 70 ? "bg-amber-500" : "bg-indigo-500"}`}
                  style={{ width: `${usage.rules.limit > 0 ? Math.min(usage.rules.pct, 100) : 0}%` }}
                />
              </div>
            </div>
            {/* Rule Sets */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Rule Sets</span>
                <span className="text-gray-300">
                  {usage.ruleSets.current}
                  {usage.ruleSets.limit > 0 ? ` / ${usage.ruleSets.limit}` : " / ∞"}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-800">
                <div
                  className={`h-2 rounded-full transition-all ${usage.ruleSets.pct >= 90 ? "bg-red-500" : usage.ruleSets.pct >= 70 ? "bg-amber-500" : "bg-indigo-500"}`}
                  style={{ width: `${usage.ruleSets.limit > 0 ? Math.min(usage.ruleSets.pct, 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Alerts Widget */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recent Alerts</h2>
            <a href="/app/alerts" className="text-sm text-indigo-400 hover:text-indigo-300">View all →</a>
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-500">No recent alerts. All clear!</p>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 5).map((a: any) => (
                <a key={a.id} href={`/app/alerts/${a.id}`} className="block rounded-lg border border-gray-800 bg-gray-800/30 p-3 hover:bg-gray-800/60 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{a.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{a.ruleName} · {a.documentName || "Unknown doc"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${severityBadge(a.severity)}`}>
                      {a.severity}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Rule Health Summary */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Rule Health</h2>
          {healthTotal === 1 && ruleHealth.pass === 0 ? (
            <p className="text-sm text-gray-500">No evaluation data yet. Upload documents and run rules to see health data.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1"><span className="text-green-400">Pass</span><span className="text-gray-400">{ruleHealth.pass}</span></div>
                <div className="h-2 rounded-full bg-gray-800"><div className="h-2 rounded-full bg-green-500" style={{ width: `${(ruleHealth.pass / healthTotal) * 100}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1"><span className="text-yellow-400">Warning</span><span className="text-gray-400">{ruleHealth.warning}</span></div>
                <div className="h-2 rounded-full bg-gray-800"><div className="h-2 rounded-full bg-yellow-500" style={{ width: `${(ruleHealth.warning / healthTotal) * 100}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1"><span className="text-red-400">Fail</span><span className="text-gray-400">{ruleHealth.fail}</span></div>
                <div className="h-2 rounded-full bg-gray-800"><div className="h-2 rounded-full bg-red-500" style={{ width: `${(ruleHealth.fail / healthTotal) * 100}%` }} /></div>
              </div>
            </div>
          )}
        </div>

        {/* Documents Pending Review */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Documents Pending Review</h2>
            <a href="/app/documents" className="text-sm text-indigo-400 hover:text-indigo-300">View all →</a>
          </div>
          <p className="text-sm text-gray-500">Upload documents to begin monitoring for compliance violations.</p>
          <a href="/app/documents" className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            Upload Documents
          </a>
        </div>
      </div>
    </div>
  );
}

function severityBadge(s: string) {
  const map: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400",
    high: "bg-orange-500/10 text-orange-400",
    medium: "bg-yellow-500/10 text-yellow-400",
    low: "bg-blue-500/10 text-blue-400",
  };
  return map[s] || "bg-gray-500/10 text-gray-400";
}
