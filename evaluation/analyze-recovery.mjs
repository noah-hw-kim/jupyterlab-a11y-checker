#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  parseSemanticResponseText,
  checkSuggestionLength,
} from "@berkeley-dsep-infra/a11y-checker-core";
import {
  analyzeScoring,
  parseScoringPacket,
  computeStrategySlice,
} from "./analyze-scoring.mjs";

export class RecoveryAnalysisError extends Error {}
const fail = (message) => {
  throw new RecoveryAnalysisError(message);
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const key = (job) => JSON.stringify([job.caseId, job.strategy]);
const inside = (parent, child) =>
  child === parent || child.startsWith(parent + sep);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rule = "single-surplus-final-closing-brace-v1";
const jsonString = String.raw`"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"`;
const concern = String.raw`"concern"\s*:\s*(?:true|false)`;
const suggestion = `"suggestion"\\s*:\\s*(?:null|${jsonString})`;
const shape = new RegExp(
  `^\\{\\s*(?:${concern}\\s*,\\s*${suggestion}|${suggestion}\\s*,\\s*${concern})\\s*\\}$`,
);

// A deliberately narrow offline rule, not a change to the production parser.
export function recoverExtraClosingBrace(raw) {
  if (typeof raw !== "string") fail("Recovery content must be text.");
  let cleaned = raw.trim();
  if (cleaned.startsWith("```"))
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "");
  cleaned = cleaned.trim();
  const prefix = cleaned.slice(0, -1);
  if (!cleaned.endsWith("}") || !shape.test(prefix))
    fail("Response does not match the single-surplus-brace recovery rule.");
  let value;
  try {
    value = parseSemanticResponseText(prefix);
  } catch {
    fail("Recovered response does not satisfy the semantic contract.");
  }
  return { prefix, value };
}

