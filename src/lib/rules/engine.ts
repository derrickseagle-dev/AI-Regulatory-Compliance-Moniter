/**
 * Rule Execution Engine — main entry point for evaluating documents against rule sets.
 *
 * Orchestrates pattern → semantic → composite evaluation.
 * Can use a DB connection (for persisting results) or run standalone (for testing).
 */

import { evaluatePatternRule } from "./pattern-evaluator";
import { evaluateSemanticRule, evaluateSemanticRulesBatch } from "./semantic-evaluator";
import {
  evaluateComposite,
  makePatternSubResult,
  makeSemanticSubResult,
} from "./composite-evaluator";
import type {
  RuleDefinition,
  PatternRuleConfig,
  SemanticRuleConfig,
  CompositeRuleConfig,
  EvaluationResult,
  EngineReport,
  SemanticFinding,
} from "./types";

// ── Types ───────────────────────────────────────────────────

/** Minimal document shape the engine needs */
export interface EngineDocument {
  id: string;
  contentText: string | null;
  contentChunks: string[] | null;
}

/** Rule definitions with their DB config parsed */
export interface EngineRule {
  id: string;
  ruleSetId: string;
  name: string;
  type: "pattern" | "semantic" | "composite";
  config: PatternRuleConfig | SemanticRuleConfig | CompositeRuleConfig;
  severity: "low" | "medium" | "high" | "critical";
  framework: string;
  isActive: boolean;
}

/** Optional callback to persist evaluations */
export type PersistEvaluationFn = (
  result: EvaluationResult,
) => Promise<void> | void;

// ── Main API ────────────────────────────────────────────────

/**
 * Evaluate a document against all active rules in a rule set.
 *
 * The evaluation flow:
 * 1. Load active rules from the rule set
 * 2. For each document chunk: evaluate pattern rules first (cheap)
 * 3. Batch semantic rules and evaluate them via LLM
 * 4. Evaluate composite rules using sub-results
 * 5. Aggregate results into a report
 *
 * @param document - The document to evaluate (must have contentText and/or contentChunks)
 * @param rules - Array of active rule definitions to evaluate against
 * @param persistFn - Optional callback to persist each evaluation result
 * @returns EngineReport with all results, costs, and timing
 */
export async function evaluateDocument(
  document: EngineDocument,
  rules: EngineRule[],
  persistFn?: PersistEvaluationFn,
): Promise<EngineReport> {
  const startTime = Date.now();
  const activeRules = rules.filter((r) => r.isActive);

  // Determine text sources: prefer chunks, fall back to full text
  const texts = getTextSources(document);
  if (texts.length === 0) {
    return emptyReport(document.id, activeRules.length, Date.now() - startTime);
  }

  // Separate rules by type
  const patternRules = activeRules.filter((r) => r.type === "pattern");
  const semanticRules = activeRules.filter((r) => r.type === "semantic");
  const compositeRules = activeRules.filter((r) => r.type === "composite");

  const allResults: EvaluationResult[] = [];
  let totalCost = 0;

  // Use the first chunk for evaluation (full-text evaluation)
  // For multi-chunk documents, we evaluate against combined text
  const combinedText = texts.join("\n\n---\n\n");

  // ── 1. Pattern Rules (cheap, run first) ──────────────────
  const patternResults = evaluatePatternRules(
    document.id,
    combinedText,
    patternRules,
  );
  allResults.push(...patternResults);
  await persistResults(patternResults, persistFn);

  // ── 2. Semantic Rules (LLM-based, batch them) ────────────
  if (semanticRules.length > 0) {
    const { results: semResults, cost } = await evaluateSemanticRules(
      document.id,
      combinedText,
      semanticRules,
    );
    allResults.push(...semResults);
    totalCost += cost;
    await persistResults(semResults, persistFn);
  }

  // ── 3. Composite Rules ───────────────────────────────────
  if (compositeRules.length > 0) {
    const compResults = evaluateCompositeRules(
      document.id,
      compositeRules,
      allResults,
    );
    allResults.push(...compResults);
    await persistResults(compResults, persistFn);
  }

  const totalTimeMs = Date.now() - startTime;
  const violationsFound = allResults.filter((r) => r.triggered).length;

  return {
    documentId: document.id,
    totalRules: activeRules.length,
    passedRules: activeRules.length - violationsFound,
    violationsFound,
    results: allResults,
    totalCost,
    totalTimeMs,
  };
}

// ── Private Helpers ─────────────────────────────────────────

function getTextSources(document: EngineDocument): string[] {
  if (document.contentChunks && document.contentChunks.length > 0) {
    return document.contentChunks;
  }
  if (document.contentText) {
    return [document.contentText];
  }
  return [];
}

