import type {
  EvaluationAttemptEvent,
  EvaluationJobStatus,
  IEvaluationAttemptFinished,
  IEvaluationAttemptStarted,
  IEvaluationConfig,
  IEvaluationJob,
  IEvaluationResponseReceived,
} from "../evaluation-types.js";
import { parseSemanticResponseText, parseSemanticResult } from "./semantic.js";
import {
  parseQualityCheckResult,
  parseQualityResponseText,
} from "./semantic-validation.js";
import { parseEvaluationConfig } from "./evaluation-config.js";

export interface IEvaluationResumeContext {
  experimentId: string;
  fingerprint: string;
  /** Configuration saved in the frozen experiment snapshot. */
  config: IEvaluationConfig;
  /** Complete frozen job list, not a runtime-filtered subset. */
  jobs: IEvaluationJob[];
}
export interface IEvaluationResumeJob {
  job: IEvaluationJob;
  status: EvaluationJobStatus;
  action: "send" | "skip" | "wait" | "recover-response" | "blocked";
  attemptsUsed: number;
  nextAttemptNumber: 1 | 2 | null;
  notBefore: string | null;
  responseToRecover: IEvaluationResponseReceived | null;
}
export interface IEvaluationResumePlan {
  jobs: IEvaluationResumeJob[];
  nextRequestNotBefore: string | null;
  blocked: boolean;
}
interface Attempt {
  start: IEvaluationAttemptStarted;
  response?: IEvaluationResponseReceived;
  finish?: IEvaluationAttemptFinished;
}

