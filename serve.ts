// Production server for Regula AI.
// Bun runs TypeScript natively, so we can import from ~/lib directly.
import handler from "./dist/server/server.js";
import { getDb, tenants, users, documents, rules, ruleSets, alerts, alertGroups, auditLog } from "./src/lib/db/index";
import { eq, and, or, desc, count, gte, lte, like } from "drizzle-orm";
import {
  hashPassword, verifyPassword, createSession, validateSession,
  destroySession, getSessionToken, setSessionCookie, clearSessionCookie,
} from "./src/lib/auth/index";
import { auditEvents } from "./src/lib/audit/index";
import { auditEventFactory, verifyChain, toCSV, toJSON, type AuditEvent } from "./src/lib/audit/trail";
import { ingestDocument } from "./src/lib/ingestion/pipeline";
import { evaluatePatternRule } from "./src/lib/rules/pattern-evaluator";
import { evaluateSemanticRule } from "./src/lib/rules/semantic-evaluator";
import { generateAlertsFromEvaluations, generateAlert, toFeedItem, transitionAlert } from "./src/lib/alerts/generator";
import { RULE_TEMPLATES } from "./src/lib/rules/templates";
import { checkTierLimit, getUsageStats } from "./src/lib/tiers/index";
import { generateDailyDigest } from "./src/lib/email/digest";
import { sendDigestEmail } from "./src/lib/email/sender";
import { createCheckoutSession, verifyWebhookSignature, extractEventDetails, createBillingPortalSession } from "./src/lib/billing/index";
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
    const [user] = await db.insert(users).values({ email, passwordHash: ph, name: name || email.split("@")[0], role: "owner", tenantId: tenant.id, onboardingCompleted: false, onboardingStep: 0, digestPreference: "daily" }).returning();
    const token = await createSession(user.id);
    await auditEvents.userLogin(tenant.id, user.id, { action: "signup", email: user.email });
    return setSessionCookie(json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, onboardingCompleted: false, onboardingStep: 0 }, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, tier: tenant.tier } }), token);
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
  const db = getDb();
  const [fullUser] = await db.select({ onboardingCompleted: users.onboardingCompleted, onboardingStep: users.onboardingStep, digestPreference: users.digestPreference }).from(users).where(eq(users.id, user.id)).limit(1);
  return json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId, tenantSlug: user.tenantSlug, tenantTier: user.tenantTier, onboardingCompleted: fullUser?.onboardingCompleted ?? false, onboardingStep: fullUser?.onboardingStep ?? 0, digestPreference: fullUser?.digestPreference ?? "daily" } });
}

// Document Handlers
async function handleIngest(req: Request): Promise<Response> {
try {
  const user = await getAuthUser(req);
  if (!user) return errJson("UNAUTHORIZED", "Authentication required.", 401);
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) return errJson("INVALID_CONTENT_TYPE", "Expected multipart/form-data.", 400);

  // Tier limit check
  const docLimit = await checkTierLimit("documents", user.tenantId);
  if (!docLimit.allowed) return errJson("TIER_LIMIT", docLimit.message!, 402);
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

  // Tier limit check for rules
  const ruleLimit = await checkTierLimit("rules", user.tenantId);
  if (!ruleLimit.allowed) return errJson("TIER_LIMIT", ruleLimit.message!, 402);
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

// ── Alerts Handlers ────────────────────────────────────────────

async function handleAlertsList(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const status = url.searchParams.get("status");
    const severity = url.searchParams.get("severity");
    const framework = url.searchParams.get("framework");
    const search = url.searchParams.get("search");
    const sort = url.searchParams.get("sort") || "-createdAt";

    const conds = [eq(alerts.tenantId, user.tenantId)];
    if (status) conds.push(eq(alerts.status, status as any));
    if (severity) conds.push(eq(alerts.severity, severity as any));
    if (framework) conds.push(eq(alerts.framework, framework));
    if (search) conds.push(or(like(alerts.title, `%${search}%`), like(alerts.evidenceText, `%${search}%`))!);

    const [tr] = await db.select({ total: count() }).from(alerts).where(and(...conds));
    const orderCol = sort.startsWith("-") ? desc(alerts[sort.slice(1) as keyof typeof alerts] as any) : (alerts[sort as keyof typeof alerts] as any);
    const rows = await db.select().from(alerts).where(and(...conds))
      .orderBy(desc(alerts.createdAt)).limit(limit).offset((page - 1) * limit);

    return json({
      data: rows.map(r => ({ ...r, config: undefined, createdAt: String(r.createdAt), updatedAt: String(r.updatedAt), acknowledgedAt: r.acknowledgedAt ? String(r.acknowledgedAt) : null, resolvedAt: r.resolvedAt ? String(r.resolvedAt) : null, dismissedAt: r.dismissedAt ? String(r.dismissedAt) : null })),
      meta: { page, limit, total: tr?.total ?? 0, totalPages: Math.ceil((tr?.total ?? 0) / limit) },
    });
  } catch (err) { console.error("Alerts list:", err); return errJson("INTERNAL_ERROR", "Failed to fetch alerts.", 500); }
}

