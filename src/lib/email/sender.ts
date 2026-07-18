/**
 * MVP email sender for Regula AI.
 * Logs emails to a JSON file for now — real email sending to be added in a later phase.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { DigestContent } from "./digest";

export interface EmailLogEntry {
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

/**
 * For MVP: log the digest email to a JSON file.
 * In production, this would send via SendGrid, SES, or similar.
 */
export async function sendDigestEmail(digest: DigestContent): Promise<EmailLogEntry> {
  const entry: EmailLogEntry = {
    id: crypto.randomUUID(),
    to: digest.recipientEmail,
    subject: digest.subject,
    htmlBody: digest.htmlBody,
    textBody: digest.textBody,
    created_at: new Date().toISOString(),
    status: "logged",
  };

  appendToLog(entry);
  console.log(`[Email] Digest logged to ${LOG_FILE}: ${digest.subject} -> ${digest.recipientEmail}`);
  return entry;
}
