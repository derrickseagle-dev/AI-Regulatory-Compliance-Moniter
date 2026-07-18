/**
 * Immutable Audit Trail with Cryptographic Chaining.
 *
 * Every audit event is hashed and chained to the previous event's hash,
 * making the entire trail tamper-evident. The verification endpoint
 * walks the chain and reports any anomalies.
 *
 * Based on architecture doc Section 7.
 */

import { createHash } from "node:crypto";
import type { EventType } from "~/lib/db/schema";

// ── Audit Event Interface ────────────────────────────────────

export interface AuditEvent {
  id?: number; // BIGSERIAL from DB, optional for in-memory
  tenantId: string;
  eventType: EventType;
  actorId: string | null;
  resourceType: string;
  resourceId: string | null;
  payload: Record<string, unknown>;
  prevHash: string | null;
  contentHash: string | null;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string; // ISO-8601
}

// ── Hashing ──────────────────────────────────────────────────

const GENESIS_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Compute the SHA-256 content hash for an audit event.
 * Mirrors the PostgreSQL trigger logic from Section 7.2.
 */
export function computeContentHash(event: AuditEvent): string {
  const contentToHash = [
    event.tenantId,
    event.eventType,
    event.resourceId ?? "",
    JSON.stringify(event.payload),
    event.createdAt,
    event.prevHash ?? GENESIS_HASH,
  ].join("|");

  return createHash("sha256").update(contentToHash, "utf8").digest("hex");
}

/**
 * Compute the previous hash for a new event given the previous event.
 */
export function computePrevHash(previousEvent: AuditEvent): string {
  return previousEvent.contentHash ?? computeContentHash(previousEvent);
}

// ── Event Factory ────────────────────────────────────────────

/**
 * Create a new audit event with computed hashes.
 * This mirrors the DB trigger logic in pure TypeScript.
 */
export function createAuditEvent(
  params: Omit<AuditEvent, "prevHash" | "contentHash" | "id">,
  previousEvent?: AuditEvent,
): AuditEvent {
  const prevHash = previousEvent
    ? computePrevHash(previousEvent)
    : GENESIS_HASH;

  const event: AuditEvent = {
    ...params,
    prevHash,
    contentHash: null,
  };

  event.contentHash = computeContentHash(event);
  return event;
}

/**
 * Convenience factory for common event types.
 */
