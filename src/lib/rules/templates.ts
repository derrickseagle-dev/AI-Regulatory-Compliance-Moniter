/**
 * Pre-built compliance rule templates for Regula AI.
 * Used to seed new tenants with ready-to-use rule configurations.
 */
import type { RuleConfig } from "./types";

export interface RuleTemplate {
  name: string;
  description: string;
  type: "pattern" | "semantic" | "composite";
  framework: "SEC" | "FINRA" | "FDA" | "GDPR" | "HIPAA" | "CCPA" | "custom";
  severity: "low" | "medium" | "high" | "critical";
  config: RuleConfig;
  category: string;
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  // ── 1. GDPR Personal Data Detection ──────────────────────
  {
    name: "GDPR Personal Data Detection",
    description:
      "Detects personally identifiable information (PII) in documents: email addresses, phone numbers, IP addresses, and postal addresses. Flags unredacted personal data that may violate GDPR Article 5 (data minimization) and Article 32 (security of processing).",
    type: "pattern",
    framework: "GDPR",
    severity: "high",
    category: "Data Privacy",
    config: {
      type: "pattern",
      patterns: [
        {
          id: "email",
          label: "Email Address",
          regex:
            "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b",
          flags: "gi",
        },
        {
          id: "phone",
          label: "Phone Number",
          regex:
            "\\b(\\+?\\d{1,3}[-.\\s]?)?\\(?\\d{2,4}\\)?[-.\\s]?\\d{2,4}[-.\\s]?\\d{2,4}\\b",
          flags: "gi",
        },
        {
          id: "ip",
          label: "IP Address",
          regex:
            "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b",
          flags: "gi",
        },
        {
          id: "address",
          label: "Postal Address",
          keywords: [
            "street",
            "avenue",
            "road",
            "lane",
            "drive",
            "boulevard",
            "postal code",
            "zip code",
            "city",
            "state",
            "country",
          ],
          proximity: 10,
          requireAll: false,
          caseSensitive: false,
        },
      ],
      matchLogic: "any",
    },
  },

  // ── 2. SEC Forward-Looking Statement ──────────────────────
  {
    name: "SEC Forward-Looking Statement",
    description:
      "Detects forward-looking language about future performance that lacks required safe-harbor disclaimers. SEC Rule 175 and the Private Securities Litigation Reform Act require forward-looking statements to be accompanied by meaningful cautionary language.",
    type: "pattern",
    framework: "SEC",
    severity: "high",
    category: "Securities Compliance",
    config: {
      type: "pattern",
      patterns: [
        {
          id: "forward_looking",
          label: "Forward-Looking Language",
          keywords: [
            "expects",
            "anticipates",
            "believes",
            "estimates",
            "projects",
            "forecast",
            "target",
            "outlook",
            "guidance",
            "will grow",
            "will increase",
            "will achieve",
            "future performance",
            "projected revenue",
            "expected earnings",
          ],
          caseSensitive: false,
        },
        {
          id: "disclaimer",
          label: "Safe Harbor Disclaimer",
          keywords: [
            "safe harbor",
            "forward-looking statements",
            "cautionary statement",
            "risk factors",
            "actual results may differ",
            "Private Securities Litigation Reform Act",
            "Section 27A",
            "Section 21E",
          ],
          caseSensitive: false,
        },
      ],
      matchLogic: "all",
    },
  },

