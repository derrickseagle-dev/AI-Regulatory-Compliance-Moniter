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
};
