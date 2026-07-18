import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  real,
  integer,
  jsonb,
  bigserial,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────

export const tenantTierEnum = pgEnum("tenant_tier", [
  "starter",
  "professional",
  "enterprise",
]);

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "admin",
  "compliance_officer",
  "viewer",
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "upload",
  "email",
  "slack",
  "api",
  "model_output",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "processing",
  "processed",
  "failed",
]);

export const frameworkEnum = pgEnum("framework", [
  "SEC",
  "FINRA",
  "FDA",
  "GDPR",
  "HIPAA",
  "CCPA",
  "custom",
]);

export const ruleTypeEnum = pgEnum("rule_type", [
  "pattern",
  "semantic",
  "composite",
]);

export const severityEnum = pgEnum("severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "open",
  "acknowledged",
  "resolved",
  "false_positive",
]);

export const auditEventTypeEnum = pgEnum("audit_event_type", [
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
]);

// ── Tables ─────────────────────────────────────────────────

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    tier: tenantTierEnum("tier").notNull().default("starter"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_tenants_slug").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }),
    role: userRoleEnum("role").notNull().default("compliance_officer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_users_email_tenant").on(t.email, t.tenantId),
    index("idx_users_tenant").on(t.tenantId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_sessions_token").on(t.token),
    index("idx_sessions_user").on(t.userId),
    index("idx_sessions_expires").on(t.expiresAt),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 500 }).notNull(),
    sourceType: sourceTypeEnum("source_type").notNull().default("upload"),
    contentText: text("content_text"),
    contentChunks: jsonb("content_chunks").$type<string[]>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    status: documentStatusEnum("status").notNull().default("pending"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    fileHash: varchar("file_hash", { length: 128 }),
    fileSize: integer("file_size"),
    pageCount: integer("page_count"),
    wordCount: integer("word_count"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_documents_tenant_status").on(t.tenantId, t.status),
    index("idx_documents_tenant_created").on(t.tenantId, t.createdAt.desc()),
  ],
);

export const ruleSets = pgTable(
  "rule_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    framework: frameworkEnum("framework").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_rule_sets_tenant").on(t.tenantId)],
);

export const rules = pgTable(
  "rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ruleSetId: uuid("rule_set_id")
      .notNull()
      .references(() => ruleSets.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    type: ruleTypeEnum("type").notNull(),
    config: jsonb("config").notNull(),
    severity: severityEnum("severity").notNull().default("medium"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_rules_set").on(t.ruleSetId)],
);

export const evaluations = pgTable(
  "evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => rules.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index"),
    triggered: boolean("triggered").notNull().default(false),
    confidence: real("confidence"),
    evidenceText: text("evidence_text"),
    reasoning: text("reasoning"),
    humanOverride: boolean("human_override").default(false),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_evaluations_document").on(t.documentId),
    index("idx_evaluations_rule").on(t.ruleId),
    index("idx_evaluations_tenant").on(t.tenantId),
  ],
);

export const alertGroups = pgTable(
  "alert_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    ruleId: uuid("rule_id").references(() => rules.id),
    alertCount: integer("alert_count").notNull().default(0),
    highestSeverity: severityEnum("highest_severity").notNull(),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_alert_groups_tenant").on(t.tenantId),
    index("idx_alert_groups_rule").on(t.ruleId),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    alertGroupId: uuid("alert_group_id").references(() => alertGroups.id),
    severity: severityEnum("severity").notNull(),
    status: alertStatusEnum("status").notNull().default("open"),
    title: varchar("title", { length: 500 }).notNull(),
    summary: text("summary"),
    recommendedAction: text("recommended_action"),
    assignedTo: uuid("assigned_to").references(() => users.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    documentName: varchar("document_name", { length: 500 }),
    chunkIndex: integer("chunk_index"),
    evidenceText: text("evidence_text"),
    evidenceContext: text("evidence_context"),
    ruleId: uuid("rule_id").references(() => rules.id),
    ruleName: varchar("rule_name", { length: 255 }),
    ruleSetName: varchar("rule_set_name", { length: 255 }),
    framework: frameworkEnum("framework"),
    reasoning: text("reasoning"),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_alerts_tenant_status").on(t.tenantId, t.status),
    index("idx_alerts_tenant_severity").on(t.tenantId, t.severity),
    index("idx_alerts_group").on(t.alertGroupId),
    index("idx_alerts_evaluation").on(t.evaluationId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventType: auditEventTypeEnum("event_type").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: uuid("resource_id"),
    payload: jsonb("payload"),
    prevHash: text("prev_hash"),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_audit_log_tenant").on(t.tenantId, t.createdAt.desc()),
    index("idx_audit_log_resource").on(t.resourceType, t.resourceId),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    quantity: integer("quantity").default(1),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_usage_tenant_date").on(t.tenantId, t.recordedAt.desc())],
);
