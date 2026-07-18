import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/app/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [tierError, setTierError] = useState<string | null>(null);

  const fetchDocs = async (p: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/documents?page=${p}&limit=20`);
      const data = await r.json();
      setDocs(data.data || []);
      setMeta(data.meta || {});
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(page); }, [page]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setTierError(null);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    try {
      const res = await fetch("/api/v1/ingest", { method: "POST", body: fd });
      const json = await res.json();
      if (res.status === 402) {
        setTierError(json.error?.message || "Tier limit reached. Upgrade your plan to upload more documents.");
      } else {
        setPage(1); // reload
        setTimeout(() => fetchDocs(1), 1000);
      }
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = "";
    }
  }

  const statusBadge = (s: string) => {
    const m: Record<string, string> = {
      processed: "bg-green-500/10 text-green-400",
      processing: "bg-yellow-500/10 text-yellow-400",
      pending: "bg-gray-500/10 text-gray-400",
      failed: "bg-red-500/10 text-red-400",
    };
    return m[s] || "bg-gray-500/10 text-gray-400";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Documents</h1>
        <label className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-white transition ${uploading ? "bg-gray-600 cursor-wait" : "bg-indigo-600 hover:bg-indigo-500"}`}>
          {uploading ? "Uploading…" : "Upload"}
          <input type="file" multiple accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {tierError && (
        <div className="rounded-xl bg-amber-900/30 px-4 py-3 text-sm text-amber-400">{tierError}</div>
      )}

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/70 text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">File</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Size</th>
                <th className="px-4 py-3 text-left font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 w-40 rounded bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="h-5 w-16 rounded-full bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-12 rounded bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 rounded bg-gray-800" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-800">
            <UploadIcon />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-white">No documents yet</h3>
          <p className="mt-1 text-sm text-gray-500">Upload PDF, DOCX, or TXT files to begin monitoring for compliance violations.</p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            <UploadIconSmall /> Upload Your First Document
            <input type="file" multiple accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/70 text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">File</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Size</th>
                <th className="px-4 py-3 text-left font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {docs.map((d: any) => (
                <tr key={d.id} className="hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-200">{d.filename}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(d.status)}`}>{d.status}</span></td>
                  <td className="px-4 py-3 text-gray-400">{d.fileSize ? `${(d.fileSize / 1024).toFixed(1)} KB` : "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{meta.total} documents</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="rounded-lg bg-gray-800 px-3 py-1 hover:bg-gray-700 disabled:opacity-30">Prev</button>
            <span className="py-1">Page {page} of {meta.totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= meta.totalPages}
              className="rounded-lg bg-gray-800 px-3 py-1 hover:bg-gray-700 disabled:opacity-30">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadIcon() { return <svg className="h-6 w-6 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>; }
function UploadIconSmall() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>; }
