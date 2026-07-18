/**
 * Rule Engine — barrel export.
 */
export * from "./types";
export { evaluatePatternRule, evaluatePattern } from "./pattern-evaluator";
export {
  evaluateSemanticRule,
  evaluateSemanticRulesBatch,
} from "./semantic-evaluator";
export {
  evaluateComposite,
  makePatternSubResult,
  makeSemanticSubResult,
} from "./composite-evaluator";
export { evaluateDocument } from "./engine";
