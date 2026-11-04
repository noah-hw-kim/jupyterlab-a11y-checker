#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseEvaluationConfig,
  planEvaluationResume,
} from "@berkeley-dsep-infra/a11y-checker-core";

export class ScoringAnalyzerError extends Error {}

const fail = (message) => {
  throw new ScoringAnalyzerError(message);
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jobKey = (job) => JSON.stringify([job.caseId, job.strategy, job.stage]);

const inside = (parent, child) => {
  const p = resolve(parent);
  const c = resolve(child);
  return c === p || c.startsWith(p + sep);
};

const STRATEGIES = [
  "minimal",
  "fixed-window",
  "structure-aware",
  "largest-practical",
];

const EXPECTED_DEFECT_LABELS = [
  "Visual claim conflicts with the image",
  "Description contradicts approved notebook context",
  "Important image content is missing",
  "Wording is unnecessarily repetitive or irrelevant",
];

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

function extractFencedBlock(sectionText, headingLabel, scoringId) {
  const escaped = headingLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerMatch = new RegExp(`\\*\\*${escaped}\\*\\*\\r?\\n\\r?\\n`).exec(
    sectionText,
  );
  if (!headerMatch) {
    fail(`${scoringId} is missing the "${headingLabel}" block.`);
  }
  const rest = sectionText.slice(headerMatch.index + headerMatch[0].length);
  if (
    headingLabel === "Description to score" &&
    /^\*\(Empty description\)\*\r?\n/.test(rest)
  ) {
    return { text: "", isEmptyMarker: true };
  }
  const openMatch = /^(`{3,})text\r?\n/.exec(rest);
  if (!openMatch) {
    fail(`${scoringId} "${headingLabel}" must be a fenced text block.`);
  }
  const fence = openMatch[1];
  const contentStart = openMatch[0].length;
  const closeRegex = new RegExp(`\\r?\\n${fence}(?:\\r?\\n|$)`);
  const closeMatch = closeRegex.exec(rest.slice(contentStart));
  if (!closeMatch) {
    fail(`${scoringId} "${headingLabel}" fenced block is not closed.`);
  }
  return {
    text: rest.slice(contentStart, contentStart + closeMatch.index),
    isEmptyMarker: false,
  };
}

// ============================================================================
// Step 1: Parse the finalized human scoring packet (scoring-packet.md)
// ============================================================================
export function parseScoringPacket(markdownText) {
  if (typeof markdownText !== "string" || !markdownText.trim()) {
    fail("Scoring packet markdown is empty.");
  }

  const rawBlocks = markdownText.split(/^## Review Item:[ \t]*/m).slice(1);
  if (rawBlocks.length === 0) {
    fail("No Review Item sections found in scoring-packet.md.");
  }

  const itemsByScoringId = new Map();
  const orderedScoringIds = [];

  for (const block of rawBlocks) {
    const firstLineEnd = block.indexOf("\n");
    const scoringId = (
      firstLineEnd === -1 ? block : block.slice(0, firstLineEnd)
    ).trim();
    if (!/^ITEM-\d+$/.test(scoringId)) {
      fail(`Invalid scoring item heading: ${scoringId}`);
    }
    if (itemsByScoringId.has(scoringId)) {
      fail(`Duplicate scoring item heading: ${scoringId}`);
    }
    orderedScoringIds.push(scoringId);

    const assetMatch = /^!\[Chart\]\(([^)\r\n]+)\)\r?$/m.exec(block);
    if (!assetMatch) {
      fail(`${scoringId} is missing its ![Chart](...) image reference.`);
    }
    const assetPath = assetMatch[1].trim();

    const contextBlock = extractFencedBlock(
      block,
      "Approved context",
      scoringId,
    );
    const descriptionBlock = extractFencedBlock(
      block,
      "Description to score",
      scoringId,
    );

    const unsupSplit = block.split("### Unsupported factual assertions");
    if (unsupSplit.length !== 2) {
      fail(
        `${scoringId} is missing the Unsupported factual assertions section.`,
      );
    }
    const defectsSplit = unsupSplit[1].split(
      "### Other defects for validation analysis",
    );
    if (defectsSplit.length !== 2) {
      fail(
        `${scoringId} is missing the Other defects for validation analysis section.`,
      );
    }
    const finalSplit = defectsSplit[1].split("### Finalization");
    if (finalSplit.length !== 2) {
      fail(`${scoringId} is missing the Finalization section.`);
    }

    const factTableText = unsupSplit[0];
    const unsupTableText = defectsSplit[0];
    const defectTableText = finalSplit[0];
    const finalizationText = finalSplit[1];

    // 1a. Parse required-fact rows and require non-empty evidence/explanation
    const factRows = parseMarkdownTableRows(factTableText, 3, scoringId, "Fact");
    if (factRows.length === 0) {
      fail(`${scoringId} has no required-fact rows.`);
    }
    const facts = factRows.map(([factText, markRaw, evidence]) => {
      const mark = normalizeYesNo(markRaw, `${scoringId} fact "${factText}"`);
      if (descriptionBlock.isEmptyMarker && mark === "Yes") {
        fail(`${scoringId} has an empty description and cannot convey facts.`);
      }
      if (!evidence && !descriptionBlock.isEmptyMarker) {
        fail(
          `${scoringId} fact "${factText}" is missing supporting words or explanation.`,
        );
      }
      return { fact: factText, conveyed: mark === "Yes", mark, evidence };
    });

    // 1b. Parse unsupported factual assertions
    const unsupRows = parseMarkdownTableRows(
      unsupTableText,
      2,
      scoringId,
      "Unsupported assertions",
    );
    const unsupportedClaims = [];
    for (const [quote, evidence] of unsupRows) {
      if (!quote && !evidence) {
        fail(
          `${scoringId} has a blank unsupported-assertions table; write None when there are no unsupported claims.`,
        );
      }
      if (/^unsure$/i.test(quote) || /^unsure$/i.test(evidence)) {
        fail(`${scoringId} has an unresolved Unsure in unsupported assertions.`);
      }
      if (quote.toLowerCase() === "none") {
        if (unsupRows.length > 1) {
          fail(
            `${scoringId} cannot mix None with quoted unsupported assertions.`,
          );
        }
        continue;
      }
      if (!quote || !evidence) {
        fail(
          `${scoringId} unsupported assertion "${quote || evidence}" requires both a quoted assertion and evidence.`,
        );
      }
      unsupportedClaims.push({ quote, evidence });
    }

    // 1c. Parse the 4 defect rows
    const defectRows = parseMarkdownTableRows(
      defectTableText,
      3,
      scoringId,
      "Other defects",
    );
    if (defectRows.length !== EXPECTED_DEFECT_LABELS.length) {
      fail(
        `${scoringId} must have exactly ${EXPECTED_DEFECT_LABELS.length} defect rows.`,
      );
    }
    const defects = {};
    for (let i = 0; i < EXPECTED_DEFECT_LABELS.length; i++) {
      const [label, markRaw, evidence] = defectRows[i];
      if (label !== EXPECTED_DEFECT_LABELS[i]) {
        fail(
          `${scoringId} defect row ${i + 1} label mismatch: expected "${EXPECTED_DEFECT_LABELS[i]}", got "${label}".`,
        );
      }
      const mark = normalizeYesNo(markRaw, `${scoringId} defect "${label}"`);
      if (mark === "Yes" && !evidence) {
        fail(`${scoringId} defect "${label}" is marked Yes without evidence.`);
      }
      defects[label] = { present: mark === "Yes", mark, evidence };
    }

    // 1d. Verify finalization fields strictly on their own single lines ([ \t]*, never matching \n)
    const uncertaintiesMatch =
      /^- Uncertainties and resolution:[ \t]*([^\r\n]*)$/m.exec(
        finalizationText,
      );
    const reviewerMatch =
      /^- Reviewer identifier:[ \t]*([^\r\n]*)$/m.exec(finalizationText);
    const dateMatch = /^- Finalized date:[ \t]*([^\r\n]*)$/m.exec(
      finalizationText,
    );
    const resolvedMatch =
      /^- All Unsure entries resolved before unblinding:[ \t]*([^\r\n]*)$/m.exec(
        finalizationText,
      );

    const uncertaintiesNote = uncertaintiesMatch?.[1]?.trim() ?? "";
    const reviewer = reviewerMatch?.[1]?.trim() ?? "";
    const finalizedDate = dateMatch?.[1]?.trim() ?? "";
    const resolvedFlag = resolvedMatch?.[1]?.trim() ?? "";

    if (!uncertaintiesNote) {
      fail(
        `${scoringId} is missing an Uncertainties and resolution entry (write None if there were none).`,
      );
    }
    if (!reviewer) {
      fail(`${scoringId} is missing a Reviewer identifier in Finalization.`);
    }
    if (!finalizedDate) {
      fail(`${scoringId} is missing a Finalized date in Finalization.`);
    }
    if (resolvedFlag.toLowerCase() !== "yes") {
      fail(
        `${scoringId} must have "All Unsure entries resolved before unblinding: Yes" in Finalization.`,
      );
    }

    const factsYes = facts.filter((f) => f.conveyed).length;
    const factsTotal = facts.length;

    itemsByScoringId.set(scoringId, {
      scoringId,
      assetPath,
      context: contextBlock.text,
      description: descriptionBlock.text,
      isEmptyDescriptionMarker: descriptionBlock.isEmptyMarker,
      facts,
      factsYes,
      factsTotal,
      factCoverage: factsYes / factsTotal,
      unsupportedClaims,
      unsupportedClaimCount: unsupportedClaims.length,
      hasUnsupportedClaim: unsupportedClaims.length > 0,
      defects: {
        visualConflict: defects[EXPECTED_DEFECT_LABELS[0]].present,
        contextContradiction: defects[EXPECTED_DEFECT_LABELS[1]].present,
        importantContentMissing: defects[EXPECTED_DEFECT_LABELS[2]].present,
        repetitiveOrIrrelevant: defects[EXPECTED_DEFECT_LABELS[3]].present,
        raw: defects,
      },
      uncertaintiesNote,
      reviewer,
      finalizedDate,
    });
  }

  Object.defineProperty(itemsByScoringId, "orderedScoringIds", {
    value: orderedScoringIds,
    enumerable: false,
  });

  return itemsByScoringId;
}

function parseMarkdownTableRows(sectionText, expectedCols, scoringId, label) {
  const separatorIndex = sectionText.indexOf("| ---");
  if (separatorIndex === -1) {
    fail(`${scoringId} is missing the markdown table separator in ${label}.`);
  }
  const lineEnd = sectionText.indexOf("\n", separatorIndex);
  const afterSeparator =
    lineEnd === -1 ? "" : sectionText.slice(lineEnd + 1);
  const rows = [];
  for (const rawLine of afterSeparator.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== expectedCols) {
      fail(
        `${scoringId} ${label} table row has ${cells.length} columns (expected ${expectedCols}): ${line}`,
      );
    }
    rows.push(cells);
  }
  return rows;
}

function normalizeYesNo(raw, context) {
  const value = String(raw ?? "").trim();
  if (!value) {
    fail(`${context} is blank; every mark must be Yes or No before analysis.`);
  }
  if (/^unsure$/i.test(value)) {
    fail(`${context} is still marked Unsure; resolve all Unsure marks before unblinding.`);
    fail(
      `${context} is still marked Unsure; resolve all Unsure marks before unblinding.`,
    );
  }
  if (/^yes$/i.test(value)) return "Yes";
  if (/^no$/i.test(value)) return "No";
  fail(`${context} has invalid mark "${value}" (expected Yes or No).`);
}

// ============================================================================
// Step 2: Load & verify experiment artifacts, benchmark manifest, and mapping
// ============================================================================
async function checkedPath(parent, relPath) {
  const lexical = resolve(parent, relPath);
  const real = await fs.realpath(lexical);
  if (!inside(parent, lexical) || !inside(parent, real)) {
    fail(`Input path escapes its root directory: ${relPath}`);
  }
  return real;
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

async function loadAndVerifyInputs({
  scoringDir,
  sourceDir,
  validationDir,
  frozenDir,
}) {
  const scoringRoot = await fs.realpath(scoringDir);
  const sourceRoot = await fs.realpath(sourceDir);
  const frozenRoot = await fs.realpath(frozenDir);
  const validationRoot = validationDir
    ? await fs.realpath(validationDir)
    : null;

  for (const dir of [
    scoringRoot,
    sourceRoot,
    ...(validationRoot ? [validationRoot] : []),
  ]) {
    const lockFile =
      dir === scoringRoot ? `${scoringRoot}.export.lock` : join(dir, ".runner.lock");
    if (
      await fs.stat(lockFile).then(
        () => true,
        (e) => {
          if (e.code === "ENOENT") return false;
          throw e;
        },
      )
    ) {
      fail(`Directory is locked by an active operation: ${dir}`);
    }
  }

  const completeMarker = await checkedPath(scoringRoot, "COMPLETE");
  if ((await fs.readFile(completeMarker, "utf8")) !== "complete\n") {
    fail("Scoring packet COMPLETE marker is invalid.");
  }

  const packetPath = await checkedPath(
    scoringRoot,
    "reviewer/scoring-packet.md",
  );
  const mappingPath = await checkedPath(scoringRoot, "private-mapping.json");

  const [
    packetText,
    mappingBytes,
    manifestBytes,
    freezeBytes,
    expBytes,
    attemptsBytes,
  ] = await Promise.all([
    fs.readFile(packetPath, "utf8"),
    fs.readFile(mappingPath),
    fs.readFile(await checkedPath(frozenRoot, "references/manifest.json")),
    fs.readFile(await checkedPath(frozenRoot, "references/freeze.json")),
    fs.readFile(await checkedPath(sourceRoot, "experiment.json")),
    fs.readFile(await checkedPath(sourceRoot, "attempts.jsonl")),
  ]);

  let mapping, manifest, freeze, sourceExperiment;
  try {
    mapping = JSON.parse(mappingBytes.toString("utf8"));
    manifest = JSON.parse(manifestBytes.toString("utf8"));
    freeze = JSON.parse(freezeBytes.toString("utf8"));
    sourceExperiment = JSON.parse(expBytes.toString("utf8"));
  } catch {
    fail("Malformed JSON in scoring, source, or benchmark files.");
  }

  // Verify source snapshot fingerprint and prompt artifacts
  if (
    sourceExperiment.schemaVersion !== 1 ||
    sourceExperiment.sourceGeneration ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sourceExperiment.experimentId ?? "")
  ) {
    fail("Invalid generation experiment.json snapshot.");
  }
  const config = parseEvaluationConfig(sourceExperiment.config);
  const identity = {
    config: sourceExperiment.config,
    resolvedEndpoint: sourceExperiment.resolvedEndpoint,
    codeCommit: sourceExperiment.codeCommit,
    codeSnapshotSha256: sourceExperiment.codeSnapshotSha256,
    benchmarkFreezeSha256: sourceExperiment.benchmarkFreezeSha256,
    prompts: sourceExperiment.prompts,
    generationJobs: sourceExperiment.generationJobs,
  };
  if (sha256(JSON.stringify(identity)) !== sourceExperiment.fingerprint) {
    fail("Source experiment.json fingerprint is inconsistent.");
  }
  for (const stage of ["generation", "validation"]) {
    const prompt = sourceExperiment.prompts?.[stage];
    if (
      prompt?.path !== `prompts/${stage}.json` ||
      sha256(await fs.readFile(await checkedPath(sourceRoot, prompt.path))) !==
        prompt.sha256
    ) {
      fail(`Source ${stage} prompt is missing or changed.`);
    }
  }

  // Verify frozen benchmark inventory and all file hashes
  if (
    freeze.status !== "frozen" ||
    manifest.annotationStatus !== "reviewed" ||
    !Array.isArray(manifest.cases) ||
    manifest.cases.length !== 24 ||
    new Set(manifest.cases.map((c) => c.id)).size !== 24 ||
    !manifest.cases.every((c) => c.annotationStatus === "reviewed")
  ) {
    fail("Benchmark is not fully reviewed and frozen.");
  }
  const expectedFrozenFiles = [
    "references/manifest.json",
    ...manifest.cases.flatMap((c) => [c.notebookPath, c.imagePath]),
  ].sort();
  if (
    JSON.stringify(Object.keys(freeze.files ?? {}).sort()) !==
    JSON.stringify(expectedFrozenFiles)
  ) {
    fail("Frozen benchmark inventory is incomplete.");
  }
  for (const [rel, expectedHash] of Object.entries(freeze.files)) {
    const actualHash = sha256(
      await fs.readFile(await checkedPath(frozenRoot, rel)),
    );
    if (actualHash !== expectedHash) {
      fail(`Frozen file hash mismatch for ${rel}.`);
    }
  }

  // Verify private-mapping.json metadata against source and frozen benchmark
  const expSha = sha256(expBytes);
  const attemptsSha = sha256(attemptsBytes);
  const freezeSha = sha256(freezeBytes);
  if (
    mapping.schemaVersion !== 1 ||
    mapping.sourceExperimentId !== sourceExperiment.experimentId ||
    mapping.sourceFingerprint !== sourceExperiment.fingerprint ||
    mapping.sourceSnapshotSha256 !== expSha ||
    mapping.sourceAttemptsSha256 !== attemptsSha ||
    mapping.freezeHash !== freezeSha ||
    sourceExperiment.benchmarkFreezeSha256 !== freezeSha ||
    JSON.stringify(mapping.frozenHashes) !== JSON.stringify(freeze.files)
  ) {
    fail(
      "private-mapping.json hashes or metadata do not match source and frozen benchmark.",
    );
  }

  // Parse and validate generation JSONL events via shared core resume planner
  const attemptsText = attemptsBytes.toString("utf8");
  if (!attemptsText || !attemptsText.endsWith("\n")) {
    fail("Source attempts.jsonl has an incomplete final line.");
  }
  const generationEvents = attemptsText
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));

  let resumePlan;
  try {
    resumePlan = planEvaluationResume(
      {
        experimentId: sourceExperiment.experimentId,
        fingerprint: sourceExperiment.fingerprint,
        config,
        jobs: sourceExperiment.generationJobs,
      },
      config,
      generationEvents,
      Date.now(),
    );
  } catch (cause) {
    throw new ScoringAnalyzerError("Source event log validation failed.", {
      cause,
    });
  }

  // Reconstruct expected schedule and expected mapping/packet content from source
  const splitCases = new Map(
    manifest.cases
      .filter((c) => c.split === config.split)
      .map((c) => [c.id, c]),
  );
  if (
    JSON.stringify([...config.strategies].sort()) !==
    JSON.stringify([...STRATEGIES].sort())
  ) {
    fail("Scoring analysis requires all four context strategies.");
  }
  const expectedScheduleKeys = new Set(
    [...splitCases.keys()].flatMap((id) =>
      STRATEGIES.map((strategy) =>
        jobKey({ caseId: id, strategy, stage: "generation" }),
      ),
    ),
  );
  if (
    !Array.isArray(sourceExperiment.generationJobs) ||
    sourceExperiment.generationJobs.length !== expectedScheduleKeys.size ||
    sourceExperiment.generationJobs.some(
      (job) => !expectedScheduleKeys.delete(jobKey(job)),
    ) ||
    expectedScheduleKeys.size > 0
  ) {
    fail("Source generation schedule is incomplete.");
  }

  const eventsByJob = new Map();
  for (const record of generationEvents) {
    const list = eventsByJob.get(jobKey(record.job)) ?? [];
    list.push(record);
    eventsByJob.set(jobKey(record.job), list);
  }

  const reconstructedItems = sourceExperiment.generationJobs.map((job) => {
    const caseEntry = splitCases.get(job.caseId);
    const planEntry = resumePlan.jobs.find(
      (candidate) => jobKey(candidate.job) === jobKey(job),
    );
    const status = planEntry?.status;
    if (
      ![
        "succeeded",
        "model-output-error",
        "exhausted-error",
        "blocked-error",
      ].includes(status)
    ) {
      fail(`Source job is not in a terminal state: ${jobKey(job)} (${status})`);
    }
    const jobEvents = eventsByJob.get(jobKey(job)) ?? [];
    const finish = jobEvents
      .filter((r) => r.event === "attempt-finished")
      .at(-1);
    const start = jobEvents
      .filter((r) => r.event === "attempt-started")
      .at(-1);
    if (!finish || !start) fail(`Source job lacks terminal events: ${jobKey(job)}`);

    const sourceAlt = start.input.existingAltText || null;
    const expectedTask =
      caseEntry.expectedAltState === "present" ? "evaluate" : "generate";
    if (
      start.input.task !== expectedTask ||
      start.input.imagePath !== caseEntry.imagePath ||
      start.input.imageMimeType !== "image/png" ||
      start.input.imageSha256 !== freeze.files[caseEntry.imagePath] ||
      start.input.existingAltText !==
        (expectedTask === "evaluate" ? caseEntry.existingAltText : null)
    ) {
      fail(`Source image/alt identity mismatch on ${jobKey(job)}.`);
    }

    const parsed = finish.parsed?.value;
    let description = "";
    let effectiveSource = "missed-improvement-empty";
    let availability = "available";
    if (status === "succeeded" && parsed.concern === true) {
      description = parsed.suggestion ?? "";
      effectiveSource = "proposed-replacement";
    } else if (
      status === "succeeded" &&
      caseEntry.expectedAltState === "present"
    ) {
      description = sourceAlt ?? "";
      effectiveSource = "retained-existing-alt";
    } else if (status !== "succeeded") {
      availability = "unavailable";
      effectiveSource = "unavailable";
    }

    return {
      caseId: caseEntry.id,
      strategy: job.strategy,
      attemptId: finish.attemptId,
      modelConcern: parsed?.concern ?? null,
      description,
      effectiveSource,
      availability,
      shouldImprove: caseEntry.shouldImprove,
      context: caseEntry.evidence.context,
      requiredFacts: caseEntry.requiredFacts,
      imagePath: caseEntry.imagePath,
    };
  });

  const numericSeed = seedValue(mapping.seed);
  const shuffledExpected = shuffle(reconstructedItems, numericSeed);

  if (
    !Array.isArray(mapping.items) ||
    mapping.items.length !== shuffledExpected.length
  ) {
    fail("private-mapping.json item count does not match source schedule.");
  }

  const expectedPacketItems = [];
  for (let i = 0; i < shuffledExpected.length; i++) {
    const exp = shuffledExpected[i];
    const actualMap = mapping.items[i];
    const scoringId = `ITEM-${String(i + 1).padStart(2, "0")}`;
    const expectedMapEntry = {
      scoringId,
      caseId: exp.caseId,
      strategy: exp.strategy,
      sourceAttemptId: exp.attemptId,
      modelConcern: exp.modelConcern,
      effectiveDescription: exp.description,
      effectiveSource: exp.effectiveSource,
      availability: exp.availability,
      shouldImprove: exp.shouldImprove,
    };
    if (JSON.stringify(actualMap) !== JSON.stringify(expectedMapEntry)) {
      fail(
        `private-mapping.json entry for ${scoringId} does not match reconstructed source item.`,
      );
    }
    if (exp.availability === "available") {
      expectedPacketItems.push({
        scoringId,
        assetPath: `assets/${scoringId}.png`,
        context: exp.context,
        description: exp.description,
        requiredFacts: exp.requiredFacts,
        imagePath: exp.imagePath,
      });
    }
  }

  // Parse scoring-packet.md and bind every reviewed item's content to the expected packet
  const scoredItemsById = parseScoringPacket(packetText);
  const orderedScoringIds = scoredItemsById.orderedScoringIds ?? [
    ...scoredItemsById.keys(),
  ];

  if (
    JSON.stringify(orderedScoringIds) !==
    JSON.stringify(expectedPacketItems.map((p) => p.scoringId))
  ) {
    fail(
      "Scored item IDs or order in scoring-packet.md do not match private-mapping.json.",
    );
  }

  for (const expPacket of expectedPacketItems) {
    const scored = scoredItemsById.get(expPacket.scoringId);
    if (scored.assetPath !== expPacket.assetPath) {
      fail(
        `${expPacket.scoringId} asset path in scoring-packet.md was altered.`,
      );
    }
    if (scored.context !== expPacket.context) {
      fail(
        `${expPacket.scoringId} Approved context in scoring-packet.md does not match frozen benchmark evidence.`,
      );
    }
    if (expPacket.description === "") {
      if (!scored.isEmptyDescriptionMarker || scored.description !== "") {
        fail(
          `${expPacket.scoringId} empty description marker in scoring-packet.md was altered.`,
        );
      }
    } else if (
      scored.isEmptyDescriptionMarker ||
      scored.description !== expPacket.description
    ) {
      fail(
        `${expPacket.scoringId} Description to score in scoring-packet.md does not match the source description.`,
      );
    }

    const expectedFactCells = expPacket.requiredFacts.map((f) => tableCell(f));
    const actualFactCells = scored.facts.map((f) => f.fact);
    if (
      JSON.stringify(actualFactCells) !== JSON.stringify(expectedFactCells)
    ) {
      fail(
        `${expPacket.scoringId} required facts in scoring-packet.md do not match the frozen manifest.`,
      );
    }

    // Verify copied opaque image asset matches the frozen image hash
    const assetBytes = await fs.readFile(
      await checkedPath(scoringRoot, join("reviewer", expPacket.assetPath)),
    );
    if (sha256(assetBytes) !== freeze.files[expPacket.imagePath]) {
      fail(
        `${expPacket.scoringId} reviewer image asset bytes do not match frozen benchmark image.`,
      );
    }
  }


  // Load and verify optional Part B validation directory
  let validationEvents = null;
  let validationExperiment = null;
  let validationResumePlan = null;
  if (validationRoot) {
    const [valExpBytes, valAttemptsBytes] = await Promise.all([
      fs.readFile(await checkedPath(validationRoot, "experiment.json")),
      fs.readFile(await checkedPath(validationRoot, "attempts.jsonl")),
    ]);
    try {
      validationExperiment = JSON.parse(valExpBytes.toString("utf8"));
    } catch {
      fail("Validation experiment.json is malformed.");
    }
    if (
      !validationExperiment.sourceGeneration ||
      validationExperiment.sourceGeneration?.experimentId !==
        sourceExperiment.experimentId ||
      validationExperiment.sourceGeneration?.fingerprint !==
        sourceExperiment.fingerprint ||
      validationExperiment.sourceGeneration?.snapshotSha256 !== expSha ||
      validationExperiment.sourceGeneration?.attemptsSha256 !== attemptsSha
    ) {
      fail(
        "Validation run source lineage does not match the generation source directory.",
      );
    }
    const valConfig = parseEvaluationConfig(validationExperiment.config);
    const valIdentity = {
      config: validationExperiment.config,
      resolvedEndpoint: validationExperiment.resolvedEndpoint,
      codeCommit: validationExperiment.codeCommit,
      codeSnapshotSha256: validationExperiment.codeSnapshotSha256,
      benchmarkFreezeSha256: validationExperiment.benchmarkFreezeSha256,
      prompts: validationExperiment.prompts,
      generationJobs: validationExperiment.generationJobs,
      sourceGeneration: validationExperiment.sourceGeneration,
      exclusions: validationExperiment.exclusions,
    };
    if (
      sha256(JSON.stringify(valIdentity)) !== validationExperiment.fingerprint
    ) {
      fail("Validation experiment.json fingerprint is inconsistent.");
    }
    const valText = valAttemptsBytes.toString("utf8");
    if (valText && !valText.endsWith("\n")) {
      fail("Validation attempts.jsonl has an incomplete final line.");
    }
    validationEvents = valText
      ? valText
          .trimEnd()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    try {
      validationResumePlan = planEvaluationResume(
        {
          experimentId: validationExperiment.experimentId,
          fingerprint: validationExperiment.fingerprint,
          config: valConfig,
          jobs: validationExperiment.generationJobs,
        },
        valConfig,
        validationEvents,
        Date.now(),
      );
    } catch (cause) {
      throw new ScoringAnalyzerError("Validation event log validation failed.", {
        cause,
      });
    }
    for (const entry of validationResumePlan.jobs) {
      if (
        ![
          "succeeded",
          "model-output-error",
          "exhausted-error",
          "blocked-error",
        ].includes(entry.status)
      ) {
        fail(
          `Validation job is not in a terminal state: ${jobKey(entry.job)} (${entry.status})`,
        );
      }
    }
  }

  return {
    mapping,
    manifest,
    freeze,
    sourceExperiment,
    scoredItemsById,
    generationEvents,
    validationExperiment,
    validationEvents,
  };
}

// ============================================================================
// Step 3: Compute Part A Primary & Secondary Metrics
// ============================================================================
function summarizeAttemptHistory(events, stage = "generation") {
  const byJobKey = new Map();
  for (const ev of events) {
    if (ev.job?.stage !== stage) continue;
    const k = `${ev.job.caseId}::${ev.job.strategy}`;
    if (!byJobKey.has(k)) {
      byJobKey.set(k, {
        caseId: ev.job.caseId,
        strategy: ev.job.strategy,
        started: [],
        responses: [],
        finished: [],
      });
    }
    const group = byJobKey.get(k);
    if (ev.event === "attempt-started") group.started.push(ev);
    else if (ev.event === "response-received") group.responses.push(ev);
    else if (ev.event === "attempt-finished") group.finished.push(ev);
  }
  return byJobKey;
}

function computePartAMetrics({
  mapping,
  manifest,
  scoredItemsById,
  generationEvents,
}) {
  const casesById = new Map(manifest.cases.map((c) => [c.id, c]));
  const historyByJob = summarizeAttemptHistory(generationEvents, "generation");

  // Join mapping items with case metadata, attempt history, and human scores
  const joinedJobs = mapping.items.map((mapItem) => {
    const caseMeta = casesById.get(mapItem.caseId);
    if (!caseMeta) fail(`Unknown caseId ${mapItem.caseId} in private-mapping.json.`);
    const jobHistory = historyByJob.get(
      `${mapItem.caseId}::${mapItem.strategy}`,
    );
    if (!jobHistory) {
      fail(`Missing generation history for ${mapItem.caseId} (${mapItem.strategy}).`);
    }

    const terminalFinish = jobHistory.finished.at(-1);
    const terminalStart = jobHistory.started.find(
      (s) => s.attemptId === terminalFinish?.attemptId,
    );
    const terminalResponse = jobHistory.responses.find(
      (r) => r.attemptId === terminalFinish?.attemptId,
    );

    const totalLatencyMs = jobHistory.finished.reduce(
      (sum, f) => sum + (typeof f.latencyMs === "number" ? f.latencyMs : 0),
      0,
    );
    const parseFailureCount = jobHistory.finished.filter(
      (f) => f.outcome === "model-output-error",
    ).length;

    const isAvailable = mapItem.availability === "available";
    const humanScore = isAvailable
      ? scoredItemsById.get(mapItem.scoringId)
      : null;
    const isNonEmptyDescription =
      isAvailable &&
      typeof mapItem.effectiveDescription === "string" &&
      mapItem.effectiveDescription.trim().length > 0;

    // Protocol rule: valid no-improvement response with missing/empty alt has 0 fact coverage
    const effectiveFactCoverage = isAvailable
      ? mapItem.effectiveSource === "missed-improvement-empty"
        ? 0
        : humanScore.factCoverage
      : null;

    return {
      scoringId: mapItem.scoringId,
      caseId: mapItem.caseId,
      strategy: mapItem.strategy,
      category: caseMeta.category,
      contextSensitive: Boolean(caseMeta.contextSensitive),
      shouldImprove: Boolean(caseMeta.shouldImprove),
      availability: mapItem.availability,
      isAvailable,
      effectiveSource: mapItem.effectiveSource,
      effectiveDescription: mapItem.effectiveDescription,
      isNonEmptyDescription,
      modelConcern: mapItem.modelConcern,
      humanScore,
      effectiveFactCoverage,
      attemptsUsed: jobHistory.started.length,
      firstAttemptSuccess:
        jobHistory.finished[0]?.outcome === "succeeded" &&
        jobHistory.started.length === 1,
      eventualSuccess: terminalFinish?.outcome === "succeeded",
      terminalOutcome: terminalFinish?.outcome ?? "unknown",
      terminalLatencyMs: terminalFinish?.latencyMs ?? null,
      totalLatencyMs,
      parseFailureCount,
      selectedSourceChars:
        terminalStart?.input?.selectedSourceCharacterCount ?? null,
      formattedContextChars:
        terminalStart?.input?.formattedContextCharacterCount ?? null,
      messageTextChars: terminalStart?.input?.messageTextCharacterCount ?? null,
      truncated: Boolean(terminalStart?.input?.truncated),
      usageAvailable: Boolean(terminalResponse?.response?.usageAvailable),
      usage: terminalResponse?.response?.usageAvailable
        ? terminalResponse.response.usage
        : null,
      wordLimit: terminalFinish?.wordLimit ?? null,
    };
  });

  // Determine common cases where all 4 strategies produced a valid response
  const caseIds = [...new Set(joinedJobs.map((j) => j.caseId))].sort();
  const commonValidCaseIds = new Set(
    caseIds.filter((cid) =>
      STRATEGIES.every(
        (st) =>
          joinedJobs.find((j) => j.caseId === cid && j.strategy === st)
            ?.isAvailable,
      ),
    ),
  );

  const byStrategy = {};
  for (const strategy of STRATEGIES) {
    const jobs = joinedJobs
      .filter((j) => j.strategy === strategy)
      .sort((a, b) => a.caseId.localeCompare(b.caseId));
    byStrategy[strategy] = computeStrategySlice(jobs, commonValidCaseIds);
  }

  return {
    totalCases: caseIds.length,
    commonValidCaseCount: commonValidCaseIds.size,
    commonValidCaseIds: [...commonValidCaseIds],
    byStrategy,
    jobs: joinedJobs,
  };
}

function computeStrategySlice(jobs, commonValidCaseIds) {
  const totalJobs = jobs.length;
  const validJobs = jobs.filter((j) => j.isAvailable);
  const nonEmptyJobs = jobs.filter((j) => j.isNonEmptyDescription);
  const commonValidJobs = validJobs.filter((j) =>
    commonValidCaseIds.has(j.caseId),
  );
  const proposedReplacementJobs = validJobs.filter(
    (j) => j.effectiveSource === "proposed-replacement",
  );

  // 1. Fact coverage over valid-response jobs
  const avgFactCoverage =
    validJobs.length > 0
      ? validJobs.reduce((s, j) => s + j.effectiveFactCoverage, 0) /
        validJobs.length
      : null;
  const totalFactsConveyed = validJobs.reduce(
    (s, j) =>
      s +
      (j.effectiveSource === "missed-improvement-empty"
        ? 0
        : j.humanScore.factsYes),
    0,
  );
  const totalFactsRequired = validJobs.reduce(
    (s, j) => s + j.humanScore.factsTotal,
    0,
  );

  const commonFactCoverage =
    commonValidJobs.length > 0
      ? commonValidJobs.reduce((s, j) => s + j.effectiveFactCoverage, 0) /
        commonValidJobs.length
      : null;

  // 2. Unsupported claims over non-empty descriptions
  const unsupportedOutputNumerator = nonEmptyJobs.filter(
    (j) => j.humanScore.hasUnsupportedClaim,
  ).length;
  const unsupportedOutputDenominator = nonEmptyJobs.length;
  const unsupportedOutputRate =
    unsupportedOutputDenominator > 0
      ? unsupportedOutputNumerator / unsupportedOutputDenominator
      : null;
  const unsupportedClaimCount = nonEmptyJobs.reduce(
    (s, j) => s + j.humanScore.unsupportedClaimCount,
    0,
  );

  // 3. Semantic detection accuracy on weak vs. acceptable cases
  const detectionEligibleJobs = jobs.filter(
    (j) => j.category === "weak" || j.category === "acceptable",
  );
  const validDetectionJobs = detectionEligibleJobs.filter((j) => j.isAvailable);
  let tp = 0,
    tn = 0,
    fp = 0,
    fn = 0;
  for (const j of validDetectionJobs) {
    if (j.shouldImprove && j.modelConcern === true) tp++;
    else if (!j.shouldImprove && j.modelConcern === false) tn++;
    else if (!j.shouldImprove && j.modelConcern === true) fp++;
    else if (j.shouldImprove && j.modelConcern === false) fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  // When both precision and recall are defined and both are 0 (TP = 0, FP > 0, FN > 0), F1 is 0, not N/A
  const f1 =
    precision !== null && recall !== null
      ? precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0
      : null;

  // 4. Missing/empty remediation jobs reported separately
  const missingEmptyJobs = jobs.filter((j) => j.category === "missing-empty");
  const missingEmptyRemediated = missingEmptyJobs.filter(
    (j) => j.isAvailable && j.modelConcern === true && j.isNonEmptyDescription,
  ).length;

  // 5. Secondary metrics: input sizes, token usage, latency, constraint validity
  const avgSelectedSourceChars = averageNumbers(
    jobs.map((j) => j.selectedSourceChars),
  );
  const avgFormattedContextChars = averageNumbers(
    jobs.map((j) => j.formattedContextChars),
  );
  const avgTerminalLatencyMs = averageNumbers(
    validJobs.map((j) => j.terminalLatencyMs),
  );
  const totalLatencyMs = jobs.reduce((s, j) => s + j.totalLatencyMs, 0);
  const totalRequestsSent = jobs.reduce((s, j) => s + j.attemptsUsed, 0);
  const firstAttemptSuccessCount = jobs.filter(
    (j) => j.firstAttemptSuccess,
  ).length;
  const eventualSuccessCount = jobs.filter((j) => j.eventualSuccess).length;
  const parseFailureCount = jobs.reduce((s, j) => s + j.parseFailureCount, 0);

  const withinWordLimitNumerator = proposedReplacementJobs.filter(
    (j) => j.wordLimit?.withinLimit === true,
  ).length;
  const withinWordLimitDenominator = proposedReplacementJobs.length;
  const constraintValidRate =
    withinWordLimitDenominator > 0
      ? withinWordLimitNumerator / withinWordLimitDenominator
      : null;

  const jobsWithUsage = validJobs.filter((j) => j.usageAvailable && j.usage);
  const tokenUsage =
    jobsWithUsage.length === validJobs.length && validJobs.length > 0
      ? {
          status: "available",
          reportedJobs: jobsWithUsage.length,
          avgPromptTokens: averageNumbers(
            jobsWithUsage.map((j) => j.usage.promptTokens),
          ),
          avgCompletionTokens: averageNumbers(
            jobsWithUsage.map((j) => j.usage.completionTokens),
          ),
          avgTotalTokens: averageNumbers(
            jobsWithUsage.map((j) => j.usage.totalTokens),
          ),
        }
      : {
          status: "unavailable",
          reportedJobs: jobsWithUsage.length,
          avgPromptTokens: null,
          avgCompletionTokens: null,
          avgTotalTokens: null,
        };

  // 6. Subgroup breakdowns (by category and contextSensitive)
  const subgroups = {
    byCategory: {},
    byContextSensitivity: {
      contextSensitive: computeSimpleCoverage(
        validJobs.filter((j) => j.contextSensitive),
      ),
      notContextSensitive: computeSimpleCoverage(
        validJobs.filter((j) => !j.contextSensitive),
      ),
    },
  };
  for (const cat of ["missing-empty", "weak", "acceptable"]) {
    subgroups.byCategory[cat] = computeSimpleCoverage(
      validJobs.filter((j) => j.category === cat),
    );
  }

  return {
    primary: {
      validResponseNumerator: validJobs.length,
      validResponseDenominator: totalJobs,
      validResponseRate: validJobs.length / totalJobs,
      usableDescriptionNumerator: nonEmptyJobs.length,
      usableDescriptionDenominator: totalJobs,
      usableDescriptionRate: nonEmptyJobs.length / totalJobs,
      requiredFactCoverage: avgFactCoverage,
      commonCaseFactCoverage: commonFactCoverage,
      totalFactsConveyed,
      totalFactsRequired,
      unsupportedOutputNumerator,
      unsupportedOutputDenominator,
      unsupportedOutputRate,
      unsupportedClaimCount,
      semanticDetection: {
        eligibleCases: detectionEligibleJobs.length,
        validDecisions: validDetectionJobs.length,
        tp,
        tn,
        fp,
        fn,
        precision,
        recall,
        f1,
      },
      missingEmptyRemediation: {
        totalCases: missingEmptyJobs.length,
        remediatedCount: missingEmptyRemediated,
      },
    },
    secondary: {
      avgSelectedSourceChars,
      avgFormattedContextChars,
      tokenUsage,
      avgTerminalLatencyMs,
      totalLatencyMs,
      totalRequestsSent,
      firstAttemptSuccessCount,
      eventualSuccessCount,
      parseFailureCount,
      constraintValidNumerator: withinWordLimitNumerator,
      constraintValidDenominator: withinWordLimitDenominator,
      constraintValidRate,
    },
    subgroups,
  };
}

function computeSimpleCoverage(validJobs) {
  if (validJobs.length === 0) {
    return {
      validJobCount: 0,
      avgFactCoverage: null,
      unsupportedClaimCount: null,
    };
  }
  const nonEmpty = validJobs.filter((j) => j.isNonEmptyDescription);
  return {
    validJobCount: validJobs.length,
    avgFactCoverage:
      validJobs.reduce((s, j) => s + j.effectiveFactCoverage, 0) /
      validJobs.length,
    unsupportedClaimCount: nonEmpty.reduce(
      (s, j) => s + j.humanScore.unsupportedClaimCount,
      0,
    ),
  };
}

function averageNumbers(values) {
  const nums = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ============================================================================
// Step 4: Compute Part B Validation Screening Comparison
// ============================================================================
function computePartBMetrics({
  partAJobs,
  validationExperiment,
  validationEvents,
}) {
  if (!validationExperiment || !validationEvents) return null;

  const structureAwareJobs = partAJobs
    .filter((j) => j.strategy === "structure-aware")
    .sort((a, b) => a.caseId.localeCompare(b.caseId));

  const valHistoryByJob = summarizeAttemptHistory(
    validationEvents,
    "validation",
  );
  const exclusionsByCase = new Map(
    (validationExperiment.exclusions ?? []).map((ex) => [ex.caseId, ex]),
  );

  let problemsFlagged = 0;
  let problemsMissed = 0;
  let correctSuggestionsFlagged = 0;
  let passes = 0;
  let validatorFailures = 0;
  let validatorReasonInconsistencies = 0;

  const caseComparisons = [];

  for (const job of structureAwareJobs) {
    const exclusion = exclusionsByCase.get(job.caseId);
    if (exclusion) {
      caseComparisons.push({
        caseId: job.caseId,
        scoringId: job.scoringId,
        eligibility: "excluded",
        exclusionReason: exclusion.reason,
      });
      continue;
    }

    const valHistory = valHistoryByJob.get(`${job.caseId}::structure-aware`);
    const terminalFinish = valHistory?.finished.at(-1);
    const checks = terminalFinish?.parsed?.value ?? null;
    const valSucceeded = terminalFinish?.outcome === "succeeded" && checks;
    const allFiveChecksPass =
      valSucceeded &&
      checks.grounded === true &&
      checks.contextConsistent === true &&
      checks.informative === true &&
      checks.concise === true &&
      checks.noUnsupportedClaims === true;

    const reviewDecision = allFiveChecksPass ? "pass" : "manual-review";

    // Protocol rule (line 185): a failure reason must agree with a false flag;
    // empty reasons when a check is false or reasons present when all checks are true are noted.
    const reasons = Array.isArray(checks?.reasons) ? checks.reasons : [];
    const reasonInconsistent =
      valSucceeded &&
      ((!allFiveChecksPass && reasons.length === 0) ||
        (allFiveChecksPass && reasons.length > 0));
    if (reasonInconsistent) validatorReasonInconsistencies++;

    // Rubric rule: missing any one reference fact does NOT automatically mean a quality defect.
    // Quality defects are evaluated from Section 2 (unsupported claims) and Section 3 (4 defect rows).
    const hs = job.humanScore;
    const humanHasQualityDefect =
      hs.hasUnsupportedClaim ||
      hs.defects.visualConflict ||
      hs.defects.contextContradiction ||
      hs.defects.importantContentMissing ||
      hs.defects.repetitiveOrIrrelevant;

    // Dimension-by-dimension agreement between the 5 validator checks and human evidence
    const checkComparison = valSucceeded
      ? {
          grounded: {
            validator: checks.grounded,
            humanPass: !hs.defects.visualConflict && !hs.hasUnsupportedClaim,
          },
          contextConsistent: {
            validator: checks.contextConsistent,
            humanPass: !hs.defects.contextContradiction,
          },
          informative: {
            validator: checks.informative,
            humanPass: !hs.defects.importantContentMissing,
          },
          concise: {
            validator: checks.concise,
            humanPass: !hs.defects.repetitiveOrIrrelevant,
          },
          noUnsupportedClaims: {
            validator: checks.noUnsupportedClaims,
            humanPass: !hs.hasUnsupportedClaim,
          },
        }
      : null;

    let comparisonOutcome;
    if (!valSucceeded) {
      validatorFailures++;
      comparisonOutcome = "validator-request-or-parse-failure";
    } else if (humanHasQualityDefect && reviewDecision === "manual-review") {
      problemsFlagged++;
      comparisonOutcome = "problem-flagged";
    } else if (humanHasQualityDefect && reviewDecision === "pass") {
      problemsMissed++;
      comparisonOutcome = "problem-missed";
    } else if (!humanHasQualityDefect && reviewDecision === "manual-review") {
      correctSuggestionsFlagged++;
      comparisonOutcome = "correct-suggestion-flagged";
    } else {
      passes++;
      comparisonOutcome = "pass";
    }

    caseComparisons.push({
      caseId: job.caseId,
      scoringId: job.scoringId,
      eligibility: "eligible",
      suggestion: job.effectiveDescription,
      validatorOutcome: terminalFinish?.outcome ?? "missing",
      reviewDecision,
      reasonInconsistent,
      validatorChecks: checks
        ? {
            grounded: checks.grounded,
            contextConsistent: checks.contextConsistent,
            informative: checks.informative,
            concise: checks.concise,
            noUnsupportedClaims: checks.noUnsupportedClaims,
            reasons,
          }
        : null,
      humanEvidence: {
        factCoverage: `${hs.factsYes}/${hs.factsTotal}`,
        hasMissingReferenceFact: hs.factsYes < hs.factsTotal,
        unsupportedClaimCount: hs.unsupportedClaimCount,
        defects: {
          visualConflict: hs.defects.visualConflict,
          contextContradiction: hs.defects.contextContradiction,
          importantContentMissing: hs.defects.importantContentMissing,
          repetitiveOrIrrelevant: hs.defects.repetitiveOrIrrelevant,
        },
        humanHasQualityDefect,
      },
      checkComparison,
      comparisonOutcome,
    });
  }

  return {
    validationExperimentId: validationExperiment.experimentId,
    eligibleCount: caseComparisons.filter((c) => c.eligibility === "eligible")
      .length,
    excludedCount: caseComparisons.filter((c) => c.eligibility === "excluded")
      .length,
    summary: {
      problemsFlagged,
      problemsMissed,
      correctSuggestionsFlagged,
      passes,
      validatorFailures,
      validatorReasonInconsistencies,
    },
    cases: caseComparisons,
  };
}

// ============================================================================
// Step 5: Format a clean Markdown summary for the report
// ============================================================================
const fmtPct = (v) =>
  typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "N/A";
const fmtNum = (v, d = 1) => (typeof v === "number" ? v.toFixed(d) : "N/A");

export function formatSummaryMarkdown(report) {
  let md = `# Evaluation Summary (${report.sourceExperimentId})\n\n`;
  md += `- **Split / Total cases:** ${report.partA.totalCases} cases (Common valid cases across all 4 strategies: ${report.partA.commonValidCaseCount}/${report.partA.totalCases})\n`;
  md += `- **Note:** Descriptive counts and rates from saved experiment artifacts; single-rater strategy-masked evaluation.\n\n`;

  md += `## Part A: Primary Quality Metrics\n\n`;
  md += `| Strategy | Valid Responses | Required-Fact Coverage | Unsupported Outputs | Unsupported Claims | Detection (TP/TN/FP/FN) | Detection F1 (P / R) |\n`;
  md += `| --- | --- | --- | --- | --- | --- | --- |\n`;
  for (const st of STRATEGIES) {
    const p = report.partA.byStrategy[st].primary;
    const det = p.semanticDetection;
    md += `| \`${st}\` | ${p.validResponseNumerator}/${p.validResponseDenominator} | ${fmtPct(p.requiredFactCoverage)} (${p.totalFactsConveyed}/${p.totalFactsRequired}) | ${p.unsupportedOutputNumerator}/${p.unsupportedOutputDenominator} (${fmtPct(p.unsupportedOutputRate)}) | ${p.unsupportedClaimCount} | ${det.tp}/${det.tn}/${det.fp}/${det.fn} (${det.validDecisions}/${det.eligibleCases}) | ${fmtNum(det.f1, 2)} (${fmtNum(det.precision, 2)} / ${fmtNum(det.recall, 2)}) |\n`;
  }

  md += `\n## Part A: Secondary Efficiency & Validity Metrics\n\n`;
  md += `| Strategy | Avg Source Chars | Avg Formatted Chars | Avg Total Tokens | Avg Latency (ms) | Total Requests | Parse Failures | Constraint-Valid (<=40w) |\n`;
  md += `| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  for (const st of STRATEGIES) {
    const s = report.partA.byStrategy[st].secondary;
    const tok =
      s.tokenUsage.status === "available"
        ? fmtNum(s.tokenUsage.avgTotalTokens, 0)
        : "unavailable";
    md += `| \`${st}\` | ${fmtNum(s.avgSelectedSourceChars, 0)} | ${fmtNum(s.avgFormattedContextChars, 0)} | ${tok} | ${fmtNum(s.avgTerminalLatencyMs, 0)} | ${s.totalRequestsSent} | ${s.parseFailureCount} | ${s.constraintValidNumerator}/${s.constraintValidDenominator} (${fmtPct(s.constraintValidRate)}) |\n`;
  }

  if (report.partB) {
    const b = report.partB;
    md += `\n## Part B: Validation Screening Comparison (\`structure-aware\`)\n\n`;
    md += `- **Eligible replacements:** ${b.eligibleCount} (Excluded: ${b.excludedCount})\n`;
    md += `- **Passes (Human OK, Validator Pass):** ${b.summary.passes}\n`;
    md += `- **Problems Flagged (Human Defect, Validator Flagged):** ${b.summary.problemsFlagged}\n`;
    md += `- **Problems Missed (Human Defect, Validator Pass):** ${b.summary.problemsMissed}\n`;
    md += `- **Correct Suggestions Flagged / False Alarms (Human OK, Validator Flagged):** ${b.summary.correctSuggestionsFlagged}\n`;
    md += `- **Validator Request/Parse Failures:** ${b.summary.validatorFailures}\n\n`;

    md += `| Case | Item | Eligibility | Human Coverage | Human Quality Defect? | Validator Decision | Comparison Outcome |\n`;
    md += `| --- | --- | --- | --- | --- | --- | --- |\n`;
    for (const c of b.cases) {
      if (c.eligibility === "excluded") {
        md += `| \`${c.caseId}\` | \`${c.scoringId}\` | Excluded (${c.exclusionReason}) | - | - | - | - |\n`;
      } else {
        md += `| \`${c.caseId}\` | \`${c.scoringId}\` | Eligible | ${c.humanEvidence.factCoverage} | ${c.humanEvidence.humanHasQualityDefect ? "Yes" : "No"} | \`${c.reviewDecision}\` | \`${c.comparisonOutcome}\` |\n`;
      }
    }
  }

  return md;
}

// ============================================================================
// Main entry point (exportable for tests + runnable via CLI)
// ============================================================================
export async function analyzeScoring({
  scoringDir,
  sourceDir,
  validationDir = null,
  frozenDir,
  outputDir = null,
}) {
  if (!scoringDir || !sourceDir || !frozenDir) {
    fail("Required arguments: --scoring, --source, and --frozen.");
  }

  const inputs = await loadAndVerifyInputs({
    scoringDir: resolve(scoringDir),
    sourceDir: resolve(sourceDir),
    validationDir: validationDir ? resolve(validationDir) : null,
    frozenDir: resolve(frozenDir),
  });

  const partA = computePartAMetrics(inputs);
  const partB = computePartBMetrics({
    partAJobs: partA.jobs,
    validationExperiment: inputs.validationExperiment,
    validationEvents: inputs.validationEvents,
  });

  const report = {
    schemaVersion: "phase7-analysis-v1",
    sourceExperimentId: inputs.mapping.sourceExperimentId,
    sourceFingerprint: inputs.mapping.sourceFingerprint,
    freezeHash: inputs.mapping.freezeHash,
    partA,
    partB,
  };

  const markdown = formatSummaryMarkdown(report);

  if (outputDir) {
    const resolvedOut = await canonicalDestination(resolve(outputDir));
    const sourceReal = await fs.realpath(resolve(sourceDir));
    const frozenReal = await fs.realpath(resolve(frozenDir));
    const valReal = validationDir
      ? await fs.realpath(resolve(validationDir))
      : null;
    for (const protectedRoot of [
      sourceReal,
      frozenReal,
      ...(valReal ? [valReal] : []),
    ]) {
      if (inside(protectedRoot, resolvedOut) || inside(resolvedOut, protectedRoot)) {
        fail("Output path overlaps a protected source, validation, or frozen directory.");
      }
    }
    await fs.mkdir(resolvedOut, { recursive: true });
    const jsonPath = join(resolvedOut, "summary.json");
    const mdPath = join(resolvedOut, "summary.md");
    await Promise.all([
      fs.writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8"),
      fs.writeFile(mdPath, markdown, "utf8"),
    ]);
  }

  return { report, markdown };
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      strict: true,
      options: {
        scoring: { type: "string" },
        source: { type: "string" },
        validation: { type: "string" },
        frozen: { type: "string" },
        output: { type: "string" },
      },
    }));
  } catch {
    fail(
      "Invalid arguments. Use --scoring, --source, --frozen, [--validation], and [--output].",
    );
  }

  const { report } = await analyzeScoring({
    scoringDir: values.scoring,
    sourceDir: values.source,
    validationDir: values.validation,
    frozenDir: values.frozen,
    outputDir: values.output,
  });

  console.log(
    JSON.stringify(
      {
        sourceExperimentId: report.sourceExperimentId,
        totalCases: report.partA.totalCases,
        commonValidCaseCount: report.partA.commonValidCaseCount,
        partBIncluded: Boolean(report.partB),
        outputDir: values.output ? resolve(values.output) : null,
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      error instanceof ScoringAnalyzerError
        ? error.message
        : "Scoring analysis failed unexpectedly.",
    );
    process.exitCode = 1;
  });
}

