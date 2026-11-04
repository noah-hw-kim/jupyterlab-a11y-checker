import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runEvaluation,
  selectProviderResponse,
  sendModelRequest,
} from "../runner.mjs";

const env = {
  A11YLENS_MODEL_ENDPOINT: "https://example.test/v1/chat/completions",
  A11YLENS_API_KEY: "offline-test-credential",
};
const result = { concern: true, suggestion: "A line chart." };
function fixture(t) {
  const outputDir = mkdtempSync(join(tmpdir(), "a11ylens-runner-"));
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));
  let clock = Date.parse("2026-10-29T12:00:00.000Z");
  const starts = [];
  const dependencies = {
    env,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    send: async (args) => {
      starts.push(clock);
      clock += 100;
      assert.equal(args.timeoutMs, 120000);
      assert.equal(args.body.model, "gemini-3.5-flash-lite");
      assert.equal(args.body.max_tokens, 2048);
      assert.ok(!("temperature" in args.body));
      assert.ok(!("reasoning_effort" in args.body));
      return {
        httpStatus: 200,
        retryAfter: null,
        response: selectProviderResponse({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify(result),
                reasoning_content: "MUST_NOT_SAVE",
                extra_content: { thought_signature: "MUST_NOT_SAVE" },
              },
            },
          ],
          model: "gemini-3.5-flash-lite",
          id: "offline-response",
          usage: {
            prompt_tokens: 100,
            completion_tokens: 10,
            total_tokens: 110,
          },
        }),
      };
    },
  };
  const options = {
    outputDir,
    experimentId: "development-test",
    cases: ["case-01"],
    strategies: ["minimal"],
  };
  const records = () =>
    readFileSync(join(outputDir, "attempts.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  return { outputDir, dependencies, options, records, starts };
}

test("Case 1 Minimal dry run selects exactly one image and makes zero calls/writes", async (t) => {
  const f = fixture(t);
  const outputDir = join(f.outputDir, "unused");
  const value = await runEvaluation(
    { ...f.options, outputDir, dryRun: true },
    {
      ...f.dependencies,
      env: {},
      send: () => {
        throw new Error("Unexpected HTTP");
      },
    },
  );
  assert.equal(value.requests, 0);
  assert.equal(value.plannedJobs.length, 1);
  assert.equal(value.plannedJobs[0].job.caseId, "case-01");
  assert.equal(value.plannedJobs[0].job.strategy, "minimal");
  assert.equal(value.plannedJobs[0].input.task, "generate");
  assert.equal(existsSync(outputDir), false);
});

test("one request records start/response/finish; success is skipped and snapshots stay unchanged", async (t) => {
  const f = fixture(t);
  const first = await runEvaluation(f.options, f.dependencies);
  assert.equal(first.requests, 1);
  assert.equal(first.results[0].outcome, "succeeded");
  assert.deepEqual(
    f.records().map((e) => e.event),
    ["attempt-started", "response-received", "attempt-finished"],
  );
  const snapshot = readFileSync(join(f.outputDir, "experiment.json"), "utf8");
  const second = await runEvaluation(f.options, f.dependencies);
  assert.equal(second.requests, 0);
  assert.equal(f.starts.length, 1);
  assert.equal(
    readFileSync(join(f.outputDir, "experiment.json"), "utf8"),
    snapshot,
  );
  const log = readFileSync(join(f.outputDir, "attempts.jsonl"), "utf8");
  assert.ok(!log.includes(env.A11YLENS_API_KEY));
  assert.ok(!log.includes("MUST_NOT_SAVE"));
  assert.ok(!log.includes("Authorization"));
});

test("case filters change execution only, preserving all 24 development jobs and the fingerprint", async (t) => {
  const f = fixture(t);
  await runEvaluation(f.options, f.dependencies);
  const before = readFileSync(join(f.outputDir, "experiment.json"), "utf8");
  assert.equal(JSON.parse(before).generationJobs.length, 24);
  const next = await runEvaluation(
    { ...f.options, cases: ["case-02"] },
    f.dependencies,
  );
  assert.equal(next.requests, 1);
  assert.equal(
    readFileSync(join(f.outputDir, "experiment.json"), "utf8"),
    before,
  );
  assert.ok(f.starts[1] - f.starts[0] >= 15000);
});

test("a batch dispatches at most four requests, paced from starts", async (t) => {
  const f = fixture(t);
  const value = await runEvaluation(
    { ...f.options, cases: [], strategies: [] },
    f.dependencies,
  );
  assert.equal(value.requests, 4);
  assert.equal(value.stopped, "batch-limit");
  assert.equal(f.starts.length, 4);
  for (let i = 1; i < f.starts.length; i++)
    assert.ok(f.starts[i] - f.starts[i - 1] >= 15000);
});

test("429 stops immediately and persists Retry-After for a different case on resume", async (t) => {
  const f = fixture(t);
  const normal = f.dependencies.send;
  const limited = async (args) => {
    const response = await normal(args);
    return { ...response, httpStatus: 429, retryAfter: "120" };
  };
  const first = await runEvaluation(
    { ...f.options, cases: [], strategies: [] },
    { ...f.dependencies, send: limited },
  );
  assert.equal(first.requests, 1);
  assert.equal(first.stopped, "rate-limited");
  const cooldown = Date.parse(f.records()[1].providerRetryNotBefore);
  await runEvaluation({ ...f.options, cases: ["case-01"] }, f.dependencies);
  assert.ok(f.starts[1] >= cooldown);
});

test("manual retries preserve counts, never retry in the same invocation, and stop after two", async (t) => {
  const f = fixture(t);
  let calls = 0;
  const dependencies = {
    ...f.dependencies,
    send: async () => {
      calls++;
      throw new Error(`Do not save ${env.A11YLENS_API_KEY}`);
    },
  };
  assert.equal((await runEvaluation(f.options, dependencies)).requests, 1);
  assert.equal((await runEvaluation(f.options, dependencies)).requests, 1);
  assert.equal((await runEvaluation(f.options, dependencies)).requests, 0);
  assert.equal(calls, 2);
  assert.deepEqual(
    f
      .records()
      .filter((e) => e.event === "attempt-started")
      .map((e) => e.attemptNumber),
    [1, 2],
  );
  assert.equal(f.records().at(-1).outcome, "exhausted-error");
  assert.ok(
    !readFileSync(join(f.outputDir, "attempts.jsonl"), "utf8").includes(
      env.A11YLENS_API_KEY,
    ),
  );
});

test("recorded responses finalize locally without sending another request", async (t) => {
  const f = fixture(t);
  await runEvaluation(f.options, f.dependencies);
  const records = f.records();
  writeFileSync(
    join(f.outputDir, "attempts.jsonl"),
    records
      .slice(0, 2)
      .map((e) => JSON.stringify(e))
      .join("\n") + "\n",
  );
  const recovered = await runEvaluation(f.options, f.dependencies);
  assert.equal(recovered.requests, 0);
  assert.equal(f.starts.length, 1);
  assert.equal(f.records().at(-1).outcome, "succeeded");
});

test("malformed model content is preserved and does not trigger another sample", async (t) => {
  const f = fixture(t);
  const send = async (args) => {
    const response = await f.dependencies.send(args);
    response.response.rawContent = "not JSON";
    return response;
  };
  const first = await runEvaluation(f.options, { ...f.dependencies, send });
  assert.equal(first.results[0].outcome, "model-output-error");
  assert.equal(f.records()[1].response.rawContent, "not JSON");
  assert.equal((await runEvaluation(f.options, f.dependencies)).requests, 0);
});

test("changed endpoint or malformed log refuses resume without overwriting artifacts or dispatching", async (t) => {
  const f = fixture(t);
  await runEvaluation(f.options, f.dependencies);
  const before = readFileSync(join(f.outputDir, "experiment.json"), "utf8");
  await assert.rejects(
    runEvaluation(f.options, {
      ...f.dependencies,
      env: {
        ...env,
        A11YLENS_MODEL_ENDPOINT: "https://different.test/v1/chat/completions",
      },
    }),
    /identity differs/,
  );
  assert.equal(
    readFileSync(join(f.outputDir, "experiment.json"), "utf8"),
    before,
  );
  appendFileSync(join(f.outputDir, "attempts.jsonl"), "{partial");
  await assert.rejects(
    runEvaluation(f.options, f.dependencies),
    /incomplete final line/,
  );
  assert.equal(f.starts.length, 1);
});

test("an existing lock is preserved and prevents any dispatch", async (t) => {
  const f = fixture(t);
  mkdirSync(f.outputDir, { recursive: true });
  const path = join(f.outputDir, ".runner.lock");
  writeFileSync(path, "another runner owns this");
  await assert.rejects(runEvaluation(f.options, f.dependencies), /locked/);
  assert.equal(readFileSync(path, "utf8"), "another runner owns this");
  assert.equal(f.starts.length, 0);
});

test("unknown filters and credential-bearing endpoints fail before writes or HTTP", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    runEvaluation({ ...f.options, cases: ["not-a-case"] }, f.dependencies),
    /Unknown case/,
  );
  await assert.rejects(
    runEvaluation(f.options, {
      ...f.dependencies,
      env: {
        ...env,
        A11YLENS_MODEL_ENDPOINT: "https://user:password@example.test",
      },
    }),
    /credential-free/,
  );
  assert.equal(existsSync(join(f.outputDir, "experiment.json")), false);
  assert.equal(f.starts.length, 0);
});

