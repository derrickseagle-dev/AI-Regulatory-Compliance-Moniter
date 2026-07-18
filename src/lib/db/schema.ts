import { pgTable, uuid, text, varchar, timestamp, boolean, integer, jsonb, bigint, real, pgEnum } from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────
export const tenantTierEnum = pgEnum("tenant_tier", ["starter", "professional", "enterprise"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "member", "viewer"]);
export const sourceTypeEnum = pgEnum("source_type", ["upload", "email", "slack", "api", "model_output"]);
export const documentStatusEnum = pgEnum("document_status", ["pending", "processing", "processed", "failed"]);
export const frameworkEnum = pgEnum("framework", ["SEC", "FINRA", "FDA", "GDPR", "HIPAA", "CCPA", "custom"]);
export const ruleTypeEnum = pgEnum("rule_type", ["pattern", "semantic", "composite"]);
export const severityEnum = pgEnum("severity", ["low", "medium", "high", "critical"]);
export const alertStatusEnum = pgEnum("alert_status", ["open", "acknowledged", "resolved", "false_positive"]);
export const eventTypeEnum = pgEnum("event_type", [
  "document.uploaded",
  "document.processed",
  "rule.created",
  "rule.updated",
  "evaluation.run",
  "alert.created",
  "alert.status_changed",
  "alert.assigned",
  "user.login",
  "tenant.config_changed",
  "evaluation.completed",
  "alert.acknowledged",
  "alert.resolved",
  "alert.dismissed",
  "user.logout",
  "rule.deleted",
]);

// ── Type aliases for wider use ───────────────────────────────
export type Severity = "low" | "medium" | "high" | "critical";
export type Framework = "SEC" | "FINRA" | "FDA" | "GDPR" | "HIPAA" | "CCPA" | "custom";
export type RuleType = "pattern" | "semantic" | "composite";
export type AlertStatus = "open" | "acknowledged" | "resolved" | "false_positive";
export type EventType = typeof eventTypeEnum.enumValues[number];

// ── Tables ───────────────────────────────────────────────────
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  tier: tenantTierEnum("tier").default("starter").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  subscriptionStatus: varchar("subscription_status", { length: 50 }).default("inactive"),
  subscriptionPeriodEnd: timestamp("subscription_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const digestPreferenceEnum = pgEnum("digest_preference", ["daily", "weekly", "off"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  role: userRoleEnum("role").default("member").notNull(),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  onboardingStep: integer("onboarding_step").default(0).notNull(),
  digestPreference: digestPreferenceEnum("digest_preference").default("daily").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  filename: varchar("filename", { length: 500 }).notNull(),
  sourceType: sourceTypeEnum("source_type").default("upload").notNull(),
  contentText: text("content_text"),
  contentChunks: jsonb("content_chunks").$type<string[]>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  status: documentStatusEnum("status").default("pending").notNull(),
  fileSize: integer("file_size"),
  pageCount: integer("page_count"),
  wordCount: integer("word_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ruleSets = pgTable("rule_sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  framework: frameworkEnum("framework").default("custom").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rules = pgTable("rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  ruleSetId: uuid("rule_set_id").references(() => ruleSets.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: ruleTypeEnum("type").default("pattern").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
  severity: severityEnum("severity").default("medium").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const evaluations = pgTable("evaluations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  documentId: uuid("document_id").references(() => documents.id).notNull(),
  ruleId: uuid("rule_id").references(() => rules.id).notNull(),
  chunkIndex: integer("chunk_index"),
  triggered: boolean("triggered").default(false).notNull(),
  confidence: real("confidence").default(0),
  evidenceText: text("evidence_text"),
  reasoning: text("reasoning"),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  evaluationId: uuid("evaluation_id").references(() => evaluations.id),
  alertGroupId: uuid("alert_group_id"),
  severity: severityEnum("severity").default("medium").notNull(),
  status: alertStatusEnum("status").default("open").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  summary: text("summary"),
  recommendedAction: text("recommended_action"),
  evidenceText: text("evidence_text"),
  evidenceContext: text("evidence_context"),
  documentId: uuid("document_id").references(() => documents.id),
  documentName: text("document_name"),
  ruleId: uuid("rule_id").references(() => rules.id),
  ruleName: text("rule_name"),
  ruleSetName: text("rule_set_name"),
  framework: text("framework"),
  reasoning: text("reasoning"),
  confidence: real("confidence").default(0),
  assignedTo: uuid("assigned_to").references(() => users.id),
  chunkIndex: integer("chunk_index"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  dismissedBy: uuid("dismissed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const feedback = pgTable("feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  rating: integer("rating").notNull(), // 1-5 (maps to emoji: 😡😟😐😊😍)
  message: text("message"),
  pageUrl: text("page_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const alertGroups = pgTable("alert_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  ruleId: uuid("rule_id").references(() => rules.id),
  documentIds: jsonb("document_ids").$type<string[]>().default([]),
  alertCount: integer("alert_count").default(0),
  highestSeverity: severityEnum("highest_severity").default("low").notNull(),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  eventType: eventTypeEnum("event_type").notNull(),
  actorId: uuid("actor_id").references(() => users.id),
  resourceType: varchar("resource_type", { length: 100 }).notNull(),
  resourceId: uuid("resource_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  prevHash: text("prev_hash"),
  contentHash: text("content_hash"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
