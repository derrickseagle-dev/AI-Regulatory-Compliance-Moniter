import { getDb, auditLog, type InferInsertModel } from "~/lib/db";
import type { SessionUser } from "~/lib/auth/session";

type AuditEntry = Omit<
  InferInsertModel<typeof auditLog>,
  "id" | "prevHash" | "contentHash" | "createdAt"
>;

/**
 * Write an entry to the immutable audit log.
 * The hash chaining is handled by a PostgreSQL trigger.
 */
export async function writeAuditEntry(
  entry: AuditEntry,
  user?: SessionUser,
): Promise<void> {
  const db = getDb();

  await db.insert(auditLog).values({
    ...entry,
    actorId: entry.actorId || user?.id || null,
  });
}

/**
 * Convenience helpers for common audit events
 */
export const auditEvents = {
  writeAuditEntry,

  documentUploaded(
    tenantId: string,
    documentId: string,
    payload: Record<string, unknown>,
    user?: SessionUser,
  ) {
    return writeAuditEntry(
      {
        tenantId,
        eventType: "document.uploaded",
        resourceType: "document",
        resourceId: documentId,
        payload,
      },
      user,
    );
  },

  documentProcessed(
    tenantId: string,
    documentId: string,
    payload: Record<string, unknown>,
    user?: SessionUser,
  ) {
    return writeAuditEntry(
      {
        tenantId,
        eventType: "document.processed",
        resourceType: "document",
        resourceId: documentId,
        payload,
      },
      user,
    );
  },

  evaluationCompleted(
    tenantId: string,
    evaluationId: string,
    payload: Record<string, unknown>,
    user?: SessionUser,
  ) {
    return writeAuditEntry(
      {
        tenantId,
        eventType: "evaluation.completed",
        resourceType: "evaluation",
        resourceId: evaluationId,
        payload,
      },
      user,
    );
  },

  userLogin(
    tenantId: string,
    userId: string,
    payload: Record<string, unknown>,
  ) {
    return writeAuditEntry({
      tenantId,
      eventType: "user.login",
      resourceType: "user",
      resourceId: userId,
      actorId: userId,
      payload,
    });
  },

  userLogout(
    tenantId: string,
    userId: string,
    payload: Record<string, unknown>,
  ) {
    return writeAuditEntry({
      tenantId,
      eventType: "user.logout",
      resourceType: "user",
      resourceId: userId,
      actorId: userId,
      payload,
    });
  },

  ruleCreated(
    tenantId: string,
    ruleId: string,
    payload: Record<string, unknown>,
    user?: SessionUser,
  ) {
    return writeAuditEntry(
      {
        tenantId,
        eventType: "rule.created",
        resourceType: "rule",
        resourceId: ruleId,
        payload,
      },
      user,
    );
  },

  ruleUpdated(
    tenantId: string,
    ruleId: string,
    payload: Record<string, unknown>,
    user?: SessionUser,
  ) {
    return writeAuditEntry(
      {
        tenantId,
        eventType: "rule.updated",
        resourceType: "rule",
        resourceId: ruleId,
        payload,
      },
      user,
    );
  },

  ruleDeleted(
    tenantId: string,
    ruleId: string,
    payload: Record<string, unknown>,
    user?: SessionUser,
  ) {
    return writeAuditEntry(
      {
        tenantId,
        eventType: "rule.deleted",
        resourceType: "rule",
        resourceId: ruleId,
        payload,
      },
      user,
    );
  },

  alertCreated(
    tenantId: string,
    alertId: string,
    payload: Record<string, unknown>,
    user?: SessionUser,
  ) {
    return writeAuditEntry(
      {
        tenantId,
        eventType: "alert.created",
        resourceType: "alert",
        resourceId: alertId,
        payload,
      },
      user,
    );
  },

  alertAcknowledged(
    tenantId: string,
    alertId: string,
    payload: Record<string, unknown>,
    user?: SessionUser,
  ) {
    return writeAuditEntry(
      {
        tenantId,
        eventType: "alert.acknowledged",
        resourceType: "alert",
        resourceId: alertId,
        payload,
      },
      user,
    );
  },

  alertResolved(
    tenantId: string,
    alertId: string,
    payload: Record<string, unknown>,
    user?: SessionUser,
  ) {
    return writeAuditEntry(
      {
        tenantId,
        eventType: "alert.resolved",
        resourceType: "alert",
        resourceId: alertId,
        payload,
      },
      user,
    );
  },

  alertDismissed(
    tenantId: string,
    alertId: string,
    payload: Record<string, unknown>,
    user?: SessionUser,
  ) {
    return writeAuditEntry(
      {
        tenantId,
        eventType: "alert.dismissed",
        resourceType: "alert",
        resourceId: alertId,
        payload,
      },
      user,
    );
  },

  alertStatusChanged(
    tenantId: string,
    alertId: string,
    payload: Record<string, unknown>,
    user?: SessionUser,
  ) {
    return writeAuditEntry(
      {
        tenantId,
        eventType: "alert.status_changed",
        resourceType: "alert",
        resourceId: alertId,
        payload,
      },
      user,
    );
  },
};
