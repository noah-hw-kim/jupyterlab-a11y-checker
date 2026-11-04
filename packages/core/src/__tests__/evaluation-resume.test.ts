import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  IEvaluationAttemptStarted,
  IEvaluationResponseReceived,
  IEvaluationAttemptFinished,
  IEvaluationJob,
} from "../evaluation-types.js";
import { planEvaluationResume } from "../utils/evaluation-resume.js";

const config = JSON.parse(
  readFileSync(
    new URL("../../../../evaluation/config.example.json", import.meta.url),
    "utf8",
  ),
);
const time = Date.parse("2026-10-28T00:00:00.000Z");
const at = (offset: number) => new Date(time + offset).toISOString();
const job: IEvaluationJob = {
  caseId: "case-test",
  strategy: "minimal",
  stage: "generation",
};
const other: IEvaluationJob = { ...job, strategy: "fixed-window" };
const context = {
  experimentId: "dev-test",
  fingerprint: "f".repeat(64),
  config,
  jobs: [job, other],
};
const result = { concern: true, suggestion: "A line chart." };
function start(
  attemptNumber: 1 | 2 = 1,
  offset = 0,
  selected = job,
): IEvaluationAttemptStarted {
  return {
    schemaVersion: 1,
    experimentId: context.experimentId,
    fingerprint: context.fingerprint,
    job: selected,
    attemptId: `${selected.stage}-${selected.strategy}-${attemptNumber}`,
    attemptNumber,
    timestamp: at(offset),
    event: "attempt-started",
    dispatchState: "reserved-before-send",
    input: {
      task: "evaluate",
      existingAltText: "graph",
      imagePath: "assets/test.png",
      imageSha256: "a".repeat(64),
      imageMimeType: "image/png",
      formattedContext: "source",
      includedCellIndices: [0],
      selectedSourceCharacterCount: 6,
      formattedContextCharacterCount: 6,
      messageTextCharacterCount: 50,
      truncated: false,
      sourceGenerationAttemptId: null,
      suggestionToValidate: null,
    },
  };
}
function response(s: IEvaluationAttemptStarted): IEvaluationResponseReceived {
  return {
    ...s,
    event: "response-received",
    dispatchState: "response-received",
    timestamp: new Date(Date.parse(s.timestamp) + 1000).toISOString(),
    httpStatus: 200,
    latencyMs: 1000,
    retryNotBefore: null,
    providerRetryNotBefore: null,
    response: {
      rawContent: JSON.stringify(result),
      finishReason: "stop",
      returnedModel: config.model,
      responseId: "response-test",
      usage: null,
      usageAvailable: false,
    },
  };
}
function success(s: IEvaluationAttemptStarted): IEvaluationAttemptFinished {
  return {
    ...s,
    event: "attempt-finished",
    dispatchState: "response-received",
    timestamp: new Date(Date.parse(s.timestamp) + 2000).toISOString(),
    outcome: "succeeded",
    latencyMs: 1000,
    responseRecorded: true,
    parsed: { kind: "generation", value: result },
    wordLimit: { wordCount: 3, maxWords: 40, withinLimit: true },
    error: null,
    retryNotBefore: null,
    providerRetryNotBefore: null,
  };
}
function failed(s: IEvaluationAttemptStarted): IEvaluationAttemptFinished {
  return {
    ...success(s),
    dispatchState: "unknown",
    responseRecorded: false,
    outcome: s.attemptNumber === 1 ? "retryable-error" : "exhausted-error",
    parsed: null,
    wordLimit: null,
    error: {
      kind: "transport",
      message: "Timed out",
      httpStatus: null,
      retryable: true,
    },
    retryNotBefore: new Date(Date.parse(s.timestamp) + 32000).toISOString(),
  };
}
function limited(s: IEvaluationAttemptStarted, deadline: number) {
  const received = {
    ...response(s),
    httpStatus: 429,
    retryNotBefore: at(deadline),
    providerRetryNotBefore: at(deadline),
  };
  const finished: IEvaluationAttemptFinished = {
    ...failed(s),
    dispatchState: "response-received",
    responseRecorded: true,
    error: {
      kind: "provider",
      message: "Rate limited",
      httpStatus: 429,
      retryable: true,
    },
    retryNotBefore: at(deadline),
    providerRetryNotBefore: at(deadline),
  };
  return [s, received, finished];
}
const plan = (events: unknown[], now = time + 300000) =>
  planEvaluationResume(context, config, events, now);

