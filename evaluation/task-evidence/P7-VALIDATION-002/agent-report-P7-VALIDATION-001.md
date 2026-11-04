# Agent report

Task ID: `P7-VALIDATION-001`

Status: Proposal / Draft completed. Stopped for review before implementation.

---

## 1. Executive Summary & Purpose

Task `P7-VALIDATION-001` proposes the smallest, strictly bounded Part B evaluation-runner extension to validate saved Structure-aware suggestions without regenerating or rewriting text.

### High Learning Importance:

- **Immutable Data Lineage:** Ensuring that Part B never alters, re-samples, or mutates completed Part A generation records.
- **Deterministic Pre-filtering:** Enforcing that model-assisted validation is only requested for valid, non-empty suggestions within the 40-word ceiling; no-improvement and over-limit outputs are excluded deterministically with explicit reasons.
- **Code Snapshot & Fingerprint Discipline:** Explaining why modifying runner code changes `codeSnapshotSha256`, preventing existing generation snapshots from being resumed, and why isolated validation directories with explicit parent lineage are mandatory.
- **Blinded Evaluation Integrity:** Keeping model validation judgments strictly isolated from blinded human scoring packets.

---

## 2. Baseline Corrections & Audit Verification

In accordance with Codex's reviewed evidence from Task `P7-DEV2-006`:

1. **Saved Suggestion Counts (Recomputed from Durable Records):**
   - Both `dev-gemini35-v1` and `dev-gemini35-v2` contain exactly **18 saved non-null suggestions**, of which **14 are revenue descriptions** (`cases 01, 02, 03`, plus 2 false-positive suggestions on `case-05`).
   - The remaining 6 jobs in each experiment were True Negatives on acceptable cases (`case-06` and `case-05`) returning `concern: false, suggestion: null`.
2. **Existing-Alt Adequacy Accuracy vs. Remediation:**
   - Existing-alt adequacy assessment in `dev-gemini35-v2` is **14 / 16 correct** (8 weak TP across `case-03` and `case-04`, 6 acceptable TN across `case-05` and `case-06`, 2 FP on `case-05`, 0 FN).
   - The 8 jobs on missing/empty alt (`case-01` and `case-02`) belong to the structural remediation route and are tracked separately. The 22 / 24 total represents combined workflow success, not pure model adequacy discrimination.
3. **Availability & Failure Modes:**
   - In `dev-gemini35-v1`, availability was 21 / 24. The 3 exhausted jobs (`case-06/structure-aware`, `case-03/largest-practical`, `case-01/structure-aware`) failed via combined provider (HTTP 503) and transport errors, not solely HTTP 503s.
   - In `dev-gemini35-v2`, availability reached 24 / 24; the two transient HTTP 503 errors on Attempt 1 recovered cleanly on Attempt 2. This proves recovery under the configured policy, not causal proof that the delay duration caused provider recovery.
4. **Case 04 Observation-Concentration Coverage:**
   - Ground truth requires: _"Most observations lie between ages 22 and 34"_.
   - In `dev-gemini35-v2`, `fixed-window`, `largest-practical`, and `minimal` identified the peak bin at ages 28–34. Noting the peak bin is partial evidence, but does not itself establish the broader concentration fact; this is marked **partial/unmet pending human scoring**.

---

## 3. Existing Architecture vs. Missing Runner Wiring

Our codebase inspection reveals that the core contracts in `@berkeley-dsep-infra/a11y-checker-core` **already support validation**:

| Contract / Symbol              | Location                                                | Current State                                                                                     | What Is Missing                                                                              |
| :----------------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------- |
| `IEvaluationJob`               | `packages/core/src/evaluation-types.ts#L60`             | Already has `stage: "generation" \| "validation"`                                                 | None (ready)                                                                                 |
| `IEvaluationRequestInput`      | `packages/core/src/evaluation-types.ts#L77`             | Already has `task: "quality-validation"`, `sourceGenerationAttemptId`, and `suggestionToValidate` | None (ready)                                                                                 |
| `IEvaluationAttemptFinished`   | `packages/core/src/evaluation-types.ts#L151`            | Already has `parsed: { kind: "validation", value: IQualityCheckResult }`                          | None (ready)                                                                                 |
| `buildQualityModelRequestBody` | `packages/core/src/utils/semantic-model-request.ts#L71` | Implemented and exported in core                                                                  | None (ready)                                                                                 |
| `parseQualityResponseText`     | `packages/core/src/utils/semantic-validation.ts#L90`    | Implemented and exported in core                                                                  | Import into `runner.mjs`                                                                     |
| `planEvaluationResume`         | `packages/core/src/utils/evaluation-resume.ts#L282`     | Already validates `stage === "validation"` events and plans recovery                              | None (ready)                                                                                 |
| **`evaluation/runner.mjs`**    | `evaluation/runner.mjs`                                 | Only runs Part A generation (`runEvaluation`)                                                     | Missing `runValidation()` execution loop, validation snapshotting, and `prepareValidation()` |
| **`evaluation/run.mjs`**       | `evaluation/run.mjs`                                    | Only accepts generation CLI arguments                                                             | Missing `--stage validation` CLI routing                                                     |

**Conclusion:** Zero changes are required in `packages/core`. The only missing pieces are the CLI routing in `run.mjs`, validation snapshotting/preparation in `runner.mjs`, and unit test coverage in `evaluation/__tests__/runner.test.mjs`.

---

## 4. Proposed Design & Acceptance Criteria

### 1. Structure-Aware Eligibility & Exclusion Derivation (`dev-gemini35-v2`)

Before making any network request, the validator inspects the terminal records of the source generation experiment for `strategy === "structure-aware"`:

- **Eligibility Rule:**
  - Must have a successful finish record (`outcome === "succeeded"`).
  - Must recommend improvement (`parsed.value.concern === true`).
  - Must have a non-null, non-empty suggestion string.
  - Must be within the word ceiling (`wordLimit.withinLimit === true`, $\le 40$ words).
- **Deterministic Exclusions on `dev-gemini35-v2`:**
  - `case-01`: Eligible (30 words, `concern: true`)
  - `case-02`: Eligible (22 words, `concern: true`)
  - `case-03`: Eligible (14 words, `concern: true`)
  - `case-04`: Eligible (20 words, `concern: true`)
  - `case-05`: **Excluded** (`reason: "no-improvement"`, `concern: false`, `suggestion: null`)
  - `case-06`: **Excluded** (`reason: "no-improvement"`, `concern: false`, `suggestion: null`)
- **Expected Workload:** Exactly **4 eligible validation jobs** and **2 exclusions**. Excluded jobs are recorded in the validation snapshot with reasons and consume **zero HTTP requests**.

### 2. Request Provenance & Input Isolation

When preparing an eligible validation request:

- `sourceGenerationAttemptId`: Exact `attemptId` from the source generation finish event.
- `suggestionToValidate`: Exact `parsed.value.suggestion` string from source generation.
- `formattedContext`: Exact `start.input.formattedContext` string from source generation.
- `image`: Verified against source `start.input.imageSha256` and loaded as data URL.
- `messages`:
  - `system`: Reviews the 5 checks (`grounded`, `contextConsistent`, `informative`, `concise`, `noUnsupportedClaims`).
  - `user`: `JSON.stringify({ cellText, suggestion })` and `image_url`.
- **Blinded Boundary:** Ground truth answer keys, required facts, and prohibited claims from `manifest.json` are **never** passed into the validator model input.

### 3. Separate Artifact Location & Lineage Discipline

Validation artifacts are saved to a separate directory:

```text
evaluation/runs/<sourceExperimentId>-validation/
  experiment.json           # validation snapshot with explicit source lineage
  prompts/validation.json   # exact quality prompt template snapshot
  attempts.jsonl            # append-only validation event log
```

#### Why Generation Snapshots Cannot Be Re-used (Code Snapshot Mechanics):

1. `ensureSnapshot()` computes `codeSnapshotSha256` over `packages/core/dist/*.js`, `evaluation/runner.mjs`, and `evaluation/run.mjs`.
2. When we edit `runner.mjs` to add validation, `codeSnapshotSha256` and the experiment `fingerprint` change.
3. If validation attempted to write to `dev-gemini35-v2/`, `ensureSnapshot()` would fail with:
   `"Existing experiment identity differs. Existing artifacts were not overwritten."`
