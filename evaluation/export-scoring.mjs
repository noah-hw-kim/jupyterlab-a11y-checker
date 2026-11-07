import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseEvaluationConfig,
  planEvaluationResume,
} from "@berkeley-dsep-infra/a11y-checker-core";

export class ScoringExporterError extends Error {}
const fail = (message) => {
  throw new ScoringExporterError(message);
};
const key = (job) => JSON.stringify([job.caseId, job.strategy, job.stage]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (parent, child) => {
  const p = resolve(parent);
  const c = resolve(child);
  return c === p || c.startsWith(p + sep);
};

function seedValue(value) {
  if (typeof value !== "string" && typeof value !== "number")
    fail("Seed must be an unsigned 32-bit integer.");
  if (typeof value === "string" && !/^(0|[1-9]\d*)$/.test(value))
    fail("Seed must be an unsigned 32-bit integer.");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0 || result > 0xffffffff)
    fail("Seed must be an unsigned 32-bit integer.");
  return result;
}

function shuffle(items, seed) {
  let state = seed >>> 0;
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    state = Math.imul(state + 0x6d2b79f5, 1);
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    const j = Math.floor(
      (((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32) * (i + 1),
    );
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function fenced(text) {
  const runs = String(text ?? "").match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
  return `${fence}text\n${String(text ?? "")}\n${fence}`;
}

function tableCell(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;")
    .replaceAll("*", "&#42;")
    .replaceAll("_", "&#95;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;")
    .replaceAll("\n", "<br>");
}

export function packetMarkdown(items) {
  let output = "# Blinded Human Scoring Packet\n\n";
  output +=
    "Strategy-masked single-rater scoring; familiarity and repeated images limit masking.\n\n";
  output +=
    "Mark each defined fact Yes / No / Unsure and quote supporting words. Equivalent wording counts. Wrong subjects or units do not satisfy the fact. Empty text conveys zero facts.\n\n";
  output +=
    "List distinct unsupported assertions with evidence; an omitted fact is not an invented claim. Correct unit conversions are allowed. Assess all four defects separately; a missing reference fact does not automatically make the whole description uninformative.\n\n";
  output +=
    "Word limits are assessed independently from unnecessary verbosity. Resolve all Unsure entries before unblinding. Do not open the private mapping until review is finalized.\n\n";
  output +=
    "Scoring clarification approved November 6, 2026, after held-out collection: relationship facts require the relationship to be expressed; listing values alone does not satisfy them. Equivalent relational wording counts, regardless of fact number. Unit abbreviations such as ms count as stated units.\n\n";
  output +=
    "Defect 3.3 checks whether essential information is missing or cannot be established. A missing summary sentence alone is not a defect: a straightforward comparison of a short, complete, clearly ordered value sequence may supply sufficient information. A relationship fact No and 3.3 No are allowed. Do not choose marks merely to avoid overlap. Record uncertainty for complex or ambiguous presentations.\n\n";
  for (const item of items) {
    output += `---\n\n## Review Item: ${item.scoringId}\n\n![Chart](${item.assetPath})\n\n`;
    output += `**Approved context**\n\n${fenced(item.context)}\n\n**Description to score**\n\n`;
    output +=
      item.description === ""
        ? "*(Empty description)*\n\n"
        : `${fenced(item.description)}\n\n`;
    output +=
      "| Fact | Conveyed? Yes / No / Unsure | Exact supporting words or explanation |\n| --- | --- | --- |\n";
    for (const fact of item.requiredFacts)
      output += `| ${tableCell(fact)} | | |\n`;
    output +=
      "\n### Unsupported factual assertions\n\n| Quoted assertion | Evidence showing it is unsupported/incorrect |\n| --- | --- |\n| | |\n";
    output +=
      "\n### Other defects for validation analysis\n\n| Defect | Present? Yes / No / Unsure | Evidence |\n| --- | --- | --- |\n";
    for (const defect of [
      "Visual claim conflicts with the image",
      "Description contradicts approved notebook context",
      "Important image content is missing",
      "Wording is unnecessarily repetitive or irrelevant",
    ])
      output += `| ${defect} | | |\n`;
    output +=
      "\n### Finalization\n\n- Uncertainties and resolution: \n- Reviewer identifier: \n- Finalized date: \n- All Unsure entries resolved before unblinding: \n\n";
  }
  return output;
}

async function canonicalDestination(path) {
  try {
    return await fs.realpath(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) fail("Cannot resolve output destination.");
    return join(await canonicalDestination(parent), relative(parent, path));
  }
}

async function protectPaths(source, frozen, output) {
  const destination = await canonicalDestination(output);
  if (
    inside(source, destination) ||
    inside(destination, source) ||
    inside(frozen, destination) ||
    inside(destination, frozen)
  )
    fail("Protected paths overlap.");
}

async function checkedPath(parent, path) {
  const lexical = resolve(parent, path);
  const real = await fs.realpath(lexical);
  if (!inside(parent, lexical) || !inside(parent, real))
    fail("Input path escapes its source directory.");
  return real;
}

async function readBound(path, bound) {
  const bytes = await fs.readFile(path);
  const currentHash = hash(bytes);
  if (bound.has(path) && bound.get(path) !== currentHash)
    fail("Input changed during export.");
  bound.set(path, currentHash);
  return bytes;
}
function parseJson(bytes) {
  try {
    return JSON.parse(String(bytes));
  } catch {
    return fail("Source JSON is invalid.");
  }
}
async function verifyBound(bound) {
  for (const [path, expected] of bound)
    if (hash(await fs.readFile(path)) !== expected)
      fail("Input changed during export.");
}
async function loadEvidence(source, frozen) {
  if (
    await fs.stat(join(source, ".runner.lock")).then(
      () => true,
      (e) => {
        if (e.code === "ENOENT") return false;
        throw e;
      },
    )
  )
    fail("Source experiment is locked; finish it before export.");
  const bound = new Map();
  const snapshotBytes = await readBound(
    await checkedPath(source, "experiment.json"),
    bound,
  );
  const attemptsBytes = await readBound(
    await checkedPath(source, "attempts.jsonl"),
    bound,
  );
  const snapshot = parseJson(snapshotBytes);
  const manifest = parseJson(
    await readBound(
      await checkedPath(frozen, "references/manifest.json"),
      bound,
    ),
  );
  const freezeBytes = await readBound(
    await checkedPath(frozen, "references/freeze.json"),
    bound,
  );
  const freeze = parseJson(freezeBytes);
  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.sourceGeneration ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(snapshot.experimentId ?? "") ||
    !/^[a-f0-9]{64}$/.test(snapshot.codeSnapshotSha256 ?? "") ||
    !/^[a-f0-9]{40,64}$/.test(snapshot.codeCommit ?? "")
  )
    fail("Invalid generation snapshot.");
  const config = parseEvaluationConfig(snapshot.config);
  const identity = {
    config: snapshot.config,
    resolvedEndpoint: snapshot.resolvedEndpoint,
    codeCommit: snapshot.codeCommit,
    codeSnapshotSha256: snapshot.codeSnapshotSha256,
    benchmarkFreezeSha256: snapshot.benchmarkFreezeSha256,
    prompts: snapshot.prompts,
    generationJobs: snapshot.generationJobs,
  };
  if (hash(JSON.stringify(identity)) !== snapshot.fingerprint)
    fail("Source snapshot fingerprint is inconsistent.");
  if (snapshot.benchmarkFreezeSha256 !== hash(freezeBytes))
    fail("Benchmark freeze does not match source.");
  if (
    freeze.status !== "frozen" ||
    manifest.annotationStatus !== "reviewed" ||
    !Array.isArray(manifest.cases) ||
    manifest.cases.length !== 24 ||
    new Set(manifest.cases.map((c) => c.id)).size !== 24 ||
    !manifest.cases.every((c) => c.annotationStatus === "reviewed")
  )
    fail("Benchmark is not fully reviewed and frozen.");
  const expectedFiles = [
    "references/manifest.json",
    ...manifest.cases.flatMap((c) => [c.notebookPath, c.imagePath]),
  ].sort();
  if (
    JSON.stringify(Object.keys(freeze.files ?? {}).sort()) !==
    JSON.stringify(expectedFiles)
  )
    fail("Frozen inventory is incomplete.");
  for (const [path, expected] of Object.entries(freeze.files)) {
    if (
      !/^[a-f0-9]{64}$/.test(expected) ||
      hash(await readBound(await checkedPath(frozen, path), bound)) !== expected
    )
      fail("Frozen file hash mismatch.");
  }
  for (const stage of ["generation", "validation"]) {
    const prompt = snapshot.prompts?.[stage];
    if (
      prompt?.path !== `prompts/${stage}.json` ||
      hash(await readBound(await checkedPath(source, prompt.path), bound)) !==
        prompt.sha256
    )
      fail("Source prompt is missing or changed.");
  }
  const cases = new Map(
    manifest.cases
      .filter((c) => c.split === config.split)
      .map((c) => [c.id, c]),
  );
  const strategies = [
    "minimal",
    "fixed-window",
    "structure-aware",
    "largest-practical",
  ];
  if (
    JSON.stringify([...config.strategies].sort()) !==
    JSON.stringify([...strategies].sort())
  )
    fail("Scoring requires all four strategies.");
  const expectedJobs = new Set(
    [...cases.keys()].flatMap((id) =>
      strategies.map((strategy) =>
        key({ caseId: id, strategy, stage: "generation" }),
      ),
    ),
  );
  if (
    !Array.isArray(snapshot.generationJobs) ||
    snapshot.generationJobs.length !== expectedJobs.size ||
    snapshot.generationJobs.some((job) => !expectedJobs.delete(key(job))) ||
    expectedJobs.size
  )
    fail("Source schedule is incomplete.");
  const text = String(attemptsBytes);
  if (!text || !text.endsWith("\n"))
    fail("Source JSONL has an incomplete final line.");
  const records = text
    .trimEnd()
    .split("\n")
    .map((line) => parseJson(line));
  return {
    snapshot,
    snapshotBytes,
    attemptsBytes,
    config,
    cases,
    freeze,
    bound,
    records,
    frozenHashes: freeze.files,
    freezeHash: hash(freezeBytes),
  };
}

function validateEvents(snapshot, records) {
  const config = parseEvaluationConfig(snapshot.config);
  const context = {
    experimentId: snapshot.experimentId,
    fingerprint: snapshot.fingerprint,
    config,
    jobs: snapshot.generationJobs,
  };
  let plan;
  try {
    plan = planEvaluationResume(context, config, records, Date.now());
  } catch (cause) {
    throw new ScoringExporterError("Source event validation failed.", {
      cause,
    });
  }
  const byJob = new Map();
  for (const record of records) {
    const list = byJob.get(key(record.job)) ?? [];
    list.push(record);
    byJob.set(key(record.job), list);
  }
  for (const entry of plan.jobs) {
    if (
      entry.status === "pending" ||
      entry.status === "retryable-error" ||
      entry.status === "response-recorded" ||
      entry.status === "interrupted-unknown"
    )
      fail(`Source is incomplete: ${key(entry.job)}`);
    if (
      ![
        "succeeded",
        "model-output-error",
        "exhausted-error",
        "blocked-error",
      ].includes(entry.status)
    )
      fail(`Unsupported source state: ${entry.status}`);
  }
  return { plan, byJob };
}

export async function exportScoring({ sourceDir, frozenDir, outputDir, seed }) {
  if (!sourceDir || !frozenDir || !outputDir)
    fail("sourceDir, frozenDir, and outputDir are required.");
  const source = await fs.realpath(resolve(sourceDir));
  const frozen = await fs.realpath(resolve(frozenDir));
  const output = await canonicalDestination(resolve(outputDir));
  await protectPaths(source, frozen, output);
  const evidence = await loadEvidence(source, frozen);
  const {
    snapshot,
    snapshotBytes,
    attemptsBytes,
    config,
    cases,
    freezeHash,
    frozenHashes,
    bound,
    records,
  } = evidence;
  const { plan, byJob } = validateEvents(snapshot, records);
  const numericSeed = seedValue(seed ?? config.orderSeed);
  const items = snapshot.generationJobs.map((job) => {
    const entry = cases.get(job.caseId);
    if (!entry || !snapshot.config.strategies.includes(job.strategy))
      fail("Source job is outside the frozen schedule.");
    const status = plan.jobs.find(
      (candidate) => key(candidate.job) === key(job),
    ).status;
    const finish = (byJob.get(key(job)) ?? [])
      .filter((record) => record.event === "attempt-finished")
      .at(-1);
    const start = (byJob.get(key(job)) ?? [])
      .filter((record) => record.event === "attempt-started")
      .at(-1);
    if (!finish || !start) fail("Source job lacks a terminal event.");
    const sourceAlt = start.input.existingAltText || null;
    const expectedTask =
      entry.expectedAltState === "present" ? "evaluate" : "generate";
    if (
      start.input.task !== expectedTask ||
      start.input.imagePath !== entry.imagePath ||
      start.input.imageMimeType !== "image/png" ||
      start.input.imageSha256 !== frozenHashes[entry.imagePath] ||
      start.input.existingAltText !==
        (expectedTask === "evaluate" ? entry.existingAltText : null)
    )
      fail("Source image/alt identity differs from the frozen case.");
    const parsed = finish.parsed?.value;
    let description = "";
    let effectiveSource = "missed-improvement-empty";
    let availability = "available";
    if (status === "succeeded" && parsed.concern === true) {
      description = parsed.suggestion ?? "";
      effectiveSource = "proposed-replacement";
    } else if (status === "succeeded" && entry.expectedAltState === "present") {
      description = sourceAlt ?? "";
      effectiveSource = "retained-existing-alt";
    } else if (status !== "succeeded") {
      availability = "unavailable";
      effectiveSource = "unavailable";
    }
    return {
      caseId: entry.id,
      strategy: job.strategy,
      attemptId: finish.attemptId,
      modelConcern: parsed?.concern ?? null,
      description,
      effectiveSource,
      availability,
      shouldImprove: entry.shouldImprove,
      context: entry.evidence.context,
      requiredFacts: entry.requiredFacts,
      imagePath: entry.imagePath,
    };
  });
  await fs.mkdir(dirname(output), { recursive: true });
  const lockPath = `${output}.export.lock`;
  const lock = await fs.open(lockPath, "wx", 0o600);
  let staged;
  try {
    try {
      await fs.lstat(output);
      fail("Output already exists; preserve existing reviews.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    staged = await fs.mkdtemp(`${output}.tmp-`);
    await fs.mkdir(join(staged, "reviewer/assets"), {
      recursive: true,
      mode: 0o700,
    });
    const mapping = [];
    const packet = [];
    for (const [index, item] of shuffle(items, numericSeed).entries()) {
      const scoringId = `ITEM-${String(index + 1).padStart(2, "0")}`;
      if (item.availability === "available")
        await fs.copyFile(
          await checkedPath(frozen, item.imagePath),
          join(staged, "reviewer/assets", `${scoringId}.png`),
        );
      mapping.push({
        scoringId,
        caseId: item.caseId,
        strategy: item.strategy,
        sourceAttemptId: item.attemptId,
        modelConcern: item.modelConcern,
        effectiveDescription: item.description,
        effectiveSource: item.effectiveSource,
        availability: item.availability,
        shouldImprove: item.shouldImprove,
      });
      if (item.availability === "available")
        packet.push({
          scoringId,
          assetPath: `assets/${scoringId}.png`,
          context: item.context,
          description: item.description,
          requiredFacts: item.requiredFacts,
        });
    }
    await fs.writeFile(
      join(staged, "reviewer/scoring-packet.md"),
      packetMarkdown(packet),
    );
    await fs.writeFile(
      join(staged, "private-mapping.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          sourceExperimentId: snapshot.experimentId,
          sourceFingerprint: snapshot.fingerprint,
          sourceSnapshotSha256: hash(snapshotBytes),
          sourceAttemptsSha256: hash(attemptsBytes),
          freezeHash,
          frozenHashes,
          seed: numericSeed,
          items: mapping,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    await verifyBound(bound);
    await fs.writeFile(join(staged, "COMPLETE"), "complete\n", { mode: 0o600 });
    await fs.rename(staged, output);
    return {
      output,
      itemCount: packet.length,
      unavailableCount: mapping.length - packet.length,
    };
  } catch (error) {
    if (staged) await fs.rm(staged, { recursive: true, force: true });
    throw error;
  } finally {
    await lock.close();
    await fs.unlink(lockPath);
  }
}

async function main() {
  const { values } = parseArgs({
    strict: true,
    options: {
      source: { type: "string" },
      frozen: { type: "string" },
      output: { type: "string" },
      seed: { type: "string" },
    },
  });
  const result = await exportScoring({
    sourceDir: values.source,
    frozenDir: values.frozen,
    outputDir: values.output,
    seed: values.seed,
  });
  console.log(JSON.stringify(result, null, 2));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(
      error instanceof ScoringExporterError
        ? error.message
        : "Scoring export failed; source artifacts were not modified.",
    );
    process.exitCode = 1;
  });
