import { validateSession, type SessionUser } from "./session";

const SESSION_COOKIE = "regula_session";

/**
 * Read the session cookie from a Request's headers.
 */
export function getSessionToken(request: Request): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;

  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Set the session cookie in a Response.
 */
export function setSessionCookie(
  response: Response,
  token: string,
): Response {
  response.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; ` +
      "HttpOnly; SameSite=Lax; Path=/; Max-Age=604800", // 7 days
  );
  return response;
}

/**
 * Clear the session cookie (logout).
 */
export function clearSessionCookie(response: Response): Response {
  response.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
  return response;
}

/**
 * Authenticate a request. Returns the user if authenticated,
 * or null if not. Does not throw — callers decide how to handle
 * unauthenticated requests.
 */
export async function authenticateRequest(
  request: Request,
): Promise<SessionUser | null> {
  const token = getSessionToken(request);
  if (!token) return null;
  return validateSession(token);
}

/**
 * Require authentication. Throws a Response (redirect) if not authenticated.
 */
export async function requireAuth(request: Request): Promise<SessionUser> {
  const user = await authenticateRequest(request);
  if (!user) {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
  }
  return user;
}
