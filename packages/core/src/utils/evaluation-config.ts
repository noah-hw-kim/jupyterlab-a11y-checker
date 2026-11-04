import type { IEvaluationConfig } from "../evaluation-types.js";

const strategies = [
  "minimal",
  "fixed-window",
  "structure-aware",
  "largest-practical",
];
const retryStatuses = [408, 429, 500, 502, 503, 504];

/** Validate external JSON before the runner can prepare any request. */
export function parseEvaluationConfig(value: unknown): IEvaluationConfig {
  const config = record(value);
  exactKeys(config, [
    "schemaVersion",
    "model",
    "endpointEnv",
    "apiKeyEnv",
    "split",
    "strategies",
    "contextCharacterBudget",
    "reasoningEffort",
    "temperature",
    "maxOutputTokens",
    "maxSuggestionWords",
    "imageMimeType",
    "concurrency",
    "requestTimeoutMs",
    "retry",
    "orderSeed",
    "batchSize",
    "minimumRequestIntervalMs",
  ]);
  const retry = record(config.retry);
  exactKeys(retry, ["mode", "maxAttempts", "minimumDelayMs", "httpStatuses"]);
  check(config.schemaVersion === 1, "schemaVersion");
  check(
    typeof config.model === "string" && config.model.trim().length > 0,
    "model",
  );
  for (const key of ["endpointEnv", "apiKeyEnv"]) {
    check(
      typeof config[key] === "string" &&
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(config[key] as string),
      key,
    );
  }
  check(
    config.endpointEnv !== config.apiKeyEnv,
    "distinct environment variable names",
  );
  check(config.split === "development" || config.split === "held-out", "split");
  check(
    Array.isArray(config.strategies) &&
      config.strategies.length === 4 &&
      new Set(config.strategies).size === 4 &&
      config.strategies.every((s) => strategies.includes(s)),
    "strategies",
  );
  check(config.reasoningEffort === "provider-default", "reasoningEffort");
  check(config.temperature === "provider-default", "temperature");
  check(config.imageMimeType === "image/png", "imageMimeType");
  check(config.concurrency === 1, "concurrency");
  for (const key of [
    "contextCharacterBudget",
    "maxOutputTokens",
    "maxSuggestionWords",
    "requestTimeoutMs",
    "batchSize",
    "minimumRequestIntervalMs",
  ]) {
    check(Number.isSafeInteger(config[key]) && Number(config[key]) > 0, key);
  }
  check(
    Number.isSafeInteger(config.orderSeed) && Number(config.orderSeed) >= 0,
    "orderSeed",
  );
  check(retry.mode === "manual", "retry.mode");
  check(retry.maxAttempts === 2, "retry.maxAttempts");
  check(
    Number.isSafeInteger(retry.minimumDelayMs) &&
      Number(retry.minimumDelayMs) >= 30000,
    "retry.minimumDelayMs",
  );
  check(
    Array.isArray(retry.httpStatuses) &&
      retry.httpStatuses.length === retryStatuses.length &&
      new Set(retry.httpStatuses).size === retryStatuses.length &&
      retry.httpStatuses.every((status) => retryStatuses.includes(status)),
    "retry.httpStatuses",
  );
  // Return a detached value so later edits to the input cannot change this config.
  return JSON.parse(JSON.stringify(config)) as IEvaluationConfig;
}

function record(value: unknown): Record<string, unknown> {
  check(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "object",
  );
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  check(
    Object.keys(value).length === keys.length &&
      keys.every((k) => Object.prototype.hasOwnProperty.call(value, k)),
    "field names",
  );
}
function check(condition: unknown, field: string): asserts condition {
  if (!condition) throw new Error(`Invalid evaluation config: ${field}`);
}
