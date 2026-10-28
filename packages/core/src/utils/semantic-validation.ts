import type {
  IModelValidator,
  IQualityCheckResult,
  IQualityValidationRequest,
  IValidationResult,
  IWordLimitCheck,
} from "../types.js";
import { parseSemanticResult } from "./semantic.js";

/**
 * Checks length only; response validity belongs to the existing parser.
 * Words are whitespace-separated groups, so a hyphenated term counts as one.
 */
export function checkSuggestionLength(
  suggestion: string,
  maxWords = 40,
): IWordLimitCheck {
  if (!Number.isSafeInteger(maxWords) || maxWords <= 0) {
    throw new Error("maxWords must be a positive safe integer");
  }

  const text = suggestion.trim();
  const wordCount = text ? text.split(/\s+/u).length : 0;

  return {
    wordCount,
    maxWords,
    withinLimit: wordCount <= maxWords,
  };
}

export function parseQualityCheckResult(value: unknown): IQualityCheckResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Quality judgment must be an object");
  }

  const result = value as Record<string, unknown>;
  const {
    grounded,
    contextConsistent,
    informative,
    concise,
    noUnsupportedClaims,
    reasons,
  } = result;

  if (
    typeof grounded !== "boolean" ||
    typeof contextConsistent !== "boolean" ||
    typeof informative !== "boolean" ||
    typeof concise !== "boolean" ||
    typeof noUnsupportedClaims !== "boolean"
  ) {
    throw new Error("Quality judgment requires five boolean checks");
  }

  if (
    !Array.isArray(reasons) ||
    !reasons.every(
      (reason) => typeof reason === "string" && reason.trim().length > 0,
    )
  ) {
    throw new Error("Quality judgment reasons must be nonempty strings");
  }

  const allPassed =
    grounded &&
    contextConsistent &&
    informative &&
    concise &&
    noUnsupportedClaims;

  if (allPassed && reasons.length > 0) {
    throw new Error("Passing quality checks must have no failure reasons");
  }
  if (!allPassed && reasons.length === 0) {
    throw new Error("Failed quality checks require a reason");
  }

  return {
    grounded,
    contextConsistent,
    informative,
    concise,
    noUnsupportedClaims,
    reasons: reasons.map((reason) => reason.trim()),
  };
}

export function parseQualityResponseText(
  responseText: string,
): IQualityCheckResult {
  let cleaned = responseText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "");
  }

  let value: unknown;
  try {
    value = JSON.parse(cleaned.trim());
  } catch {
    throw new Error("Quality response must be valid JSON");
  }
  return parseQualityCheckResult(value);
}

/** Compose length and quality checks without rewriting or regenerating text. */
export async function validateGeneratedSuggestion(
  request: IQualityValidationRequest,
  validator?: IModelValidator,
  maxWords = 40,
): Promise<IValidationResult> {
  const startTime = Date.now();
  // Reuse structural validation before evaluating a proposed replacement.
  parseSemanticResult({ concern: true, suggestion: request.suggestion });
  const wordLimit = checkSuggestionLength(request.suggestion, maxWords);

  if (!wordLimit.withinLimit || !validator) {
    return {
      outcome: "manual-review",
      reasons: [
        !wordLimit.withinLimit
          ? `Suggestion has ${wordLimit.wordCount} words; the limit is ${maxWords}.`
          : "Model quality validation is not configured.",
      ],
      wordLimit,
      modelCheckStatus: "not-run",
      requestCount: 0,
      latencyMs: Date.now() - startTime,
    };
  }

  try {
    const qualityCheck = parseQualityCheckResult(
      await validator.validateSuggestion(request),
    );
    // The parser guarantees empty reasons only when every check is true.
    return {
      outcome: qualityCheck.reasons.length === 0 ? "pass" : "manual-review",
      reasons: qualityCheck.reasons,
      wordLimit,
      qualityCheck,
      modelCheckStatus: "succeeded",
      requestCount: 1,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      outcome: "manual-review",
      reasons: ["The model quality check could not be completed."],
      wordLimit,
      modelCheckStatus: "failed",
      requestCount: 1,
      latencyMs: Date.now() - startTime,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
