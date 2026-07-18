/**
 * Composite Rule Evaluator — combines pattern and semantic evaluators
 * with AND/OR boolean logic.
 *
 * Pure functions: no DB dependencies. Receives sub-evaluator results as input.
 */

import type {
  CompositeRuleConfig,
  CompositeRuleNode,
  CompositeRuleRef,
  CompositeFinding,
  SubRuleResult,
  PatternFinding,
  SemanticFinding,
} from "./types";

/**
 * Evaluate a composite rule given the results of its sub-rules.
 *
 * @param config - The composite rule configuration with AND/OR logic tree
 * @param subResults - Map of ruleId → evaluation result (pre-computed)
 * @returns CompositeFinding with overall triggered status and per-sub-rule results
 */
export function evaluateComposite(
  config: CompositeRuleConfig,
  subResults: Record<string, SubRuleResult>,
): CompositeFinding {
  const triggered = evaluateNode(config.config, subResults);
  return { triggered, subResults };
}

/**
 * Recursively evaluate a composite rule node (AND/OR tree).
 */
function evaluateNode(
  node: CompositeRuleNode,
  subResults: Record<string, SubRuleResult>,
): boolean {
  const results = node.rules.map((child) => {
    if (isCompositeNode(child)) {
      return evaluateNode(child, subResults);
    }
    // Leaf node: reference to a sub-rule
    const result = subResults[child.ruleId];
    if (!result) {
      // Sub-rule not found — treat as false (conservative)
      return false;
    }
    return result.triggered;
  });

  if (node.logic === "AND") {
    return results.every((r) => r === true);
  }
  // OR
  return results.some((r) => r === true);
}

/**
 * Build a SubRuleResult from a pattern evaluation.
 */
export function makePatternSubResult(
  ruleId: string,
  ruleName: string,
  findings: PatternFinding[],
): SubRuleResult {
  const triggered = findings.length > 0;
  const evidence = findings.map((f) => f.matchedText).join(" | ");
  return {
    ruleId,
    ruleName,
    triggered,
    confidence: triggered ? 1.0 : 0.0,
    evidence,
  };
}

/**
 * Build a SubRuleResult from a semantic evaluation.
 */
export function makeSemanticSubResult(
  ruleId: string,
  ruleName: string,
  finding: SemanticFinding,
): SubRuleResult {
  return {
    ruleId,
    ruleName,
    triggered: finding.verdict === "violation",
    confidence: finding.confidence,
    evidence: finding.citedText || finding.explanation,
  };
}

// ── Helpers ─────────────────────────────────────────────────

function isCompositeNode(
  child: CompositeRuleRef | CompositeRuleNode,
): child is CompositeRuleNode {
  return "logic" in child && "rules" in child;
}
