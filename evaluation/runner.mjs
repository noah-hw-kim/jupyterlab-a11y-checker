import { createHash, randomUUID } from "node:crypto";
import {
  openSync,
  closeSync,
  fsyncSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  realpathSync,
  statSync,
} from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseEvaluationConfig,
  planEvaluationResume,
  rawIpynbToGeneralCells,
  extractImageCandidates,
  buildSemanticRequest,
  buildSemanticModelRequestBody,
  buildQualityModelRequestBody,
  parseSemanticResponseText,
  parseQualityResponseText,
  checkSuggestionLength,
  selectMinimalContext,
  selectFixedWindowContext,
  selectStructureAwareContext,
  selectLargestPracticalContext,
  formatContext,
} from "@berkeley-dsep-infra/a11y-checker-core";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SELECTORS = {
  minimal: selectMinimalContext,
  "fixed-window": selectFixedWindowContext,
  "structure-aware": selectStructureAwareContext,
  "largest-practical": selectLargestPracticalContext,
};
export class EvaluationRunnerError extends Error {}
const fail = (message) => {
  throw new EvaluationRunnerError(message);
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const key = (job) => JSON.stringify([job.caseId, job.strategy, job.stage]);
const iso = (ms) => new Date(ms).toISOString();
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fail(
      "Cannot read valid JSON from an evaluation input or saved artifact.",
    );
  }
};
function coreCall(fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof EvaluationRunnerError) throw error;
    return fail(
      "Evaluation configuration or saved records are invalid; execution stopped.",
    );
  }
}
function liveSettings(env, config) {
  const endpoint = safeEndpoint(env[config.endpointEnv]);
  const apiKey = env[config.apiKeyEnv];
  if (typeof apiKey !== "string" || !apiKey.trim() || /[\r\n]/.test(apiKey))
    fail("Required API-key environment variable is missing or invalid.");
  return { endpoint, apiKey };
}
function safeEndpoint(value) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    return url.href;
  } catch {
    return fail(
      "Set the endpoint environment variable to a credential-free HTTP(S) URL.",
    );
  }
}
function validExperimentId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value))
    fail(
      "Provide an explicit experiment ID using letters, numbers, dots, underscores, or hyphens.",
    );
  return value;
}
// Resolve existing symlink parents even when the destination has not been created.
function canonicalDestination(path) {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  if (parent === path) fail("Cannot resolve evaluation output path.");
  return join(canonicalDestination(parent), relative(parent, path));
}
function assertOutputDirectory(outDir, protectedDirs) {
  const output = canonicalDestination(outDir);
  for (const path of protectedDirs) {
    const protectedPath = canonicalDestination(path);
    if (
      output === protectedPath ||
      output.startsWith(protectedPath + sep) ||
      protectedPath.startsWith(output + sep)
    )
      fail(
        "Output directory must not overlap frozen inputs or source generation artifacts.",
      );
  }
}
function qualityDecision(finish) {
  const value = finish.parsed?.value;
  return finish.outcome === "succeeded" &&
    value &&
    [
      "grounded",
      "contextConsistent",
      "informative",
      "concise",
      "noUnsupportedClaims",
    ].every((field) => value[field] === true)
    ? "pass"
    : "manual-review";
}
function inside(root, path) {
  const rel = relative(realpathSync(root), realpathSync(path));
  if (
    rel.startsWith(`..${sep}`) ||
    rel === ".." ||
    resolve(root, rel) !== realpathSync(path)
  ) {
    fail("An evaluation input resolves outside the benchmark directory.");
  }
  return realpathSync(path);
}
function verifyBenchmark(root) {
  const directory = resolve(root, "test_files/benchmark");
  const freezePath = join(directory, "references/freeze.json");
  const freeze = readJson(freezePath);
  const manifest = readJson(join(directory, "references/manifest.json"));
  if (
    freeze.status !== "frozen" ||
    manifest.annotationStatus !== "reviewed" ||
    !Array.isArray(manifest.cases) ||
    manifest.cases.length !== 24 ||
    new Set(manifest.cases.map((c) => c.id)).size !== 24 ||
    !manifest.cases.every((c) => c.annotationStatus === "reviewed")
  ) {
    fail(
      "The benchmark must contain 24 reviewed cases with a frozen integrity snapshot.",
    );
  }
  const expected = [
    "references/manifest.json",
    ...manifest.cases.flatMap((c) => [c.notebookPath, c.imagePath]),
  ].sort();
  if (
    JSON.stringify(Object.keys(freeze.files).sort()) !==
    JSON.stringify(expected)
  )
    fail("Benchmark integrity file list is inconsistent.");
  for (const [path, hash] of Object.entries(freeze.files)) {
    if (sha(readFileSync(inside(directory, resolve(directory, path)))) !== hash)
      fail("A frozen benchmark file has changed.");
  }
  return { directory, manifest, freezeHash: sha(readFileSync(freezePath)) };
}
function shuffle(jobs, seed) {
  let state = seed >>> 0;
  const result = [...jobs];
  for (let i = result.length - 1; i > 0; i--) {
    state += 0x6d2b79f5;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    const j = Math.floor(
      (((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296) * (i + 1),
    );
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function prepare(benchmark, config, job) {
  const entry = benchmark.manifest.cases.find((c) => c.id === job.caseId);
  if (!entry || entry.split !== config.split)
    fail("Requested case is not in the configured split.");
  const notebookPath = inside(
    benchmark.directory,
    resolve(benchmark.directory, entry.notebookPath),
  );
  const cells = rawIpynbToGeneralCells(readJson(notebookPath));
  const cell = cells.find((c) => c.cellIndex === entry.cellIndex);
  const candidates = extractImageCandidates(cells).filter(
    (c) =>
      c.cellIndex === entry.cellIndex &&
      c.sourceType === entry.sourceType &&
      (c.sourceType !== "code-output" || c.outputIndex === entry.outputIndex),
  );
  if (!cell || candidates.length !== 1)
    fail("The case does not resolve to exactly one intended image.");
  const candidate = candidates[0];
  const imagePath = inside(
    benchmark.directory,
    resolve(benchmark.directory, entry.imagePath),
  );
  const bytes = readFileSync(imagePath);
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    fail("The case image is not a saved PNG.");
  if (candidate.sourceType === "code-output") {
    if (
      candidate.mimeType !== "image/png" ||
      !Buffer.from(candidate.src, "base64").equals(bytes)
    )
      fail("Output image bytes do not match the case asset.");
  } else if (
    inside(
      benchmark.directory,
      resolve(dirname(notebookPath), candidate.src),
    ) !== imagePath
  ) {
    fail("The selected Markdown image does not match the case asset.");
  }
  if (
    candidate.altState !== entry.expectedAltState ||
    candidate.existingAltText !== entry.existingAltText
  )
    fail("Existing alt text differs from the frozen case.");
  const context = SELECTORS[job.strategy](
    candidate,
    cells,
    config.contextCharacterBudget,
  );
  const request = buildSemanticRequest(
    candidate,
    cell,
    `data:image/png;base64,${bytes.toString("base64")}`,
  );
  request.cellText = formatContext(context);
  const body = buildSemanticModelRequestBody(
    request,
    { model: config.model },
    config.maxOutputTokens,
  );
  const textCharacters = body.messages.reduce(
    (sum, message) =>
      sum +
      (typeof message.content === "string"
        ? message.content.length
        : message.content.reduce(
            (count, part) =>
              count + (part.type === "text" ? part.text.length : 0),
            0,
          )),
    0,
  );
  return {
    body,
    input: {
      task: request.task,
      existingAltText: request.existingAltText ?? null,
      imagePath: entry.imagePath,
      imageSha256: sha(bytes),
      imageMimeType: "image/png",
      formattedContext: request.cellText,
      includedCellIndices: context.cells.map((c) => c.cellIndex),
      selectedSourceCharacterCount: context.characterCount,
      formattedContextCharacterCount: request.cellText.length,
      messageTextCharacterCount: textCharacters,
      truncated: context.truncated,
      sourceGenerationAttemptId: null,
      suggestionToValidate: null,
    },
  };
}
function promptSnapshots(config) {
  const settings = { model: config.model };
  const request = {
    imageDataUrl: "{{imageDataUrl}}",
    cellText: "{{formattedContext}}",
  };
  return {
    generation:
      JSON.stringify(
        {
          generate: buildSemanticModelRequestBody(
            { ...request, task: "generate" },
            settings,
            config.maxOutputTokens,
          ),
          evaluate: buildSemanticModelRequestBody(
            {
              ...request,
              task: "evaluate",
              existingAltText: "{{existingAltText}}",
            },
            settings,
            config.maxOutputTokens,
          ),
        },
        null,
        2,
      ) + "\n",
    validation:
      JSON.stringify(
        buildQualityModelRequestBody(
          { ...request, suggestion: "{{suggestion}}" },
          settings,
          config.maxOutputTokens,
        ),
        null,
        2,
      ) + "\n",
  };
}
function codeIdentity(root) {
  const files = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".js")) files.push(path);
    }
  };
  walk(join(root, "packages/core/dist"));
  files.push(
    join(root, "evaluation/runner.mjs"),
    join(root, "evaluation/run.mjs"),
  );
  const hash = createHash("sha256");
  for (const file of files.sort())
    hash
      .update(relative(root, file))
      .update("\0")
      .update(readFileSync(file))
      .update("\0");
  let gitDir = join(root, ".git");
  if (statSync(gitDir).isFile())
    gitDir = resolve(
      root,
      readFileSync(gitDir, "utf8")
        .trim()
        .replace(/^gitdir: /, ""),
    );
  const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
  let commit = head;
  if (head.startsWith("ref: ")) {
    const ref = head.slice(5);
    const refPath = join(gitDir, ref);
    commit = existsSync(refPath)
      ? readFileSync(refPath, "utf8").trim()
      : readFileSync(join(gitDir, "packed-refs"), "utf8")
          .split("\n")
          .find((line) => line.endsWith(` ${ref}`))
          ?.split(" ")[0];
  }
  if (!/^[a-f0-9]{40,64}$/.test(commit ?? ""))
    fail("Cannot identify the code revision.");
  return { codeCommit: commit, codeSnapshotSha256: hash.digest("hex") };
}
function durableNew(path, content) {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function syncDirectory(path) {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function appendEvent(path, event) {
  const fd = openSync(path, "a", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(event) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  syncDirectory(dirname(path));
}
function loadRecords(path) {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf8");
  if (content && !content.endsWith("\n"))
    fail(
      "Attempt log has an incomplete final line; preserve it for recovery. No requests sent.",
    );
  try {
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return fail(
      "Attempt log contains malformed JSON; refusing to reset attempts.",
    );
  }
}
function withLock(outDir, callback) {
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const path = join(outDir, ".runner.lock");
  const token = randomUUID();
  try {
    durableNew(path, JSON.stringify({ token, pid: process.pid }) + "\n");
  } catch {
    return fail(
      "Experiment is locked by another or interrupted runner. Check it before resuming.",
    );
  }
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (readJson(path).token === token) {
        unlinkSync(path);
        syncDirectory(outDir);
      }
    });
}
function ensureSnapshot(outDir, proposed, prompts) {
  const path = join(outDir, "experiment.json");
  if (existsSync(path)) {
    const saved = readJson(path);
    if (
      saved.fingerprint !== proposed.fingerprint ||
      JSON.stringify(saved.config) !== JSON.stringify(proposed.config) ||
      JSON.stringify(saved.generationJobs) !==
        JSON.stringify(proposed.generationJobs) ||
      saved.experimentId !== proposed.experimentId ||
      saved.resolvedEndpoint !== proposed.resolvedEndpoint ||
      saved.codeCommit !== proposed.codeCommit ||
      saved.codeSnapshotSha256 !== proposed.codeSnapshotSha256 ||
      saved.benchmarkFreezeSha256 !== proposed.benchmarkFreezeSha256 ||
      JSON.stringify(saved.prompts) !== JSON.stringify(proposed.prompts) ||
      JSON.stringify(saved.sourceGeneration ?? null) !==
        JSON.stringify(proposed.sourceGeneration ?? null) ||
      JSON.stringify(saved.exclusions ?? null) !==
        JSON.stringify(proposed.exclusions ?? null)
    )
      fail(
        "Existing experiment identity differs. Existing artifacts were not overwritten.",
      );
    for (const kind of ["generation", "validation"]) {
      const artifact = saved.prompts[kind];
      if (sha(readFileSync(join(outDir, artifact.path))) !== artifact.sha256)
        fail("A saved prompt snapshot has changed.");
    }
    return saved;
  }
  if (readdirSync(outDir).some((name) => name !== ".runner.lock"))
    fail(
      "Output directory contains partial or unrelated artifacts; refusing to overwrite them.",
    );
  mkdirSync(join(outDir, "prompts"), { mode: 0o700 });
  for (const kind of ["generation", "validation"])
    durableNew(join(outDir, proposed.prompts[kind].path), prompts[kind]);
  syncDirectory(join(outDir, "prompts"));
  durableNew(path, JSON.stringify(proposed, null, 2) + "\n");
  syncDirectory(outDir);
  return proposed;
}
const integerCount = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;
export function selectProviderResponse(data) {
  const counts = data?.usage;
  const usage = {
    promptTokens: integerCount(counts?.prompt_tokens),
    completionTokens: integerCount(counts?.completion_tokens),
    totalTokens: integerCount(counts?.total_tokens),
  };
  const available = Object.values(usage).some((value) => value !== null);
  const nullable = (value) => (typeof value === "string" ? value : null);
  return {
    rawContent: data?.choices?.[0]?.message?.content ?? null,
    finishReason: nullable(data?.choices?.[0]?.finish_reason),
    returnedModel: nullable(data?.model),
    responseId: nullable(data?.id),
    usage: available ? usage : null,
    usageAvailable: available,
  };
}
export async function sendModelRequest({ endpoint, apiKey, body, timeoutMs }) {
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  const selected = selectProviderResponse(data);
  if (response.ok && data === null) selected.rawContent = text;
  return {
    httpStatus: response.status,
    retryAfter: response.headers.get("retry-after"),
    response: selected,
  };
}
function retryDeadline(header, now, minimum) {
  let provider = 0;
  if (typeof header === "string") {
    if (/^\d+(?:\.\d+)?$/.test(header.trim()))
      provider = now + Number(header) * 1000;
    else provider = Date.parse(header);
  }
  return iso(Math.max(now + minimum, Number.isFinite(provider) ? provider : 0));
}
function finalize(start, received, config, now) {
  const finish = {
    schemaVersion: 1,
    experimentId: start.experimentId,
    fingerprint: start.fingerprint,
    job: start.job,
    attemptId: start.attemptId,
    attemptNumber: start.attemptNumber,
    timestamp: iso(now),
    event: "attempt-finished",
    dispatchState: received ? "response-received" : "unknown",
    outcome: "succeeded",
    latencyMs:
      received?.latencyMs ?? Math.max(0, now - Date.parse(start.timestamp)),
    responseRecorded: Boolean(received),
    parsed: null,
    wordLimit: null,
    error: null,
    retryNotBefore: received?.retryNotBefore ?? null,
    providerRetryNotBefore: received?.providerRetryNotBefore ?? null,
  };
  if (received && received.httpStatus >= 200 && received.httpStatus < 300) {
    if (
      received.response.returnedModel !== null &&
      received.response.returnedModel !== config.model
    ) {
      finish.outcome = "blocked-error";
      finish.error = {
        kind: "configuration",
        httpStatus: received.httpStatus,
        message:
          "Provider returned an unexpected model identifier; verify it before continuing.",
        retryable: false,
      };
      return finish;
    }
    try {
      if (typeof received.response.rawContent !== "string") throw new Error();
      if (start.job.stage === "validation") {
        finish.parsed = {
          kind: "validation",
          value: parseQualityResponseText(received.response.rawContent),
        };
      } else {
        const result = parseSemanticResponseText(received.response.rawContent);
        finish.parsed = { kind: "generation", value: result };
        finish.wordLimit =
          result.suggestion === null
            ? null
            : checkSuggestionLength(
                result.suggestion,
                config.maxSuggestionWords,
              );
      }
    } catch {
      finish.outcome = "model-output-error";
      finish.error = {
        kind: "parse",
        httpStatus: received.httpStatus,
        message: "Model content was empty, invalid JSON, or schema-invalid.",
        retryable: false,
      };
    }
  } else {
    const status = received?.httpStatus ?? null;
    const retryable =
      status === null || config.retry.httpStatuses.includes(status);
    finish.outcome = retryable
      ? start.attemptNumber === 1
        ? "retryable-error"
        : "exhausted-error"
      : "blocked-error";
    finish.error = {
      kind: received ? (retryable ? "provider" : "configuration") : "transport",
      httpStatus: status,
      message: received
        ? `Provider returned HTTP ${status}.`
        : "Network request failed or timed out.",
      retryable,
    };
    if (retryable && !received)
      finish.retryNotBefore = iso(now + config.retry.minimumDelayMs);
  }
  return finish;
}

/** Part A generation only. Dependencies allow offline tests without real requests or waits. */
export async function runEvaluation(options = {}, dependencies = {}) {
  const root = resolve(options.root ?? ROOT);
  const config = coreCall(() =>
    parseEvaluationConfig(
      readJson(
        resolve(
          options.configPath ?? join(root, "evaluation/config.example.json"),
        ),
      ),
    ),
  );
  const benchmark = verifyBenchmark(root);
  const cases = benchmark.manifest.cases.filter(
    (c) => c.split === config.split,
  );
  const caseFilter = options.cases ?? [];
  const strategyFilter = options.strategies ?? [];
  if (
    caseFilter.some((id) => !cases.some((c) => c.id === id)) ||
    strategyFilter.some((name) => !config.strategies.includes(name))
  )
    fail("Unknown case/strategy filter for this split.");
  const jobs = shuffle(
    cases.flatMap((c) =>
      config.strategies.map((strategy) => ({
        caseId: c.id,
        strategy,
        stage: "generation",
      })),
    ),
    config.orderSeed,
  );
  const selected = (job) =>
    (!caseFilter.length || caseFilter.includes(job.caseId)) &&
    (!strategyFilter.length || strategyFilter.includes(job.strategy));
  if (!jobs.some(selected)) fail("No jobs selected.");
  if (options.dryRun) {
    return {
      dryRun: true,
      plannedJobs: jobs
        .filter(selected)
        .map((job) => ({ job, input: prepare(benchmark, config, job).input })),
      requests: 0,
    };
  }
  const now = dependencies.now ?? Date.now;
  const env = dependencies.env ?? process.env;
  const { endpoint, apiKey } = liveSettings(env, config);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.experimentId ?? ""))
    fail(
      "Provide an explicit experiment ID using letters, numbers, dots, underscores, or hyphens.",
    );
  const outDir = resolve(
    options.outputDir ?? join(root, "evaluation/runs", options.experimentId),
  );
  assertOutputDirectory(outDir, [benchmark.directory]);
  const prompts = promptSnapshots(config);
  const promptArtifacts = Object.fromEntries(
    ["generation", "validation"].map((kind) => [
      kind,
      { path: `prompts/${kind}.json`, sha256: sha(prompts[kind]) },
    ]),
  );
  const identity = {
    config,
    resolvedEndpoint: endpoint,
    ...codeIdentity(root),
    benchmarkFreezeSha256: benchmark.freezeHash,
    prompts: promptArtifacts,
    generationJobs: jobs,
  };
  const proposed = {
    schemaVersion: 1,
    experimentId: options.experimentId,
    createdAt: iso(now()),
    ...identity,
    fingerprint: sha(JSON.stringify(identity)),
  };
  return executeRun({
    root,
    config,
    proposed,
    prompts,
    outDir,
    selected,
    prepareJob: (benchmark, job) => prepare(benchmark, config, job),
    dependencies,
    endpoint,
    apiKey,
  });
}

