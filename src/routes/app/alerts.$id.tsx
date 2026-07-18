import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/app/alerts/$id")({
  component: AlertDetailPage,
});

function AlertDetailPage() {
  const { id } = Route.useParams();
  const [alert, setAlert] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [alertRes, auditRes] = await Promise.all([
          fetch(`/api/v1/alerts/${id}`),
          fetch(`/api/v1/audit?resourceType=alert&resourceId=${id}&limit=50`),
        ]);
        if (alertRes.ok) {
          const data = await alertRes.json();
          setAlert(data);
        }
        if (auditRes.ok) {
          const data = await auditRes.json();
          setTimeline(data.data || []);
        }
      } catch {}
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleAction(action: string) {
    setActionLoading(action);
    try {
      await fetch(`/api/v1/alerts/${id}/${action}`, { method: "POST" });
      const res = await fetch(`/api/v1/alerts/${id}`);
      if (res.ok) setAlert(await res.json());
    } catch {}
    setActionLoading("");
  }

  const severityBadge = (s: string) => {
    const m: Record<string, string> = {
      critical: "bg-red-500/20 text-red-400 border-red-500/30",
      high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    };
    return m[s] || "";
  };

  const statusBadge = (s: string) => {
    const m: Record<string, string> = {
      open: "bg-gray-500/20 text-gray-300 border-gray-500/30",
      acknowledged: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
      resolved: "bg-green-500/20 text-green-400 border-green-500/30",
      false_positive: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
    return m[s] || "";
  };

  const canAct = (s: string): string[] => {
    if (s === "open") return ["acknowledge", "dismiss"];
    if (s === "acknowledged") return ["resolve", "dismiss"];
    return [];
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><p className="text-gray-500">Loading alert…</p></div>;
  }

  if (!alert) {
    return <div className="space-y-4"><h1 className="text-2xl font-bold text-white">Alert Not Found</h1><p className="text-gray-400">This alert may have been removed or you may not have access.</p></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <a href="/app/alerts" className="text-sm text-indigo-400 hover:text-indigo-300 mb-2 inline-block">← Back to Alerts</a>
          <h1 className="text-2xl font-bold text-white">{alert.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {canAct(alert.status).map(action => (
            <button
              key={action}
              onClick={() => handleAction(action)}
              disabled={!!actionLoading}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40 ${
                action === "acknowledge" ? "bg-indigo-600 hover:bg-indigo-500" :
                action === "resolve" ? "bg-green-600 hover:bg-green-500" :
                "bg-gray-600 hover:bg-gray-500"
              }`}
            >
              {actionLoading === action ? "Processing…" : action.charAt(0).toUpperCase() + action.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <h2 className="text-lg font-semibold text-white mb-3">Evidence</h2>
            <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
              <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
                {highlightEvidence(alert.evidenceText, alert.evidenceText)}
              </pre>
            </div>
            {alert.evidenceContext && alert.evidenceContext !== alert.evidenceText && (
              <div className="mt-3">
                <h3 className="text-sm font-medium text-gray-400 mb-1">Surrounding Context</h3>
                <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
                  <p className="text-sm text-gray-400 leading-relaxed">{alert.evidenceContext}</p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <h2 className="text-lg font-semibold text-white mb-3">Analysis</h2>
            <p className="text-sm text-gray-300 leading-relaxed">{alert.reasoning}</p>
            {alert.confidence !== undefined && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-400">Confidence:</span>
                <div className="h-2 w-24 rounded-full bg-gray-700">
                  <div className={`h-2 rounded-full ${alert.confidence > 0.8 ? "bg-red-500" : alert.confidence > 0.6 ? "bg-yellow-500" : "bg-green-500"}`}
                    style={{ width: `${(alert.confidence * 100).toFixed(0)}%` }} />
                </div>
                <span className="text-xs text-gray-400">{(alert.confidence * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>

          {alert.recommendedAction && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5">
              <h2 className="text-lg font-semibold text-indigo-400 mb-2">Recommended Action</h2>
              <p className="text-sm text-gray-300">{alert.recommendedAction}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <h2 className="text-lg font-semibold text-white mb-3">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-gray-400">Status</dt><dd><span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge(alert.status)}`}>{alert.status.replace("_", " ")}</span></dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Severity</dt><dd><span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${severityBadge(alert.severity)}`}>{alert.severity}</span></dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Framework</dt><dd className="text-gray-200">{alert.framework || "N/A"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Rule</dt><dd className="text-gray-200 truncate max-w-[140px]">{alert.ruleName}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Rule Set</dt><dd className="text-gray-200">{alert.ruleSetName || "N/A"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Document</dt><dd className="text-gray-200 truncate max-w-[140px]">{alert.documentName || "N/A"}</dd></div>
              <hr className="border-gray-700" />
              <div className="flex justify-between"><dt className="text-gray-400">Created</dt><dd className="text-gray-500 text-xs">{alert.createdAt ? new Date(alert.createdAt).toLocaleString() : "—"}</dd></div>
              {alert.acknowledgedAt && (<div className="flex justify-between"><dt className="text-gray-400">Acknowledged</dt><dd className="text-gray-500 text-xs">{new Date(alert.acknowledgedAt).toLocaleString()}</dd></div>)}
              {alert.resolvedAt && (<div className="flex justify-between"><dt className="text-gray-400">Resolved</dt><dd className="text-gray-500 text-xs">{new Date(alert.resolvedAt).toLocaleString()}</dd></div>)}
              {alert.dismissedAt && (<div className="flex justify-between"><dt className="text-gray-400">Dismissed</dt><dd className="text-gray-500 text-xs">{new Date(alert.dismissedAt).toLocaleString()}</dd></div>)}
            </dl>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <h2 className="text-lg font-semibold text-white mb-3">Audit Timeline</h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-500">No audit events recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {timeline.map((e: any, i: number) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`h-2 w-2 rounded-full mt-1.5 ${i === timeline.length - 1 ? "bg-indigo-500" : "bg-gray-600"}`} />
                      {i < timeline.length - 1 && <div className="w-px flex-1 bg-gray-700 mt-1" />}
                    </div>
                    <div className="pb-3">
                      <p className="text-sm text-gray-300">{formatAuditEvent(e.eventType)}</p>
                      <p className="text-xs text-gray-500">{e.createdAt ? new Date(e.createdAt).toLocaleString() : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function highlightEvidence(text: string, evidence: string): string {
  if (!text || !evidence) return text || "—";
  const escaped = evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    const regex = new RegExp(`(${escaped})`, "gi");
    return text.replace(regex, '<mark class="bg-yellow-500/30 text-yellow-200 rounded px-0.5">$1</mark>');
  } catch { return text; }
}

function formatAuditEvent(eventType: string): string {
  const labels: Record<string, string> = {
    "alert.created": "Alert created", "alert.acknowledged": "Alert acknowledged",
    "alert.resolved": "Alert resolved", "alert.dismissed": "Alert dismissed",
    "alert.status_changed": "Status changed", "document.uploaded": "Document uploaded",
    "document.processed": "Document processed", "evaluation.completed": "Evaluation completed",
    "evaluation.run": "Evaluation run",
  };
  return labels[eventType] || eventType;
}
