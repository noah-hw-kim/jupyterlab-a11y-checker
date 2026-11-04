import type {
  ContextStrategy,
  IEvaluationCase,
  IQualityCheckResult,
  ISemanticResult,
  IWordLimitCheck,
  SemanticTask,
} from "./types.js";

/** Public settings only. Environment variable names are not credentials. */
export interface IEvaluationConfig {
  schemaVersion: 1;
  model: string;
  endpointEnv: string;
  apiKeyEnv: string;
  split: IEvaluationCase["split"];
  strategies: ContextStrategy[];
  contextCharacterBudget: number;
  reasoningEffort: "provider-default";
  temperature: "provider-default";
  maxOutputTokens: number;
  maxSuggestionWords: number;
  imageMimeType: "image/png";
  concurrency: 1;
  /** Maximum HTTP attempts per invocation, including failed attempts and retries. */
  batchSize: number;
  /** Minimum interval between request starts, enforced across resumed sessions. */
  minimumRequestIntervalMs: number;
  requestTimeoutMs: number;
  retry: {
    mode: "manual";
    maxAttempts: 2;
    minimumDelayMs: number;
    httpStatuses: number[];
  };
  orderSeed: number;
}

/** Saved once; resumes must agree with this snapshot. Never include an API key. */
export interface IEvaluationSnapshot {
  schemaVersion: 1;
  experimentId: string;
  createdAt: string;
  config: IEvaluationConfig;
  /** Credential-free endpoint URL resolved from endpointEnv. */
  resolvedEndpoint: string;
  /** SHA-256 of effective config, endpoint, prompt hashes, code and benchmark identity. */
  fingerprint: string;
  codeCommit: string;
  codeSnapshotSha256: string;
  benchmarkFreezeSha256: string;
  prompts: {
    generation: { path: string; sha256: string };
    validation: { path: string; sha256: string };
  };
  /** Seeded execution order; runtime subset filters do not rewrite this list. */
  generationJobs: IEvaluationJob[];
  /** Part B snapshots bind historical Part A bytes without rewriting them. */
  sourceGeneration?: {
    experimentId: string;
    fingerprint: string;
    snapshotSha256: string;
    attemptsSha256: string;
  };
  /** Cases with no quality-model attempt; never represented as fake requests. */
  exclusions?: Array<{
    caseId: string;
    strategy: "structure-aware";
    stage: "validation";
    sourceGenerationAttemptId: string;
    reason: "no-improvement" | "over-word-limit" | "source-unavailable";
  }>;
}

export interface IEvaluationJob {
  caseId: string;
  strategy: ContextStrategy;
  stage: "generation" | "validation";
}

/** Derived from the experiment snapshot and event log, not edited by hand. */
export type EvaluationJobStatus =
  | "pending"
  | "retryable-error"
  | "succeeded"
  | "model-output-error"
  | "exhausted-error"
  | "response-recorded"
  | "interrupted-unknown"
  | "blocked-error";

export interface IEvaluationRequestInput {
  task: SemanticTask | "quality-validation";
  existingAltText: string | null;
  imagePath: string;
  imageSha256: string;
  imageMimeType: "image/png";
  formattedContext: string;
  includedCellIndices: number[];
  selectedSourceCharacterCount: number;
  formattedContextCharacterCount: number;
  messageTextCharacterCount: number;
  truncated: boolean;
  /** Validation reuses one saved generation result; generation uses null. */
  sourceGenerationAttemptId: string | null;
  /** Exact saved suggestion supplied to validation; null during generation. */
  suggestionToValidate: string | null;
}

interface IEvaluationEventBase {
  schemaVersion: 1;
  experimentId: string;
  fingerprint: string;
  job: IEvaluationJob;
  attemptId: string;
  attemptNumber: 1 | 2;
  timestamp: string;
}

/** Append and flush before entering the send boundary. This reserves an attempt. */
export interface IEvaluationAttemptStarted extends IEvaluationEventBase {
  event: "attempt-started";
  dispatchState: "reserved-before-send";
  input: IEvaluationRequestInput;
}

export interface IEvaluationProviderResponse {
  /** Preserve message.content even when empty or schema-invalid; no reasoning fields. */
  rawContent: unknown;
  finishReason: string | null;
  returnedModel: string | null;
  responseId: string | null;
  /** Null means no usable token counts were reported; never synthesize counts. */
  usage: null | {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  usageAvailable: boolean;
}

/** Flush the response before parsing, so parsing can resume without another call. */
export interface IEvaluationResponseReceived extends IEvaluationEventBase {
  event: "response-received";
  dispatchState: "response-received";
  /** Derived from status/Retry-After before parsing so crash recovery preserves it. */
  retryNotBefore: string | null;
  providerRetryNotBefore: string | null;
  httpStatus: number;
  latencyMs: number;
  response: IEvaluationProviderResponse;
}

export interface IEvaluationAttemptFinished extends IEvaluationEventBase {
  event: "attempt-finished";
  /** A response proves receipt; connection/timeout failures can remain unknown. */
  dispatchState: "response-received" | "unknown";
  outcome:
    | "succeeded"
    | "retryable-error"
    | "model-output-error"
    | "exhausted-error"
    | "blocked-error";
  latencyMs: number;
  responseRecorded: boolean;
  parsed:
    | { kind: "generation"; value: ISemanticResult }
    | { kind: "validation"; value: IQualityCheckResult }
    | null;
  wordLimit: IWordLimitCheck | null;
  error: null | {
    kind: "transport" | "provider" | "parse" | "configuration";
    httpStatus: number | null;
    /** Safe summary only: never serialize request headers or client error objects. */
    message: string;
    retryable: boolean;
  };
  /** Earliest permitted retry; includes a longer provider Retry-After if supplied. */
  retryNotBefore: string | null;
  /** Provider-wide cooldown after HTTP 429, even if this job exhausted its attempts. */
  providerRetryNotBefore: string | null;
}

export type EvaluationAttemptEvent =
  | IEvaluationAttemptStarted
  | IEvaluationResponseReceived
  | IEvaluationAttemptFinished;
