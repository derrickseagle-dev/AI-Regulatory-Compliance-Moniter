/**
 * Semantic Rule Evaluator — uses OpenAI GPT-4o to evaluate document content
 * against natural-language compliance rules.
 *
 * Pure functions: no DB dependencies. Requires OPENAI_API_KEY env var.
 * Degrades gracefully with clear error messages if the key is not set.
 */

import OpenAI from "openai";
import type { SemanticRuleConfig, SemanticFinding, SemanticVerdict } from "./types";

// ── Cost constants (USD per 1K tokens, as of July 2026) ─────
const GPT4O_INPUT_COST_PER_1K = 0.0025;
const GPT4O_OUTPUT_COST_PER_1K = 0.01;

// ── System prompt template ──────────────────────────────────

const SYSTEM_PROMPT = `You are a regulatory compliance reviewer. Your task is to evaluate whether the provided text violates a specific compliance rule.

Respond ONLY with a JSON object in this exact format:
{
  "verdict": "violation" | "clear" | "inconclusive",
  "confidence": <number between 0 and 1>,
  "explanation": "<brief reasoning for your verdict>",
  "citedText": "<exact text from the document that supports your verdict>"
}

Rules:
- "violation": the text violates the rule
- "clear": the text does not violate the rule
- "inconclusive": you cannot determine with sufficient confidence
- confidence: 0.0-1.0 indicating how confident you are
- citedText: quote the specific passage(s) from the document that informed your decision. Use "N/A" if no specific text is relevant.
- Be conservative: only return "violation" if you are confident the text violates the rule.`;

// ── Lazy OpenAI client ──────────────────────────────────────

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set — semantic rule evaluation requires an OpenAI API key. " +
        "Set OPENAI_API_KEY in the environment to enable LLM-powered rules.",
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

// ── Public API ──────────────────────────────────────────────

/**
 * Evaluate a single semantic rule against document text.
 * Returns a structured finding with verdict, confidence, and cost estimate.
 */
export async function evaluateSemanticRule(
  text: string,
  config: SemanticRuleConfig,
): Promise<SemanticFinding> {
  const client = getClient();
  const model = config.model || "gpt-4o";
  const temperature = config.temperature ?? 0.1;
  const confidenceThreshold = config.confidenceThreshold ?? 0.7;

  const userPrompt = buildUserPrompt(text, config);

  const response = await client.chat.completions.create({
    model,
    temperature,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 500,
  });

  const usage = response.usage;
  const tokensUsed = (usage?.total_tokens ?? 0);
  const estimatedCost = estimateCost(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
  );

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    return {
      verdict: "inconclusive",
      confidence: 0,
      explanation: "No response from LLM.",
      citedText: "",
      tokensUsed,
      estimatedCost,
    };
  }

  const parsed = parseVerdict(rawContent, confidenceThreshold);
  return { ...parsed, tokensUsed, estimatedCost };
}

/**
 * Evaluate multiple semantic rules against a single document text in one API call.
 * This batches N rule descriptions into a single request to control costs.
 */