/** Plan recovery only. Never send requests, sleep, mutate records, or write files. */
export function planEvaluationResume(
  context: IEvaluationResumeContext,
  configValue: unknown,
  records: unknown[],
  nowMs = Date.now(),
): IEvaluationResumePlan {
  const config = parseEvaluationConfig(configValue);
  requireLog(
    configKey(config) === configKey(parseEvaluationConfig(context.config)),
  );
  requireLog(
    text(context.experimentId) &&
      sha(context.fingerprint) &&
      Number.isFinite(nowMs),
  );
  const jobs = new Map<string, Attempt[]>();
  for (const job of context.jobs) {
    requireLog(validJob(job, config) && !jobs.has(jobKey(job)));
    jobs.set(jobKey(job), []);
  }
  const attempts = new Map<string, Attempt>();
  let globalDeadline = 0;
  let blocked = false;
  for (const value of records) {
    const event = readEvent(value, config);
    requireLog(
      event.experimentId === context.experimentId &&
        event.fingerprint === context.fingerprint,
    );
    const history = jobs.get(jobKey(event.job));
    requireLog(history);
    if (event.event === "attempt-started") {
      requireLog(
        !attempts.has(event.attemptId) &&
          event.attemptNumber === history.length + 1,
      );
      const previous = history[history.length - 1];
      if (previous) {
        // A saved response must be finalized locally before another attempt.
        requireLog(
          previous.finish?.outcome === "retryable-error" ||
            (!previous.response && !previous.finish),
        );
        requireLog(inputKey(previous.start) === inputKey(event));
        requireLog(ms(event.timestamp) >= ms(previous.start.timestamp));
      }
      const attempt = { start: event };
      history.push(attempt);
      attempts.set(event.attemptId, attempt);
      globalDeadline = Math.max(
        globalDeadline,
        ms(event.timestamp) + config.minimumRequestIntervalMs,
      );
    } else {
      const attempt = attempts.get(event.attemptId);
      requireLog(history[history.length - 1] === attempt);
      requireLog(
        attempt &&
          jobKey(attempt.start.job) === jobKey(event.job) &&
          attempt.start.attemptNumber === event.attemptNumber &&
          ms(event.timestamp) >= ms(attempt.start.timestamp),
      );
      if (event.event === "response-received") {
        requireLog(!attempt.response && !attempt.finish);
        attempt.response = event;
        // Even a crash before the finish event must retain the 429 cooldown.
        if (event.providerRetryNotBefore) {
          globalDeadline = Math.max(
            globalDeadline,
            ms(event.providerRetryNotBefore),
          );
        }
      } else {
        requireLog(
          !attempt.finish &&
            event.responseRecorded === Boolean(attempt.response),
        );
        requireLog(
          event.dispatchState ===
            (attempt.response ? "response-received" : "unknown"),
        );
        if (attempt.response) {
          requireLog(ms(event.timestamp) >= ms(attempt.response.timestamp));
          requireLog(
            optionalMs(event.retryNotBefore) >=
              optionalMs(attempt.response.retryNotBefore),
          );
          requireLog(
            optionalMs(event.providerRetryNotBefore) >=
              optionalMs(attempt.response.providerRetryNotBefore),
          );
        }
        if (
          event.outcome === "succeeded" ||
          event.outcome === "model-output-error"
        ) {
          requireLog(
            attempt.response &&
              attempt.response.httpStatus >= 200 &&
              attempt.response.httpStatus < 300,
          );
        }
        if (
          event.error?.httpStatus !== null &&
          event.error?.httpStatus !== undefined
        ) {
          requireLog(
            attempt.response &&
              event.error.httpStatus === attempt.response.httpStatus,
          );
        }
        if (event.outcome === "succeeded") {
          const content = attempt.response!.response.rawContent;
          requireLog(typeof content === "string");
          const rawParsed =
            event.job.stage === "generation"
              ? parseSemanticResponseText(content)
              : parseQualityResponseText(content);
          const savedParsed =
            event.parsed!.kind === "generation"
              ? parseSemanticResult(event.parsed!.value)
              : parseQualityCheckResult(event.parsed!.value);
          requireLog(JSON.stringify(rawParsed) === JSON.stringify(savedParsed));
        }
        attempt.finish = event;
        blocked ||= event.outcome === "blocked-error";
        if (event.providerRetryNotBefore)
          globalDeadline = Math.max(
            globalDeadline,
            ms(event.providerRetryNotBefore),
          );
      }
    }
  }
  const plan = context.jobs.map((job): IEvaluationResumeJob => {
    const history = jobs.get(jobKey(job))!;
    const last = history[history.length - 1];
    const state: IEvaluationResumeJob = {
      job: { ...job },
      status: "pending",
      action: "send",
      attemptsUsed: history.length,
      nextAttemptNumber:
        history.length === 0 ? 1 : history.length === 1 ? 2 : null,
      notBefore: null,
      responseToRecover: null,
    };
    if (last?.response && !last.finish) {
      return {
        ...state,
        status: "response-recorded",
        action: "recover-response",
        nextAttemptNumber: null,
        responseToRecover: last.response,
      };
    }
    if (last?.finish && last.finish.outcome !== "retryable-error") {
      return {
        ...state,
        status: last.finish.outcome,
        action: last.finish.outcome === "blocked-error" ? "blocked" : "skip",
        nextAttemptNumber: null,
      };
    }
    let deadline = globalDeadline;
    if (last) {
      state.status = last.finish ? "retryable-error" : "interrupted-unknown";
      if (state.nextAttemptNumber === null) return { ...state, action: "skip" };
      deadline = Math.max(
        deadline,
        last.finish
          ? Math.max(
              ms(last.finish.timestamp) + config.retry.minimumDelayMs,
              optionalMs(last.finish.retryNotBefore),
            )
          : ms(last.start.timestamp) +
              config.requestTimeoutMs +
              config.retry.minimumDelayMs,
      );
    }
    if (blocked) return { ...state, action: "blocked" };
    if (deadline > nowMs)
      return {
        ...state,
        action: "wait",
        notBefore: new Date(deadline).toISOString(),
      };
    return state;
  });
  return {
    jobs: plan,
    blocked,
    nextRequestNotBefore:
      globalDeadline > nowMs ? new Date(globalDeadline).toISOString() : null,
  };
}