  // ── 3. HIPAA PHI Detection ───────────────────────────────
  {
    name: "HIPAA PHI Detection",
    description:
      "Detects Protected Health Information (PHI) including medical record numbers, health plan beneficiary IDs, treatment dates, and other identifiers covered under HIPAA's Privacy Rule (45 CFR § 164.514).",
    type: "pattern",
    framework: "HIPAA",
    severity: "critical",
    category: "Healthcare Privacy",
    config: {
      type: "pattern",
      patterns: [
        {
          id: "mrn",
          label: "Medical Record Number",
          regex: "\\bMRN[#:]?\\s*\\d{4,10}\\b",
          flags: "gi",
        },
        {
          id: "health_plan_id",
          label: "Health Plan Beneficiary ID",
          regex: "\\b(HPID|BENE?F?)[#:]?\\s*[A-Z0-9]{6,16}\\b",
          flags: "gi",
        },
        {
          id: "treatment_date",
          label: "Treatment Date",
          keywords: [
            "date of service",
            "admission date",
            "discharge date",
            "date of birth",
            "DOB",
            "treatment date",
            "diagnosis date",
          ],
          proximity: 10,
          caseSensitive: false,
        },
        {
          id: "phi_direct",
          label: "PHI Identifiers",
          keywords: [
            "patient name",
            "patient DOB",
            "SSN",
            "social security",
            "insurance ID",
            "policy number",
            "medical record",
            "health record",
          ],
          caseSensitive: false,
        },
      ],
      matchLogic: "any",
    },
  },

  // ── 4. FINRA Communication Review ────────────────────────
  {
    name: "FINRA Communication Review",
    description:
      "Detects exaggerated, unwarranted, or misleading claims in financial communications. Addresses FINRA Rule 2210 (Communications with the Public) and Rule 2211 (Institutional Communications) requirements for fair and balanced messaging.",
    type: "pattern",
    framework: "FINRA",
    severity: "high",
    category: "Financial Communications",
    config: {
      type: "pattern",
      patterns: [
        {
          id: "exaggerated",
          label: "Exaggerated Claims",
          keywords: [
            "guaranteed returns",
            "risk-free",
            "no risk",
            "100% safe",
            "can't lose",
            "sure thing",
            "guaranteed profit",
            "completely safe",
            "foolproof",
            "no downside",
            "always wins",
            "bulletproof",
          ],
          caseSensitive: false,
        },
        {
          id: "promissory",
          label: "Promissory Language",
          keywords: [
            "promise",
            "pledge",
            "assure",
            "guarantee",
            "warrant",
            "commit to deliver",
            "will definitely",
            "will certainly",
            "without exception",
          ],
          proximity: 15,
          caseSensitive: false,
        },
        {
          id: "urgency",
          label: "Urgency Tactics",
          keywords: [
            "act now",
            "limited time",
            "don't miss out",
            "urgent",
            "expires soon",
            "today only",
            "last chance",
            "hurry",
            "must act",
          ],
          caseSensitive: false,
        },
      ],
      matchLogic: "any",
    },
  },

  // ── 5. FDA Off-Label Promotion ───────────────────────────
  {
    name: "FDA Off-Label Promotion",
    description:
      "Flags language suggesting unapproved uses of drugs or medical devices. The FDA prohibits manufacturers from promoting products for uses not covered by their approved labeling (§ 21 CFR 202.1). Uses semantic AI to evaluate nuanced contextual suggestions.",
    type: "semantic",
    framework: "FDA",
    severity: "critical",
    category: "Pharma Compliance",
    config: {
      type: "semantic",
      prompt:
        "You are an FDA compliance reviewer. Review the following text and determine if it suggests or promotes off-label (unapproved) uses of any drug or medical device. An off-label promotion is any statement that suggests, implies, or describes a use of the product that is not in its FDA-approved labeling. Even indirect suggestions — such as discussing a medical condition without naming the drug, but in a context that implies a link — may qualify. Respond ONLY with valid JSON: { \"verdict\": \"violation\" | \"clear\" | \"inconclusive\", \"confidence\": <0-1>, \"explanation\": \"...\", \"citedText\": \"...\" }",
      framework: "FDA",
      ruleDescription:
        "Detect language that promotes or suggests off-label uses of drugs or medical devices, including indirect or contextual suggestions of unapproved indications, populations, or dosage regimens.",
      model: "gpt-4o",
      temperature: 0.1,
      confidenceThreshold: 0.7,
    },
  },
];
