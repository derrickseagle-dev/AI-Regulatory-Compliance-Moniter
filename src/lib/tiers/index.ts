/**
 * Tier limit checking for Regula AI.
 *
 * Tiers:
 *   Starter      — 100 docs/mo, 3 rule sets, 5 rules per set
 *   Professional — 1000 docs/mo, 10 rule sets, 20 rules per set
 *   Enterprise   — unlimited
 */

import { getDb, tenants, documents, ruleSets, rules } from "~/lib/db/index";
import { eq, and, gte, sql } from "drizzle-orm";

export type TierId = "starter" | "professional" | "enterprise";

export interface TierDefinition {
  id: TierId;
  label: string;
  maxDocumentsPerMonth: number;
  maxRuleSets: number;
  maxRulesPerSet: number;
  // Max rules total (maxRuleSets * maxRulesPerSet as a single cap)
  get maxRulesTotal(): number;
}

export const TIERS: Record<TierId, TierDefinition> = {
  starter: {
    id: "starter",
    label: "Starter",
    maxDocumentsPerMonth: 100,
    maxRuleSets: 3,
    maxRulesPerSet: 5,
    get maxRulesTotal() {
      return this.maxRuleSets * this.maxRulesPerSet;
    },
  },
  professional: {
    id: "professional",
    label: "Professional",
    maxDocumentsPerMonth: 1000,
    maxRuleSets: 10,
    maxRulesPerSet: 20,
    get maxRulesTotal() {
      return this.maxRuleSets * this.maxRulesPerSet;
    },
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    maxDocumentsPerMonth: Infinity,
    maxRuleSets: Infinity,
    maxRulesPerSet: Infinity,
    get maxRulesTotal() {
      return Infinity;
    },
  },
};

export type ResourceType = "documents" | "rule_set" | "rules";

export interface TierCheckResult {
  allowed: boolean;
  resource: ResourceType;
  current: number;
  limit: number;
  tier: TierId;
  message?: string;
}

/**
 * Check if a tenant is within their tier limits for a given resource.
 * Returns a result with allowed boolean and usage info.
 */
export async function checkTierLimit(
  resource: ResourceType,
  tenantId: string
): Promise<TierCheckResult> {
  const db = getDb();

  // Get tenant tier
  const [tenant] = await db
    .select({ tier: tenants.tier })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const tierId: TierId = (tenant?.tier as TierId) || "starter";
  const tier = TIERS[tierId];

  let current = 0;
  let limit = 0;

  switch (resource) {
    case "documents": {
      // Count documents created this calendar month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(documents)
        .where(
          and(
            eq(documents.tenantId, tenantId),
            gte(documents.createdAt, monthStart)
          )
        );
      current = row?.total ?? 0;
      limit = tier.maxDocumentsPerMonth;
      break;
    }
    case "rule_set": {
      const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(ruleSets)
        .where(eq(ruleSets.tenantId, tenantId));
      current = row?.total ?? 0;
      limit = tier.maxRuleSets;
      break;
    }
    case "rules": {
      // Count total rules across all rule sets for this tenant
      const tenantRuleSets = await db
        .select({ id: ruleSets.id })
        .from(ruleSets)
        .where(eq(ruleSets.tenantId, tenantId));
      const rsIds = tenantRuleSets.map((rs) => rs.id);
      if (rsIds.length === 0) {
        current = 0;
      } else {
        // Build OR of eq conditions
        const conditions = rsIds.map((id) => eq(rules.ruleSetId, id));
        // Use a join-style approach by summing per-set
        let total = 0;
        for (const id of rsIds) {
          const [row] = await db
            .select({ total: sql<number>`count(*)::int` })
            .from(rules)
            .where(eq(rules.ruleSetId, id));
          total += row?.total ?? 0;
        }
        current = total;
      }
      limit = tier.maxRulesTotal;
      break;
    }
  }

  const allowed = current < limit;

  const messages: Record<ResourceType, string> = {
    documents: `Document limit reached: ${current}/${limit} this month. Upgrade your tier to upload more documents.`,
    rule_set: `Rule set limit reached: ${current}/${limit}. Upgrade your tier to create more rule sets.`,
    rules: `Rule limit reached: ${current}/${limit} across all rule sets. Upgrade your tier to create more rules.`,
  };

  return {
    allowed,
    resource,
    current,
    limit: limit === Infinity ? -1 : (limit as number),
    tier: tierId,
    message: allowed ? undefined : messages[resource],
  };
}

/**
 * Get usage statistics for a tenant (for dashboard display).
 */
export async function getUsageStats(tenantId: string) {
  const db = getDb();

  const [tenant] = await db
    .select({ tier: tenants.tier })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const tierId: TierId = (tenant?.tier as TierId) || "starter";
  const tier = TIERS[tierId];

  // Document count this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [docCount] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, tenantId),
        gte(documents.createdAt, monthStart)
      )
    );

  // Rule set count
  const [rsCount] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(ruleSets)
    .where(eq(ruleSets.tenantId, tenantId));

  // Rule count
  const tenantRuleSets = await db
    .select({ id: ruleSets.id })
    .from(ruleSets)
    .where(eq(ruleSets.tenantId, tenantId));
  const rsIds = tenantRuleSets.map((rs) => rs.id);
  let ruleCount = 0;
  for (const id of rsIds) {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(rules)
      .where(eq(rules.ruleSetId, id));
    ruleCount += row?.total ?? 0;
  }

  const docsLimit =
    tier.maxDocumentsPerMonth === Infinity
      ? -1
      : tier.maxDocumentsPerMonth;
  const ruleSetsLimit =
    tier.maxRuleSets === Infinity ? -1 : tier.maxRuleSets;
  const rulesLimit =
    tier.maxRulesTotal === Infinity ? -1 : tier.maxRulesTotal;

  return {
    tier: tierId,
    tierLabel: tier.label,
    documents: {
      current: docCount?.total ?? 0,
      limit: docsLimit,
      pct: docsLimit > 0 ? Math.round(((docCount?.total ?? 0) / docsLimit) * 100) : 0,
    },
    ruleSets: {
      current: rsCount?.total ?? 0,
      limit: ruleSetsLimit,
      pct: ruleSetsLimit > 0 ? Math.round(((rsCount?.total ?? 0) / ruleSetsLimit) * 100) : 0,
    },
    rules: {
      current: ruleCount,
      limit: rulesLimit,
      pct: rulesLimit > 0 ? Math.round((ruleCount / rulesLimit) * 100) : 0,
    },
  };
}
