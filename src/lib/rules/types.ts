/**
 * Shared types for the Regula AI rule engine.
 */

import type { Severity, Framework, RuleType } from "~/lib/db/schema";

// Re-export enums used in rules
export type { Severity, Framework, RuleType };

// ── Pattern Rule Types ──────────────────────────────────────

export interface PatternConfig {
  /** Unique identifier for this pattern within the rule */
  id: string;
  /** Human-readable label for the pattern match */
  label: string;
  /** Regex pattern (optional if keywords are provided) */
  regex?: string;
  /** Regex flags (e.g., 'gi' for global + case-insensitive) */
  flags?: string;
  /** Keyword list (optional if regex is provided) */
  keywords?: string[];
  /** Maximum word distance for proximity matching (e.g., term1 within N words of term2) */
  proximity?: number;
  /** For proximity matches: require all keywords to be found within the window */
  requireAll?: boolean;
  /** Whether matching is case-sensitive (default: false) */
  caseSensitive?: boolean;
}

export interface PatternRuleConfig {
  type: "pattern";
  /** Array of pattern definitions to match against */
  patterns: PatternConfig[];
  /** Logic for combining multiple patterns: 'any' (OR) or 'all' (AND) */
  matchLogic: "any" | "all";
}

export interface PatternFinding {
  /** Which pattern was matched */
  patternId: string;
  /** The label from the pattern config */
  label: string;
  /** The exact text that matched */
  matchedText: string;
  /** Character offset (0-based) where the match starts */
  position: number;
  /** Length of the matched text */
  length: number;
  /** The surrounding context (±100 chars) */
  context: string;
}

// ── Semantic Rule Types ─────────────────────────────────────

export interface SemanticRuleConfig {
  type: "semantic";
  /** The prompt template to send to the LLM. Variables: {framework}, {rule_description} */
  prompt: string;
  /** Regulatory framework this rule targets */
  framework: Framework;
  /** Natural-language description of what constitutes a violation */
  ruleDescription: string;
  /** The LLM model to use (default: gpt-4o) */
  model?: string;
  /** Temperature for LLM calls (default: 0.1) */
  temperature?: number;
  /** Minimum confidence to trigger a violation (default: 0.7) */
  confidenceThreshold?: number;
}

export type SemanticVerdict = "violation" | "clear" | "inconclusive";

export interface SemanticFinding {
  verdict: SemanticVerdict;
  /** Confidence score 0-1 */
  confidence: number;
  /** Explanation of the finding */
  explanation: string;
  /** The specific text cited as evidence */
  citedText: string;
  /** Total tokens used for this evaluation (for cost tracking) */
  tokensUsed: number;
  /** Estimated cost in USD */
  estimatedCost: number;
}

// ── Composite Rule Types ────────────────────────────────────

export interface CompositeRuleNode {
  logic: "AND" | "OR";
  rules: (CompositeRuleRef | CompositeRuleNode)[];
}

export interface CompositeRuleRef {
  ruleId: string;
}

export interface CompositeRuleConfig {
  type: "composite";
  config: CompositeRuleNode;
}

export interface CompositeFinding {
  /** Whether the composite rule overall was triggered */
  triggered: boolean;
  /** Results of each sub-rule evaluation, keyed by rule ID */
  subResults: Record<string, SubRuleResult>;
}

export interface SubRuleResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  confidence: number;
  evidence: string;
}

// ── Unified Rule Config ─────────────────────────────────────

export type RuleConfig = PatternRuleConfig | SemanticRuleConfig | CompositeRuleConfig;

// ── Rule Definition (stored in DB) ──────────────────────────

export interface RuleDefinition {
  id: string;
  ruleSetId: string;
  name: string;
  description?: string;
  type: RuleType;
  config: RuleConfig;
  severity: Severity;
  framework: Framework;
  isActive: boolean;
  createdAt: string;
}

// ── Evaluation Result ───────────────────────────────────────

export interface EvaluationResult {
  documentId: string;
  ruleId: string;
  ruleName: string;
  ruleType: RuleType;
  severity: Severity;
  framework: Framework;
  triggered: boolean;
  confidence: number;
  evidenceText: string;
  reasoning: string;
  chunkIndex?: number;
  /** Cost incurred by this evaluation (USD) */
  costIncurred: number;
  /** Time taken for evaluation (ms) */
  timeMs: number;
}

// ── Engine Report ───────────────────────────────────────────

export interface EngineReport {
  documentId: string;
  totalRules: number;
  passedRules: number;
  violationsFound: number;
  results: EvaluationResult[];
  totalCost: number;
  totalTimeMs: number;
}
