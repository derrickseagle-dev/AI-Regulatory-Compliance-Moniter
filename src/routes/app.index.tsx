import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({ component: DashboardHome });

function DashboardHome() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      <p className="mt-1 text-gray-400">Welcome to Regula AI. Your compliance monitoring dashboard.</p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Documents" value="—" subtitle="Upload and monitor documents" href="/app/documents" />
        <StatCard title="Open Alerts" value="—" subtitle="Active compliance alerts" href="/app/alerts" />
        <StatCard title="Rules Active" value="—" subtitle="Compliance rules" href="/app/rules" />
      </div>
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
        <div className="mt-4"><a href="/app/documents" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500"><UploadIcon /> Upload Documents</a></div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, href }: { title: string; value: string; subtitle: string; href: string }) {
  return <a href={href} className="rounded-2xl border border-gray-800 bg-gray-900 p-6 transition hover:border-gray-700"><p className="text-sm font-medium text-gray-400">{title}</p><p className="mt-2 text-3xl font-bold text-white">{value}</p><p className="mt-1 text-sm text-gray-500">{subtitle}</p></a>;
}

function UploadIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>; }
