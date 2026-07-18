/**
 * Alert Generation Engine
 *
 * Pure functions for creating alerts from evaluation results,
 * with grouping, deduplication, and lifecycle management.
 *
 * All functions are pure where possible — they work with data
 * and don't depend on a database connection directly.
 */

import { v4 as uuid } from "uuid";
import type {
  Alert,
  CreateAlertInput,
  AlertGroup,
  AlertGroupingKey,
  AlertTransition,
  AlertStatus,
} from "./types";
import { ALERT_LIFECYCLE } from "./types";
import type { EvaluationResult } from "~/lib/rules/types";

// ── Alert Generation ─────────────────────────────────────────

/**
 * Generate an alert from an evaluation result.
 * Pure function — returns the alert object without side effects.
 */
export function generateAlert(input: CreateAlertInput): Alert {
  const now = new Date().toISOString();

  return {
    id: uuid(),
    tenantId: input.tenantId,
    title: generateAlertTitle(input.ruleName, input.severity),
    severity: input.severity,
    status: "open",

    documentId: input.documentId,
    documentName: input.documentName,
    chunkIndex: input.chunkIndex ?? 0,
    evidenceText: input.evidenceText,
    evidenceContext: input.evidenceContext || generateEvidenceContext(input.evidenceText),

    ruleId: input.ruleId,
    ruleName: input.ruleName,
    ruleSetName: input.ruleSetName || "Default",
    framework: input.framework || "custom",

    reasoning: input.reasoning,
    confidence: input.confidence,
    recommendedAction: input.recommendedAction || generateRecommendedAction(input.ruleName, input.severity),

    alertGroupId: null, // Set by grouping logic
    createdAt: now,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolvedBy: null,
    dismissedAt: null,
    dismissedBy: null,
    assignedTo: null,
  };
}

/**
 * Generate alerts from a batch of evaluation results.
 * Applies deduplication and grouping.
 */
