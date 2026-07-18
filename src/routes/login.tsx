import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, tenantSlug }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message || "Login failed"); return; }
      window.location.href = "/app";
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center">
          <ShieldIcon />
          <h2 className="mt-4 text-2xl font-bold text-white">Sign in to Regula AI</h2>
        </div>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input type="text" required placeholder="Company slug" value={tenantSlug} onChange={e => setTenantSlug(e.target.value)} className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none" />
          <input type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none" />
          <input type="password" required placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none" />
          {error && <div className="rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-400">{error}</div>}
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-500">Don't have an account? <a href="/signup" className="text-indigo-400 hover:text-indigo-300">Create one</a></p>
      </div>
    </div>
  );
}

function ShieldIcon() {
  return <svg className="mx-auto h-8 w-8 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
}
