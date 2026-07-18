import { eq, and, gt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb, sessions, users, tenants } from "~/lib/db";
import type { InferSelectModel } from "drizzle-orm";

export type SessionUser = Pick<
  InferSelectModel<typeof users>,
  "id" | "email" | "name" | "role"
> & {
  tenantId: string;
  tenantSlug: string;
  tenantTier: string;
};

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateToken(): string {
  return uuidv4() + "." + uuidv4();
}

/**
 * Create a new session for a user. Stores the session in the database
 * and returns the session token (to be set as a cookie).
 */
export async function createSession(userId: string): Promise<string> {
  const db = getDb();

  // Get user with tenant info
  const [user] = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new Error("User not found");

  const token = generateToken();

  await db.insert(sessions).values({
    userId: user.id,
    tenantId: user.tenantId,
    token,
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
  });

  return token;
}

/**
 * Validate a session token and return the user if valid.
 * Returns null if the session is expired or invalid.
 */
export async function validateSession(
  token: string,
): Promise<SessionUser | null> {
  const db = getDb();

  const [session] = await db
    .select({
      userId: sessions.userId,
      tenantId: sessions.tenantId,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1);

  if (!session) return null;
  if (new Date() > session.expiresAt) {
    // Clean up expired session
    await db.delete(sessions).where(eq(sessions.token, token));
    return null;
  }

  // Get user + tenant info
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      tenantId: users.tenantId,
      tenantSlug: tenants.slug,
      tenantTier: tenants.tier,
    })
    .from(users)
    .innerJoin(tenants, eq(users.tenantId, tenants.id))
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    tenantId: row.tenantId,
    tenantSlug: row.tenantSlug,
    tenantTier: row.tenantTier,
  };
}

/**
 * Delete a session (logout).
 */
export async function destroySession(token: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.token, token));
}
