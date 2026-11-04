import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  runEvaluation,
  runValidation,
  selectProviderResponse,
} from "../runner.mjs";

const env = {
  A11YLENS_MODEL_ENDPOINT: "https://example.test/v1/chat/completions",
  A11YLENS_API_KEY: "offline-test-credential",
};
const passing = {
  grounded: true,
  contextConsistent: true,
  informative: true,
  concise: true,
  noUnsupportedClaims: true,
  reasons: [],
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const readEvents = (dir) =>
  readFileSync(join(dir, "attempts.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
const response = (value, httpStatus = 200) => ({
  httpStatus,
  retryAfter: null,
  response: selectProviderResponse({
    model: "gemini-3.5-flash-lite",
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(value) } },
    ],
  }),
});

async function fixture(t, results = {}) {
  const base = mkdtempSync(join(tmpdir(), "a11ylens-validation-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const sourceDir = join(base, "source"),
    outputDir = join(base, "validation");
  let clock = Date.parse("2026-11-01T12:00:00Z");
  const starts = [],
    bodies = [];
  const dependencies = {
    env,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    send: async ({ body }) => {
      starts.push(clock);
      bodies.push(body);
      clock += 100;
      return response(passing);
    },
  };
  // Filtered calls preserve the complete seeded source schedule, while making
  // mocked case identity explicit instead of guessing from natural-language text.
  for (const id of [
    "case-01",
    "case-02",
    "case-03",
    "case-04",
    "case-05",
    "case-06",
  ]) {
    const result =
      results[id] ??
      (id === "case-05" || id === "case-06"
        ? { concern: false, suggestion: null }
        : { concern: true, suggestion: `Description for ${id}.` });
    await runEvaluation(
      {
        experimentId: "synthetic-source",
        outputDir: sourceDir,
        cases: [id],
        strategies: ["structure-aware"],
      },
      {
        ...dependencies,
        send: async () => {
          clock += 100;
          return response(result);
        },
      },
    );
  }
  const sourceBefore = [
    "experiment.json",
    "attempts.jsonl",
    "prompts/generation.json",
    "prompts/validation.json",
  ].map((p) => [p, sha(readFileSync(join(sourceDir, p)))]);
  const options = {
    sourceId: "synthetic-source",
    sourceDir,
    experimentId: "validation-test",
    outputDir,
  };
  const run = (opts = {}, deps = {}) =>
    runValidation({ ...options, ...opts }, { ...dependencies, ...deps });
  const assertSourceUnchanged = () => {
    for (const [p, h] of sourceBefore)
      assert.equal(sha(readFileSync(join(sourceDir, p))), h);
  };
  return {
    base,
    sourceDir,
    outputDir,
    options,
    dependencies,
    run,
    starts,
    bodies,
    assertSourceUnchanged,
  };
}

test("validation preview is credential-free, write-free, and preserves exact saved inputs", async (t) => {
  const f = await fixture(t);
  const dry = await f.run(
    { dryRun: true },
    { env: {}, send: () => assert.fail("Unexpected request") },
  );
  assert.equal(dry.requests, 0);
  assert.equal(dry.plannedJobs.length, 4);
  assert.deepEqual(
    dry.exclusions.map((x) => [x.caseId, x.reason]),
    [
      ["case-05", "no-improvement"],
      ["case-06", "no-improvement"],
    ],
  );
  const events = readEvents(f.sourceDir);
  for (const { job, input } of dry.plannedJobs) {
    const finish = events.find(
      (e) => e.event === "attempt-finished" && e.job.caseId === job.caseId,
    );
    const start = events.find(
      (e) => e.event === "attempt-started" && e.attemptId === finish.attemptId,
    );
    assert.equal(input.sourceGenerationAttemptId, finish.attemptId);
    assert.equal(input.suggestionToValidate, finish.parsed.value.suggestion);
    assert.equal(input.formattedContext, start.input.formattedContext);
    assert.equal(input.imageSha256, start.input.imageSha256);
  }
  assert.equal(existsSync(f.outputDir), false);
  assert.equal(f.starts.length, 0);
  f.assertSourceUnchanged();
});

test("validation snapshots full schedule across case filters, skips completed jobs, and preserves image/context", async (t) => {
  const f = await fixture(t);
  const first = await f.run({ cases: ["case-01"] });
  assert.equal(first.requests, 1);
  assert.equal(first.results[0].reviewDecision, "pass");
  const snapshotBytes = readFileSync(join(f.outputDir, "experiment.json"));
  const snapshot = JSON.parse(snapshotBytes);
  assert.equal(snapshot.generationJobs.length, 4);
  assert.equal(snapshot.exclusions.length, 2);
  assert.equal(snapshot.sourceGeneration.experimentId, "synthetic-source");
  const second = await f.run({ cases: ["case-02"] });
  assert.equal(second.requests, 1);
  assert.ok(f.starts[1] - f.starts[0] >= 15000);
  assert.deepEqual(
    readFileSync(join(f.outputDir, "experiment.json")),
    snapshotBytes,
  );
  assert.equal((await f.run({ cases: ["case-01"] })).requests, 0);
  const sourceStart = readEvents(f.sourceDir).find(
    (e) => e.event === "attempt-started" && e.job.caseId === "case-01",
  );
  const text = JSON.parse(f.bodies[0].messages[1].content[0].text);
  assert.deepEqual(text, {
    cellText: sourceStart.input.formattedContext,
    suggestion: "Description for case-01.",
  });
  const image = f.bodies[0].messages[1].content[1].image_url.url;
  assert.equal(
    sha(Buffer.from(image.split(",")[1], "base64")),
    sourceStart.input.imageSha256,
  );
  assert.ok(!("reasoning_effort" in f.bodies[0]));
  assert.ok(!("temperature" in f.bodies[0]));
  f.assertSourceUnchanged();
});

test("valid failed checks are succeeded executions requiring manual review; malformed checks are terminal", async (t) => {
  const f = await fixture(t);
  const result = await f.run(
    { cases: ["case-01"] },
    {
      send: async () =>
        response({
          ...passing,
          informative: false,
          reasons: ["Missing the main distribution pattern."],
        }),
    },
  );
  assert.equal(result.results[0].outcome, "succeeded");
  assert.equal(result.results[0].reviewDecision, "manual-review");
  assert.deepEqual(
    readEvents(f.outputDir).map((e) => e.event),
    ["attempt-started", "response-received", "attempt-finished"],
  );
  const bad = await f.run(
    { cases: ["case-02"] },
    { send: async () => response({ grounded: true, accurate: true }) },
  );
  assert.equal(bad.results[0].outcome, "model-output-error");
  assert.equal(bad.results[0].reviewDecision, "manual-review");
  assert.equal((await f.run({ cases: ["case-02"] })).requests, 0);
  f.assertSourceUnchanged();
});

test("recorded validation responses recover before dispatch even outside runtime filters", async (t) => {
  const f = await fixture(t);
  await f.run({ cases: ["case-01"] });
  const events = readEvents(f.outputDir);
  writeFileSync(
    join(f.outputDir, "attempts.jsonl"),
    events.slice(0, 2).map(JSON.stringify).join("\n") + "\n",
  );
  const recovered = await f.run(
    { cases: ["case-05"] },
    { send: () => assert.fail("Recovery re-POSTed") },
  );
  assert.equal(recovered.requests, 0);
  const finish = readEvents(f.outputDir).at(-1);
  assert.equal(finish.outcome, "succeeded");
  assert.equal(finish.parsed.kind, "validation");
  assert.deepEqual(finish.parsed.value, passing);
  f.assertSourceUnchanged();
});

test("validation manual transient retries respect two-attempt limit and preserve generation", async (t) => {
  const f = await fixture(t);
  const send = async () => response(null, 503);
  const first = await f.run({ cases: ["case-01"] }, { send });
  assert.equal(first.requests, 1);
  assert.equal(first.results[0].outcome, "retryable-error");
  const second = await f.run({ cases: ["case-01"] }, { send });
  assert.equal(second.results[0].attemptNumber, 2);
  assert.equal(second.results[0].outcome, "exhausted-error");
  assert.equal(second.results[0].reviewDecision, "manual-review");
  const events = readEvents(f.outputDir).filter(
    (e) => e.event === "attempt-started",
  );
  assert.ok(
    Date.parse(events[1].timestamp) - Date.parse(events[0].timestamp) >= 30000,
  );
  assert.equal((await f.run({ cases: ["case-01"] })).requests, 0);
  f.assertSourceUnchanged();
});

test("validation stops on 429 and retains provider-wide cooldown for another job", async (t) => {
  const f = await fixture(t);
  const first = await f.run(
    {},
    { send: async () => ({ ...response(null, 429), retryAfter: "120" }) },
  );
  assert.equal(first.requests, 1);
  assert.equal(first.stopped, "rate-limited");
  const events = readEvents(f.outputDir);
  const firstCase = first.results[0].job.caseId;
  const nextCase = firstCase === "case-01" ? "case-02" : "case-01";
  const deadline = Date.parse(events[1].providerRetryNotBefore);
  await f.run({ cases: [nextCase] });
  assert.ok(f.starts[0] >= deadline);
});

test("validation caps a batch at four and paces all request starts", async (t) => {
  const f = await fixture(t, {
    "case-05": { concern: true, suggestion: "Another description." },
  });
  const first = await f.run();
  assert.equal(first.requests, 4);
  assert.equal(first.stopped, "batch-limit");
  assert.equal((await f.run()).requests, 1);
  for (let i = 1; i < f.starts.length; i++)
    assert.ok(f.starts[i] - f.starts[i - 1] >= 15000);
});

test("no-improvement and over-limit exclusions never dispatch requests", async (t) => {
  const long = Array(41).fill("word").join(" ");
  const f = await fixture(t, {
    "case-02": { concern: true, suggestion: long },
  });
  const dry = await f.run(
    { dryRun: true, cases: ["case-02", "case-05"] },
    { env: {} },
  );
  assert.equal(dry.plannedJobs.length, 0);
  assert.deepEqual(
    dry.exclusions.map((x) => x.reason),
    ["over-word-limit", "no-improvement"],
  );
  const live = await f.run(
    { cases: ["case-02", "case-05"] },
    { send: () => assert.fail("Excluded job dispatched") },
  );
  assert.equal(live.requests, 0);
  assert.equal(live.stopped, "complete");
  f.assertSourceUnchanged();
});

test("an entirely ineligible source returns exclusions with zero requests", async (t) => {
  const results = Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((i) => [
      `case-0${i}`,
      { concern: false, suggestion: null },
    ]),
  );
  const f = await fixture(t, results);
  const dry = await f.run({ dryRun: true }, { env: {} });
  assert.equal(dry.plannedJobs.length, 0);
  assert.equal(dry.exclusions.length, 6);
  assert.equal(
    (await f.run({}, { send: () => assert.fail("Unexpected call") })).requests,
    0,
  );
});

test("source mutation on resume fails before changing validation evidence", async (t) => {
  const f = await fixture(t);
  await f.run({ cases: ["case-01"] });
  const valBefore = readFileSync(join(f.outputDir, "attempts.jsonl"));
  appendFileSync(join(f.sourceDir, "attempts.jsonl"), "\n"); // Valid JSONL, different immutable bytes.
  await assert.rejects(f.run({ cases: ["case-02"] }), /identity differs/);
  assert.deepEqual(
    readFileSync(join(f.outputDir, "attempts.jsonl")),
    valBefore,
  );
  assert.equal(f.starts.length, 1);
});

test("source raw/parsed disagreement and missing word evidence fail closed", async (t) => {
  for (const mode of ["parsed", "wordLimit"]) {
    const f = await fixture(t);
    const events = readEvents(f.sourceDir);
    const finish = events.find(
      (e) => e.event === "attempt-finished" && e.job.caseId === "case-01",
    );
    if (mode === "parsed")
      finish.parsed.value.suggestion = "Tampered suggestion.";
    else finish.wordLimit = null;
    writeFileSync(
      join(f.sourceDir, "attempts.jsonl"),
      events.map(JSON.stringify).join("\n") + "\n",
    );
    await assert.rejects(f.run(), /invalid|inconsistent/);
    assert.equal(f.starts.length, 0);
    assert.equal(existsSync(f.outputDir), false);
  }
});

test("endpoint, config, filters, and protected/symlinked paths reject before writes", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run({ cases: ["case-99"] }), /filter/);
  await assert.rejects(f.run({ strategies: ["minimal"] }), /filter/);
  await assert.rejects(
    f.run(
      {},
      { env: { ...env, A11YLENS_MODEL_ENDPOINT: "https://other.test/v1" } },
    ),
    /endpoint differs/,
  );
  await assert.rejects(
    f.run(
      {},
      {
        env: {
          ...env,
          A11YLENS_MODEL_ENDPOINT: "https://user:secret@example.test/v1",
        },
      },
    ),
    /credential-free/,
  );
  await assert.rejects(f.run({ outputDir: f.sourceDir }), /overlap/);
  await assert.rejects(f.run({ outputDir: f.base }), /overlap/);
  await assert.rejects(
    f.run({ outputDir: join(f.sourceDir, "child") }),
    /overlap/,
  );
  const alias = join(f.base, "alias");
  symlinkSync(f.sourceDir, alias, "dir");
  await assert.rejects(
    f.run({ outputDir: join(alias, "not-created") }),
    /overlap/,
  );
  const config = JSON.parse(
    readFileSync("evaluation/config.example.json", "utf8"),
  );
  config.maxOutputTokens = 1024;
  const configPath = join(f.base, "config.json");
  writeFileSync(configPath, JSON.stringify(config));
  await assert.rejects(f.run({ configPath }), /configuration differs/);
  assert.equal(f.starts.length, 0);
  assert.equal(existsSync(f.outputDir), false);
  f.assertSourceUnchanged();
});