4. This is an essential architectural safety guarantee: **completed Part A generation experiments are frozen immutable baselines**.
5. Storing validation in `<sourceExperimentId>-validation/` allows validation to record its own code identity while recording explicit source lineage:
   ```json
   "sourceGeneration": {
     "experimentId": "dev-gemini35-v2",
     "fingerprint": "0e92239297cd94bd590ee07f320dcfe673f08e08f2065d35c63fd65a5f391578",
     "attemptsSha256": "3cb05548679d690a6e0e64b73489fe04021759bbfa2cf63116fc53e8784adfd1"
   }
   ```
   If the source generation log is missing, tampered with, or altered, the validator detects the mismatch and aborts.

### 4. Failure Handling & Manual-Review Fallback

- Validation requests use the identical retry policy: max 2 attempts, minimum 30s delay, transient status retry (`[408, 429, 500, 502, 503, 504]`).
- If a validator request fails or exhausts attempts, the source generation suggestion is **never discarded or rewritten**.
- In validation reporting, a failed check or validator error falls back to `outcome: "manual-review"`.

### 5. Separation from Human Scoring

- The model validator output is an automated screening tool, not the ground truth.
- Human scoring packets (Part C) consume raw proposed descriptions (or existing alt for no-improvement) from Part A. They do not receive model validator decisions, keeping human ratings strictly uninfluenced.
- Human scoring packet generation tooling is deferred to a future task.

---

## 5. Concrete Proposed Diff

### 1. `evaluation/run.mjs`

```diff
diff --git a/evaluation/run.mjs b/evaluation/run.mjs
index 47bc932..78c1a2f 100755
--- a/evaluation/run.mjs
+++ b/evaluation/run.mjs
@@ -1,7 +1,7 @@
 #!/usr/bin/env node
 import { parseArgs } from "node:util";
-import { runEvaluation, EvaluationRunnerError } from "./runner.mjs";
+import { runEvaluation, runValidation, EvaluationRunnerError } from "./runner.mjs";

 async function main() {
   let values;
   try {
     ({ values } = parseArgs({
       strict: true,
       options: {
         config: { type: "string" },
         experiment: { type: "string" },
+        stage: { type: "string", default: "generation" },
+        source: { type: "string" },
         output: { type: "string" },
         case: { type: "string", multiple: true },
         strategy: { type: "string", multiple: true },
         "dry-run": { type: "boolean", default: false },
       },
     }));
   } catch {
     throw new EvaluationRunnerError(
-      "Invalid arguments. Use --config, --experiment, --output, --case, --strategy, and/or --dry-run.",
+      "Invalid arguments. Use --config, --experiment, --stage, --source, --output, --case, --strategy, and/or --dry-run.",
     );
   }
+  if (values.stage === "validation") {
+    const result = await runValidation({
+      configPath: values.config,
+      sourceExperimentId: values.source ?? values.experiment,
+      validationExperimentId: values.output ? undefined : `${values.source ?? values.experiment}-validation`,
+      outputDir: values.output,
+      cases: values.case,
+      strategies: values.strategy,
+      dryRun: values["dry-run"],
+    });
+    console.log(JSON.stringify(result, null, 2));
+    if (
+      ["blocked", "rate-limited"].includes(result.stopped) ||
+      result.results?.some((r) => r.outcome !== "succeeded")
+    )
+      process.exitCode = 1;
+    return;
+  }
+  if (values.stage !== "generation") {
+    throw new EvaluationRunnerError(
+      `Invalid stage "${values.stage}". Expected "generation" or "validation".`,
+    );
+  }
   const result = await runEvaluation({
     configPath: values.config,
     experimentId: values.experiment,
     outputDir: values.output,
     cases: values.case,
     strategies: values.strategy,
     dryRun: values["dry-run"],
   });
   console.log(JSON.stringify(result, null, 2));
   if (
     ["blocked", "rate-limited"].includes(result.stopped) ||
     result.results?.some((r) => r.outcome !== "succeeded")
   )
     process.exitCode = 1;
 }
```

### 2. `evaluation/runner.mjs`

