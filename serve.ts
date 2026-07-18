// Production server for Regula AI.
// Bun runs TypeScript natively, so we can import from ~/lib directly.
// For production, compile with: bun build --target=bun serve.ts --outdir=dist-server
import handler from "./dist/server/server.js";
import { getDb, tenants, users, documents } from "./src/lib/db/index";
import { eq, and, desc, count } from "drizzle-orm";
import {
  hashPassword, verifyPassword, createSession, validateSession,
  destroySession, getSessionToken, setSessionCookie, clearSessionCookie,
} from "./src/lib/auth/index";
import { auditEvents } from "./src/lib/audit/index";
import { ingestDocument } from "./src/lib/ingestion/pipeline";
import { z } from "zod";

const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;

// ── Helpers ────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function errJson(code: string, message: string, status = 400): Response {
  return json({ error: { code, message } }, status);
}
async function getAuthUser(req: Request) {
  const token = getSessionToken(req);
  if (!token) return null;
  return validateSession(token);
}

// ── Auth Handlers ──────────────────────────────────────────

const signupSchema = z.object({
  email: z.string().email(), password: z.string().min(8),
  name: z.string().min(1).max(255).optional(),
  tenantName: z.string().min(1).max(255),
  tenantSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
});

async function handleAuthSignup(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const p = signupSchema.safeParse(body);
    if (!p.success) return json({ error: { code: "VALIDATION_ERROR", message: "Invalid input", details: p.error.issues } }, 400);
    const { email, password, name, tenantName, tenantSlug } = p.data;
    const db = getDb();

    const [et] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
    if (et) return errJson("CONFLICT", "Company slug already taken.", 409);

    const [tenant] = await db.insert(tenants).values({ name: tenantName, slug: tenantSlug, tier: "starter" }).returning();
    const [eu] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), eq(users.tenantId, tenant.id))).limit(1);
    if (eu) return errJson("CONFLICT", "User already exists.", 409);

    const ph = await hashPassword(password);
    const [user] = await db.insert(users).values({ email, passwordHash: ph, name: name || email.split("@")[0], role: "owner", tenantId: tenant.id }).returning();
    const token = await createSession(user.id);
    await auditEvents.userLogin(tenant.id, user.id, { action: "signup", email: user.email });
    return setSessionCookie(json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, tier: tenant.tier } }), token);
  } catch (err) { console.error("Signup:", err); return errJson("INTERNAL_ERROR", "Unexpected error.", 500); }
}

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1), tenantSlug: z.string().min(1) });

async function handleAuthLogin(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const p = loginSchema.safeParse(body);
    if (!p.success) return json({ error: { code: "VALIDATION_ERROR", message: "Invalid input", details: p.error.issues } }, 400);
    const { email, password, tenantSlug } = p.data;
    const db = getDb();
    const [tenant] = await db.select({ id: tenants.id, name: tenants.name, slug: tenants.slug }).from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
    if (!tenant) return errJson("NOT_FOUND", "Company not found.", 404);
    const [user] = await db.select({ id: users.id, email: users.email, passwordHash: users.passwordHash, name: users.name, role: users.role }).from(users).where(and(eq(users.email, email), eq(users.tenantId, tenant.id))).limit(1);
    if (!user || !(await verifyPassword(password, user.passwordHash))) return errJson("INVALID_CREDENTIALS", "Invalid email or password.", 401);
    const token = await createSession(user.id);
    await auditEvents.userLogin(tenant.id, user.id, { action: "login", email: user.email });
    return setSessionCookie(json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } }), token);
  } catch (err) { console.error("Login:", err); return errJson("INTERNAL_ERROR", "Unexpected error.", 500); }
}

async function handleAuthLogout(req: Request): Promise<Response> {
  try { const t = getSessionToken(req); if (t) await destroySession(t); return clearSessionCookie(json({ success: true })); }
  catch { return errJson("INTERNAL_ERROR", "Logout failed.", 500); }
}