describe("offline evaluation resume planning", () => {
  it("starts untouched jobs at attempt one", () => {
    expect(
      plan([]).jobs.map((j) => [j.status, j.action, j.nextAttemptNumber]),
    ).toEqual([
      ["pending", "send", 1],
      ["pending", "send", 1],
    ]);
  });
  it("skips a completed job without consuming another attempt", () => {
    const s = start();
    expect(plan([s, response(s), success(s)]).jobs[0]).toMatchObject({
      status: "succeeded",
      action: "skip",
      attemptsUsed: 1,
      nextAttemptNumber: null,
    });
  });
  it("preserves the retry deadline and remaining attempt across resumes", () => {
    const s = start();
    const events = [s, failed(s)];
    expect(plan(events, time + 10000).jobs[0]).toMatchObject({
      action: "wait",
      attemptsUsed: 1,
      nextAttemptNumber: 2,
      notBefore: at(32000),
    });
    expect(plan(events, time + 33000).jobs[0].action).toBe("send");
  });
  it("never offers a third attempt after two transient failures", () => {
    const one = start();
    const two = start(2, 40000);
    expect(plan([one, failed(one), two, failed(two)]).jobs[0]).toMatchObject({
      status: "exhausted-error",
      action: "skip",
      attemptsUsed: 2,
      nextAttemptNumber: null,
    });
  });
  it("recovers a stored response locally instead of requesting another sample", () => {
    const s = start();
    expect(plan([s, response(s)]).jobs[0]).toMatchObject({
      status: "response-recorded",
      action: "recover-response",
      attemptsUsed: 1,
      nextAttemptNumber: null,
    });
  });
  it("counts an interrupted request and waits conservatively before its remaining attempt", () => {
    const s = start();
    expect(plan([s], time + 1000).jobs[0]).toMatchObject({
      status: "interrupted-unknown",
      action: "wait",
      notBefore: at(150000),
    });
    expect(plan([s]).jobs[0]).toMatchObject({
      action: "send",
      attemptsUsed: 1,
      nextAttemptNumber: 2,
    });
    const two = start(2, 200000);
    expect(plan([s, two]).jobs[0]).toMatchObject({
      action: "skip",
      attemptsUsed: 2,
      nextAttemptNumber: null,
    });
  });
  it("enforces pacing for a different job after a restart", () => {
    const s = start();
    expect(
      plan([s, response(s), success(s)], time + 3000).jobs[1],
    ).toMatchObject({ action: "wait", notBefore: at(15000) });
  });
  it("keeps a provider cooldown after a rate-limited job exhausts both attempts", () => {
    const one = start();
    const two = start(2, 60000);
    const state = plan(
      [...limited(one, 60000), ...limited(two, 180000)],
      time + 90000,
    );
    expect(state.jobs[0]).toMatchObject({ action: "skip", attemptsUsed: 2 });
    expect(state.jobs[1]).toMatchObject({
      action: "wait",
      notBefore: at(180000),
    });
  });
  it("retains the longer Retry-After cooldown even if a crash precedes the finish record", () => {
    const [s, received] = limited(start(), 180000);
    const state = plan([s, received], time + 90000);
    expect(state.jobs[0].action).toBe("recover-response");
    expect(state.jobs[1]).toMatchObject({
      action: "wait",
      notBefore: at(180000),
    });
  });
  it("does not retry a model-output failure", () => {
    const s = start();
    const raw = response(s);
    raw.response.rawContent = "not JSON";
    const finish: IEvaluationAttemptFinished = {
      ...success(s),
      outcome: "model-output-error",
      parsed: null,
      wordLimit: null,
      error: {
        kind: "parse",
        message: "Invalid JSON",
        httpStatus: 200,
        retryable: false,
      },
    };
    expect(plan([s, raw, finish]).jobs[0]).toMatchObject({
      status: "model-output-error",
      action: "skip",
      nextAttemptNumber: null,
    });
  });
  it("blocks new requests after authentication/configuration errors", () => {
    const s = start();
    const raw = { ...response(s), httpStatus: 401 };
    const finish: IEvaluationAttemptFinished = {
      ...failed(s),
      outcome: "blocked-error",
      dispatchState: "response-received",
      responseRecorded: true,
      error: {
        kind: "configuration",
        message: "Unauthorized",
        httpStatus: 401,
        retryable: false,
      },
    };
    const state = plan([s, raw, finish]);
    expect(state.blocked).toBe(true);
    expect(state.jobs[1].action).toBe("blocked");
  });
  it("refuses settings that differ from the frozen configuration", () => {
    expect(() =>
      planEvaluationResume(
        context,
        { ...config, contextCharacterBudget: 4000 },
        [],
      ),
    ).toThrow();
  });

  it("refuses incompatible, incomplete, duplicate, or out-of-order records", () => {
    const s = start();
    for (const events of [
      [{}],
      [{ ...s, fingerprint: "b".repeat(64) }],
      [{ ...s, job: { ...job, caseId: "unknown" } }],
      [s, s],
      [response(s)],
      [s, response(s), success(s), success(s)],
      [s, response(s), start(2, 40000)],
      [{ ...s, timestamp: "bad" }],
    ])
      expect(() => plan(events)).toThrow();
  });
  it("refuses changed retry inputs and successful results that disagree with raw content", () => {
    const s = start();
    const two = start(2, 40000);
    two.input.imageSha256 = "b".repeat(64);
    expect(() => plan([s, failed(s), two])).toThrow();
    const different = response(s);
    different.response.rawContent = JSON.stringify({
      concern: false,
      suggestion: null,
    });
    expect(() => plan([s, different, success(s)])).toThrow();
  });
  it("accepts harmless object-key reordering without changing retry identity", () => {
    const s = start();
    const two = start(2, 40000);
    two.input = Object.fromEntries(
      Object.entries(two.input).reverse(),
    ) as typeof two.input;
    expect(plan([s, failed(s), two]).jobs[0].attemptsUsed).toBe(2);
  });
  it("does not retry a completed quality judgment merely because it flags a concern", () => {
    const validationJob: IEvaluationJob = {
      ...job,
      strategy: "structure-aware",
      stage: "validation",
    };
    const s = start(1, 0, validationJob);
    s.input = {
      ...s.input,
      task: "quality-validation",
      sourceGenerationAttemptId: "saved-generation",
      suggestionToValidate: "A line chart.",
    };
    const judgment = {
      grounded: false,
      contextConsistent: true,
      informative: true,
      concise: true,
      noUnsupportedClaims: false,
      reasons: ["The trend is unsupported."],
    };
    const raw = response(s);
    raw.response.rawContent = JSON.stringify(judgment);
    const finish = {
      ...success(s),
      parsed: { kind: "validation", value: judgment },
    };
    expect(
      planEvaluationResume(
        { ...context, jobs: [validationJob] },
        config,
        [s, raw, finish],
        time + 300000,
      ).jobs[0],
    ).toMatchObject({ status: "succeeded", action: "skip" });
  });
});