async function executeRun({
  root,
  config,
  proposed,
  prompts,
  outDir,
  selected,
  prepareJob,
  dependencies,
  endpoint,
  apiKey,
  verifySource = () => {},
}) {
  const now = dependencies.now ?? Date.now;
  const sleep =
    dependencies.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const send = dependencies.send ?? sendModelRequest;
  return withLock(outDir, async () => {
    verifySource();
    const snapshot = ensureSnapshot(outDir, proposed, prompts);
    const logPath = join(outDir, "attempts.jsonl");
    const context = {
      experimentId: snapshot.experimentId,
      fingerprint: snapshot.fingerprint,
      config: snapshot.config,
      jobs: snapshot.generationJobs,
    };
    const plan = () =>
      coreCall(() =>
        planEvaluationResume(context, config, loadRecords(logPath), now()),
      );
    // Recover every saved response before any new dispatch, even outside runtime filters.
    let state = plan();
    for (const item of state.jobs.filter(
      (item) => item.action === "recover-response",
    )) {
      const received = item.responseToRecover;
      const start = loadRecords(logPath).find(
        (event) =>
          event.event === "attempt-started" &&
          event.attemptId === received.attemptId,
      );
      appendEvent(logPath, finalize(start, received, config, now()));
    }
    const attempted = new Set();
    const results = [];
    let stopped = "complete";
    while (results.length < config.batchSize) {
      state = plan();
      if (state.blocked) {
        stopped = "blocked";
        break;
      }
      const eligible = state.jobs.filter(
        (item) =>
          selected(item.job) &&
          !attempted.has(key(item.job)) &&
          ["send", "wait"].includes(item.action),
      );
      if (!eligible.length) break;
      const item =
        eligible.find((item) => item.action === "send") ?? eligible[0];
      if (item.action === "wait") {
        await sleep(Math.max(1, Date.parse(item.notBefore) - now()));
        continue;
      }
      // Verify current frozen inputs again immediately before preparing each request.
      verifySource();
      const prepared = prepareJob(verifyBenchmark(root), item.job);
      const priorStart = loadRecords(logPath).find(
        (event) =>
          event.event === "attempt-started" && key(event.job) === key(item.job),
      );
      if (
        priorStart &&
        JSON.stringify(priorStart.input) !== JSON.stringify(prepared.input)
      )
        fail("Retry input differs from the recorded request.");
      const startedAt = now();
      const start = {
        schemaVersion: 1,
        experimentId: snapshot.experimentId,
        fingerprint: snapshot.fingerprint,
        job: item.job,
        attemptId: randomUUID(),
        attemptNumber: item.nextAttemptNumber,
        timestamp: iso(startedAt),
        event: "attempt-started",
        dispatchState: "reserved-before-send",
        input: prepared.input,
      };
      appendEvent(logPath, start);
      attempted.add(key(item.job));
      let received = null;
      let transport;
      try {
        transport = await send({
          endpoint,
          apiKey,
          body: prepared.body,
          timeoutMs: config.requestTimeoutMs,
        });
      } catch {
        /* No response is known; keep the attempt and record a safe transport failure. */
      }
      if (transport) {
        const timestamp = now();
        const retryAt = config.retry.httpStatuses.includes(transport.httpStatus)
          ? retryDeadline(
              transport.retryAfter,
              timestamp,
              config.retry.minimumDelayMs,
            )
          : null;
        received = {
          schemaVersion: 1,
          experimentId: start.experimentId,
          fingerprint: start.fingerprint,
          job: start.job,
          attemptId: start.attemptId,
          attemptNumber: start.attemptNumber,
          timestamp: iso(timestamp),
          event: "response-received",
          dispatchState: "response-received",
          httpStatus: transport.httpStatus,
          latencyMs: Math.max(0, timestamp - startedAt),
          retryNotBefore: retryAt,
          providerRetryNotBefore: transport.httpStatus === 429 ? retryAt : null,
          response: transport.response,
        };
        appendEvent(logPath, received);
      }
      const finished = finalize(start, received, config, now());
      appendEvent(logPath, finished);
      plan(); // Refuse inconsistent durable records before any subsequent dispatch.
      results.push({
        job: item.job,
        attemptNumber: start.attemptNumber,
        outcome: finished.outcome,
        result: finished.parsed?.value ?? null,
        ...(item.job.stage === "validation"
          ? { reviewDecision: qualityDecision(finished) }
          : {}),
      });
      if (received?.httpStatus === 429) {
        stopped = "rate-limited";
        break;
      }
      if (finished.outcome === "blocked-error") {
        stopped = "blocked";
        break;
      }
    }
    if (results.length === config.batchSize && stopped === "complete")
      stopped = "batch-limit";
    return {
      dryRun: false,
      experimentId: snapshot.experimentId,
      outputDir: outDir,
      requests: results.length,
      stopped,
      results,
    };
  });
}