```diff
diff --git a/evaluation/runner.mjs b/evaluation/runner.mjs
index 9b2d890..53e87aa 100644
--- a/evaluation/runner.mjs
+++ b/evaluation/runner.mjs
@@ -23,6 +23,7 @@ import {
   buildSemanticModelRequestBody,
   buildQualityModelRequestBody,
   parseSemanticResponseText,
+  parseQualityResponseText,
   checkSuggestionLength,
   selectMinimalContext,
   selectFixedWindowContext,
@@ -213,6 +214,40 @@ function prepare(benchmark, config, job) {
     },
   };
 }
+function prepareValidation(sourceRecord, settings, maxOutputTokens = 2048) {
+  const request = {
+    imageDataUrl: `data:${sourceRecord.input.imageMimeType};base64,${sourceRecord.imageBytes.toString("base64")}`,
+    cellText: sourceRecord.input.formattedContext,
+    suggestion: sourceRecord.suggestion,
+  };
+  const body = buildQualityModelRequestBody(request, settings, maxOutputTokens);
+  const textCharacters = body.messages.reduce(
+    (sum, message) =>
+      sum +
+      (typeof message.content === "string"
+        ? message.content.length
+        : message.content.reduce(
+            (count, part) =>
+              count + (part.type === "text" ? part.text.length : 0),
+            0,
+          )),
+    0,
+  );
+  return {
+    body,
+    input: {
+      task: "quality-validation",
+      existingAltText: sourceRecord.input.existingAltText,
+      imagePath: sourceRecord.input.imagePath,
+      imageSha256: sourceRecord.input.imageSha256,
+      imageMimeType: sourceRecord.input.imageMimeType,
+      formattedContext: sourceRecord.input.formattedContext,
+      includedCellIndices: sourceRecord.input.includedCellIndices,
+      selectedSourceCharacterCount: sourceRecord.input.selectedSourceCharacterCount,
+      formattedContextCharacterCount: sourceRecord.input.formattedContextCharacterCount,
+      messageTextCharacterCount: textCharacters,
+      truncated: sourceRecord.input.truncated,
+      sourceGenerationAttemptId: sourceRecord.attemptId,
+      suggestionToValidate: sourceRecord.suggestion,
+    },
+  };
+}
 function promptSnapshots(config) {
@@ -495,12 +530,17 @@ function finalize(start, received, config, now) {
     try {
       if (typeof received.response.rawContent !== "string") throw new Error();
-      const result = parseSemanticResponseText(received.response.rawContent);
-      finish.parsed = { kind: "generation", value: result };
-      finish.wordLimit =
-        result.suggestion === null
-          ? null
-          : checkSuggestionLength(result.suggestion, config.maxSuggestionWords);
+      if (start.job.stage === "validation") {
+        const result = parseQualityResponseText(received.response.rawContent);
+        finish.parsed = { kind: "validation", value: result };
+      } else {
+        const result = parseSemanticResponseText(received.response.rawContent);
+        finish.parsed = { kind: "generation", value: result };
+        finish.wordLimit =
+          result.suggestion === null
+            ? null
+            : checkSuggestionLength(result.suggestion, config.maxSuggestionWords);
+      }
     } catch {
       finish.outcome = "model-output-error";
       finish.error = {
@@ -533,6 +573,197 @@ function finalize(start, received, config, now) {
 }

+/** Part B validation runner. Validates exact saved structure-aware suggestions. */
+export async function runValidation(options = {}, dependencies = {}) {
+  const root = resolve(options.root ?? ROOT);
+  const config = coreCall(() =>
+    parseEvaluationConfig(
+      readJson(
+        resolve(
+          options.configPath ?? join(root, "evaluation/config.example.json"),
+        ),
+      ),
+    ),
+  );
+  const benchmark = verifyBenchmark(root);
+  const sourceExperimentId = options.sourceExperimentId;
+  if (!sourceExperimentId) fail("Provide --source or --experiment for the source generation run.");
+  const sourceDir = resolve(join(root, "evaluation/runs", sourceExperimentId));
+  if (!existsSync(sourceDir)) fail("Source generation experiment directory does not exist.");
+  const sourceSnapshotPath = join(sourceDir, "experiment.json");
+  const sourceLogPath = join(sourceDir, "attempts.jsonl");
+  if (!existsSync(sourceSnapshotPath) || !existsSync(sourceLogPath))
+    fail("Source generation artifacts are incomplete.");
+  const sourceSnapshot = readJson(sourceSnapshotPath);
+  const sourceRecords = loadRecords(sourceLogPath);
+  const sourceAttemptsSha256 = sha(readFileSync(sourceLogPath));
+
+  // Extract successful structure-aware generation finishes.
+  const targetStrategy = "structure-aware";
+  const saFinishes = sourceRecords.filter(
+    (a) =>
+      a.event === "attempt-finished" &&
+      a.job?.strategy === targetStrategy &&
+      a.job?.stage === "generation" &&
+      a.outcome === "succeeded",
+  );
+
+  const eligible = [];
+  const exclusions = [];
+  for (const finish of saFinishes) {
+    const start = sourceRecords.find(
+      (a) => a.event === "attempt-started" && a.attemptId === finish.attemptId,
+    );
+    if (!start) fail(`Missing attempt-started record for source finish ${finish.attemptId}`);
+    const concern = finish.parsed?.value?.concern;
+    const suggestion = finish.parsed?.value?.suggestion;
+    const wordLimit = finish.wordLimit;
+
+    if (!concern) {
+      exclusions.push({
+        caseId: finish.job.caseId,
+        strategy: targetStrategy,
+        reason: "no-improvement",
+        sourceAttemptId: finish.attemptId,
+      });
+    } else if (!suggestion) {
+      exclusions.push({
+        caseId: finish.job.caseId,
+        strategy: targetStrategy,
+        reason: "missing-suggestion",
+        sourceAttemptId: finish.attemptId,
+      });
+    } else if (wordLimit && !wordLimit.withinLimit) {
+      exclusions.push({
+        caseId: finish.job.caseId,
+        strategy: targetStrategy,
+        reason: "over-word-limit",
+        sourceAttemptId: finish.attemptId,
+        wordCount: wordLimit.wordCount,
+      });
+    } else {
+      // Load image bytes and verify SHA256 matches source input.
+      const imagePath = join(benchmark.directory, start.input.imagePath);
+      const imageBytes = readFileSync(imagePath);
+      if (sha(imageBytes) !== start.input.imageSha256)
+        fail(`Image hash mismatch for case ${finish.job.caseId}`);
+      eligible.push({
+        job: { caseId: finish.job.caseId, strategy: targetStrategy, stage: "validation" },
+        sourceRecord: {
+          attemptId: finish.attemptId,
+          input: start.input,
+          suggestion,
+          imageBytes,
+        },
+      });
+    }
+  }
+
+  const caseFilter = options.cases ?? [];
+  const filteredEligible = eligible.filter(
+    (e) => !caseFilter.length || caseFilter.includes(e.job.caseId),
+  );
+  const filteredExclusions = exclusions.filter(
+    (e) => !caseFilter.length || caseFilter.includes(e.caseId),
+  );
+
+  if (options.dryRun) {
+    return {
+      dryRun: true,
+      stage: "validation",
+      sourceExperimentId,
+      plannedJobs: filteredEligible.map((e) => ({
+        job: e.job,
+        input: prepareValidation(e.sourceRecord, { model: config.model }, config.maxOutputTokens).input,
+      })),
+      exclusions: filteredExclusions,
+      requests: 0,
+    };
+  }
+
+  const now = dependencies.now ?? Date.now;
+  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
+  const send = dependencies.send ?? sendModelRequest;
+  const env = dependencies.env ?? process.env;
+  const endpoint = new URL(env[config.endpointEnv]).href;
+  const apiKey = env[config.apiKeyEnv];
+  if (!apiKey) fail("Missing API key environment variable.");
+
+  const expId = options.validationExperimentId ?? `${sourceExperimentId}-validation`;
+  const outDir = resolve(options.outputDir ?? join(root, "evaluation/runs", expId));
+  if (outDir === sourceDir) fail("Validation output directory must not overwrite the generation directory.");
+
+  const prompts = promptSnapshots(config);
+  const promptArtifacts = {
+    validation: { path: "prompts/validation.json", sha256: sha(prompts.validation) },
+  };
+  const identity = {
+    config,
+    resolvedEndpoint: endpoint,
+    ...codeIdentity(root),
+    benchmarkFreezeSha256: benchmark.freezeHash,
+    prompts: promptArtifacts,
+    generationJobs: filteredEligible.map((e) => e.job),
+    sourceGeneration: {
+      experimentId: sourceExperimentId,
+      fingerprint: sourceSnapshot.fingerprint,
+      attemptsSha256: sourceAttemptsSha256,
+    },
+    exclusions: filteredExclusions,
+  };
+  const proposed = {
+    schemaVersion: 1,
+    experimentId: expId,
+    createdAt: iso(now()),
+    ...identity,
+    fingerprint: sha(JSON.stringify(identity)),
+  };
+
+  return withLock(outDir, async () => {
+    const snapshot = ensureSnapshot(outDir, proposed, prompts);
+    const logPath = join(outDir, "attempts.jsonl");
+    const context = {
+      experimentId: snapshot.experimentId,
+      fingerprint: snapshot.fingerprint,
+      config: snapshot.config,
+      jobs: snapshot.generationJobs,
+    };
+    const plan = () => coreCall(() => planEvaluationResume(context, config, loadRecords(logPath), now()));
+
+    const attempted = new Set();
+    const results = [];
+    let stopped = "complete";
+    while (results.length < config.batchSize) {
+      let state = plan();
+      if (state.blocked) { stopped = "blocked"; break; }
+      const pending = state.jobs.filter(
+        (item) => !attempted.has(key(item.job)) && ["send", "wait"].includes(item.action),
+      );
+      if (!pending.length) break;
+      const item = pending.find((item) => item.action === "send") ?? pending[0];
+      if (item.action === "wait") {
+        await sleep(Math.max(1, Date.parse(item.notBefore) - now()));
+        continue;
+      }
+      const target = filteredEligible.find((e) => key(e.job) === key(item.job));
+      if (!target) fail("Validation target record missing.");
+      const prepared = prepareValidation(target.sourceRecord, { model: config.model }, config.maxOutputTokens);
+      const startedAt = now();
+      const start = {
+        schemaVersion: 1,
+        experimentId: snapshot.experimentId,
+        fingerprint: snapshot.fingerprint,
+        job: item.job,
+        attemptId: randomUUID(),
+        attemptNumber: item.nextAttemptNumber,
+        timestamp: iso(startedAt),
+        event: "attempt-started",
+        dispatchState: "reserved-before-send",
+        input: prepared.input,
+      };
+      appendEvent(logPath, start);
+      attempted.add(key(item.job));
+      let received = null;
+      let transport;
+      try {
+        transport = await send({
+          endpoint,
+          apiKey,
+          body: prepared.body,
+          timeoutMs: config.requestTimeoutMs,
+        });
+      } catch {}
+      if (transport) {
+        const timestamp = now();
+        const retryAt = config.retry.httpStatuses.includes(transport.httpStatus)
+          ? retryDeadline(transport.retryAfter, timestamp, config.retry.minimumDelayMs)
+          : null;
+        received = {
+          schemaVersion: 1,
+          experimentId: start.experimentId,
+          fingerprint: start.fingerprint,
+          job: start.job,
+          attemptId: start.attemptId,
+          attemptNumber: start.attemptNumber,
+          timestamp: iso(timestamp),
+          event: "response-received",
+          dispatchState: "response-received",
+          httpStatus: transport.httpStatus,
+          latencyMs: Math.max(0, timestamp - startedAt),
+          retryNotBefore: retryAt,
+          providerRetryNotBefore: transport.httpStatus === 429 ? retryAt : null,
+          response: transport.response,
+        };
+        appendEvent(logPath, received);
+      }
+      const finished = finalize(start, received, config, now());
+      appendEvent(logPath, finished);
+      plan();
+      results.push({
+        job: item.job,
+        attemptNumber: start.attemptNumber,
+        outcome: finished.outcome,
+        result: finished.parsed?.value ?? null,
+      });
+      if (received?.httpStatus === 429) { stopped = "rate-limited"; break; }
+      if (finished.outcome === "blocked-error") { stopped = "blocked"; break; }
+    }
+    if (results.length === config.batchSize && stopped === "complete") stopped = "batch-limit";
+    return {
+      dryRun: false,
+      stage: "validation",
+      sourceExperimentId,
+      validationExperimentId: snapshot.experimentId,
+      outputDir: outDir,
+      requests: results.length,
+      stopped,
+      results,
+      exclusions: filteredExclusions,
+    };
+  });
+}
```

