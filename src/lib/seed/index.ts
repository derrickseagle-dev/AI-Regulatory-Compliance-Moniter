/**
 * Demo Data Seeder — seeds sample documents, rules, and runs evaluations
 * to generate realistic alerts for beta tenant immediate value.
 *
 * All seeded data is marked with `is_demo: true` for easy identification
 * and cleanup.
 */
import { getDb, documents, ruleSets, rules, evaluations, alerts } from "~/lib/db/index";
import { eq, and, count, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { SAMPLE_DOCUMENTS } from "./documents";
import { ALL_DEMO_RULES } from "./rules";
import { evaluateDocument, type EngineRule } from "~/lib/rules/engine";
import type { PatternRuleConfig, SemanticRuleConfig, CompositeRuleConfig, EvaluationResult } from "~/lib/rules/types";
import { checkTierLimit } from "~/lib/tiers/index";

export interface SeedResult {
  documentsCreated: number;
  rulesActivated: number;
  alertsGenerated: number;
}

export interface ClearResult {
  documentsRemoved: number;
  rulesRemoved: number;
  alertsRemoved: number;
}

/**
 * Seed demo data for a tenant.
 * Idempotent — checks if demo documents already exist before seeding.
 */
export async function seedDemoData(tenantId: string, userId: string): Promise<SeedResult> {
  const db = getDb();

  // ── Idempotency check ──────────────────────────────────────
  const [existing] = await db
    .select({ count: count() })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.isDemo, true)));
  if (existing && existing.count > 0) {
    return { documentsCreated: 0, rulesActivated: 0, alertsGenerated: 0 };
  }

  // ── 1. Get or create default rule set ──────────────────────
  let [defaultRs] = await db
    .select({ id: ruleSets.id })
    .from(ruleSets)
    .where(eq(ruleSets.tenantId, tenantId))
    .limit(1);

  if (!defaultRs) {
    const [rs] = await db
      .insert(ruleSets)
      .values({
        tenantId,
        name: "Default Rule Set",
        framework: "custom",
        isActive: true,
        createdBy: userId,
      })
      .returning();
    defaultRs = rs;
  }

  // ── 2. Create demo documents ───────────────────────────────
  const createdDocIds: string[] = [];
  for (const doc of SAMPLE_DOCUMENTS) {
    const [inserted] = await db
      .insert(documents)
      .values({
        tenantId,
        filename: doc.filename,
        sourceType: "upload",
        contentText: doc.content,
        status: "processed",
        isDemo: true,
        metadata: { seeded: true, category: doc.category },
      })
      .returning();
    createdDocIds.push(inserted.id);
  }

  // ── 3. Create demo rules ───────────────────────────────────
  const createdRuleIds: string[] = [];
  for (const tmpl of ALL_DEMO_RULES) {
    const ruleLimit = await checkTierLimit("rules", tenantId);
    if (!ruleLimit.allowed) continue;

    const [rule] = await db
      .insert(rules)
      .values({
        ruleSetId: defaultRs.id,
        name: tmpl.name,
        description: tmpl.description,
        type: tmpl.type as "pattern" | "semantic" | "composite",
        config: tmpl.config as any,
        severity: tmpl.severity,
        isActive: true,
        isDemo: true,
      })
      .returning();
    createdRuleIds.push(rule.id);
  }

  // ── 4. Run evaluations on each document ────────────────────
  const allRules = await db
    .select()
    .from(rules)
    .where(
      and(
        eq(rules.ruleSetId, defaultRs.id),
        eq(rules.isDemo, true),
        eq(rules.isActive, true),
      )
    );

  const engineRules: EngineRule[] = allRules.map((r) => ({
    id: r.id,
    ruleSetId: r.ruleSetId,
    name: r.name,
    type: r.type as "pattern" | "semantic" | "composite",
    config: r.config as PatternRuleConfig | SemanticRuleConfig | CompositeRuleConfig,
    severity: r.severity as "low" | "medium" | "high" | "critical",
    framework: "",
    isActive: r.isActive,
  }));

  let totalAlerts = 0;

  for (const docId of createdDocIds) {
    const [doc] = await db
      .select({
        id: documents.id,
        contentText: documents.contentText,
        contentChunks: documents.contentChunks,
        filename: documents.filename,
      })
      .from(documents)
      .where(eq(documents.id, docId))
      .limit(1);

    if (!doc) continue;

    const engineDoc = {
      id: doc.id,
      contentText: doc.contentText,
      contentChunks: doc.contentChunks as string[] | null,
    };

    const persistFn = async (result: EvaluationResult) => {
      const [evalRecord] = await db
        .insert(evaluations)
        .values({
          tenantId,
          documentId: result.documentId,
          ruleId: result.ruleId,
          triggered: result.triggered,
          confidence: result.confidence,
          evidenceText: result.evidenceText.slice(0, 5000),
          reasoning: result.reasoning,
          chunkIndex: result.chunkIndex ?? 0,
        })
        .returning();

      if (result.triggered) {
        await db.insert(alerts).values({
          id: uuid(),
          tenantId,
          evaluationId: evalRecord.id,
          severity: result.severity,
          status: "open",
          title: `Demo: Potential violation — ${result.ruleName}`,
          summary: result.reasoning.slice(0, 500),
          recommendedAction: `Review "${doc.filename}" for "${result.ruleName}" compliance.`,
          evidenceText: result.evidenceText.slice(0, 5000),
          evidenceContext: result.evidenceText.slice(0, 500),
          documentId: result.documentId,
          documentName: doc.filename,
          ruleId: result.ruleId,
          ruleName: result.ruleName,
          ruleSetName: "Default Rule Set",
          framework: result.framework,
          reasoning: result.reasoning,
          confidence: result.confidence,
          isDemo: true,
        });
        totalAlerts++;
      }
    };

    await evaluateDocument(engineDoc, engineRules, persistFn);
  }

  return {
    documentsCreated: createdDocIds.length,
    rulesActivated: createdRuleIds.length,
    alertsGenerated: totalAlerts,
  };
}