/** Load historical evidence without comparing its code hash to today's code. */
function validationSource(
  benchmark,
  config,
  sourceId,
  sourceDir,
  prompts,
  now,
) {
  if (existsSync(join(sourceDir, ".runner.lock")))
    fail("Source generation is locked; finish it before validation.");
  const snapshotPath = inside(sourceDir, join(sourceDir, "experiment.json"));
  const logPath = inside(sourceDir, join(sourceDir, "attempts.jsonl"));
  const snapshot = readJson(snapshotPath);
  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.experimentId !== sourceId ||
    snapshot.sourceGeneration ||
    !/^[a-f0-9]{64}$/.test(snapshot.codeSnapshotSha256 ?? "") ||
    !/^[a-f0-9]{40,64}$/.test(snapshot.codeCommit ?? "") ||
    !Number.isFinite(Date.parse(snapshot.createdAt))
  )
    fail("Source generation snapshot is invalid.");
  const sourceConfig = coreCall(() => parseEvaluationConfig(snapshot.config));
  if (JSON.stringify(sourceConfig) !== JSON.stringify(config))
    fail(
      "Validation configuration differs from source generation configuration.",
    );
  if (snapshot.benchmarkFreezeSha256 !== benchmark.freezeHash)
    fail("Source generation benchmark identity differs.");
  const cases = benchmark.manifest.cases.filter(
    (c) => c.split === config.split,
  );
  const expectedJobs = shuffle(
    cases.flatMap((c) =>
      config.strategies.map((strategy) => ({
        caseId: c.id,
        strategy,
        stage: "generation",
      })),
    ),
    config.orderSeed,
  );
  if (
    JSON.stringify(snapshot.generationJobs) !== JSON.stringify(expectedJobs) ||
    !config.strategies.includes("structure-aware")
  )
    fail("Source generation schedule does not match the configured split.");
  const endpoint = safeEndpoint(snapshot.resolvedEndpoint);
  const identity = {
    config: snapshot.config,
    resolvedEndpoint: endpoint,
    codeCommit: snapshot.codeCommit,
    codeSnapshotSha256: snapshot.codeSnapshotSha256,
    benchmarkFreezeSha256: snapshot.benchmarkFreezeSha256,
    prompts: snapshot.prompts,
    generationJobs: snapshot.generationJobs,
  };
  if (sha(JSON.stringify(identity)) !== snapshot.fingerprint)
    fail("Source generation snapshot fingerprint is inconsistent.");
  const boundFiles = new Map([
    [snapshotPath, sha(readFileSync(snapshotPath))],
    [logPath, sha(readFileSync(logPath))],
  ]);
  for (const kind of ["generation", "validation"]) {
    const artifact = snapshot.prompts?.[kind];
    if (
      artifact?.path !== `prompts/${kind}.json` ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "")
    )
      fail("Source prompt artifact is invalid.");
    const path = inside(sourceDir, join(sourceDir, artifact.path));
    if (sha(readFileSync(path)) !== artifact.sha256)
      fail("Source prompt artifact has changed.");
    boundFiles.set(path, artifact.sha256);
  }
  if (sha(prompts.validation) !== snapshot.prompts.validation.sha256)
    fail("Validator prompt differs from the frozen source validator prompt.");
  const verify = () => {
    if (existsSync(join(sourceDir, ".runner.lock")))
      fail("Source generation is locked; validation stopped.");
    for (const [path, hash] of boundFiles)
      if (sha(readFileSync(path)) !== hash)
        fail("Source generation artifacts have changed; validation stopped.");
  };
  const records = loadRecords(logPath);
  const plan = coreCall(() =>
    planEvaluationResume(
      {
        experimentId: snapshot.experimentId,
        fingerprint: snapshot.fingerprint,
        config: sourceConfig,
        jobs: snapshot.generationJobs,
      },
      sourceConfig,
      records,
      now(),
    ),
  );
  if (plan.blocked)
    fail("Source generation is blocked; resolve it before validation.");
  const sources = new Map(),
    jobs = [],
    exclusions = [];
  for (const entry of cases) {
    const job = {
      caseId: entry.id,
      strategy: "structure-aware",
      stage: "generation",
    };
    const state = plan.jobs.find((item) => key(item.job) === key(job));
    if (
      !state ||
      !["succeeded", "model-output-error", "exhausted-error"].includes(
        state.status,
      )
    )
      fail(
        "Source structure-aware generation must reach terminal states before validation.",
      );
    const finish = records.findLast(
      (r) => r.event === "attempt-finished" && key(r.job) === key(job),
    );
    const exclude = (reason) =>
      exclusions.push({
        caseId: entry.id,
        strategy: "structure-aware",
        stage: "validation",
        reason,
        sourceGenerationAttemptId: finish.attemptId,
      });
    if (state.status !== "succeeded") {
      exclude("source-unavailable");
      continue;
    }
    const start = records.find(
      (r) => r.event === "attempt-started" && r.attemptId === finish.attemptId,
    );
    const result = finish.parsed.value;
    const expectedTask =
      entry.expectedAltState === "present" ? "evaluate" : "generate";
    if (
      start.input.imagePath !== entry.imagePath ||
      start.input.imageMimeType !== "image/png" ||
      start.input.task !== expectedTask ||
      start.input.existingAltText !==
        (expectedTask === "evaluate" ? entry.existingAltText : null)
    )
      fail(
        "Source image or existing alt identity differs from the frozen case.",
      );
    const bytes = readFileSync(
      inside(
        benchmark.directory,
        resolve(benchmark.directory, entry.imagePath),
      ),
    );
    if (
      sha(bytes) !== start.input.imageSha256 ||
      bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    )
      fail("Source image bytes differ from the frozen PNG.");
    const wordCheck =
      result.suggestion === null
        ? null
        : checkSuggestionLength(result.suggestion, config.maxSuggestionWords);
    if (JSON.stringify(wordCheck) !== JSON.stringify(finish.wordLimit))
      fail("Source word-limit evidence is inconsistent with its suggestion.");
    if (!result.concern) {
      exclude("no-improvement");
      continue;
    }
    if (!wordCheck.withinLimit) {
      exclude("over-word-limit");
      continue;
    }
    const validationJob = { ...job, stage: "validation" };
    jobs.push(validationJob);
    sources.set(key(validationJob), {
      input: start.input,
      suggestion: result.suggestion,
      attemptId: finish.attemptId,
    });
  }
  verify();
  return {
    jobs,
    exclusions,
    sources,
    verify,
    endpoint,
    lineage: {
      experimentId: sourceId,
      fingerprint: snapshot.fingerprint,
      snapshotSha256: boundFiles.get(snapshotPath),
      attemptsSha256: boundFiles.get(logPath),
    },
  };
}

