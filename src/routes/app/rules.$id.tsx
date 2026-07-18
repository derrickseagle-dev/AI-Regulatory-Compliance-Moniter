import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";

export const Route = createFileRoute("/app/rules/$id")({ component: RuleDetailPage });

interface Rule {
  id: string;
  name: string;
  type: "pattern" | "semantic" | "composite";
  config: any;
  severity: "low" | "medium" | "high" | "critical";
  framework: string;
  isActive: boolean;
  ruleSetId: string;
  description?: string;
  createdAt: string;
}

function RuleDetailPage() {
  const { id } = Route.useParams();
  const [rule, setRule] = useState<Rule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [configJson, setConfigJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: string; text: string } | null>(null);

  // Test sandbox state
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const loadRule = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/rules/${id}`);
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (res.status === 404) { setError("Rule not found."); return; }
      const json = await res.json();
      setRule(json);
      setConfigJson(JSON.stringify(json.config, null, 2));
    } catch (err) { setError("Failed to load rule."); console.error(err); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { loadRule(); }, [loadRule]);

  const handleSaveConfig = async () => {
    if (!rule) return;
    setSaving(true);
    setSaveMsg(null);
    let config;
    try { config = JSON.parse(configJson); }
    catch { setSaveMsg({ type: "error", text: "Invalid JSON." }); setSaving(false); return; }

    try {
      const res = await fetch(`/api/v1/rules/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (res.ok) {
        setRule({ ...rule, config });
        setEditing(false);
        setSaveMsg({ type: "success", text: "Rule updated." });
      } else {
        const j = await res.json();
        setSaveMsg({ type: "error", text: j.error?.message || "Update failed." });
      }
    } catch { setSaveMsg({ type: "error", text: "Network error." }); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async () => {
    if (!rule) return;
    try {
      await fetch(`/api/v1/rules/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      setRule({ ...rule, isActive: !rule.isActive });
    } catch (err) { console.error(err); }
  };

  const handleTest = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/v1/rules/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText }),
      });
      const json = await res.json();
      setTestResult(json);
    } catch (err) {
      setTestResult({ error: "Test failed." });
    } finally { setTesting(false); }
  };

  const typeBadge = (t: string) => {
    const c: Record<string, string> = { pattern: "bg-cyan-900/40 text-cyan-400 border-cyan-700/50", semantic: "bg-purple-900/40 text-purple-400 border-purple-700/50", composite: "bg-amber-900/40 text-amber-400 border-amber-700/50" };
    return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${c[t] || "bg-gray-800 text-gray-400"}`}>{t}</span>;
  };

  const severityBadge = (s: string) => {
    const c: Record<string, string> = {
      low: "bg-gray-800 text-gray-300", medium: "bg-yellow-900/40 text-yellow-400",
      high: "bg-orange-900/40 text-orange-400", critical: "bg-red-900/40 text-red-400",
    };
    return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${c[s] || c.low}`}>{s}</span>;
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return d; }
  };

  if (loading) return <div className="py-12 text-center text-gray-500">Loading…</div>;
  if (error) return <div className="py-12 text-center"><p className="text-red-400">{error}</p><a href="/app/rules" className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300">&larr; Back to Rules</a></div>;
  if (!rule) return null;

  return (
    <div>
      <div className="mb-6">
        <a href="/app/rules" className="text-sm text-gray-400 hover:text-gray-200">&larr; Back to Rules</a>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{rule.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {typeBadge(rule.type)}
            <span className="text-sm text-gray-400">{rule.framework}</span>
            {severityBadge(rule.severity)}
            <button onClick={handleToggleActive}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                rule.isActive ? "bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60" : "bg-gray-800 text-gray-500 hover:bg-gray-700"
              }`}>
              {rule.isActive ? "Active" : "Disabled"}
            </button>
          </div>
          {rule.description && <p className="mt-2 text-sm text-gray-500">{rule.description}</p>}
          <p className="mt-1 text-xs text-gray-600">Created {formatDate(rule.createdAt)}</p>
        </div>
        <button onClick={() => setEditing(!editing)}
          className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 transition">
          {editing ? "Cancel Edit" : "Edit Config"}
        </button>
      </div>

      {saveMsg && (
        <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${saveMsg.type === "success" ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>
          {saveMsg.text}
        </div>
      )}

      {/* Config Section */}
      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Configuration</h2>
        {editing ? (
          <div className="mt-4 space-y-4">
            <textarea value={configJson} onChange={e => setConfigJson(e.target.value)}
              rows={16}
              className="block w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 font-mono text-xs text-gray-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              spellCheck={false} />
            <button onClick={handleSaveConfig} disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        ) : (
          <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs text-gray-300 font-mono">
            {JSON.stringify(rule.config, null, 2)}
          </pre>
        )}
      </div>

      {/* Test Sandbox */}
      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Test Sandbox</h2>
        <p className="mt-1 text-sm text-gray-400">Paste sample text below to see what this rule flags.</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-gray-300">Sample Text</label>
            <textarea value={testText} onChange={e => setTestText(e.target.value)}
              rows={10}
              className="mt-1 block w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Paste document text here to test the rule…" />
            <button onClick={handleTest} disabled={testing || !testText.trim()}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              {testing ? "Testing…" : "Run Test"}
            </button>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-300">Results</label>
            <div className="mt-1 rounded-xl border border-gray-700 bg-gray-950 p-4 min-h-[200px]">
              {testing ? (
                <p className="text-sm text-gray-500">Running evaluation…</p>
              ) : testResult ? (
                testResult.error ? (
                  <p className="text-sm text-red-400">{testResult.error}</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Verdict:</span>
                      <span className={`font-semibold ${testResult.triggered ? "text-red-400" : "text-emerald-400"}`}>
                        {testResult.triggered ? "VIOLATION FOUND" : "CLEAR"}
                      </span>
                    </div>
                    {testResult.confidence !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">Confidence:</span>
                        <span className="text-white">{(testResult.confidence * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    {testResult.reasoning && (
                      <div>
                        <span className="text-gray-400">Reasoning:</span>
                        <p className="mt-1 text-gray-300">{testResult.reasoning}</p>
                      </div>
                    )}
                    {testResult.evidenceText && (
                      <div>
                        <span className="text-gray-400">Evidence:</span>
                        <p className="mt-1 rounded-lg bg-gray-900 p-2 font-mono text-xs text-yellow-300">{testResult.evidenceText}</p>
                      </div>
                    )}
                    {testResult.findings && testResult.findings.length > 0 && (
                      <div>
                        <span className="text-gray-400">Findings ({testResult.findings.length}):</span>
                        <ul className="mt-1 space-y-1">
                          {testResult.findings.map((f: any, i: number) => (
                            <li key={i} className="rounded-lg bg-gray-900 p-2 text-xs">
                              <span className="text-cyan-400">[{f.patternId}]</span>{" "}
                              <span className="text-gray-300">{f.label}:</span>{" "}
                              <span className="text-yellow-300">"{f.matchedText}"</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {testResult.costIncurred !== undefined && testResult.costIncurred > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>Cost:</span>
                        <span>${testResult.costIncurred.toFixed(6)}</span>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <p className="text-sm text-gray-600">Paste text and click "Run Test" to see results.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