export const auditEventFactory = {
  documentUploaded(
    tenantId: string,
    documentId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "document.uploaded",
      actorId: actorId ?? null,
      resourceType: "document",
      resourceId: documentId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  documentProcessed(
    tenantId: string,
    documentId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "document.processed",
      actorId: actorId ?? null,
      resourceType: "document",
      resourceId: documentId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  evaluationCompleted(
    tenantId: string,
    evaluationId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "evaluation.completed",
      actorId: actorId ?? null,
      resourceType: "evaluation",
      resourceId: evaluationId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  alertCreated(
    tenantId: string,
    alertId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "alert.created",
      actorId: actorId ?? null,
      resourceType: "alert",
      resourceId: alertId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  alertAcknowledged(
    tenantId: string,
    alertId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "alert.acknowledged",
      actorId: actorId ?? null,
      resourceType: "alert",
      resourceId: alertId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  alertResolved(
    tenantId: string,
    alertId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "alert.resolved",
      actorId: actorId ?? null,
      resourceType: "alert",
      resourceId: alertId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  alertDismissed(
    tenantId: string,
    alertId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "alert.dismissed",
      actorId: actorId ?? null,
      resourceType: "alert",
      resourceId: alertId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  alertStatusChanged(
    tenantId: string,
    alertId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "alert.status_changed",
      actorId: actorId ?? null,
      resourceType: "alert",
      resourceId: alertId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  ruleCreated(
    tenantId: string,
    ruleId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "rule.created",
      actorId: actorId ?? null,
      resourceType: "rule",
      resourceId: ruleId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  ruleUpdated(
    tenantId: string,
    ruleId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "rule.updated",
      actorId: actorId ?? null,
      resourceType: "rule",
      resourceId: ruleId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  ruleDeleted(
    tenantId: string,
    ruleId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "rule.deleted",
      actorId: actorId ?? null,
      resourceType: "rule",
      resourceId: ruleId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  userLogin(
    tenantId: string,
    userId: string,
    payload: Record<string, unknown>,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "user.login",
      actorId: userId,
      resourceType: "user",
      resourceId: userId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },

  userLogout(
    tenantId: string,
    userId: string,
    payload: Record<string, unknown>,
  ) {
    return createAuditEvent({
      tenantId,
      eventType: "user.logout",
      actorId: userId,
      resourceType: "user",
      resourceId: userId,
      payload,
      createdAt: new Date().toISOString(),
    });
  },
};

// ── Chain Verification ───────────────────────────────────────

export interface VerificationResult {
  verified: boolean;
  entriesChecked: number;
  firstEntry: { id: number | null; createdAt: string } | null;
  lastEntry: { id: number | null; createdAt: string } | null;
  chainIntact: boolean;
  anomalies: ChainAnomaly[];
}

export interface ChainAnomaly {
  entryId: number | null;
  type: "broken_hash" | "broken_chain" | "missing_prev_hash";
  expectedHash?: string;
  actualHash?: string;
  message: string;
}

/**
 * Verify the integrity of an audit trail chain.
 * Walks every event from first to last, recomputing hashes
 * and checking that prev_hash links are intact.
 */
export function verifyChain(events: AuditEvent[]): VerificationResult {
  if (events.length === 0) {
    return {
      verified: true,
      entriesChecked: 0,
      firstEntry: null,
      lastEntry: null,
      chainIntact: true,
      anomalies: [],
    };
  }

  const anomalies: ChainAnomaly[] = [];

  // Sort by id (ascending) for chain walking
  const sorted = [...events].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];

    // Verify that this event's content hash matches what we compute
    if (event.contentHash) {
      const computedHash = computeContentHash(event);
      if (computedHash !== event.contentHash) {
        anomalies.push({
          entryId: event.id ?? null,
          type: "broken_hash",
          expectedHash: computedHash,
          actualHash: event.contentHash,
          message: `Content hash mismatch at entry ${event.id}`,
        });
      }
    }

    // Verify that the prev_hash links to the previous event's content_hash
    if (i > 0) {
      const prevEvent = sorted[i - 1];
      const expectedPrevHash =
        prevEvent.contentHash ?? computeContentHash(prevEvent);

      if (event.prevHash !== expectedPrevHash) {
        anomalies.push({
          entryId: event.id ?? null,
          type: "broken_chain",
          expectedHash: expectedPrevHash,
          actualHash: event.prevHash ?? undefined,
          message: `Chain broken between entry ${prevEvent.id} and ${event.id}`,
        });
      }
    } else {
      // First entry: prev_hash should be the genesis hash
      if (event.prevHash && event.prevHash !== GENESIS_HASH) {
        anomalies.push({
          entryId: event.id ?? null,
          type: "missing_prev_hash",
          expectedHash: GENESIS_HASH,
          actualHash: event.prevHash,
          message: `First entry ${event.id} should have genesis hash as prev_hash`,
        });
      }
    }
  }

  return {
    verified: anomalies.length === 0,
    entriesChecked: events.length,
    firstEntry: sorted[0]
      ? { id: sorted[0].id ?? null, createdAt: sorted[0].createdAt }
      : null,
    lastEntry: sorted[sorted.length - 1]
      ? {
          id: sorted[sorted.length - 1].id ?? null,
          createdAt: sorted[sorted.length - 1].createdAt,
        }
      : null,
    chainIntact: anomalies.length === 0,
    anomalies,
  };
}

// ── Export Helpers ───────────────────────────────────────────

/**
 * Convert audit events to CSV format.
 */
export function toCSV(events: AuditEvent[]): string {
  const headers = [
    "id",
    "tenant_id",
    "event_type",
    "actor_id",
    "resource_type",
    "resource_id",
    "payload",
    "prev_hash",
    "content_hash",
    "ip_address",
    "user_agent",
    "created_at",
  ];

  const rows = events.map(e => [
    e.id ?? "",
    e.tenantId,
    e.eventType,
    e.actorId ?? "",
    e.resourceType,
    e.resourceId ?? "",
    JSON.stringify(e.payload),
    e.prevHash ?? "",
    e.contentHash ?? "",
    e.ipAddress ?? "",
    e.userAgent ?? "",
    e.createdAt,
  ]);

  return [
    headers.join(","),
    ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
}

/**
 * Convert audit events to JSON format.
 */
export function toJSON(events: AuditEvent[]): string {
  return JSON.stringify(events, null, 2);
}