function prepareValidation(benchmark, config, job, source) {
  if (!source) fail("Validation source record is missing.");
  const bytes = readFileSync(
    inside(
      benchmark.directory,
      resolve(benchmark.directory, source.input.imagePath),
    ),
  );
  if (sha(bytes) !== source.input.imageSha256)
    fail("Validation image differs from the source generation image.");
  const body = buildQualityModelRequestBody(
    {
      imageDataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      cellText: source.input.formattedContext,
      suggestion: source.suggestion,
    },
    {
      model: config.model,
      ...(config.reasoningEffort === "low" ? { reasoningEffort: "low" } : {}),
    },
    config.maxOutputTokens,
  );
  const messageTextCharacterCount = body.messages.reduce(
    (sum, message) =>
      sum +
      (typeof message.content === "string"
        ? message.content.length
        : message.content.reduce(
            (count, part) =>
              count + (part.type === "text" ? part.text.length : 0),
            0,
          )),
    0,
  );
  return {
    body,
    input: {
      ...source.input,
      task: "quality-validation",
      messageTextCharacterCount,
      sourceGenerationAttemptId: source.attemptId,
      suggestionToValidate: source.suggestion,
    },
  };
}

/** Part B: preserve generation evidence and screen exact saved suggestions. */
export async function runValidation(options = {}, dependencies = {}) {
  const root = resolve(options.root ?? ROOT);
  const config = coreCall(() =>
    parseEvaluationConfig(
      readJson(
        resolve(
          options.configPath ?? join(root, "evaluation/config.example.json"),
        ),
      ),
    ),
  );
  const benchmark = verifyBenchmark(root);
  const sourceId = validExperimentId(options.sourceId);
  const sourceDir = resolve(
    options.sourceDir ?? join(root, "evaluation/runs", sourceId),
  );
  const now = dependencies.now ?? Date.now;
  const prompts = promptSnapshots(config);
  const source = validationSource(
    benchmark,
    config,
    sourceId,
    sourceDir,
    prompts,
    now,
  );
  const caseFilter = options.cases ?? [],
    strategyFilter = options.strategies ?? [];
  const cases = benchmark.manifest.cases.filter(
    (c) => c.split === config.split,
  );
  if (
    caseFilter.some((id) => !cases.some((c) => c.id === id)) ||
    strategyFilter.some((strategy) => strategy !== "structure-aware")
  )
    fail("Unknown validation case/strategy filter for this split.");
  const selected = (job) =>
    !caseFilter.length || caseFilter.includes(job.caseId);
  const experimentId = validExperimentId(
    options.experimentId ?? `${sourceId}-validation`,
  );
  const outDir = resolve(
    options.outputDir ?? join(root, "evaluation/runs", experimentId),
  );
  assertOutputDirectory(outDir, [sourceDir, benchmark.directory]);
  const prepareJob = (bm, job) =>
    prepareValidation(bm, config, job, source.sources.get(key(job)));
  const summary = {
    stage: "validation",
    sourceGeneration: source.lineage,
    exclusions: source.exclusions.filter(selected),
  };
  if (options.dryRun)
    return {
      ...summary,
      dryRun: true,
      requests: 0,
      plannedJobs: source.jobs
        .filter(selected)
        .map((job) => ({ job, input: prepareJob(benchmark, job).input })),
    };
  const { endpoint, apiKey } = liveSettings(
    dependencies.env ?? process.env,
    config,
  );
  if (endpoint !== source.endpoint)
    fail("Validation endpoint differs from source generation endpoint.");
  const identity = {
    config,
    resolvedEndpoint: endpoint,
    ...codeIdentity(root),
    benchmarkFreezeSha256: benchmark.freezeHash,
    prompts: Object.fromEntries(
      ["generation", "validation"].map((kind) => [
        kind,
        { path: `prompts/${kind}.json`, sha256: sha(prompts[kind]) },
      ]),
    ),
    generationJobs: source.jobs,
    sourceGeneration: source.lineage,
    exclusions: source.exclusions,
  };
  const proposed = {
    schemaVersion: 1,
    experimentId,
    createdAt: iso(now()),
    ...identity,
    fingerprint: sha(JSON.stringify(identity)),
  };
  const result = await executeRun({
    root,
    config,
    proposed,
    prompts,
    outDir,
    selected,
    prepareJob,
    dependencies,
    endpoint,
    apiKey,
    verifySource: source.verify,
  });
  return { ...result, ...summary };
}
