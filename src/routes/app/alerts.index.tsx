import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";

export const Route = createFileRoute("/app/alerts/")({
  component: AlertsPage,
});

type FilterState = {
  status: string;
  severity: string;
  framework: string;
  search: string;
  page: number;
};

function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    status: "",
    severity: "",
    framework: "",
    search: "",
    page: 1,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.severity) params.set("severity", filters.severity);
      if (filters.framework) params.set("framework", filters.framework);
      if (filters.search) params.set("search", filters.search);
      params.set("page", String(filters.page));
      params.set("limit", "20");
      params.set("sort", "-createdAt");

      const res = await fetch(`/api/v1/alerts?${params}`);
      const data = await res.json();
      setAlerts(data.data || []);
      setMeta(data.meta || { total: 0, page: 1, totalPages: 1 });
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // Poll for unacknowledged count
  const [unackedCount, setUnackedCount] = useState(0);
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/v1/alerts?status=open&limit=1");
        const data = await res.json();
        setUnackedCount(data.meta?.total || 0);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, []);

  async function handleBulkAction() {
    if (!bulkAction || selected.size === 0) return;
    const ids = Array.from(selected);
    for (const id of ids) {
      await fetch(`/api/v1/alerts/${id}/${bulkAction}`, { method: "POST" });
    }
    setSelected(new Set());
    setBulkAction("");
    fetchAlerts();
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === alerts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(alerts.map((a: any) => a.id)));
    }
  }

  const severityBadge = (s: string) => {
    const m: Record<string, string> = {
      critical: "bg-red-500/20 text-red-400 border-red-500/30",
      high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    };
    return m[s] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
  };

  const statusBadge = (s: string) => {
    const m: Record<string, string> = {
      open: "bg-gray-500/10 text-gray-300",
      acknowledged: "bg-indigo-500/10 text-indigo-400",
      resolved: "bg-green-500/10 text-green-400",
      false_positive: "bg-purple-500/10 text-purple-400",
    };
    return m[s] || "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          {unackedCount > 0 && (
            <p className="text-sm text-gray-400 mt-0.5">
              {unackedCount} unacknowledged alert{unackedCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">{selected.size} selected</span>
              <select
                value={bulkAction}
                onChange={e => setBulkAction(e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
              >
                <option value="">Bulk action…</option>
                <option value="acknowledge">Acknowledge</option>
                <option value="dismiss">Dismiss</option>
              </select>
              <button
                onClick={handleBulkAction}
                disabled={!bulkAction}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          )}
          <a
            href="/app/documents"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Upload Documents
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.status}
          onChange={e => setFilters({ ...filters, status: e.target.value, page: 1 })}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>
        <select
          value={filters.severity}
          onChange={e => setFilters({ ...filters, severity: e.target.value, page: 1 })}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filters.framework}
          onChange={e => setFilters({ ...filters, framework: e.target.value, page: 1 })}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
        >
          <option value="">All Frameworks</option>
          <option value="SEC">SEC</option>
          <option value="FINRA">FINRA</option>
          <option value="FDA">FDA</option>
          <option value="GDPR">GDPR</option>
          <option value="HIPAA">HIPAA</option>
          <option value="CCPA">CCPA</option>
          <option value="custom">Custom</option>
        </select>
        <input
          type="text"
          placeholder="Search alerts…"
          value={filters.search}
          onChange={e => setFilters({ ...filters, search: e.target.value, page: 1 })}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 w-48"
        />
      </div>

      {/* Alert List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-500">Loading alerts…</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-12 text-center">
          <p className="text-gray-500">No alerts found.</p>
          <p className="mt-1 text-sm text-gray-600">
            {Object.values(filters).some(v => v)
              ? "Try adjusting your filters."
              : "Upload documents and run rules to generate alerts."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/70 text-gray-400">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === alerts.length && alerts.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-600"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">Alert</th>
                <th className="px-4 py-3 text-left font-medium">Severity</th>
                <th className="px-4 py-3 text-left font-medium">Rule</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {alerts.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-800/30 cursor-pointer" onClick={() => window.location.href = `/app/alerts/${a.id}`}>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      className="rounded border-gray-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white truncate max-w-xs">{a.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{a.documentName || "Unknown"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${severityBadge(a.severity)}`}>
                      {a.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 max-w-[150px] truncate">{a.ruleName}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(a.status)}`}>
                      {a.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{meta.total} alerts total</span>
          <div className="flex gap-2">
            <button
              onClick={() => setFilters(f => ({ ...f, page: Math.max(1, f.page - 1) }))}
              disabled={filters.page <= 1}
              className="rounded-lg bg-gray-800 px-3 py-1 hover:bg-gray-700 disabled:opacity-30"
            >
              Prev
            </button>
            <span className="py-1">
              Page {meta.page} of {meta.totalPages}
            </span>
            <button
              onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
              disabled={filters.page >= meta.totalPages}
              className="rounded-lg bg-gray-800 px-3 py-1 hover:bg-gray-700 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