export function generateAlertsFromEvaluations(
  results: EvaluationResult[],
  tenantId: string,
  documentName: string,
): { alerts: CreateAlertInput[]; groups: AlertGroupingKey[] } {
  const triggered = results.filter(r => r.triggered);
  const seen = new Set<string>();
  const alerts: CreateAlertInput[] = [];
  const groups: AlertGroupingKey[] = [];

  for (const result of triggered) {
    // Dedup: same rule + same document + same evidenceText
    const dedupKey = `${result.ruleId}|${result.documentId}|${result.evidenceText.slice(0, 200)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    alerts.push({
      tenantId,
      documentId: result.documentId,
      documentName,
      chunkIndex: result.chunkIndex,
      evidenceText: result.evidenceText,
      ruleId: result.ruleId,
      ruleName: result.ruleName,
      ruleSetName: undefined,
      framework: result.framework,
      reasoning: result.reasoning,
      confidence: result.confidence,
      severity: result.severity,
      recommendedAction: undefined,
    });
  }

  return { alerts, groups: computeGroupingKeys(alerts) };
}

// ── Deduplication ────────────────────────────────────────────

/**
 * Check if an alert would be a duplicate of an existing one.
 */
export function isDuplicate(
  newAlert: CreateAlertInput,
  existingAlerts: Alert[],
): boolean {
  return existingAlerts.some(a => {
    return (
      a.ruleId === newAlert.ruleId &&
      a.documentId === newAlert.documentId &&
      a.evidenceText.slice(0, 200) === newAlert.evidenceText.slice(0, 200)
    );
  });
}

// ── Alert Grouping ───────────────────────────────────────────

/**
 * Compute grouping keys for a set of alerts.
 * Groups alerts with the same rule + document type + time window.
 */
export function computeGroupingKeys(alerts: CreateAlertInput[]): AlertGroupingKey[] {
  const groupMap = new Map<string, AlertGroupingKey>();

  for (const alert of alerts) {
    const key = buildGroupingKeyString({
      ruleId: alert.ruleId,
      timeWindow: new Date().toISOString().slice(0, 13) + ":00", // truncate to hour
    });

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        ruleId: alert.ruleId,
        timeWindow: new Date().toISOString().slice(0, 13) + ":00",
      });
    }
  }

  return Array.from(groupMap.values());
}

function buildGroupingKeyString(key: AlertGroupingKey): string {
  return `${key.ruleId}|${key.documentType || ""}|${key.timeWindow}`;
}

/**
 * Group alerts and return alert-group assignments.
 * Returns a map of alert ID → group ID.
 */
export function assignAlertsToGroups(
  alerts: Alert[],
  groupKeys: AlertGroupingKey[],
): Map<string, string> {
  const assignments = new Map<string, string>();

  for (const alert of alerts) {
    for (const key of groupKeys) {
      if (key.ruleId === alert.ruleId) {
        assignments.set(alert.id, uuid());
        break;
      }
    }
  }

  return assignments;
}

/**
 * Create an alert group summary from grouped alerts.
 */
export function createAlertGroup(
  tenantId: string,
  title: string,
  ruleId: string,
  alerts: Alert[],
  summary?: string,
): AlertGroup {
  return {
    id: uuid(),
    tenantId,
    title,
    ruleId,
    documentIds: [...new Set(alerts.map(a => a.documentId))],
    alertCount: alerts.length,
    highestSeverity: computeHighestSeverity(alerts.map(a => a.severity)),
    summary: summary || `${alerts.length} alert(s) triggered for rule "${alerts[0]?.ruleName || ruleId}"`,
    createdAt: new Date().toISOString(),
  };
}

// ── Lifecycle State Machine ──────────────────────────────────

/**
 * Transition an alert's status.
 * Validates the transition against the lifecycle state machine.
 */
export function transitionAlert(
  alert: Alert,
  transition: AlertTransition,
  actorId: string,
): Alert {
  const allowed = ALERT_LIFECYCLE[alert.status];
  if (!allowed || !allowed.includes(transition)) {
    throw new Error(
      `Invalid transition "${transition}" from status "${alert.status}". ` +
      `Allowed: ${allowed?.join(", ") || "none"}`,
    );
  }

  const now = new Date().toISOString();
  const updated = { ...alert };

  switch (transition) {
    case "acknowledge":
      updated.status = "acknowledged";
      updated.acknowledgedAt = now;
      updated.acknowledgedBy = actorId;
      break;
    case "resolve":
      updated.status = "resolved";
      updated.resolvedAt = now;
      updated.resolvedBy = actorId;
      break;
    case "dismiss":
      updated.status = "false_positive";
      updated.dismissedAt = now;
      updated.dismissedBy = actorId;
      break;
  }

  return updated;
}

// ── Helpers ──────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function computeHighestSeverity(severities: string[]): "low" | "medium" | "high" | "critical" {
  let highest: "low" | "medium" | "high" | "critical" = "low";
  for (const s of severities) {
    if ((SEVERITY_ORDER[s] ?? 0) > SEVERITY_ORDER[highest]) {
      highest = s as typeof highest;
    }
  }
  return highest;
}

function generateAlertTitle(ruleName: string, severity: string): string {
  const prefix = severity === "critical" ? "CRITICAL: " : severity === "high" ? "High: " : "";
  return `${prefix}Potential violation — ${ruleName}`;
}

function generateEvidenceContext(evidenceText: string): string {
  // Return a snippet around the evidence, or the evidence itself
  const maxLen = 500;
  if (evidenceText.length <= maxLen) return evidenceText;
  const start = Math.max(0, Math.floor((evidenceText.length - maxLen) / 2));
  return "…" + evidenceText.slice(start, start + maxLen) + "…";
}

function generateRecommendedAction(ruleName: string, severity: string): string {
  if (severity === "critical") {
    return `IMMEDIATE ACTION REQUIRED: Review "${ruleName}" violation. Escalate to compliance officer. Consider halting distribution of affected materials.`;
  }
  if (severity === "high") {
    return `Review "${ruleName}" violation within 24 hours. Confirm whether content needs revision before publication.`;
  }
  return `Review "${ruleName}" flag during next compliance review cycle.`;
}

/**
 * Build an alert feed summary suitable for API responses.
 */
export function toFeedItem(alert: Alert) {
  return {
    id: alert.id,
    title: alert.title,
    severity: alert.severity,
    status: alert.status,
    ruleName: alert.ruleName,
    documentName: alert.documentName,
    createdAt: alert.createdAt,
    acknowledgedAt: alert.acknowledgedAt,
    resolvedAt: alert.resolvedAt,
    dismissedAt: alert.dismissedAt,
  };
}
