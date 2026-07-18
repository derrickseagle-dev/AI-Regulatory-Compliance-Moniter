/**
 * Email sender for Regula AI.
 * Delegates to src/lib/email/provider.ts which handles real sending
 * via Resend (when EMAIL_API_KEY is set) or file-based logging (fallback).
 */
import { sendEmail } from "./provider";
import type { DigestContent } from "./digest";

export interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  created_at: string;
  status: string;
}

/**
 * Send a digest email. Uses the email provider (Resend or file logging).
 */
export async function sendDigestEmail(digest: DigestContent): Promise<EmailLogEntry> {
  const result = await sendEmail({
    to: digest.recipientEmail,
    subject: digest.subject,
    htmlBody: digest.htmlBody,
    textBody: digest.textBody,
  });

  return {
    id: result.id,
    to: result.to,
    subject: result.subject,
    htmlBody: digest.htmlBody,
    textBody: digest.textBody,
    created_at: result.createdAt,
    status: result.status,
  };
}

/**
 * Send a generic email — used for transactional emails like onboarding welcome.
 */
export async function sendTransactionalEmail(
  to: string,
  subject: string,
  htmlBody: string,
  textBody?: string,
): Promise<EmailLogEntry> {
  const result = await sendEmail({
    to,
    subject,
    htmlBody,
    textBody,
  });

  return {
    id: result.id,
    to: result.to,
    subject: result.subject,
    htmlBody,
    textBody: textBody || "",
    created_at: result.createdAt,
    status: result.status,
  };
}