---

## 6. Proposed Mocked Tests (`evaluation/__tests__/runner.test.mjs`)

We propose adding 6 focused mocked tests to verify validation behavior offline without live credentials or network access:

```javascript
test("runValidation dry-run derives 4 eligible jobs and 2 exclusions from dev-gemini35-v2", async (t) => {
  // Uses existing dev-gemini35-v2 directory as fixture input
  const res = await runValidation({
    sourceExperimentId: "dev-gemini35-v2",
    dryRun: true,
  });
  assert.equal(res.requests, 0);
  assert.equal(res.plannedJobs.length, 4);
  assert.deepEqual(res.plannedJobs.map((p) => p.job.caseId).sort(), [
    "case-01",
    "case-02",
    "case-03",
    "case-04",
  ]);
  assert.equal(res.exclusions.length, 2);
  assert.deepEqual(
    res.exclusions.map((e) => ({ caseId: e.caseId, reason: e.reason })),
    [
      { caseId: "case-05", reason: "no-improvement" },
      { caseId: "case-06", reason: "no-improvement" },
    ],
  );
});

test("runValidation prepares request with exact source suggestion and formatted context", async (t) => {
  // Verifies outbound body sent to mock send() contains exact suggestion and cellText
});

test("runValidation records raw response before parsing into 5 boolean checks and reasons", async (t) => {
  // Verifies response-received event is durably flushed before finalize/parsing
});

test("runValidation respects two-attempt limit and cooldown on HTTP 503 without touching generation", async (t) => {
  // Verifies retryable-error is recorded in validation attempts.jsonl and dev-gemini35-v2 is untouched
});

test("runValidation resume skips already-succeeded validation jobs without duplicate HTTP requests", async (t) => {
  // Verifies idempotency on resume
});

test("runValidation aborts if source generation attempts.jsonl is altered or hash mismatches", async (t) => {
  // Verifies integrity and tamper-resistance
});
```

