/**
 * Pattern Rule Evaluator — regex/keyword matching against document text.
 *
 * Pure functions: no DB dependencies, no side effects.
 * Fully unit-testable.
 */

import type {
  PatternRuleConfig,
  PatternConfig,
  PatternFinding,
} from "./types";

/**
 * Evaluate a single pattern config against the given text.
 * Returns an array of findings (empty if no match).
 */
export function evaluatePattern(
  text: string,
  pattern: PatternConfig,
): PatternFinding[] {
  const findings: PatternFinding[] = [];

  if (pattern.regex) {
    findings.push(...evaluateRegex(text, pattern));
  } else if (pattern.keywords && pattern.keywords.length > 0) {
    if (pattern.proximity !== undefined && pattern.proximity > 0) {
      findings.push(...evaluateProximity(text, pattern));
    } else {
      findings.push(...evaluateKeywords(text, pattern));
    }
  }

  return findings;
}

/**
 * Evaluate a full pattern rule (multiple patterns + matchLogic) against text.
 */
export function evaluatePatternRule(
  text: string,
  config: PatternRuleConfig,
): PatternFinding[] {
  const allFindings: PatternFinding[] = [];

  for (const pattern of config.patterns) {
    const findings = evaluatePattern(text, pattern);
    allFindings.push(...findings);
  }

  if (allFindings.length === 0) return [];

  // Apply matchLogic
  if (config.matchLogic === "all") {
    // Must match ALL patterns. Check if each pattern produced at least one finding.
    const patternIdsWithFindings = new Set(
      allFindings.map((f) => f.patternId),
    );
    const allPatternIds = config.patterns.map((p) => p.id);
    const allMatched = allPatternIds.every((pid) =>
      patternIdsWithFindings.has(pid),
    );

    return allMatched ? allFindings : [];
  }

  // "any" mode (default): return all findings
  return allFindings;
}

// ── Private Helpers ──────────────────────────────────────────

function evaluateRegex(
  text: string,
  pattern: PatternConfig,
): PatternFinding[] {
  if (!pattern.regex) return [];

  const findings: PatternFinding[] = [];
  const flags = pattern.flags || (pattern.caseSensitive ? "g" : "gi");
  const re = new RegExp(pattern.regex, flags);

  let match: RegExpExecArray | null;
  // Reset lastIndex manually since we create a fresh regex each call
  while ((match = re.exec(text)) !== null) {
    const matchedText = match[0];
    const position = match.index;
    findings.push({
      patternId: pattern.id,
      label: pattern.label,
      matchedText,
      position,
      length: matchedText.length,
      context: extractContext(text, position, matchedText.length),
    });

    // Prevent infinite loops on zero-length matches
    if (match[0].length === 0) {
      if (re.lastIndex >= text.length) break;
      re.lastIndex++;
    }
  }

  return findings;
}

function evaluateKeywords(
  text: string,
  pattern: PatternConfig,
): PatternFinding[] {
  if (!pattern.keywords || pattern.keywords.length === 0) return [];

  const findings: PatternFinding[] = [];
  const lowerText = pattern.caseSensitive ? text : text.toLowerCase();

  for (const keyword of pattern.keywords) {
    const searchTerm = pattern.caseSensitive ? keyword : keyword.toLowerCase();
    let pos = 0;

    while ((pos = lowerText.indexOf(searchTerm, pos)) !== -1) {
      findings.push({
        patternId: pattern.id,
        label: pattern.label,
        matchedText: text.slice(pos, pos + keyword.length),
        position: pos,
        length: keyword.length,
        context: extractContext(text, pos, keyword.length),
      });
      pos += keyword.length;
    }
  }

  return findings;
}

/**
 * Proximity matching: find windows of N words where all keywords appear.
 * Uses a sliding window of `proximity` words.
 */
function evaluateProximity(
  text: string,
  pattern: PatternConfig,
): PatternFinding[] {
  if (!pattern.keywords || pattern.keywords.length < 2) return [];
  const proximity = pattern.proximity ?? 50;

  // Split text into words with their positions (split on whitespace and hyphens)
  const words = text.split(/[\s-]+/);
  const wordPositions: { word: string; start: number; end: number }[] = [];
  let charPos = 0;

  for (const word of words) {
    // Find the actual position of this word in the text
    const idx = text.indexOf(word, charPos);
    if (idx === -1) break;
    wordPositions.push({
      word: pattern.caseSensitive ? word : word.toLowerCase(),
      start: idx,
      end: idx + word.length,
    });
    charPos = idx + word.length;
  }

  const searchTerms = pattern.keywords.map((k) =>
    pattern.caseSensitive ? k : k.toLowerCase(),
  );

  const findings: PatternFinding[] = [];
  const seenWindows = new Set<string>();

  // Slide a window of `proximity` words over the text
  for (let i = 0; i < wordPositions.length; i++) {
    const windowEnd = Math.min(i + proximity, wordPositions.length);
    const windowWords = wordPositions.slice(i, windowEnd);

    const foundAll = pattern.requireAll
      ? searchTerms.every((term) =>
          windowWords.some((wp) => wp.word === term),
        )
      : searchTerms.some((term) =>
          windowWords.some((wp) => wp.word === term),
        );

    if (foundAll) {
      // Find the matched terms in this window
      const matchedTerms = searchTerms.filter((term) =>
        windowWords.some((wp) => wp.word === term),
      );

      const windowStart = wordPositions[i].start;
      const windowEndPos =
        windowWords[windowWords.length - 1]?.end ?? windowStart;

      const windowKey = `${windowStart}-${windowEndPos}`;
      if (seenWindows.has(windowKey)) continue;
      seenWindows.add(windowKey);

      const matchedText = text.slice(windowStart, windowEndPos);

      findings.push({
        patternId: pattern.id,
        label: pattern.label,
        matchedText:
          matchedText.length > 200
            ? matchedText.slice(0, 197) + "..."
            : matchedText,
        position: windowStart,
        length: windowEndPos - windowStart,
        context: extractContext(text, windowStart, windowEndPos - windowStart),
      });
    }
  }

  return findings;
}

/**
 * Extract surrounding context (±100 chars) around a match.
 */
function extractContext(
  text: string,
  position: number,
  length: number,
): string {
  const contextRadius = 100;
  const matchEnd = position + length;
  const start = Math.max(0, position - contextRadius);
  const end = Math.min(text.length, matchEnd + contextRadius);

  let context = text.slice(start, end);
  if (start > 0) context = "..." + context;
  if (end < text.length) context = context + "...";

  return context;
}
