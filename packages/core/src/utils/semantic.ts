import type { ISemanticResult } from "../types.js";

export function parseSemanticResult(value: unknown): ISemanticResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid semantic result format");
  }

  const result = value as Record<string, unknown>;

  const concern = result.concern;
  const suggestion = result.suggestion;

  if (typeof concern !== "boolean") {
    throw new Error(
      "Invalid semantic result format: 'concern' must be a boolean",
    );
  }

  if (typeof suggestion !== "string" && suggestion !== null) {
    throw new Error(
      "Invalid semantic result format: 'suggestion' must be a string or null",
    );
  }

  const normalizedSuggestion =
    typeof suggestion === "string" ? suggestion.trim() : null;

  if (concern && !normalizedSuggestion) {
    throw new Error(
      "Invalid semantic result format: 'suggestion' must be provided when 'concern' is true",
    );
  }

  if (!concern && normalizedSuggestion !== null) {
    throw new Error(
      "Invalid semantic result format: 'suggestion' must not be provided when 'concern' is false",
    );
  }

  return {
    concern,
    suggestion: normalizedSuggestion,
  };
}

export function parseSemanticResponseText(
  responseText: string,
): ISemanticResult {
  const trimmedResponse = responseText.trim();

  if (!trimmedResponse) {
    throw new Error("Semantic response must not be empty");
  }

  let value: unknown;

  try {
    value = JSON.parse(trimmedResponse);
  } catch {
    throw new Error("Semantic response must be valid JSON");
  }
  return parseSemanticResult(value);
}
