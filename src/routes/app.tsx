import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/app")({
  component: AppShell,
});

function AppShell() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unackedCount, setUnackedCount] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => {
        if (!data.user) window.location.href = "/login";
        else setUser(data.user);
      })
      .catch(() => window.location.href = "/login")
      .finally(() => setLoading(false));
  }, []);

  // Poll for unacknowledged alert count
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

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-950"><p className="text-gray-400">Loading…</p></div>;
  }

  if (!user) return null;

  const navItems = [
    { label: "Dashboard", href: "/app" },
    { label: "Documents", href: "/app/documents" },
    { label: "Rules", href: "/app/rules" },
    { label: "Alerts", href: "/app/alerts", badge: unackedCount },
  ];

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-gray-800 bg-gray-950 transition-transform lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center gap-2 border-b border-gray-800 px-6">
          <ShieldIcon />
          <span className="text-lg font-bold text-white">Regula AI</span>
        </div>
        <nav className="mt-4 px-3 space-y-1">
          {navItems.map(item => {
            const isActive = location.pathname === item.href || (item.href !== "/app" && location.pathname.startsWith(item.href));
            return (
              <a key={item.href} href={item.href} className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-indigo-600/20 text-indigo-400" : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"}`}>
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-400">{item.badge}</span>
                )}
              </a>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-gray-800 p-4">
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 hover:bg-gray-800/50 hover:text-gray-200">
            <LogoutIcon /> Sign Out
          </button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-gray-800 px-6">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 lg:hidden"><MenuIcon /></button>
          <div className="flex-1" />
          <div className="text-sm text-gray-500">{user?.email}</div>
        </header>
        <main className="flex-1 overflow-y-auto p-6"><Outlet /></main>
      </div>
    </div>
  );
}

function ShieldIcon() { return <svg className="h-6 w-6 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>; }
function LogoutIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>; }
function MenuIcon() { return <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>; }
