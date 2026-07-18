/**
 * Email provider abstraction for Regula AI.
 *
 * When EMAIL_API_KEY is set (Resend API key, starts with "re_"),
 * sends real emails via the Resend API. When not configured, falls
 * back to file-based logging at data/email-log.json.
 *
 * Supports switching providers by adding new send functions and
 * checking for their respective env vars.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface SendEmailInput {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export interface SendEmailResult {
  id: string;
  to: string;
  subject: string;
  status: "sent" | "logged";
  provider: string;
  providerId?: string;
  createdAt: string;
}

interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  created_at: string;
  status: "logged";
}

const LOG_DIR = join("/home/team/shared/site/data");
const LOG_FILE = join(LOG_DIR, "email-log.json");

// ── File logging fallback ───────────────────────────────────────

function ensureLogFile(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  if (!existsSync(LOG_FILE)) {
    writeFileSync(LOG_FILE, "[]", "utf-8");
  }
}

function readLog(): EmailLogEntry[] {
  ensureLogFile();
  try {
    const raw = readFileSync(LOG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function appendToLog(entry: EmailLogEntry): void {
  const log = readLog();
  log.push(entry);
  writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), "utf-8");
}

// ── Resend provider (via REST API) ──────────────────────────────

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.EMAIL_API_KEY;
  if (!apiKey) throw new Error("EMAIL_API_KEY not set");

  const from = process.env.EMAIL_FROM || "Regula AI <noreply@regula.ai>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.htmlBody,
      text: input.textBody || undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }

  const data = await res.json();

  return {
    id: crypto.randomUUID(),
    to: input.to,
    subject: input.subject,
    status: "sent",
    provider: "resend",
    providerId: data.id,
    createdAt: new Date().toISOString(),
  };
}

// ── Logging fallback ────────────────────────────────────────────

function logToFile(input: SendEmailInput): SendEmailResult {
  const entry: EmailLogEntry = {
    id: crypto.randomUUID(),
    to: input.to,
    subject: input.subject,
    htmlBody: input.htmlBody,
    textBody: input.textBody || "",
    created_at: new Date().toISOString(),
    status: "logged",
  };

  appendToLog(entry);
  console.log(`[Email] Logged to ${LOG_FILE}: "${input.subject}" → ${input.to}`);
  return {
    id: entry.id,
    to: input.to,
    subject: input.subject,
    status: "logged",
    provider: "file",
    createdAt: entry.created_at,
  };
}

// ── Main entry point ────────────────────────────────────────────

/**
 * Send an email. Uses the Resend API when EMAIL_API_KEY is configured,
 * otherwise falls back to file-based logging.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.EMAIL_API_KEY;

  if (apiKey && apiKey.startsWith("re_")) {
    try {
      return await sendViaResend(input);
    } catch (err) {
      console.error("[Email] Resend send failed, falling back to log:", err);
      return logToFile(input);
    }
  }

  // No valid API key — log to file
  return logToFile(input);
}
