/**
 * Alert system types for Regula AI.
 * Based on architecture doc Section 6.
 */

import type { Severity, AlertStatus, Framework } from "~/lib/db/schema";

export type { Severity, AlertStatus, Framework };

// ── Alert ────────────────────────────────────────────────────
export interface Alert {
  id: string;
  tenantId: string;
  title: string;
  severity: Severity;
  status: AlertStatus;

  // Evidence
  documentId: string;
  documentName: string;
  chunkIndex: number;
  evidenceText: string;
  evidenceContext: string;

  // Rule
  ruleId: string;
  ruleName: string;
  ruleSetName: string;
  framework: string;

  // Reasoning
  reasoning: string;
  confidence: number;

  // Action
  recommendedAction: string;

  // Grouping
  alertGroupId: string | null;

  // Lifecycle
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  dismissedAt: string | null;
  dismissedBy: string | null;
  assignedTo: string | null;
}

// ── Alert Group ──────────────────────────────────────────────
export interface AlertGroup {
  id: string;
  tenantId: string;
  title: string;
  ruleId: string;
  documentIds: string[];
  alertCount: number;
  highestSeverity: Severity;
  summary: string;
  createdAt: string;
}

// ── Alert Creation Input ─────────────────────────────────────
export interface CreateAlertInput {
  tenantId: string;
  evaluationId?: string;
  documentId: string;
  documentName: string;
  chunkIndex?: number;
  evidenceText: string;
  evidenceContext?: string;
  ruleId: string;
  ruleName: string;
  ruleSetName?: string;
  framework?: string;
  reasoning: string;
  confidence: number;
  recommendedAction?: string;
  severity: Severity;
}

// ── Alert Lifecycle ──────────────────────────────────────────
export type AlertTransition = "acknowledge" | "resolve" | "dismiss";

export const ALERT_LIFECYCLE: Record<AlertStatus, AlertTransition[]> = {
  open: ["acknowledge", "dismiss"],
  acknowledged: ["resolve", "dismiss"],
  resolved: [],
  false_positive: [],
};

// ── Alert Grouping Key ───────────────────────────────────────
export interface AlertGroupingKey {
  ruleId: string;
  documentType?: string;
  timeWindow: string; // ISO date string truncated to hour
}

// ── Alert Feed Item (for UI) ─────────────────────────────────
export interface AlertFeedItem {
  id: string;
  title: string;
  severity: Severity;
  status: AlertStatus;
  ruleName: string;
  documentName: string;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  dismissedAt: string | null;
}
