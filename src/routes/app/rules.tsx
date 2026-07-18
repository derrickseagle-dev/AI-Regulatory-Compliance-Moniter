import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";

export const Route = createFileRoute("/app/rules")({ component: RulesPage });

interface Rule {
  id: string;
  name: string;
  type: "pattern" | "semantic" | "composite";
  severity: "low" | "medium" | "high" | "critical";
  framework: string;
  isActive: boolean;
  ruleSetId: string;
  ruleSetName?: string;
  createdAt: string;
}

function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/rules?limit=100");
      if (res.status === 401) { window.location.href = "/login"; return; }
      const json = await res.json();
      setRules(json.data || []);
    } catch (err) { setError("Failed to load rules."); console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const handleToggleActive = async (ruleId: string, current: boolean) => {
    try {
      await fetch(`/api/v1/rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }),
      });
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, isActive: !current } : r));
    } catch (err) { console.error(err); }
  };

  const handleSeedTemplates = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await fetch("/api/v1/rules/templates", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setSeedResult(`Created ${json.created} rules${json.skipped > 0 ? ` (${json.skipped} skipped due to tier limit)` : ""}.`);
        await loadRules();
      } else {
        setSeedResult(json.error?.message || "Failed to seed templates.");
      }
    } catch {
      setSeedResult("Network error.");
    } finally {
      setSeeding(false);
    }
  };

  const typeBadge = (t: string) => {
    const c: Record<string, string> = { pattern: "bg-cyan-900/40 text-cyan-400 border-cyan-700/50", semantic: "bg-purple-900/40 text-purple-400 border-purple-700/50", composite: "bg-amber-900/40 text-amber-400 border-amber-700/50" };
    return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${c[t] || "bg-gray-800 text-gray-400"}`}>{t}</span>;
  };

  const severityBadge = (s: string) => {
    const c: Record<string, string> = {
      low: "bg-gray-800 text-gray-300",
      medium: "bg-yellow-900/40 text-yellow-400",
      high: "bg-orange-900/40 text-orange-400",
      critical: "bg-red-900/40 text-red-400",
    };
    return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${c[s] || c.low}`}>{s}</span>;
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return d; }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rules</h1>
          <p className="mt-1 text-gray-400">Manage compliance rules and rule sets.</p>
        </div>
        <a href="/app/rules/new" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
          <PlusIcon /> New Rule
        </a>
      </div>

      {error && <div className="mt-4 rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-400">{error}</div>}
      {seedResult && (
        <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${seedResult.startsWith("Created") ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>
          {seedResult}
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="overflow-hidden rounded-2xl border border-gray-800">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Type</th>
                  <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:table-cell">Framework</th>
                  <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 md:table-cell">Severity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                  <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 lg:table-cell">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 w-32 rounded bg-gray-800" /></td>
                    <td className="px-6 py-4"><div className="h-5 w-16 rounded-full bg-gray-800" /></td>
                    <td className="hidden px-6 py-4 sm:table-cell"><div className="h-4 w-12 rounded bg-gray-800" /></td>
                    <td className="hidden px-6 py-4 md:table-cell"><div className="h-5 w-16 rounded-full bg-gray-800" /></td>
                    <td className="px-6 py-4"><div className="h-5 w-16 rounded-full bg-gray-800" /></td>
                    <td className="hidden px-6 py-4 lg:table-cell"><div className="h-4 w-24 rounded bg-gray-800" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : rules.length === 0 ? (
          <div>
            <div className="rounded-2xl border border-dashed border-gray-800 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-800">
                <RuleIcon />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white">No rules defined</h3>
              <p className="mt-1 text-sm text-gray-500">Create your first compliance rule to start monitoring.</p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <a href="/app/rules/new" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                  <PlusIcon /> Create Rule
                </a>
              </div>
            </div>

            {/* Quick Start Rules Card */}
            <div className="mt-6 rounded-2xl border border-indigo-500/30 bg-indigo-900/10 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <RocketIcon /> Quick Start Rules
                  </h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Jump-start your compliance monitoring with 5 pre-built rule templates covering GDPR, SEC, HIPAA, FINRA, and FDA.
                  </p>
                </div>
                <button
                  onClick={handleSeedTemplates}
                  disabled={seeding}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 shrink-0"
                >
                  {seeding ? "Seeding…" : "Add Quick Start Rules"}
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { name: "GDPR Personal Data", desc: "Detects emails, phones, IPs, addresses", icon: "🔒" },
                  { name: "SEC Forward-Looking", desc: "Future performance without disclaimers", icon: "📊" },
                  { name: "HIPAA PHI Detection", desc: "Medical record numbers, health IDs", icon: "🏥" },
                  { name: "FINRA Communication", desc: "Exaggerated claims, promissory language", icon: "💼" },
                  { name: "FDA Off-Label", desc: "Unapproved drug use suggestions", icon: "💊" },
                ].map((t) => (
                  <div key={t.name} className="rounded-xl border border-gray-700 bg-gray-900/50 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{t.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-white">{t.name}</p>
                        <p className="text-xs text-gray-500">{t.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-800">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Type</th>
                  <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:table-cell">Framework</th>
                  <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 md:table-cell">Severity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                  <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 lg:table-cell">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-900/30">
                    <td className="px-6 py-4">
                      <a href={`/app/rules/${rule.id}`} className="text-sm font-medium text-white hover:text-indigo-400">{rule.name}</a>
                      {rule.ruleSetName && <p className="text-xs text-gray-500">{rule.ruleSetName}</p>}
                    </td>
                    <td className="px-6 py-4">{typeBadge(rule.type)}</td>
                    <td className="hidden px-6 py-4 text-sm text-gray-400 sm:table-cell">{rule.framework}</td>
                    <td className="hidden px-6 py-4 md:table-cell">{severityBadge(rule.severity)}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(rule.id, rule.isActive)}
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                          rule.isActive
                            ? "bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60"
                            : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                        }`}
                      >
                        {rule.isActive ? "Active" : "Disabled"}
                      </button>
                    </td>
                    <td className="hidden px-6 py-4 text-sm text-gray-500 lg:table-cell">{formatDate(rule.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PlusIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>; }
function RuleIcon() { return <svg className="h-6 w-6 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>; }
function RocketIcon() { return <svg className="h-5 w-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" /><path d="M9 12H4l.5 3.5L9 15zM15 12h5l-.5 3.5L15 15z" /></svg>; }
