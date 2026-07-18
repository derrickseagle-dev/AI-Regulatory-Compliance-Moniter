/**
 * Demo rules for seed data.
 * - 5 pre-built templates from RULE_TEMPLATES
 * - 2 additional pattern rules specific to demo
 */
import { RULE_TEMPLATES } from "~/lib/rules/templates";
import type { RuleConfig } from "~/lib/rules/types";

export interface DemoRuleDefinition {
  name: string;
  description: string;
  type: "pattern" | "semantic";
  framework: string;
  severity: "low" | "medium" | "high" | "critical";
  config: RuleConfig;
}

/** The 5 pre-built template rules to activate during seed */
export const DEMO_TEMPLATE_RULES = RULE_TEMPLATES;

/** Additional demo-specific pattern rules */
export const DEMO_EXTRA_RULES: DemoRuleDefinition[] = [
  // ── 6. Internal: Confidential Material ─────────────────────
  {
    name: "Internal: Confidential Material",
    description:
      "Flags documents marked as confidential or internal-only that may be at risk of external distribution. Identifies confidentiality markings that indicate sensitive internal documents requiring access control.",
    type: "pattern",
    framework: "custom",
    severity: "medium",
    config: {
      type: "pattern",
      patterns: [
        {
          id: "confidential_marking",
          label: "Confidentiality Marking",
          keywords: [
            "CONFIDENTIAL",
            "INTERNAL USE ONLY",
            "DO NOT DISTRIBUTE",
            "PROPRIETARY",
            "CONFIDENTIAL — INTERNAL",
            "NOT FOR DISTRIBUTION",
          ],
          caseSensitive: false,
        },
      ],
      matchLogic: "any",
    },
  },

  // ── 7. Misleading Statistics ───────────────────────────────
  {
    name: "Misleading Statistics",
    description:
      "Detects statistical claims made without source citations, cherry-picked data patterns, or percentages presented without context. Flags potentially unsubstantiated numerical claims that could be considered misleading.",
    type: "pattern",
    framework: "custom",
    severity: "high",
    config: {
      type: "pattern",
      patterns: [
        {
          id: "pct_claim",
          label: "Unsubstantiated Percentage Claim",
          regex: "\\b(\\d{2,3}\\.?\\d?%)\\b",
          flags: "gi",
        },
        {
          id: "cherry_picked",
          label: "Cherry-Picked or Absolute Language",
          keywords: [
            "100%",
            "zero",
            "never",
            "always",
            "without exception",
            "every single",
            "all of our",
            "none of",
            "absolutely no",
          ],
          caseSensitive: false,
        },
        {
          id: "missing_source",
          label: "Claim Without Source Citation",
          keywords: [
            "our data shows",
            "studies show",
            "research indicates",
            "data proves",
            "statistics demonstrate",
          ],
          caseSensitive: false,
        },
      ],
      matchLogic: "any",
    },
  },
];

/** All demo rules combined (templates + extras) */
export const ALL_DEMO_RULES = [
  ...DEMO_TEMPLATE_RULES,
  ...DEMO_EXTRA_RULES,
];
