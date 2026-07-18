import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/app/rules/new")({ component: NewRulePage });

type RuleType = "pattern" | "semantic" | "composite";
type Severity = "low" | "medium" | "high" | "critical";
type Framework = "SEC" | "FINRA" | "FDA" | "GDPR" | "HIPAA" | "CCPA" | "custom";

const FRAMEWORKS: Framework[] = ["SEC", "FINRA", "FDA", "GDPR", "HIPAA", "CCPA", "custom"];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];
const RULE_TYPES: { value: RuleType; label: string; desc: string }[] = [
  { value: "pattern", label: "Pattern", desc: "Regex and keyword matching — fast and deterministic." },
  { value: "semantic", label: "Semantic", desc: "AI-powered (GPT-4o) — catches nuanced violations regex can't." },
  { value: "composite", label: "Composite", desc: "Combine rules with AND/OR logic chains." },
];

function NewRulePage() {
  const [name, setName] = useState("");
  const [type, setType] = useState<RuleType>("pattern");
  const [framework, setFramework] = useState<Framework>("SEC");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [description, setDescription] = useState("");
  const [configJson, setConfigJson] = useState(getDefaultConfig("pattern"));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  function getDefaultConfig(t: RuleType): string {
    if (t === "pattern") {
      return JSON.stringify({
        type: "pattern",
        patterns: [
          { id: "p1", label: "Example match", keywords: ["example"], caseSensitive: false }
        ],
        matchLogic: "any",
      }, null, 2);
    }
    if (t === "semantic") {
      return JSON.stringify({
        type: "semantic",
        prompt: "You are a compliance reviewer for {framework}. Review the following text for violations of: {rule_description}. Respond with JSON.",
        framework: "SEC",
        ruleDescription: "Describe what constitutes a violation here...",
        model: "gpt-4o",
        temperature: 0.1,
        confidenceThreshold: 0.7,
      }, null, 2);
    }
    return JSON.stringify({
      type: "composite",
      config: {
        logic: "AND",
        rules: [{ ruleId: "rule-uuid-here" }],
      },
    }, null, 2);
  }

  const handleTypeChange = (t: RuleType) => {
    setType(t);
    setConfigJson(getDefaultConfig(t));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    let config;
    try { config = JSON.parse(configJson); }
    catch { setMessage({ type: "error", text: "Invalid JSON in config editor." }); setSaving(false); return; }

    try {
      const res = await fetch("/api/v1/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          config,
          severity,
          framework,
          description,
          isActive: true,
        }),
      });
      if (res.status === 401) { window.location.href = "/login"; return; }
      const json = await res.json();
      if (res.ok) {
        // Redirect to the rule detail page
        window.location.href = `/app/rules/${json.id}`;
      } else {
        setMessage({ type: "error", text: json.error?.message || "Failed to create rule." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Network error." });
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="mb-6">
        <a href="/app/rules" className="text-sm text-gray-400 hover:text-gray-200">&larr; Back to Rules</a>
      </div>
      <h1 className="text-2xl font-bold text-white">Create Rule</h1>
      <p className="mt-1 text-gray-400">Define a new compliance rule.</p>

      {message && (
        <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${message.type === "success" ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300">Rule Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 block w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="e.g., No guaranteed returns claim" />
        </div>

        {/* Type Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300">Rule Type</label>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {RULE_TYPES.map(rt => (
              <button key={rt.value} type="button" onClick={() => handleTypeChange(rt.value)}
                className={`rounded-xl border p-4 text-left transition ${
                  type === rt.value
                    ? "border-indigo-500 bg-indigo-900/20 ring-1 ring-indigo-500"
                    : "border-gray-700 bg-gray-900 hover:border-gray-600"
                }`}>
                <div className="text-sm font-semibold text-white">{rt.label}</div>
                <div className="mt-1 text-xs text-gray-400">{rt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Framework + Severity row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-300">Framework</label>
            <select value={framework} onChange={e => setFramework(e.target.value as Framework)}
              className="mt-1 block w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              {FRAMEWORKS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Severity</label>
            <select value={severity} onChange={e => setSeverity(e.target.value as Severity)}
              className="mt-1 block w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-300">Description (optional)</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Brief description of what this rule checks" />
        </div>

        {/* Config Editor */}
        <div>
          <label className="block text-sm font-medium text-gray-300">Rule Configuration (JSON)</label>
          <textarea value={configJson} onChange={e => setConfigJson(e.target.value)}
            rows={14}
            className="mt-1 block w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 font-mono text-xs text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            spellCheck={false} />
          <p className="mt-1 text-xs text-gray-500">Edit the JSON config to define your rule's matching behavior.</p>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {saving ? "Creating…" : "Create Rule"}
          </button>
          <a href="/app/rules" className="text-sm text-gray-400 hover:text-gray-200">Cancel</a>
        </div>
      </form>
    </div>
  );
}