async function canonical(path) {
  try {
    return await fs.realpath(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) fail("Cannot resolve output destination.");
    return join(await canonical(parent), relative(parent, path));
  }
}
function factCell(text) {
  return String(text)
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
function quality(slice) {
  const p = slice.primary;
  return {
    scoredDescriptions: p.validResponseNumerator,
    requiredFactCoverage: p.requiredFactCoverage,
    factsConveyed: p.totalFactsConveyed,
    factsRequired: p.totalFactsRequired,
    unsupportedOutputs: p.unsupportedOutputNumerator,
    nonemptyDescriptions: p.unsupportedOutputDenominator,
    unsupportedOutputRate: p.unsupportedOutputRate,
    unsupportedClaimCount: p.unsupportedClaimCount,
  };
}

export async function analyzeRecovery({
  primaryScoringDir,
  sourceDir,
  supplementaryDir,
  auditDir,
  frozenDir,
  outputDir = null,
}) {
  if (
    ![
      primaryScoringDir,
      sourceDir,
      supplementaryDir,
      auditDir,
      frozenDir,
    ].every((p) => typeof p === "string" && p)
  )
    fail(
      "Required paths: primary scoring, source, supplementary scoring, audit, and frozen benchmark.",
    );
  const roots = await Promise.all(
    [primaryScoringDir, sourceDir, supplementaryDir, auditDir, frozenDir].map(
      (p) => fs.realpath(resolve(p)),
    ),
  );
  const [primaryRoot, sourceRoot, supplementaryRoot, auditRoot, frozenRoot] =
    roots;
  const bound = new Map();
  async function read(root, rel) {
    const lexical = resolve(root, rel),
      actual = await fs.realpath(lexical);
    if (!inside(root, lexical) || !inside(root, actual))
      fail("Input escapes its evidence directory.");
    const bytes = await fs.readFile(actual),
      digest = hash(bytes);
    if (bound.has(actual) && bound.get(actual) !== digest)
      fail("Input changed during analysis.");
    bound.set(actual, digest);
    return bytes;
  }
  const json = (bytes) => {
    try {
      return JSON.parse(String(bytes));
    } catch {
      fail("Invalid evidence JSON.");
    }
  };
  const [
    snapshotBytes,
    attemptsBytes,
    primaryMapBytes,
    suppMapBytes,
    auditBytes,
    candidatesBytes,
    packetBytes,
    manifestBytes,
    freezeBytes,
    primaryPacketBytes,
  ] = await Promise.all([
    read(sourceRoot, "experiment.json"),
    read(sourceRoot, "attempts.jsonl"),
    read(primaryRoot, "private-mapping.json"),
    read(supplementaryRoot, "private-mapping.json"),
    read(auditRoot, "summary.json"),
    read(auditRoot, "private-recovered-candidates.json"),
    read(supplementaryRoot, "reviewer/scoring-packet.md"),
    read(frozenRoot, "references/manifest.json"),
    read(frozenRoot, "references/freeze.json"),
    read(primaryRoot, "reviewer/scoring-packet.md"),
  ]);
  if (String(await read(supplementaryRoot, "COMPLETE")) !== "complete\n")
    fail("Supplementary packet is incomplete.");
  const snapshot = json(snapshotBytes),
    primaryMap = json(primaryMapBytes),
    mapping = json(suppMapBytes);
  const audit = json(auditBytes),
    candidates = json(candidatesBytes),
    manifest = json(manifestBytes),
    freeze = json(freezeBytes);
  if (
    mapping.schemaVersion !== "supplementary-format-recovery-v1" ||
    mapping.primaryResultsReplaced !== false ||
    mapping.sourceExperimentId !== snapshot.experimentId ||
    mapping.sourceSnapshotSha256 !== hash(snapshotBytes) ||
    mapping.sourceAttemptsSha256 !== hash(attemptsBytes) ||
    mapping.primaryMappingSha256 !== hash(primaryMapBytes) ||
    mapping.sourceAuditSummarySha256 !== hash(auditBytes) ||
    mapping.sourceRecoveryCandidatesSha256 !== hash(candidatesBytes) ||
    mapping.freezeHash !== hash(freezeBytes) ||
    candidates.sourceExperimentId !== snapshot.experimentId ||
    candidates.sourceAttemptsSha256 !== hash(attemptsBytes) ||
    audit.sourceExperimentId !== snapshot.experimentId ||
    audit.sourceSnapshotSha256 !== hash(snapshotBytes) ||
    audit.sourceAttemptsSha256 !== hash(attemptsBytes) ||
    audit.modelRequests !== 0 ||
    audit.descriptionWordsEdited !== false
  )
    fail("Recovery evidence lineage or hashes do not match.");
  const { report: primary } = await analyzeScoring({
    scoringDir: primaryRoot,
    sourceDir: sourceRoot,
    frozenDir: frozenRoot,
  });
  if (primary.sourceFingerprint !== snapshot.fingerprint)
    fail("Primary source identity changed.");
  if (
    !Array.isArray(mapping.items) ||
    !Array.isArray(candidates.items) ||
    !mapping.items.length ||
    mapping.items.length !== candidates.items.length ||
    mapping.items.length !== audit.unambiguouslyRecoverable
  )
    fail("Recovery inventory is incomplete.");
  if (
    new Set(mapping.items.map((x) => x.scoringId)).size !==
      mapping.items.length ||
    new Set(mapping.items.map((x) => key(x.job))).size !==
      mapping.items.length ||
    new Set(candidates.items.map((x) => x.sourceAttemptId)).size !==
      candidates.items.length
  )
    fail("Duplicate recovery identity.");
  const scored = parseScoringPacket(String(packetBytes));
  if (
    !same(
      [...scored.keys()],
      mapping.items.map((x) => x.scoringId),
    )
  )
    fail("Supplementary scored IDs or order do not match the mapping.");
  const events = String(attemptsBytes)
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  const overlay = new Map(),
    recoveredItems = [];
  for (const item of mapping.items) {
    const originalMap = primaryMap.items.find(
      (x) => x.scoringId === item.scoringId,
    );
    const originalJob = primary.partA.jobs.find(
      (x) => key(x) === key(item.job),
    );
    const candidate = candidates.items.find(
      (x) => x.sourceAttemptId === item.sourceAttemptId,
    );
    const finish = events.find(
      (x) =>
        x.event === "attempt-finished" && x.attemptId === item.sourceAttemptId,
    );
    const response = events.find(
      (x) =>
        x.event === "response-received" && x.attemptId === item.sourceAttemptId,
    );
    if (
      !originalMap ||
      !originalJob ||
      !candidate ||
      !finish ||
      !response ||
      item.job.stage !== "generation" ||
      originalMap.sourceAttemptId !== item.sourceAttemptId ||
      originalMap.availability !== "unavailable" ||
      originalMap.caseId !== item.job.caseId ||
      originalMap.strategy !== item.job.strategy ||
      originalJob.isAvailable ||
      originalJob.terminalOutcome !== "model-output-error" ||
      item.primaryOutcome !== "model-output-error" ||
      finish.outcome !== "model-output-error" ||
      !same(finish.job, item.job) ||
      !same(candidate.job, item.job) ||
      item.recoveryRule !== rule ||
      candidate.recoveryRule !== rule ||
      candidate.descriptionWordsEdited !== false
    )
      fail("Recovery does not identify a unique original format failure.");
    const raw = response.response.rawContent;
    const recovered = recoverExtraClosingBrace(raw);
    if (
      hash(Buffer.from(raw)) !== item.rawContentSha256 ||
      item.rawContentSha256 !== candidate.rawContentSha256 ||
      raw !== candidate.rawContent ||
      recovered.prefix !== candidate.recoveredJsonPrefix ||
      !same(recovered.value, candidate.recoveredValue) ||
      recovered.value.concern !== true ||
      recovered.value.suggestion !== item.effectiveDescription ||
      !checkSuggestionLength(
        recovered.value.suggestion,
        snapshot.config.maxSuggestionWords,
      ).withinLimit
    )
      fail(
        "Recovered wording, response contract, or word limit differs from source evidence.",
      );
    const c = manifest.cases.find((x) => x.id === item.job.caseId),
      score = scored.get(item.scoringId);
    const expectedAsset = `assets/${item.scoringId}.png`;
    if (
      !c ||
      score.assetPath !== expectedAsset ||
      score.context !== c.evidence.context ||
      score.isEmptyDescriptionMarker ||
      score.description !== recovered.value.suggestion ||
      !same(
        score.facts.map((f) => f.fact),
        c.requiredFacts.map(factCell),
      ) ||
      hash(await read(supplementaryRoot, `reviewer/${expectedAsset}`)) !==
        freeze.files[c.imagePath]
    )
      fail(
        "Supplementary description, context, facts, or image differs from frozen evidence.",
      );
    overlay.set(key(item.job), {
      ...originalJob,
      isAvailable: true,
      availability: "format-recovered-description",
      effectiveSource: "format-recovered-description",
      effectiveDescription: recovered.value.suggestion,
      isNonEmptyDescription: true,
      modelConcern: recovered.value.concern,
      humanScore: score,
      effectiveFactCoverage: score.factCoverage,
    });
    recoveredItems.push({
      scoringId: item.scoringId,
      job: item.job,
      sourceAttemptId: item.sourceAttemptId,
      rawContentSha256: item.rawContentSha256,
      descriptionSha256: hash(Buffer.from(score.description)),
      factCoverage: score.factCoverage,
      factsConveyed: score.factsYes,
      factsRequired: score.factsTotal,
      unsupportedClaimCount: score.unsupportedClaimCount,
      originalOutcome: originalJob.terminalOutcome,
    });
  }
  const augmented = primary.partA.jobs.map(
    (job) => overlay.get(key(job)) ?? job,
  );
  const commonAfter = new Set(
    [...new Set(augmented.map((j) => j.caseId))].filter((id) =>
      snapshot.config.strategies.every((strategy) =>
        augmented.some(
          (j) => j.caseId === id && j.strategy === strategy && j.isAvailable,
        ),
      ),
    ),
  );
  const commonBefore = new Set(primary.partA.commonValidCaseIds),
    comparison = {};
  for (const strategy of snapshot.config.strategies) {
    const original = quality(primary.partA.byStrategy[strategy]);
    const jobs = augmented.filter((j) => j.strategy === strategy);
    const after = quality(computeStrategySlice(jobs, commonAfter));
    comparison[strategy] = {
      primary: original,
      withFormatRecovery: after,
      coverageDifference:
        after.requiredFactCoverage - original.requiredFactCoverage,
      primaryMatchedCaseCoverage:
        primary.partA.byStrategy[strategy].primary.commonCaseFactCoverage,
      matchedCasesAfterRecoveryCoverage: computeStrategySlice(jobs, commonAfter)
        .primary.commonCaseFactCoverage,
      originalMatchedCasesRecheckedCoverage: computeStrategySlice(
        jobs,
        commonBefore,
      ).primary.commonCaseFactCoverage,
    };
  }
  const report = {
    schemaVersion: "supplementary-format-recovery-analysis-v1",
    sourceExperimentId: snapshot.experimentId,
    sourceFingerprint: snapshot.fingerprint,
    sourceSnapshotSha256: hash(snapshotBytes),
    sourceAttemptsSha256: hash(attemptsBytes),
    primaryMappingSha256: hash(primaryMapBytes),
    primaryPacketSha256: hash(primaryPacketBytes),
    supplementaryMappingSha256: hash(suppMapBytes),
    supplementaryPacketSha256: hash(packetBytes),
    recoveryRule: rule,
    additionalModelRequests: 0,
    primaryResultsReplaced: false,
    primaryExecution: {
      jobs: primary.partA.jobs.length,
      validResponses: primary.partA.jobs.filter((j) => j.isAvailable).length,
      formatFailures: primary.partA.jobs.filter(
        (j) => j.terminalOutcome === "model-output-error",
      ).length,
      totalRequests: events.filter((x) => x.event === "attempt-started").length,
    },
    commonCasesBeforeRecovery: commonBefore.size,
    commonCasesAfterRecovery: commonAfter.size,
    recoveredItems,
    comparison,
    partBChanged: false,
  };
  const markdown = formatRecoveryMarkdown(report);
  async function verifyInputs() {
    for (const [path, digest] of bound)
      if (hash(await fs.readFile(path)) !== digest)
        fail("Input changed during analysis.");
  }
  await verifyInputs();
  if (outputDir) {
    const output = await canonical(resolve(outputDir));
    if (roots.some((p) => inside(p, output) || inside(output, p)))
      fail("Output overlaps protected evidence.");
    if (
      await fs.lstat(output).then(
        () => true,
        (e) => {
          if (e.code !== "ENOENT") throw e;
          return false;
        },
      )
    )
      fail("Output already exists; preserve previous reports.");
    await fs.mkdir(dirname(output), { recursive: true });
    const lockPath = output + ".analysis.lock",
      lock = await fs.open(lockPath, "wx", 0o600);
    let staged;
    try {
      staged = await fs.mkdtemp(output + ".tmp-");
      await fs.writeFile(
        join(staged, "summary.json"),
        JSON.stringify(report, null, 2) + "\n",
      );
      await fs.writeFile(join(staged, "summary.md"), markdown);
      await verifyInputs();
      if (
        await fs.lstat(output).then(
          () => true,
          (e) => {
            if (e.code !== "ENOENT") throw e;
            return false;
          },
        )
      )
        fail("Output appeared during analysis.");
      await fs.writeFile(join(staged, "COMPLETE"), "complete\n");
      await fs.rename(staged, output);
      staged = null;
    } finally {
      if (staged) await fs.rm(staged, { recursive: true, force: true });
      await lock.close();
      await fs.unlink(lockPath);
    }
  }
  return { report, markdown };
}

const pct = (n) => (n === null ? "N/A" : `${(100 * n).toFixed(1)}%`);
export function formatRecoveryMarkdown(report) {
  let out = `# Supplementary format-recovery analysis (${report.sourceExperimentId})\n\n`;
  out += `Original execution remains **${report.primaryExecution.validResponses}/${report.primaryExecution.jobs} valid responses**, **${report.primaryExecution.formatFailures} format failures**, and **${report.primaryExecution.totalRequests} requests**. No primary outcome is replaced.\n\n`;
  out += `The ${report.recoveredItems.length} descriptions were recovered only by removing one surplus closing brace, with no rewritten words or new model requests. This is a separate quality-only comparison. Different denominators can change means; this is not evidence of a new or improved generation.\n\n`;
  out +=
    "| Strategy | Primary scored descriptions | Primary mean fact coverage | With recovery: scored descriptions | With recovery: mean fact coverage | Unsupported outputs: primary / recovery view |\n| --- | --- | --- | --- | --- | --- |\n";
  for (const [strategy, value] of Object.entries(report.comparison)) {
    const a = value.primary,
      b = value.withFormatRecovery;
    out += `| ${strategy} | ${a.scoredDescriptions} | ${pct(a.requiredFactCoverage)} (${a.factsConveyed}/${a.factsRequired} facts) | ${b.scoredDescriptions} | ${pct(b.requiredFactCoverage)} (${b.factsConveyed}/${b.factsRequired} facts) | ${a.unsupportedOutputs}/${a.nonemptyDescriptions} / ${b.unsupportedOutputs}/${b.nonemptyDescriptions} |\n`;
  }
  out += `\nFact coverage is averaged per scored description; fact totals are also shown and may yield a different micro-average. Cases with scored descriptions for every strategy: ${report.commonCasesBeforeRecovery} primary, ${report.commonCasesAfterRecovery} with recovery.\n\n`;
  out +=
    "| Strategy | Primary common-case coverage | Same original common cases rechecked | All common cases after recovery |\n| --- | --- | --- | --- |\n";
  for (const [strategy, x] of Object.entries(report.comparison))
    out += `| ${strategy} | ${pct(x.primaryMatchedCaseCoverage)} | ${pct(x.originalMatchedCasesRecheckedCoverage)} | ${pct(x.matchedCasesAfterRecoveryCoverage)} |\n`;
  out +=
    "\nPart B validation decisions, eligibility, costs, and primary reliability metrics are unchanged. A recovered source does not retroactively become eligible in the primary validation experiment.\n";
  return out;
}

async function main() {
  const { values } = parseArgs({
    strict: true,
    options: Object.fromEntries(
      [
        "primary-scoring",
        "source",
        "supplementary-scoring",
        "audit",
        "frozen",
        "output",
      ].map((k) => [k, { type: "string" }]),
    ),
  });
  const { report } = await analyzeRecovery({
    primaryScoringDir: values["primary-scoring"],
    sourceDir: values.source,
    supplementaryDir: values["supplementary-scoring"],
    auditDir: values.audit,
    frozenDir: values.frozen,
    outputDir: values.output,
  });
  console.log(
    JSON.stringify(
      {
        sourceExperimentId: report.sourceExperimentId,
        recoveredItems: report.recoveredItems.length,
        primaryValidResponses: report.primaryExecution.validResponses,
        primaryResultsReplaced: false,
        additionalModelRequests: 0,
      },
      null,
      2,
    ),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(
      error instanceof RecoveryAnalysisError
        ? error.message
        : "Supplementary analysis failed; original evidence was not modified.",
    );
    process.exitCode = 1;
  });
