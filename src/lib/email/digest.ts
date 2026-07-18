/**
 * Email digest generation for Regula AI.
 * Pure function: queries recent activity and generates digest content.
 */
import { getDb, alerts, documents, rules, ruleSets, users, tenants } from "~/lib/db";
import { eq, and, gte, desc } from "drizzle-orm";

export interface DigestContent {
  subject: string;
  htmlBody: string;
  textBody: string;
  recipientEmail: string;
  recipientName: string;
}

export interface DigestStats {
  newAlerts: number;
  criticalAlerts: number;
  highAlerts: number;
  resolvedAlerts: number;
  newDocuments: number;
  rulesEvaluated: number;
  totalActiveRules: number;
}

/**
 * Generate a daily digest for a specific tenant + user combination.
 * Queries the last 24 hours of activity.
 */
export async function generateDailyDigest(
  tenantId: string,
  userId: string,
): Promise<DigestContent | null> {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch tenant
  const [tenant] = await db
    .select({ name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return null;

  // Fetch user
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);

  if (!user) return null;

  // Count new alerts in last 24h
  const [newAlerts] = await db
    .select({ total: { count: alerts.id } as any })
    .from(alerts)
    .where(
      and(
        eq(alerts.tenantId, tenantId),
        gte(alerts.createdAt, since),
      ),
    );
  const alertCount = Number((newAlerts as any)?.total?.count ?? 0);

  // Count critical alerts
  const [criticalAlerts] = await db
    .select({ total: { count: alerts.id } as any })
    .from(alerts)
    .where(
      and(
        eq(alerts.tenantId, tenantId),
        eq(alerts.severity, "critical"),
        gte(alerts.createdAt, since),
      ),
    );
  const criticalCount = Number((criticalAlerts as any)?.total?.count ?? 0);

  // Count high severity alerts
  const [highAlerts] = await db
    .select({ total: { count: alerts.id } as any })
    .from(alerts)
    .where(
      and(
        eq(alerts.tenantId, tenantId),
        eq(alerts.severity, "high"),
        gte(alerts.createdAt, since),
      ),
    );
  const highCount = Number((highAlerts as any)?.total?.count ?? 0);

  // Count resolved alerts in last 24h
  const [resolvedAlerts] = await db
    .select({ total: { count: alerts.id } as any })
    .from(alerts)
    .where(
      and(
        eq(alerts.tenantId, tenantId),
        eq(alerts.status, "resolved"),
        gte(alerts.updatedAt, since),
      ),
    );
  const resolvedCount = Number((resolvedAlerts as any)?.total?.count ?? 0);

  // Count new documents in last 24h
  const [newDocs] = await db
    .select({ total: { count: documents.id } as any })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, tenantId),
        gte(documents.createdAt, since),
      ),
    );
  const docCount = Number((newDocs as any)?.total?.count ?? 0);

  // Count total active rules
  const tenantRuleSets = await db
    .select({ id: ruleSets.id })
    .from(ruleSets)
    .where(eq(ruleSets.tenantId, tenantId));
  const ruleIds = tenantRuleSets.map(rs => rs.id);
  let activeRules = 0;
  if (ruleIds.length > 0) {
    const [activeCount] = await db
      .select({ total: { count: rules.id } as any })
      .from(rules)
      .where(
        and(
          ...ruleIds.map(id => eq(rules.ruleSetId, id)),
          eq(rules.isActive, true),
        ),
      );
    activeRules = Number((activeCount as any)?.total?.count ?? 0);
  }

  // Fetch recent alert samples (latest 5)
  const recentAlerts = await db
    .select({
      title: alerts.title,
      severity: alerts.severity,
      framework: alerts.framework,
      documentName: alerts.documentName,
    })
    .from(alerts)
    .where(
      and(
        eq(alerts.tenantId, tenantId),
        gte(alerts.createdAt, since),
      ),
    )
    .orderBy(desc(alerts.createdAt))
    .limit(5);

  const stats: DigestStats = {
    newAlerts: alertCount,
    criticalAlerts: criticalCount,
    highAlerts: highCount,
    resolvedAlerts: resolvedCount,
    newDocuments: docCount,
    rulesEvaluated: alertCount, // simplified: each alert = one evaluation
    totalActiveRules: activeRules,
  };

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subject = `Regula AI Daily Digest — ${dateStr}`;
  const recipientEmail = user.email || "";
  const recipientName = user.name || recipientEmail.split("@")[0];

  const htmlBody = buildHtml(tenant.name, dateStr, stats, recentAlerts);
  const textBody = buildText(tenant.name, dateStr, stats, recentAlerts);

  return { subject, htmlBody, textBody, recipientEmail, recipientName };
}