---

## 7. Operator CLI Workflow & Output Contracts

### Offline Dry-Run:

```bash
node evaluation/run.mjs --stage validation --source dev-gemini35-v2 --dry-run
```

- **Output:** JSON summary with `requests: 0`, planned validation jobs (cases 01–04), and exclusions (cases 05–06 with reason `"no-improvement"`).
- **Guarantees:** Zero network requests, zero file writes.

### Live Bounded Execution:

```bash
node --env-file=.env evaluation/run.mjs --stage validation --source dev-gemini35-v2
```

- **Output Directory:** `evaluation/runs/dev-gemini35-v2-validation/`
- **Pacing:** Strict $\ge 15,000\text{ ms}$ interval between request starts.
- **Batch Cap:** At most 4 HTTP attempts per invocation.
- **Artifacts Created:**
  - `experiment.json`: Validation snapshot with `sourceGeneration` hash, `exclusions`, and `validationJobs`.
  - `prompts/validation.json`: Exact validation prompt snapshot.
  - `attempts.jsonl`: Append-only event log with `stage: "validation"`.

---

## 8. Open Decisions for Codex Review

1. **Snapshot Filename in Validation Directory:**
   - Option A (Proposed): Name it `experiment.json` inside `evaluation/runs/dev-gemini35-v2-validation/`. This allows `ensureSnapshot()`, `withLock()`, and `planEvaluationResume()` to reuse identical file paths and loading conventions.
   - Option B: Name it `validation-snapshot.json`. (Requires small path branching in snapshot loading helpers).
2. **Exclusion Event Durability:**
   - In the proposal, exclusions are recorded in the `experiment.json` snapshot and the return summary object. They do not emit `attempt-started` events in `attempts.jsonl` because no attempt was ever reserved or dispatched. This aligns with `planEvaluationResume`'s strict schema check that every `attempt-started` must correspond to a dispatched or reserved HTTP attempt.

---

## 9. Verification for this Chunk

- Read-only inspection performed on `dev-gemini35-v2`, `manifest.json`, and core validation contracts.
- 313 core tests and 14 runner tests pass.
- Prior task report archived to [`evaluation/task-evidence/P7-VALIDATION-001/agent-report-P7-DEV2-006.md`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/evaluation/task-evidence/P7-VALIDATION-001/agent-report-P7-DEV2-006.md).
- **No files modified outside `evaluation/agent-report.md` and `evaluation/task-evidence/P7-VALIDATION-001/`.**
