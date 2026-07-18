// Production server for Regula AI.
// Bun runs TypeScript natively, so we can import from ~/lib directly.
import handler from "./dist/server/server.js";
import { getDb, tenants, users, documents, rules, ruleSets } from "./src/lib/db/index";
import { eq, and, or, desc, count } from "drizzle-orm";
import {
  hashPassword, verifyPassword, createSession, validateSession,
  destroySession, getSessionToken, setSessionCookie, clearSessionCookie,
} from "./src/lib/auth/index";
import { auditEvents } from "./src/lib/audit/index";
import { ingestDocument } from "./src/lib/ingestion/pipeline";
import { evaluatePatternRule } from "./src/lib/rules/pattern-evaluator";
import { evaluateSemanticRule } from "./src/lib/rules/semantic-evaluator";
import { z } from "zod";

const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;

// Helpers
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

// Auth Handlers
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

// Document Handlers
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

// Rules Handlers
async function handleRulesList(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));

    const tenantRuleSets = await db.select({ id: ruleSets.id }).from(ruleSets).where(eq(ruleSets.tenantId, user.tenantId));
    const rsIds = tenantRuleSets.map(rs => rs.id);
    if (rsIds.length === 0) return json({ data: [], meta: { page, limit, total: 0, totalPages: 0 } });

    const ruleConds = rsIds.map(id => eq(rules.ruleSetId, id));
    const [tr] = await db.select({ total: count() }).from(rules).where(or(...ruleConds));
    const rows = await db.select().from(rules).where(or(...ruleConds))
      .orderBy(desc(rules.createdAt)).limit(limit).offset((page - 1) * limit);

    const allRs = await db.select({ id: ruleSets.id, name: ruleSets.name }).from(ruleSets)
      .where(eq(ruleSets.tenantId, user.tenantId));
    const rsMap = new Map(allRs.map(r => [r.id, r.name]));

    return json({
      data: rows.map(r => ({ ...r, config: r.config as any, createdAt: String(r.createdAt), ruleSetName: rsMap.get(r.ruleSetId) || "Unknown" })),
      meta: { page, limit, total: tr?.total ?? 0, totalPages: Math.ceil((tr?.total ?? 0) / limit) },
    });
  } catch (err) { console.error("Rules list:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

async function handleRulesCreate(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const body = await req.json();
    let ruleSetId = body.ruleSetId;
    if (!ruleSetId) {
      const [existing] = await db.select({ id: ruleSets.id }).from(ruleSets).where(eq(ruleSets.tenantId, user.tenantId)).limit(1);
      if (existing) {
        ruleSetId = existing.id;
      } else {
        const [rs] = await db.insert(ruleSets).values({ tenantId: user.tenantId, name: "Default Rule Set", framework: body.framework || "custom", isActive: true, createdBy: user.id }).returning();
        ruleSetId = rs.id;
      }
    }
    const [rule] = await db.insert(rules).values({
      ruleSetId, name: body.name || "Untitled Rule", type: body.type || "pattern",
      config: body.config || {}, severity: body.severity || "medium", isActive: body.isActive !== false,
    }).returning();
    await auditEvents.ruleCreated(user.tenantId, rule.id, { name: rule.name, type: rule.type });
    return json({ ...rule, config: rule.config as any, createdAt: String(rule.createdAt) }, 201);
  } catch (err) { console.error("Rules create:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

async function handleRuleGet(req: Request, ruleId: string): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const [rule] = await db.select().from(rules).where(eq(rules.id, ruleId)).limit(1);
    if (!rule) return errJson("NOT_FOUND", "Rule not found.", 404);
    const [rs] = await db.select({ tenantId: ruleSets.tenantId }).from(ruleSets).where(eq(ruleSets.id, rule.ruleSetId)).limit(1);
    if (!rs || rs.tenantId !== user.tenantId) return errJson("NOT_FOUND", "Rule not found.", 404);
    return json({ ...rule, config: rule.config as any, createdAt: String(rule.createdAt) });
  } catch (err) { console.error("Rule get:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

async function handleRuleUpdate(req: Request, ruleId: string): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const [rule] = await db.select().from(rules).where(eq(rules.id, ruleId)).limit(1);
    if (!rule) return errJson("NOT_FOUND", "Rule not found.", 404);
    const [rs] = await db.select({ tenantId: ruleSets.tenantId }).from(ruleSets).where(eq(ruleSets.id, rule.ruleSetId)).limit(1);
    if (!rs || rs.tenantId !== user.tenantId) return errJson("NOT_FOUND", "Rule not found.", 404);
    const body = await req.json();
    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.config !== undefined) updates.config = body.config;
    if (body.severity !== undefined) updates.severity = body.severity;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.type !== undefined) updates.type = body.type;
    if (Object.keys(updates).length === 0) return errJson("VALIDATION_ERROR", "No fields to update.", 400);
    const [updated] = await db.update(rules).set(updates).where(eq(rules.id, ruleId)).returning();
    await auditEvents.ruleUpdated(user.tenantId, ruleId, { changes: Object.keys(updates) });
    return json({ ...updated, config: updated.config as any, createdAt: String(updated.createdAt) });
  } catch (err) { console.error("Rule update:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

async function handleRuleTest(req: Request, ruleId: string): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const [rule] = await db.select().from(rules).where(eq(rules.id, ruleId)).limit(1);
    if (!rule) return errJson("NOT_FOUND", "Rule not found.", 404);
    const [rs] = await db.select({ tenantId: ruleSets.tenantId }).from(ruleSets).where(eq(ruleSets.id, rule.ruleSetId)).limit(1);
    if (!rs || rs.tenantId !== user.tenantId) return errJson("NOT_FOUND", "Rule not found.", 404);
    const body = await req.json();
    const text = body.text;
    if (!text || typeof text !== "string") return errJson("VALIDATION_ERROR", "Text is required.", 400);
    const config = rule.config as any;
    const ruleType = rule.type;

    if (ruleType === "pattern") {
      const findings = evaluatePatternRule(text, config);
      return json({
        ruleId: rule.id, ruleName: rule.name, ruleType: "pattern",
        triggered: findings.length > 0, confidence: findings.length > 0 ? 1.0 : 0.0,
        findings: findings.map(f => ({ patternId: f.patternId, label: f.label, matchedText: f.matchedText, position: f.position, context: f.context })),
        reasoning: findings.length > 0 ? `Matched ${findings.length} pattern(s): ${findings.map(f => f.label).join(", ")}` : "No patterns matched.",
        evidenceText: findings.map(f => f.matchedText).join(" | "), costIncurred: 0,
      });
    }
    if (ruleType === "semantic") {
      const finding = await evaluateSemanticRule(text, config);
      return json({
        ruleId: rule.id, ruleName: rule.name, ruleType: "semantic",
        triggered: finding.verdict === "violation", confidence: finding.confidence,
        reasoning: finding.explanation, evidenceText: finding.citedText,
        costIncurred: finding.estimatedCost, tokensUsed: finding.tokensUsed,
      });
    }
    if (ruleType === "composite") {
      const subResults: Record<string, any> = {};
      const compositeConfig = config.config || config;
      const subIds = extractRuleIds(compositeConfig);
      for (const subId of subIds) {
        const [subRule] = await db.select().from(rules).where(eq(rules.id, subId)).limit(1);
        if (!subRule || subRule.type !== "pattern") {
          subResults[subId] = { ruleId: subId, ruleName: "Unknown", triggered: false, confidence: 0, evidence: "" };
          continue;
        }
        const subFindings = evaluatePatternRule(text, subRule.config as any);
        subResults[subId] = { ruleId: subId, ruleName: subRule.name, triggered: subFindings.length > 0, confidence: subFindings.length > 0 ? 1.0 : 0.0, evidence: subFindings.map(f => f.matchedText).join(" | ") };
      }
      const triggered = evalCompositeLogic(compositeConfig, subResults);
      return json({
        ruleId: rule.id, ruleName: rule.name, ruleType: "composite",
        triggered, confidence: triggered ? 1.0 : 0.0, subResults,
        reasoning: triggered ? `Composite rule triggered. Sub-results: ${Object.entries(subResults).map(([id, sr]: [string, any]) => `${sr.ruleName}=${sr.triggered}`).join(", ")}` : "Composite rule not triggered.",
        evidenceText: Object.values(subResults).filter((sr: any) => sr.triggered).map((sr: any) => sr.evidence).join(" | "), costIncurred: 0,
      });
    }
    return errJson("INVALID_RULE_TYPE", `Unsupported rule type: ${ruleType}`, 400);
  } catch (err) { console.error("Rule test:", err); return errJson("INTERNAL_ERROR", "Test failed.", 500); }
}

async function handleRuleSets(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const rows = await db.select().from(ruleSets).where(eq(ruleSets.tenantId, user.tenantId)).orderBy(desc(ruleSets.createdAt));
    return json({ data: rows.map(r => ({ ...r, createdAt: String(r.createdAt) })) });
  } catch (err) { console.error("Rule sets:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

// Composite helpers
function extractRuleIds(node: any): string[] {
  const ids: string[] = [];
  if (node.rules) { for (const child of node.rules) { if (child.ruleId) ids.push(child.ruleId); else if (child.rules) ids.push(...extractRuleIds(child)); } }
  return ids;
}
function evalCompositeLogic(node: any, subResults: Record<string, any>): boolean {
  if (!node.rules) return false;
  const results = node.rules.map((child: any) => child.ruleId ? (subResults[child.ruleId]?.triggered ?? false) : child.rules ? evalCompositeLogic(child, subResults) : false);
  return node.logic === "AND" ? results.every((r: boolean) => r) : results.some((r: boolean) => r);
}
function matchRoute(pathname: string): { handler: string; ruleId?: string } | null {
  const m = pathname.match(/^\/api\/v1\/rules\/([^/]+)\/test$/);
  if (m) return { handler: "ruleTest", ruleId: m[1] };
  const m2 = pathname.match(/^\/api\/v1\/rules\/([^/]+)$/);
  if (m2) return { handler: "ruleDetail", ruleId: m2[1] };
  return null;
}

// Server
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
          if (pathname === "/api/v1/rule-sets" && req.method === "GET") return handleRuleSets(req);
          if (pathname === "/api/v1/rules" && req.method === "GET") return handleRulesList(req);
          if (pathname === "/api/v1/rules" && req.method === "POST") return handleRulesCreate(req);
          const rm = matchRoute(pathname);
          if (rm) {
            if (rm.handler === "ruleTest" && req.method === "POST") return handleRuleTest(req, rm.ruleId!);
            if (rm.handler === "ruleDetail") {
              if (req.method === "GET") return handleRuleGet(req, rm.ruleId!);
              if (req.method === "PUT") return handleRuleUpdate(req, rm.ruleId!);
            }
          }
        } catch (e) { console.error("API error:", e); }
        if (pathname !== "/") { const f = Bun.file(CLIENT_DIR + pathname); if (await f.exists()) return new Response(f); }
        return (handler as any).fetch(req);
      },
    });
    break;
  } catch (err) { if (attempt >= 10) throw err; await Bun.sleep(200); }
}
console.log(`Regula AI on http://${HOST}:${PORT}`);