async function handleAuthMe(req: Request): Promise<Response> {
  const user = await getAuthUser(req);
  if (!user) return json({ user: null });
  return json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId, tenantSlug: user.tenantSlug, tenantTier: user.tenantTier } });
}

// ── Document Handlers ─────────────────────────────────────

async function handleIngest(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Authentication required.", 401);
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) return errJson("INVALID_CONTENT_TYPE", "Expected multipart/form-data.", 400);
    const fd = await req.formData();
    const files = fd.getAll("files") as File[];
    const sf = fd.get("file") as File | null;
    const all = files.length > 0 ? files : sf ? [sf] : [];
    if (all.length === 0) return errJson("VALIDATION_ERROR", "No files.", 400);
    const MAX = 10 * 1024 * 1024;
    const OK = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    const results: any[] = [];
    for (const f of all) {
      if (f.size > MAX) { results.push({ id: "", filename: f.name, status: "failed", error: "Too large (max 10MB)" }); continue; }
      if (f.type && !OK.includes(f.type)) { results.push({ id: "", filename: f.name, status: "failed", error: `Unsupported: ${f.type}` }); continue; }
      try {
        const buf = Buffer.from(await f.arrayBuffer());
        const r = await ingestDocument(buf, f.name, f.type || "application/octet-stream", user);
        await auditEvents.documentUploaded(user.tenantId, r.documentId, { filename: f.name, fileSize: f.size });
        results.push({ id: r.documentId, filename: f.name, status: r.status });
      } catch (err: any) { results.push({ id: "", filename: f.name, status: "failed", error: err.message }); }
    }
    return json({ documents: results, total: results.length, succeeded: results.filter(r => r.status !== "failed").length, failed: results.filter(r => r.status === "failed").length });
  } catch (err) { console.error("Ingest:", err); return errJson("INTERNAL_ERROR", "Ingestion failed.", 500); }
}

async function handleDocuments(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const conds = [eq(documents.tenantId, user.tenantId)];
    const [tr] = await db.select({ total: count() }).from(documents).where(and(...conds));
    const rows = await db.select({
      id: documents.id, filename: documents.filename, sourceType: documents.sourceType,
      status: documents.status, fileSize: documents.fileSize, pageCount: documents.pageCount,
      wordCount: documents.wordCount, createdAt: documents.createdAt, updatedAt: documents.updatedAt,
    }).from(documents).where(and(...conds)).orderBy(desc(documents.createdAt)).limit(limit).offset((page - 1) * limit);
    return json({ data: rows.map(r => ({ ...r, createdAt: String(r.createdAt), updatedAt: String(r.updatedAt) })), meta: { page, limit, total: tr?.total ?? 0, totalPages: Math.ceil((tr?.total ?? 0) / limit) } });
  } catch (err) { console.error("Documents:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

// ── Server ─────────────────────────────────────────────────

const freePort = `for _ in $(seq 1 25); do pids=$(lsof -t -iTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true); if [ -z "$pids" ]; then exit 0; fi; kill $pids 2>/dev/null || true; sleep 0.2; done`;

for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT, hostname: HOST,
      async fetch(req) {
        const { pathname } = new URL(req.url);
        try {
          if (pathname === "/api/auth/signup" && req.method === "POST") return handleAuthSignup(req);
          if (pathname === "/api/auth/login" && req.method === "POST") return handleAuthLogin(req);
          if (pathname === "/api/auth/logout" && req.method === "POST") return handleAuthLogout(req);
          if (pathname === "/api/auth/me" && req.method === "GET") return handleAuthMe(req);
          if (pathname === "/api/v1/ingest" && req.method === "POST") return handleIngest(req);
          if (pathname === "/api/v1/documents" && req.method === "GET") return handleDocuments(req);
        } catch (e) { console.error("API error:", e); }
        if (pathname !== "/") { const f = Bun.file(CLIENT_DIR + pathname); if (await f.exists()) return new Response(f); }
        return (handler as any).fetch(req);
      },
    });
    break;
  } catch (err) { if (attempt >= 10) throw err; await Bun.sleep(200); }
}
console.log(`Regula AI on http://${HOST}:${PORT}`);