function buildHtml(
  tenantName: string,
  dateStr: string,
  stats: DigestStats,
  recentAlerts: any[],
): string {
  const alertRows = recentAlerts.length > 0
    ? recentAlerts
        .map(
          (a: any) =>
            `<tr><td style="padding:8px 12px;border-bottom:1px solid #333;color:#e5e7eb;">${escapeHtml(a.title)}</td><td style="padding:8px 12px;border-bottom:1px solid #333;"><span style="background:${severityColor(a.severity)};color:#fff;padding:2px 8px;border-radius:12px;font-size:12px;">${a.severity}</span></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2" style="padding:16px;color:#6b7280;text-align:center;">No new alerts today</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0f172a;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#818cf8;font-size:24px;margin:0;">Regula AI</h1>
      <p style="color:#6b7280;margin:4px 0 0;">Compliance Digest for ${escapeHtml(tenantName)}</p>
    </div>
    <div style="background:#1e293b;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="color:#e5e7eb;font-size:16px;margin:0 0 16px;">${dateStr}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#9ca3af;">New Alerts</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;font-size:20px;color:${stats.newAlerts > 0 ? '#f87171' : '#34d399'}">${stats.newAlerts}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#9ca3af;">Critical</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;color:${stats.criticalAlerts > 0 ? '#f87171' : '#6b7280'}">${stats.criticalAlerts}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#9ca3af;">High</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;color:${stats.highAlerts > 0 ? '#fb923c' : '#6b7280'}">${stats.highAlerts}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#9ca3af;">Resolved</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;color:#34d399">${stats.resolvedAlerts}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#9ca3af;">New Documents</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;color:#e5e7eb">${stats.newDocuments}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#9ca3af;">Active Rules</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;color:#e5e7eb">${stats.totalActiveRules}</td>
        </tr>
      </table>
    </div>
    <div style="background:#1e293b;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="color:#e5e7eb;font-size:16px;margin:0 0 16px;">Recent Alerts</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:12px;text-transform:uppercase;">Alert</th><th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:12px;text-transform:uppercase;">Severity</th></tr></thead>
        <tbody>${alertRows}</tbody>
      </table>
    </div>
    <div style="text-align:center;">
      <a href="${process.env.PUBLIC_URL || "https://regula.ai"}/app/alerts" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">View Full Dashboard</a>
    </div>
    <p style="color:#4b5563;font-size:12px;text-align:center;margin-top:24px;">
      Regula AI — Continuous compliance monitoring<br/>
      <a href="${process.env.PUBLIC_URL || "https://regula.ai"}/app/preferences" style="color:#6b7280;">Manage digest preferences</a>
    </p>
  </div>
</body>
</html>`;
}

function buildText(
  tenantName: string,
  dateStr: string,
  stats: DigestStats,
  recentAlerts: any[],
): string {
  const lines = [
    `Regula AI — Daily Compliance Digest`,
    `${tenantName} | ${dateStr}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "SUMMARY",
    "━━━━━━━━━━━━━━━━━━━━",
    `New Alerts:      ${stats.newAlerts}`,
    `  Critical:      ${stats.criticalAlerts}`,
    `  High:          ${stats.highAlerts}`,
    `Resolved:        ${stats.resolvedAlerts}`,
    `New Documents:   ${stats.newDocuments}`,
    `Active Rules:    ${stats.totalActiveRules}`,
    "",
  ];

  if (recentAlerts.length > 0) {
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push("RECENT ALERTS");
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    for (const a of recentAlerts) {
      lines.push(`[${a.severity.toUpperCase()}] ${a.title}`);
    }
  } else {
    lines.push("No new alerts today. All clear!");
  }

  lines.push("");
  lines.push(`View dashboard: ${process.env.PUBLIC_URL || "https://regula.ai"}/app/alerts`);

  return lines.join("\n");
}

function severityColor(s: string): string {
  const map: Record<string, string> = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#eab308",
    low: "#3b82f6",
  };
  return map[s] || "#6b7280";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