async function handleAlertGet(req: Request, alertId: string): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const [alert] = await db.select().from(alerts).where(and(eq(alerts.id, alertId), eq(alerts.tenantId, user.tenantId))).limit(1);
    if (!alert) return errJson("NOT_FOUND", "Alert not found.", 404);
    return json({ ...alert, createdAt: String(alert.createdAt), updatedAt: String(alert.updatedAt), acknowledgedAt: alert.acknowledgedAt ? String(alert.acknowledgedAt) : null, resolvedAt: alert.resolvedAt ? String(alert.resolvedAt) : null, dismissedAt: alert.dismissedAt ? String(alert.dismissedAt) : null });
  } catch (err) { console.error("Alert get:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

async function handleAlertAction(req: Request, alertId: string, action: string): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const [alert] = await db.select().from(alerts).where(and(eq(alerts.id, alertId), eq(alerts.tenantId, user.tenantId))).limit(1);
    if (!alert) return errJson("NOT_FOUND", "Alert not found.", 404);

    const now = new Date().toISOString();
    const updates: Record<string, any> = { updatedAt: now };
    let auditPayload: Record<string, unknown> = { alertId, action };

    if (action === "acknowledge") {
      if (alert.status !== "open") return errJson("INVALID_TRANSITION", `Cannot acknowledge alert in "${alert.status}" status.`, 400);
      updates.status = "acknowledged";
      updates.acknowledgedAt = now;
      updates.acknowledgedBy = user.id;
      auditPayload = { ...auditPayload, fromStatus: alert.status, toStatus: "acknowledged" };
      await db.update(alerts).set(updates).where(eq(alerts.id, alertId));
      await auditEvents.alertAcknowledged(user.tenantId, alertId, auditPayload, user);
    } else if (action === "resolve") {
      if (alert.status !== "acknowledged") return errJson("INVALID_TRANSITION", `Cannot resolve alert in "${alert.status}" status.`, 400);
      updates.status = "resolved";
      updates.resolvedAt = now;
      updates.resolvedBy = user.id;
      auditPayload = { ...auditPayload, fromStatus: alert.status, toStatus: "resolved" };
      await db.update(alerts).set(updates).where(eq(alerts.id, alertId));
      await auditEvents.alertResolved(user.tenantId, alertId, auditPayload, user);
    } else if (action === "dismiss") {
      if (alert.status !== "open" && alert.status !== "acknowledged") return errJson("INVALID_TRANSITION", `Cannot dismiss alert in "${alert.status}" status.`, 400);
      updates.status = "false_positive";
      updates.dismissedAt = now;
      updates.dismissedBy = user.id;
      auditPayload = { ...auditPayload, fromStatus: alert.status, toStatus: "false_positive" };
      await db.update(alerts).set(updates).where(eq(alerts.id, alertId));
      await auditEvents.alertDismissed(user.tenantId, alertId, auditPayload, user);
    } else {
      return errJson("INVALID_ACTION", `Unknown action: ${action}`, 400);
    }

    const [updated] = await db.select().from(alerts).where(eq(alerts.id, alertId)).limit(1);
    return json({ ...updated, createdAt: String(updated.createdAt), updatedAt: String(updated.updatedAt), acknowledgedAt: updated.acknowledgedAt ? String(updated.acknowledgedAt) : null, resolvedAt: updated.resolvedAt ? String(updated.resolvedAt) : null, dismissedAt: updated.dismissedAt ? String(updated.dismissedAt) : null });
  } catch (err) { console.error("Alert action:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

// ── Audit Handlers ────────────────────────────────────────────

async function handleAuditQuery(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = url.searchParams.get("resourceId");

    const conds = [eq(auditLog.tenantId, user.tenantId)];
    if (resourceType) conds.push(eq(auditLog.resourceType, resourceType));
    if (resourceId) conds.push(eq(auditLog.resourceId, resourceId));

    const [tr] = await db.select({ total: count() }).from(auditLog).where(and(...conds));
    const rows = await db.select().from(auditLog).where(and(...conds))
      .orderBy(desc(auditLog.createdAt)).limit(limit).offset((page - 1) * limit);

    return json({
      data: rows.map(r => ({ ...r, payload: r.payload as any, createdAt: String(r.createdAt) })),
      meta: { page, limit, total: tr?.total ?? 0, totalPages: Math.ceil((tr?.total ?? 0) / limit) },
    });
  } catch (err) { console.error("Audit query:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

async function handleAuditVerify(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const conds = [eq(auditLog.tenantId, user.tenantId)];
    if (from) conds.push(gte(auditLog.createdAt, new Date(from)));
    if (to) conds.push(lte(auditLog.createdAt, new Date(to)));

    const rows = await db.select().from(auditLog).where(and(...conds))
      .orderBy(auditLog.id as any).limit(10000);

    const events: AuditEvent[] = rows.map(r => ({
      id: r.id,
      tenantId: r.tenantId,
      eventType: r.eventType,
      actorId: r.actorId,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      payload: r.payload as Record<string, unknown>,
      prevHash: r.prevHash,
      contentHash: r.contentHash,
      createdAt: String(r.createdAt),
    }));

    const result = verifyChain(events);
    return json(result);
  } catch (err) { console.error("Audit verify:", err); return errJson("INTERNAL_ERROR", "Verification failed.", 500); }
}

async function handleAuditExport(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const format = url.searchParams.get("format") || "json";

    const conds = [eq(auditLog.tenantId, user.tenantId)];
    if (from) conds.push(gte(auditLog.createdAt, new Date(from)));
    if (to) conds.push(lte(auditLog.createdAt, new Date(to)));

    const rows = await db.select().from(auditLog).where(and(...conds))
      .orderBy(auditLog.id as any).limit(50000);

    const events: AuditEvent[] = rows.map(r => ({
      id: r.id,
      tenantId: r.tenantId,
      eventType: r.eventType,
      actorId: r.actorId,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      payload: r.payload as Record<string, unknown>,
      prevHash: r.prevHash,
      contentHash: r.contentHash,
      ipAddress: r.ipAddress || undefined,
      userAgent: r.userAgent || undefined,
      createdAt: String(r.createdAt),
    }));

    if (format === "csv") {
      return new Response(toCSV(events), {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return new Response(toJSON(events), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) { console.error("Audit export:", err); return errJson("INTERNAL_ERROR", "Export failed.", 500); }
}

// ── Dashboard Handler ─────────────────────────────────────────

async function handleDashboardSummary(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();

    const [docCount] = await db.select({ total: count() }).from(documents).where(eq(documents.tenantId, user.tenantId));
    const [openAlerts] = await db.select({ total: count() }).from(alerts).where(and(eq(alerts.tenantId, user.tenantId), eq(alerts.status, "open")));
    const [activeRules] = await db.select({ total: count() }).from(rules).innerJoin(ruleSets, eq(rules.ruleSetId, ruleSets.id)).where(and(eq(ruleSets.tenantId, user.tenantId), eq(rules.isActive, true)));

    // Usage stats by tier
    const usage = await getUsageStats(user.tenantId);

    // Rule health: simplified
    const [passedCount] = await db.select({ total: count() }).from(alerts).where(and(eq(alerts.tenantId, user.tenantId), eq(alerts.status, "resolved")));
    const [failedCount] = await db.select({ total: count() }).from(alerts).where(and(eq(alerts.tenantId, user.tenantId), eq(alerts.status, "open")));
    const [warningCount] = await db.select({ total: count() }).from(alerts).where(and(eq(alerts.tenantId, user.tenantId), eq(alerts.status, "acknowledged")));

    return json({
      totalDocuments: docCount?.total ?? 0,
      documentsThisWeek: 0, // TODO: filter by date
      openAlerts: openAlerts?.total ?? 0,
      activeRules: activeRules?.total ?? 0,
      evaluationsRun: 0, // TODO
      ruleHealth: {
        pass: passedCount?.total ?? 0,
        fail: failedCount?.total ?? 0,
        warning: warningCount?.total ?? 0,
      },
      usage,
    });
  } catch (err) { console.error("Dashboard:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

// ── Templates Handler ─────────────────────────────────────────

async function handleTemplatesSeed(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Auth required.", 401);
    const db = getDb();

    // Get or create a default rule set for this tenant
    let [existing] = await db
      .select({ id: ruleSets.id })
      .from(ruleSets)
      .where(eq(ruleSets.tenantId, user.tenantId))
      .limit(1);

    if (!existing) {
      const [rs] = await db
        .insert(ruleSets)
        .values({
          tenantId: user.tenantId,
          name: "Default Rule Set",
          framework: "custom",
          isActive: true,
          createdBy: user.id,
        })
        .returning();
      existing = rs;
    }

    const created: any[] = [];
    const skipped: string[] = [];

    for (const tmpl of RULE_TEMPLATES) {
      // Check tier limit for rules before each insert
      const ruleLimit = await checkTierLimit("rules", user.tenantId);
      if (!ruleLimit.allowed) {
        skipped.push(`${tmpl.name} (tier limit)`);
        continue;
      }

      const [rule] = await db
        .insert(rules)
        .values({
          ruleSetId: existing.id,
          name: tmpl.name,
          description: tmpl.description,
          type: tmpl.type,
          config: tmpl.config as any,
          severity: tmpl.severity,
          isActive: true,
        })
        .returning();

      await auditEvents.ruleCreated(user.tenantId, rule.id, {
        name: rule.name,
        type: rule.type,
        fromTemplate: true,
      });

      created.push({
        id: rule.id,
        name: rule.name,
        type: rule.type,
        severity: rule.severity,
        framework: tmpl.framework,
        category: tmpl.category,
        createdAt: String(rule.createdAt),
      });
    }

    return json(
      {
        created: created.length,
        skipped: skipped.length,
        rules: created,
        skippedRules: skipped,
      },
      201
    );
  } catch (err) {
    console.error("Templates:", err);
    return errJson("INTERNAL_ERROR", "Failed to seed templates.", 500);
  }
}

// ── Onboarding Handler ────────────────────────────────────────

const onboardingSchema = z.object({
  onboardingStep: z.number().int().min(0).max(3).optional(),
  onboardingCompleted: z.boolean().optional(),
});

async function handleOnboarding(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Authentication required.", 401);
    const body = await req.json();
    const p = onboardingSchema.safeParse(body);
    if (!p.success) return errJson("VALIDATION_ERROR", "Invalid input", 400);
    const db = getDb();
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (p.data.onboardingStep !== undefined) updates.onboardingStep = p.data.onboardingStep;
    if (p.data.onboardingCompleted !== undefined) updates.onboardingCompleted = p.data.onboardingCompleted;
    await db.update(users).set(updates).where(eq(users.id, user.id));
    const [updated] = await db.select({ onboardingCompleted: users.onboardingCompleted, onboardingStep: users.onboardingStep }).from(users).where(eq(users.id, user.id)).limit(1);
    return json({ onboardingCompleted: updated?.onboardingCompleted ?? false, onboardingStep: updated?.onboardingStep ?? 0 });
  } catch (err) { console.error("Onboarding:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

// ── Preferences Handler ───────────────────────────────────────

const preferencesSchema = z.object({
  digestPreference: z.enum(["daily", "weekly", "off"]).optional(),
});

async function handlePreferences(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Authentication required.", 401);
    const body = await req.json();
    const p = preferencesSchema.safeParse(body);
    if (!p.success) return errJson("VALIDATION_ERROR", "Invalid input", 400);
    const db = getDb();
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (p.data.digestPreference !== undefined) updates.digestPreference = p.data.digestPreference;
    await db.update(users).set(updates).where(eq(users.id, user.id));
    const [updated] = await db.select({ digestPreference: users.digestPreference }).from(users).where(eq(users.id, user.id)).limit(1);
    return json({ digestPreference: updated?.digestPreference ?? "daily" });
  } catch (err) { console.error("Preferences:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

// ── Admin Digest Handler ──────────────────────────────────────

async function handleAdminSendDigest(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Authentication required.", 401);
    if (user.role !== "owner" && user.role !== "admin") return errJson("FORBIDDEN", "Admin access required.", 403);
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.userId || user.id;
    const targetTenantId = body.tenantId || user.tenantId;

    // Verify the target user belongs to the tenant
    const db = getDb();
    const [targetUser] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(and(eq(users.id, targetUserId), eq(users.tenantId, targetTenantId))).limit(1);
    if (!targetUser) return errJson("NOT_FOUND", "Target user not found in tenant.", 404);

    const digest = await generateDailyDigest(targetTenantId, targetUserId);
    if (!digest) return errJson("NOT_FOUND", "Could not generate digest.", 404);

    const entry = await sendDigestEmail(digest);
    return json({ success: true, digest: entry }, 200);
  } catch (err) { console.error("Digest:", err); return errJson("INTERNAL_ERROR", "Failed.", 500); }
}

// ── Billing Handlers ──────────────────────────────────────────

const checkoutSchema = z.object({
  tier: z.enum(["starter", "professional", "enterprise"]),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

async function handleBillingCreateCheckout(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Authentication required.", 401);
    const body = await req.json();
    const p = checkoutSchema.safeParse(body);
    if (!p.success) return errJson("VALIDATION_ERROR", "Invalid input.", 400);

    const db = getDb();
    const [tenant] = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);

    if (!tenant) return errJson("NOT_FOUND", "Tenant not found.", 404);

    const result = await createCheckoutSession({
      tier: p.data.tier,
      tenantId: tenant.id,
      tenantName: tenant.name,
      userEmail: user.email,
      successUrl: p.data.successUrl,
      cancelUrl: p.data.cancelUrl,
    });

    if (result.error) {
      return json({ error: result.error, code: result.code }, result.code === "STRIPE_NOT_CONFIGURED" ? 503 : 400);
    }

    return json({ url: result.url, sessionId: result.sessionId });
  } catch (err) {
    console.error("Create checkout:", err);
    return errJson("INTERNAL_ERROR", "Failed to create checkout session.", 500);
  }
}

async function handleBillingWebhook(req: Request): Promise<Response> {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) return errJson("VALIDATION_ERROR", "Missing stripe-signature header.", 400);

    const payload = await req.text();
    const eventOrError = verifyWebhookSignature(payload, signature);

    if ("error" in eventOrError) {
      return errJson(eventOrError.code || "WEBHOOK_ERROR", eventOrError.error, 400);
    }

    const event = eventOrError;
    const details = extractEventDetails(event);
    if (!details || !details.customerId) {
      return json({ received: true, skipped: true, reason: "No customer details extracted." });
    }

    const db = getDb();

    // Find the tenant by stripe customer ID or by metadata
    let tenantId: string | null = null;

    // Check if event has metadata with tenantId
    const metadata = (event.data.object as any)?.metadata;
    if (metadata?.tenantId) {
      tenantId = metadata.tenantId;
    }

    // If no metadata, try to find by stripe customer ID
    if (!tenantId && details.customerId) {
      const [t] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.stripeCustomerId, details.customerId))
        .limit(1);
      if (t) tenantId = t.id;
    }

    if (!tenantId) {
      console.warn("Webhook: could not identify tenant for customer", details.customerId);
      return json({ received: true, skipped: true, reason: "Unknown customer." });
    }

    // Update tenant with subscription info
    const updates: Record<string, any> = {
      stripeCustomerId: details.customerId,
      stripeSubscriptionId: details.subscriptionId,
      subscriptionStatus: details.status,
      updatedAt: new Date().toISOString(),
    };

    if (details.currentPeriodEnd) {
      updates.subscriptionPeriodEnd = new Date(details.currentPeriodEnd);
    }

    // If subscription is active, update tier based on price
    if (details.status === "active" && details.priceId) {
      if (details.priceId === process.env.STRIPE_STARTER_PRICE_ID) {
        updates.tier = "starter";
      } else if (details.priceId === process.env.STRIPE_PROFESSIONAL_PRICE_ID) {
        updates.tier = "professional";
      } else if (details.priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) {
        updates.tier = "enterprise";
      }
    }

    await db.update(tenants).set(updates).where(eq(tenants.id, tenantId));

    console.log(`Webhook [${event.type}]: updated tenant ${tenantId} — status: ${details.status}`);
    return json({ received: true, tenantId, status: details.status });
  } catch (err) {
    console.error("Webhook:", err);
    return errJson("INTERNAL_ERROR", "Webhook processing failed.", 500);
  }
}

async function handleBillingPlan(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Authentication required.", 401);

    const db = getDb();
    const [tenant] = await db
      .select({
        tier: tenants.tier,
        stripeCustomerId: tenants.stripeCustomerId,
        subscriptionStatus: tenants.subscriptionStatus,
        subscriptionPeriodEnd: tenants.subscriptionPeriodEnd,
      })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);

    if (!tenant) return errJson("NOT_FOUND", "Tenant not found.", 404);

    return json({
      tier: tenant.tier || "starter",
      stripeCustomerId: tenant.stripeCustomerId,
      subscriptionStatus: tenant.subscriptionStatus || "inactive",
      subscriptionPeriodEnd: tenant.subscriptionPeriodEnd
        ? String(tenant.subscriptionPeriodEnd)
        : null,
    });
  } catch (err) {
    console.error("Billing plan:", err);
    return errJson("INTERNAL_ERROR", "Failed.", 500);
  }
}

const portalSchema = z.object({
  returnUrl: z.string().url(),
});

async function handleBillingPortal(req: Request): Promise<Response> {
  try {
    const user = await getAuthUser(req);
    if (!user) return errJson("UNAUTHORIZED", "Authentication required.", 401);
    const body = await req.json();
    const p = portalSchema.safeParse(body);
    if (!p.success) return errJson("VALIDATION_ERROR", "Invalid input.", 400);

    const db = getDb();
    const [tenant] = await db
      .select({ stripeCustomerId: tenants.stripeCustomerId })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);

    if (!tenant?.stripeCustomerId) {
      return errJson("NOT_FOUND", "No Stripe customer found. Start a subscription first.", 404);
    }

    const result = await createBillingPortalSession(tenant.stripeCustomerId, p.data.returnUrl);
    if (result.error) {
      return json({ error: result.error, code: result.code }, result.code === "STRIPE_NOT_CONFIGURED" ? 503 : 400);
    }

    return json({ url: result.url });
  } catch (err) {
    console.error("Billing portal:", err);
    return errJson("INTERNAL_ERROR", "Failed.", 500);
  }
}

// ── Route matching helpers ───────────────────────────────────

function matchAlertRoute(pathname: string): { handler: string; alertId?: string; action?: string } | null {
  const m = pathname.match(/^\/api\/v1\/alerts\/([^/]+)\/(acknowledge|resolve|dismiss)$/);
  if (m) return { handler: "alertAction", alertId: m[1], action: m[2] };
  const m2 = pathname.match(/^\/api\/v1\/alerts\/([^/]+)$/);
  if (m2) return { handler: "alertDetail", alertId: m2[1] };
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
          if (pathname === "/api/v1/alerts" && req.method === "GET") return handleAlertsList(req);
          if (pathname === "/api/v1/audit" && req.method === "GET") return handleAuditQuery(req);
          if (pathname === "/api/v1/audit/verify" && req.method === "POST") return handleAuditVerify(req);
          if (pathname === "/api/v1/audit/export" && req.method === "GET") return handleAuditExport(req);
          if (pathname === "/api/v1/dashboard/summary" && req.method === "GET") return handleDashboardSummary(req);
          if (pathname === "/api/v1/rules/templates" && req.method === "POST") return handleTemplatesSeed(req);
          if (pathname === "/api/v1/me/onboarding" && req.method === "PATCH") return handleOnboarding(req);
          if (pathname === "/api/v1/me/preferences" && req.method === "PATCH") return handlePreferences(req);
          if (pathname === "/api/v1/admin/send-digest" && req.method === "POST") return handleAdminSendDigest(req);
          if (pathname === "/api/v1/billing/create-checkout" && req.method === "POST") return handleBillingCreateCheckout(req);
          if (pathname === "/api/v1/billing/webhook" && req.method === "POST") return handleBillingWebhook(req);
          if (pathname === "/api/v1/billing/plan" && req.method === "GET") return handleBillingPlan(req);
          if (pathname === "/api/v1/billing/portal" && req.method === "POST") return handleBillingPortal(req);
          const rm = matchRoute(pathname);
          if (rm) {
            if (rm.handler === "ruleTest" && req.method === "POST") return handleRuleTest(req, rm.ruleId!);
            if (rm.handler === "ruleDetail") {
              if (req.method === "GET") return handleRuleGet(req, rm.ruleId!);
              if (req.method === "PUT") return handleRuleUpdate(req, rm.ruleId!);
            }
          }
          const am = matchAlertRoute(pathname);
          if (am) {
            if (am.handler === "alertDetail" && req.method === "GET") return handleAlertGet(req, am.alertId!);
            if (am.handler === "alertAction" && req.method === "POST") return handleAlertAction(req, am.alertId!, am.action!);
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
