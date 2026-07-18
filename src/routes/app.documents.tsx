import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/app/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ total: 0, page: 1, totalPages: 1 });
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch(`/api/v1/documents?page=${page}&limit=20`)
      .then(r => r.json())
      .then(data => { setDocs(data.data || []); setMeta(data.meta || {}); })
      .catch(() => {});
  }, [page]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    try {
      await fetch("/api/v1/ingest", { method: "POST", body: fd });
      setPage(1); // reload
      setTimeout(() => {
        fetch("/api/v1/documents?page=1&limit=20")
          .then(r => r.json())
          .then(data => { setDocs(data.data || []); setMeta(data.meta || {}); });
      }, 1000);
    } finally {
      setUploading(false);
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
        <label className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          {uploading ? "Uploading…" : "Upload"}
          <input type="file" multiple accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-12 text-center">
          <p className="text-gray-500">No documents yet.</p>
          <p className="mt-1 text-sm text-gray-600">Upload PDF, DOCX, or TXT files to begin monitoring.</p>
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
