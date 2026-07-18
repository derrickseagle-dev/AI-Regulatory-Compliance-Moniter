import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";

export const Route = createFileRoute("/app/documents")({ component: DocumentsPage });

function DocumentsPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/documents?limit=50");
      if (res.status === 401) { window.location.href = "/login"; return; }
      const json = await res.json();
      setDocs(json.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files || files.length === 0) return;
    setUploading(true); setMessage(null);
    const formData = new FormData();
    for (const file of Array.from(files)) formData.append("files", file);
    try {
      const res = await fetch("/api/v1/ingest", { method: "POST", body: formData });
      if (res.status === 401) { window.location.href = "/login"; return; }
      const json = await res.json();
      setMessage({ type: json.succeeded > 0 ? "success" : "error", text: `${json.succeeded || 0} uploaded, ${json.failed || 0} failed.` });
      loadDocuments();
    } catch (err) { setMessage({ type: "error", text: "Upload failed." }); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const statusBadge = (status: string) => {
    const c: Record<string, string> = { pending: "bg-gray-700 text-gray-300", processing: "bg-blue-900/50 text-blue-400", processed: "bg-emerald-900/50 text-emerald-400", failed: "bg-red-900/50 text-red-400" };
    return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${c[status] || c.pending}`}>{status}</span>;
  };

  const formatDate = (d: string) => { try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return d; } };
  const formatSize = (b: number | null) => { if (!b) return "—"; if (b < 1024) return `${b} B`; if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`; return `${(b/(1024*1024)).toFixed(1)} MB`; };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white">Documents</h1><p className="mt-1 text-gray-400">Upload and manage compliance documents.</p></div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
          <UploadIcon /> {uploading ? "Uploading…" : "Upload"}
          <input type="file" multiple accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>
      {message && <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${message.type === "success" ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>{message.text}</div>}
      <div className="mt-6">
        {loading ? <div className="py-12 text-center text-gray-500">Loading…</div> :
         docs.length === 0 ? <div className="rounded-2xl border border-dashed border-gray-800 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-800"><UploadIcon /></div><h3 className="mt-4 text-sm font-semibold text-white">No documents yet</h3><p className="mt-1 text-sm text-gray-500">Upload PDF, DOCX, or TXT files.</p></div> :
         <div className="overflow-hidden rounded-2xl border border-gray-800"><table className="w-full"><thead><tr className="border-b border-gray-800 bg-gray-900/50"><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">File</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th><th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:table-cell">Size</th><th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 lg:table-cell">Uploaded</th></tr></thead><tbody className="divide-y divide-gray-800">{docs.map((doc: any) => (
           <tr key={doc.id} className="hover:bg-gray-900/30">
             <td className="px-6 py-4"><span className="text-sm font-medium text-white">{doc.filename}</span></td>
             <td className="px-6 py-4">{statusBadge(doc.status)}</td>
             <td className="hidden px-6 py-4 text-sm text-gray-400 sm:table-cell">{formatSize(doc.fileSize)}</td>
             <td className="hidden px-6 py-4 text-sm text-gray-500 lg:table-cell">{formatDate(doc.createdAt)}</td>
           </tr>
         ))}</tbody></table></div>}
      </div>
    </div>
  );
}

function UploadIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>; }