test("terminal unavailable source is excluded; unfinished source is rejected", async (t) => {
  const f = await fixture(t, { "case-04": { concern: "invalid" } });
  const dry = await f.run({ dryRun: true }, { env: {} });
  assert.equal(dry.plannedJobs.length, 3);
  assert.equal(
    dry.exclusions.find((x) => x.caseId === "case-04").reason,
    "source-unavailable",
  );
  const incomplete = await fixture(t);
  const events = readEvents(incomplete.sourceDir).filter(
    (x) => x.job.caseId !== "case-04",
  );
  writeFileSync(
    join(incomplete.sourceDir, "attempts.jsonl"),
    events.map(JSON.stringify).join("\n") + "\n",
  );
  await assert.rejects(incomplete.run({ dryRun: true }), /terminal states/);
  assert.equal(existsSync(incomplete.outputDir), false);
});

test("changed source prompt or snapshot and active source lock reject without dispatch", async (t) => {
  for (const mode of ["prompt", "snapshot", "lock"]) {
    const f = await fixture(t);
    if (mode === "prompt")
      appendFileSync(join(f.sourceDir, "prompts/validation.json"), " ");
    if (mode === "snapshot") {
      const path = join(f.sourceDir, "experiment.json");
      const value = JSON.parse(readFileSync(path, "utf8"));
      value.fingerprint = "0".repeat(64);
      writeFileSync(path, JSON.stringify(value));
    }
    if (mode === "lock")
      writeFileSync(join(f.sourceDir, ".runner.lock"), "{}\n");
    await assert.rejects(f.run(), /artifact|fingerprint|locked/);
    assert.equal(f.starts.length, 0);
    assert.equal(existsSync(f.outputDir), false);
  }
});

test("frozen benchmark symlink output is rejected before creating a destination", async (t) => {
  const f = await fixture(t);
  const alias = join(f.base, "benchmark-alias");
  symlinkSync(resolve("test_files/benchmark"), alias, "dir");
  const destination = join(alias, "must-not-create-validation");
  await assert.rejects(f.run({ outputDir: destination }), /overlap/);
  assert.equal(existsSync(destination), false);
  assert.equal(f.starts.length, 0);
});