function evaluatePatternRules(
  documentId: string,
  text: string,
  rules: EngineRule[],
): EvaluationResult[] {
  const results: EvaluationResult[] = [];

  for (const rule of rules) {
    const t0 = Date.now();
    const config = rule.config as PatternRuleConfig;
    const findings = evaluatePatternRule(text, config);
    const triggered = findings.length > 0;

    results.push({
      documentId,
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: "pattern",
      severity: rule.severity,
      framework: rule.framework as EvaluationResult["framework"],
      triggered,
      confidence: triggered ? 1.0 : 0.0,
      evidenceText: findings.map((f) => f.matchedText).join(" | "),
      reasoning: triggered
        ? `Matched ${findings.length} pattern(s): ${findings.map((f) => f.label).join(", ")}`
        : "No patterns matched.",
      costIncurred: 0,
      timeMs: Date.now() - t0,
    });
  }

  return results;
}

async function evaluateSemanticRules(
  documentId: string,
  text: string,
  rules: EngineRule[],
): Promise<{ results: EvaluationResult[]; cost: number }> {
  const t0 = Date.now();
  const configs = rules.map((r) => r.config as SemanticRuleConfig);

  let findings: SemanticFinding[];
  let totalCost = 0;

  try {
    if (rules.length === 1) {
      const finding = await evaluateSemanticRule(text, configs[0]);
      findings = [finding];
      totalCost = finding.estimatedCost;
    } else {
      findings = await evaluateSemanticRulesBatch(text, configs);
      totalCost = findings.reduce((sum, f) => sum + f.estimatedCost, 0);
    }
  } catch (err) {
    // If LLM call fails, mark all as inconclusive
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    findings = rules.map(() => ({
      verdict: "inconclusive" as const,
      confidence: 0,
      explanation: `Semantic evaluation failed: ${errorMsg}`,
      citedText: "",
      tokensUsed: 0,
      estimatedCost: 0,
    }));
  }

  const results: EvaluationResult[] = rules.map((rule, i) => {
    const finding = findings[i] ?? {
      verdict: "inconclusive" as const,
      confidence: 0,
      explanation: "No result returned.",
      citedText: "",
      tokensUsed: 0,
      estimatedCost: 0,
    };

    return {
      documentId,
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: "semantic",
      severity: rule.severity,
      framework: rule.framework as EvaluationResult["framework"],
      triggered: finding.verdict === "violation",
      confidence: finding.confidence,
      evidenceText: finding.citedText,
      reasoning: finding.explanation,
      costIncurred: finding.estimatedCost,
      timeMs: Math.round((Date.now() - t0) / rules.length),
    };
  });

  return { results, cost: totalCost };
}

function evaluateCompositeRules(
  documentId: string,
  rules: EngineRule[],
  previousResults: EvaluationResult[],
): EvaluationResult[] {
  const results: EvaluationResult[] = [];

  // Build a sub-results map from previous evaluations
  const subResultsMap: Record<string, import("./types").SubRuleResult> = {};
  for (const r of previousResults) {
    subResultsMap[r.ruleId] = {
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      triggered: r.triggered,
      confidence: r.confidence,
      evidence: r.evidenceText,
    };
  }

  for (const rule of rules) {
    const t0 = Date.now();
    const config = rule.config as CompositeRuleConfig;
    const finding = evaluateComposite(config, subResultsMap);

    const triggered = finding.triggered;
    const subEvidence = Object.values(finding.subResults)
      .filter((sr) => sr.triggered)
      .map((sr) => `[${sr.ruleName}]: ${sr.evidence}`)
      .join("; ");

    const maxConfidence = Math.max(
      0,
      ...Object.values(finding.subResults).map((sr) => sr.confidence),
    );

    results.push({
      documentId,
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: "composite",
      severity: rule.severity,
      framework: rule.framework as EvaluationResult["framework"],
      triggered,
      confidence: triggered ? maxConfidence : 0,
      evidenceText: subEvidence,
      reasoning: triggered
        ? `Composite rule triggered. Logic: ${config.config.logic}. Sub-results: ${Object.values(finding.subResults).map((sr) => `${sr.ruleName}=${sr.triggered}`).join(", ")}`
        : "Composite rule not triggered.",
      costIncurred: 0,
      timeMs: Date.now() - t0,
    });
  }

  return results;
}

function emptyReport(
  documentId: string,
  totalRules: number,
  totalTimeMs: number,
): EngineReport {
  return {
    documentId,
    totalRules,
    passedRules: totalRules,
    violationsFound: 0,
    results: [],
    totalCost: 0,
    totalTimeMs,
  };
}

async function persistResults(
  results: EvaluationResult[],
  persistFn?: PersistEvaluationFn,
): Promise<void> {
  if (!persistFn) return;
  for (const result of results) {
    await persistFn(result);
  }
}