function readEvent(
  value: unknown,
  config: IEvaluationConfig,
): EvaluationAttemptEvent {
  const event = record(value);
  requireLog(
    event.schemaVersion === 1 &&
      text(event.experimentId) &&
      sha(event.fingerprint) &&
      text(event.attemptId) &&
      (event.attemptNumber === 1 || event.attemptNumber === 2) &&
      iso(event.timestamp) &&
      validJob(event.job, config),
  );
  if (event.event === "attempt-started") {
    requireLog(event.dispatchState === "reserved-before-send");
    const input = record(event.input);
    const job = event.job as IEvaluationJob;
    requireLog(
      text(input.imagePath) &&
        sha(input.imageSha256) &&
        input.imageMimeType === "image/png" &&
        typeof input.formattedContext === "string" &&
        typeof input.truncated === "boolean" &&
        nullableText(input.existingAltText) &&
        Array.isArray(input.includedCellIndices) &&
        input.includedCellIndices.length > 0 &&
        new Set(input.includedCellIndices).size ===
          input.includedCellIndices.length &&
        input.includedCellIndices.every((n) => integer(n)) &&
        integer(input.selectedSourceCharacterCount) &&
        Number(input.selectedSourceCharacterCount) <=
          config.contextCharacterBudget &&
        input.formattedContextCharacterCount ===
          input.formattedContext.length &&
        integer(input.messageTextCharacterCount) &&
        Number(input.messageTextCharacterCount) >=
          input.formattedContext.length,
    );
    requireLog(
      job.stage === "validation"
        ? input.task === "quality-validation" &&
            text(input.sourceGenerationAttemptId) &&
            text(input.suggestionToValidate)
        : (input.task === "generate" || input.task === "evaluate") &&
            input.sourceGenerationAttemptId === null &&
            input.suggestionToValidate === null,
    );
  } else if (event.event === "response-received") {
    requireLog(
      event.dispatchState === "response-received" &&
        integer(event.httpStatus) &&
        Number(event.httpStatus) >= 100 &&
        Number(event.httpStatus) <= 599 &&
        duration(event.latencyMs) &&
        nullableIso(event.retryNotBefore) &&
        nullableIso(event.providerRetryNotBefore),
    );
    if (config.retry.httpStatuses.includes(Number(event.httpStatus))) {
      requireLog(
        event.retryNotBefore !== null &&
          optionalMs(event.retryNotBefore as string) >=
            ms(event.timestamp as string) + config.retry.minimumDelayMs,
      );
    } else requireLog(event.retryNotBefore === null);
    if (event.httpStatus === 429) {
      requireLog(
        event.providerRetryNotBefore !== null &&
          optionalMs(event.providerRetryNotBefore as string) >=
            optionalMs(event.retryNotBefore as string),
      );
    } else requireLog(event.providerRetryNotBefore === null);
    const response = record(event.response);
    requireLog(
      Object.prototype.hasOwnProperty.call(response, "rawContent") &&
        [
          response.finishReason,
          response.returnedModel,
          response.responseId,
        ].every(nullableText) &&
        typeof response.usageAvailable === "boolean" &&
        response.usageAvailable === (response.usage !== null),
    );
    if (response.usage !== null) {
      const usage = record(response.usage);
      const counts = [
        usage.promptTokens,
        usage.completionTokens,
        usage.totalTokens,
      ];
      requireLog(
        counts.every((n) => n === null || integer(n)) &&
          counts.some((n) => n !== null),
      );
    }
  } else if (event.event === "attempt-finished") {
    requireLog(
      ["response-received", "unknown"].includes(String(event.dispatchState)) &&
        duration(event.latencyMs) &&
        typeof event.responseRecorded === "boolean" &&
        [
          "succeeded",
          "retryable-error",
          "model-output-error",
          "exhausted-error",
          "blocked-error",
        ].includes(String(event.outcome)) &&
        nullableIso(event.retryNotBefore) &&
        nullableIso(event.providerRetryNotBefore),
    );
    if (event.parsed !== null) {
      const parsed = record(event.parsed);
      const stage = (event.job as IEvaluationJob).stage;
      requireLog(parsed.kind === stage);
      if (stage === "generation") parseSemanticResult(parsed.value);
      else parseQualityCheckResult(parsed.value);
    }
    if (event.wordLimit !== null) {
      const limit = record(event.wordLimit);
      requireLog(
        integer(limit.wordCount) &&
          limit.maxWords === config.maxSuggestionWords &&
          limit.withinLimit ===
            Number(limit.wordCount) <= config.maxSuggestionWords,
      );
    }
    if (event.outcome === "succeeded") {
      requireLog(
        event.parsed !== null && event.error === null && event.responseRecorded,
      );
    } else {
      const error = record(event.error);
      requireLog(
        event.parsed === null &&
          ["transport", "provider", "parse", "configuration"].includes(
            String(error.kind),
          ) &&
          text(error.message) &&
          typeof error.retryable === "boolean" &&
          (error.httpStatus === null ||
            (integer(error.httpStatus) &&
              Number(error.httpStatus) >= 100 &&
              Number(error.httpStatus) <= 599)),
      );
      if (
        event.outcome === "retryable-error" ||
        event.outcome === "exhausted-error"
      ) {
        requireLog(
          error.retryable &&
            ((error.kind === "transport" && error.httpStatus === null) ||
              (error.kind === "provider" &&
                config.retry.httpStatuses.includes(
                  Number(error.httpStatus),
                ))) &&
            event.attemptNumber ===
              (event.outcome === "retryable-error" ? 1 : 2),
        );
      } else {
        requireLog(!error.retryable);
        if (event.outcome === "model-output-error")
          requireLog(error.kind === "parse");
      }
    }
  } else requireLog(false);
  return event as unknown as EvaluationAttemptEvent;
}
function configKey(config: IEvaluationConfig): string {
  return JSON.stringify(
    Object.entries(config)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [
        key,
        key === "retry"
          ? Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
          : value,
      ]),
  );
}
function inputKey(event: IEvaluationAttemptStarted): string {
  const input = event.input;
  return JSON.stringify([
    input.task,
    input.existingAltText,
    input.imagePath,
    input.imageSha256,
    input.imageMimeType,
    input.formattedContext,
    input.includedCellIndices,
    input.selectedSourceCharacterCount,
    input.formattedContextCharacterCount,
    input.messageTextCharacterCount,
    input.truncated,
    input.sourceGenerationAttemptId,
    input.suggestionToValidate,
  ]);
}
function jobKey(job: IEvaluationJob): string {
  return JSON.stringify([job.caseId, job.strategy, job.stage]);
}
function validJob(
  value: unknown,
  config: IEvaluationConfig,
): value is IEvaluationJob {
  if (!value || typeof value !== "object") return false;
  const job = value as IEvaluationJob;
  return (
    text(job.caseId) &&
    config.strategies.includes(job.strategy) &&
    ["generation", "validation"].includes(job.stage)
  );
}
function record(value: unknown): Record<string, unknown> {
  requireLog(
    typeof value === "object" && value !== null && !Array.isArray(value),
  );
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function nullableText(value: unknown): boolean {
  return value === null || typeof value === "string";
}
function sha(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function integer(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
function duration(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function iso(value: unknown): boolean {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function nullableIso(value: unknown): boolean {
  return value === null || iso(value);
}
function ms(value: string): number {
  return Date.parse(value);
}
function optionalMs(value: string | null): number {
  return value === null ? 0 : ms(value);
}
function requireLog(condition: unknown): asserts condition {
  if (!condition)
    throw new Error(
      "Invalid or inconsistent evaluation records; refusing to reset attempts or resume.",
    );
}