export async function evaluateSemanticRulesBatch(
  text: string,
  configs: SemanticRuleConfig[],
): Promise<SemanticFinding[]> {
  if (configs.length === 0) return [];

  const client = getClient();
  const model = configs[0].model || "gpt-4o";
  const temperature = configs[0].temperature ?? 0.1;

  const rulesJson = configs.map((c, i) => ({
    id: `rule_${i}`,
    framework: c.framework,
    description: c.ruleDescription,
    threshold: c.confidenceThreshold ?? 0.7,
  }));

  const batchSystemPrompt = `You are a regulatory compliance reviewer. Evaluate the provided text against MULTIPLE compliance rules simultaneously.

Respond ONLY with a JSON object in this format:
{
  "results": [
    {
      "ruleId": "rule_0",
      "verdict": "violation" | "clear" | "inconclusive",
      "confidence": <number 0-1>,
      "explanation": "<brief reasoning>",
      "citedText": "<exact text or N/A>"
    },
    ...
  ]
}`;

  const userPrompt = `RULES TO EVALUATE:\n${JSON.stringify(rulesJson, null, 2)}\n\nDOCUMENT TEXT:\n---\n${text.slice(0, 8000)}\n---\n\nEvaluate the document against each rule.`;

  const response = await client.chat.completions.create({
    model,
    temperature,
    messages: [
      { role: "system", content: batchSystemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
  });

  const usage = response.usage;
  const totalTokens = usage?.total_tokens ?? 0;
  const estimatedCost = estimateCost(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
  );

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    return configs.map(() => ({
      verdict: "inconclusive" as SemanticVerdict,
      confidence: 0,
      explanation: "No response from LLM.",
      citedText: "",
      tokensUsed: totalTokens,
      estimatedCost,
    }));
  }

  try {
    const parsed = JSON.parse(rawContent);
    const results = parsed.results || [];

    // Distribute cost equally among rules
    const perRuleCost = estimatedCost / configs.length;
    const perRuleTokens = Math.ceil(totalTokens / configs.length);

    return configs.map((config, i) => {
      const result = results[i];
      if (!result) {
        return {
          verdict: "inconclusive" as SemanticVerdict,
          confidence: 0,
          explanation: "No result for this rule in batch response.",
          citedText: "",
          tokensUsed: perRuleTokens,
          estimatedCost: perRuleCost,
        };
      }
      return {
        verdict: normalizeVerdict(result.verdict, config.confidenceThreshold ?? 0.7, result.confidence ?? 0),
        confidence: result.confidence ?? 0,
        explanation: result.explanation || "No explanation provided.",
        citedText: result.citedText || "",
        tokensUsed: perRuleTokens,
        estimatedCost: perRuleCost,
      };
    });
  } catch {
    return configs.map(() => ({
      verdict: "inconclusive" as SemanticVerdict,
      confidence: 0,
      explanation: "Failed to parse LLM response.",
      citedText: "",
      tokensUsed: totalTokens,
      estimatedCost: estimatedCost / configs.length,
    }));
  }
}

// ── Helpers ─────────────────────────────────────────────────

function buildUserPrompt(text: string, config: SemanticRuleConfig): string {
  const truncatedText =
    text.length > 12000 ? text.slice(0, 11997) + "..." : text;

  return `REGULATORY FRAMEWORK: ${config.framework}
RULE DESCRIPTION: ${config.ruleDescription}

DOCUMENT TEXT:
---
${truncatedText}
---

Evaluate whether this document text violates the rule described above.`;
}

function parseVerdict(
  rawJson: string,
  threshold: number,
): Omit<SemanticFinding, "tokensUsed" | "estimatedCost"> {
  try {
    const parsed = JSON.parse(rawJson);
    return {
      verdict: normalizeVerdict(parsed.verdict, threshold, parsed.confidence ?? 0),
      confidence: parsed.confidence ?? 0,
      explanation: parsed.explanation || "No explanation provided.",
      citedText: parsed.citedText || "",
    };
  } catch {
    return {
      verdict: "inconclusive",
      confidence: 0,
      explanation: `Failed to parse LLM response: ${rawJson.slice(0, 200)}`,
      citedText: "",
    };
  }
}

function normalizeVerdict(
  raw: string | undefined,
  threshold: number,
  confidence: number,
): SemanticVerdict {
  if (!raw) return "inconclusive";
  const v = raw.toLowerCase();
  if (v === "violation") {
    // Only count as violation if confidence >= threshold
    return confidence >= threshold ? "violation" : "inconclusive";
  }
  if (v === "clear") return "clear";
  return "inconclusive";
}

function estimateCost(
  promptTokens: number,
  completionTokens: number,
): number {
  return (
    (promptTokens / 1000) * GPT4O_INPUT_COST_PER_1K +
    (completionTokens / 1000) * GPT4O_OUTPUT_COST_PER_1K
  );
}