/**
 * Clear all demo data for a tenant.
 * Deletes alerts → evaluations → rules → documents, respecting FK constraints.
 */
export async function clearDemoData(tenantId: string): Promise<ClearResult> {
  const db = getDb();

  // Find tenant's rule sets
  const tenantRuleSets = await db
    .select({ id: ruleSets.id })
    .from(ruleSets)
    .where(eq(ruleSets.tenantId, tenantId));
  const rsIds = tenantRuleSets.map((rs) => rs.id);

  // Count demo alerts
  const [alertBefore] = await db
    .select({ count: count() })
    .from(alerts)
    .where(and(eq(alerts.tenantId, tenantId), eq(alerts.isDemo, true)));
  const alertCountBefore = alertBefore?.count ?? 0;

  // Find evaluation IDs linked to demo alerts
  const demoEvalRows = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .innerJoin(alerts, eq(evaluations.id, alerts.evaluationId))
    .where(and(eq(alerts.tenantId, tenantId), eq(alerts.isDemo, true)));
  const demoEvalIds = demoEvalRows.map((e) => e.id);

  // Also find evaluations for demo documents by this tenant
  const demoDocEvalRows = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .innerJoin(documents, eq(evaluations.documentId, documents.id))
    .where(and(eq(documents.tenantId, tenantId), eq(documents.isDemo, true)));
  for (const row of demoDocEvalRows) {
    if (!demoEvalIds.includes(row.id)) demoEvalIds.push(row.id);
  }

  // 1. Delete demo alerts
  await db
    .delete(alerts)
    .where(and(eq(alerts.tenantId, tenantId), eq(alerts.isDemo, true)));

  // 2. Delete demo-linked evaluations
  if (demoEvalIds.length > 0) {
    await db.delete(evaluations).where(inArray(evaluations.id, demoEvalIds));
  }

  // 3. Delete demo rules from this tenant's rule sets
  let rulesRemoved = 0;
  if (rsIds.length > 0) {
    const deleted = await db
      .delete(rules)
      .where(
        and(
          eq(rules.isDemo, true),
          inArray(rules.ruleSetId, rsIds),
        )
      )
      .returning({ id: rules.id });
    rulesRemoved = deleted.length;
  }

  // 4. Delete demo documents
  const deletedDocs = await db
    .delete(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.isDemo, true)))
    .returning({ id: documents.id });

  // Verify deletion
  const [alertAfter] = await db
    .select({ count: count() })
    .from(alerts)
    .where(and(eq(alerts.tenantId, tenantId), eq(alerts.isDemo, true)));

  return {
    documentsRemoved: deletedDocs.length,
    rulesRemoved: rulesRemoved,
    alertsRemoved: alertCountBefore - (alertAfter?.count ?? 0),
  };
}

/**
 * Check if a tenant has demo data.
 */
export async function hasDemoData(tenantId: string): Promise<boolean> {
  const db = getDb();
  const [existing] = await db
    .select({ count: count() })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.isDemo, true)));
  return (existing?.count ?? 0) > 0;
}