test("real transport boundary sends once with a timeout and saves only whitelisted fields", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, env.A11YLENS_MODEL_ENDPOINT);
    assert.equal(init.headers.Authorization, `Bearer ${env.A11YLENS_API_KEY}`);
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(result),
              reasoning_content: "private",
            },
          },
        ],
        usage: { prompt_tokens: 12 },
      }),
      { status: 200 },
    );
  });
  const response = await sendModelRequest({
    endpoint: env.A11YLENS_MODEL_ENDPOINT,
    apiKey: env.A11YLENS_API_KEY,
    body: { messages: [] },
    timeoutMs: 120000,
  });
  assert.equal(response.response.rawContent, JSON.stringify(result));
  assert.deepEqual(response.response.usage, {
    promptTokens: 12,
    completionTokens: null,
    totalTokens: null,
  });
  assert.equal(response.response.usageAvailable, true);
  assert.ok(!JSON.stringify(response).includes("reasoning_content"));
});

test("an unexpected returned model stops the batch instead of mixing model results", async (t) => {
  const f = fixture(t);
  const send = async (args) => {
    const response = await f.dependencies.send(args);
    response.response.returnedModel = "gemini-3.1-flash-lite";
    return response;
  };
  const value = await runEvaluation(
    { ...f.options, cases: [], strategies: [] },
    { ...f.dependencies, send },
  );
  assert.equal(value.requests, 1);
  assert.equal(value.stopped, "blocked");
  assert.equal(value.results[0].outcome, "blocked-error");
  assert.equal(f.records()[1].response.returnedModel, "gemini-3.1-flash-lite");
});

test("a 429 on attempt four still reports rate limiting as the stop reason", async (t) => {
  const f = fixture(t);
  let count = 0;
  const send = async (args) => {
    const response = await f.dependencies.send(args);
    count++;
    return count === 4
      ? { ...response, httpStatus: 429, retryAfter: "60" }
      : response;
  };
  const value = await runEvaluation(
    { ...f.options, cases: [], strategies: [] },
    { ...f.dependencies, send },
  );
  assert.equal(value.requests, 4);
  assert.equal(value.stopped, "rate-limited");
});
