import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runEvaluation, selectProviderResponse } from "../runner.mjs";
import { exportScoring, packetMarkdown } from "../export-scoring.mjs";
import {
  analyzeRecovery,
  recoverExtraClosingBrace,
} from "../analyze-recovery.mjs";

const digest = (x) => createHash("sha256").update(x).digest("hex");
const frozenDir = resolve("test_files/benchmark");
const strategies = [
  "minimal",
  "fixed-window",
  "structure-aware",
  "largest-practical",
];
const rule = "single-surplus-final-closing-brace-v1";
const load = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const save = (p, x) => fs.writeFile(p, JSON.stringify(x, null, 2) + "\n");

// Synthetic marks test arithmetic, not the quality of a real model description.
function finalize(markdown, firstFactOnly = false) {
  return markdown
    .split(/(?=^## Review Item:)/m)
    .map((block) => {
      if (!block.startsWith("## Review Item:")) return block;
      let fact = 0;
      return block
        .replace(/^(\| [^|]+ \|) \| \|$/gm, (_, column) => {
          if (
            [
              "Visual claim",
              "Description contradicts",
              "Important image",
              "Wording is",
            ].some((x) => column.includes(x))
          )
            return `${column} No | |`;
          const yes = !firstFactOnly || fact++ === 0;
          return `${column} ${yes ? "Yes" : "No"} | ${yes ? '"synthetic evidence"' : "Not conveyed"} |`;
        })
        .replace("| | |", "| None | |")
        .replace(
          "- Uncertainties and resolution: ",
          "- Uncertainties and resolution: None",
        )
        .replace(
          "- Reviewer identifier: ",
          "- Reviewer identifier: fixture-reviewer",
        )
        .replace("- Finalized date: ", "- Finalized date: 2026-11-06")
        .replace(
          "- All Unsure entries resolved before unblinding: ",
          "- All Unsure entries resolved before unblinding: Yes",
        );
    })
    .join("");
}

async function fixture(t) {
  const base = await fs.mkdtemp(join(tmpdir(), "a11ylens-recovery-test-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const sourceDir = join(base, "source"),
    primaryScoringDir = join(base, "primary");
  const supplementaryDir = join(base, "supplementary"),
    auditDir = join(base, "audit");
  const manifest = await load(join(frozenDir, "references/manifest.json"));
  const failures = new Set([
    "case-01:minimal",
    "case-01:fixed-window",
    "case-04:structure-aware",
  ]);
  let clock = Date.parse("2026-11-06T00:00:00Z");
  for (const c of manifest.cases.filter((x) => x.split === "development")) {
    for (const strategy of strategies) {
      const value = { concern: true, suggestion: c.requiredFacts[0] };
      await runEvaluation(
        {
          outputDir: sourceDir,
          experimentId: "offline-recovery",
          cases: [c.id],
          strategies: [strategy],
        },
        {
          env: {
            A11YLENS_MODEL_ENDPOINT: "https://example.test/v1/chat/completions",
            A11YLENS_API_KEY: "offline-only-key",
          },
          now: () => clock,
          sleep: async (ms) => {
            clock += ms;
          },
          send: async () => {
            clock += 100;
            return {
              httpStatus: 200,
              retryAfter: null,
              response: selectProviderResponse({
                model: "gemini-3.5-flash-lite",
                choices: [
                  {
                    finish_reason: "stop",
                    message: {
                      content:
                        JSON.stringify(value) +
                        (failures.has(`${c.id}:${strategy}`) ? "}" : ""),
                    },
                  },
                ],
              }),
            };
          },
        },
      );
    }
  }
  await exportScoring({ sourceDir, outputDir: primaryScoringDir, frozenDir });
  const primaryPacket = join(primaryScoringDir, "reviewer/scoring-packet.md");
  await fs.writeFile(
    primaryPacket,
    finalize(await fs.readFile(primaryPacket, "utf8")),
  );
  const primaryMappingBytes = await fs.readFile(
    join(primaryScoringDir, "private-mapping.json"),
  );
  const primaryMapping = JSON.parse(primaryMappingBytes);
  const snapshotBytes = await fs.readFile(join(sourceDir, "experiment.json"));
  const attemptsBytes = await fs.readFile(join(sourceDir, "attempts.jsonl"));
  const events = String(attemptsBytes).trim().split("\n").map(JSON.parse);
  const sourceSnapshotSha256 = digest(snapshotBytes),
    sourceAttemptsSha256 = digest(attemptsBytes);
  const items = primaryMapping.items
    .filter((x) => x.availability === "unavailable")
    .map((x) => {
      const response = events.find(
        (e) =>
          e.event === "response-received" && e.attemptId === x.sourceAttemptId,
      );
      const rawContent = response.response.rawContent,
        recovered = recoverExtraClosingBrace(rawContent);
      return {
        scoringId: x.scoringId,
        job: { caseId: x.caseId, strategy: x.strategy, stage: "generation" },
        sourceAttemptId: x.sourceAttemptId,
        primaryOutcome: "model-output-error",
        sourceOutcome: "model-output-error",
        effectiveDescription: recovered.value.suggestion,
        recoveryRule: rule,
        rawContentSha256: digest(rawContent),
        rawContent,
        recoveredJsonPrefix: recovered.prefix,
        recoveredValue: recovered.value,
        descriptionWordsEdited: false,
      };
    });
  await fs.mkdir(auditDir);
  const audit = {
    sourceExperimentId: "offline-recovery",
    sourceSnapshotSha256,
    sourceAttemptsSha256,
    modelRequests: 0,
    descriptionWordsEdited: false,
    unambiguouslyRecoverable: 3,
  };
  const candidates = {
    sourceExperimentId: "offline-recovery",
    sourceAttemptsSha256,
    items,
  };
  await save(join(auditDir, "summary.json"), audit);
  await save(join(auditDir, "private-recovered-candidates.json"), candidates);
  await fs.mkdir(join(supplementaryDir, "reviewer/assets"), {
    recursive: true,
  });
  const mapping = {
    schemaVersion: "supplementary-format-recovery-v1",
    sourceExperimentId: "offline-recovery",
    sourceSnapshotSha256,
    sourceAttemptsSha256,
    primaryMappingSha256: digest(primaryMappingBytes),
    sourceAuditSummarySha256: digest(
      await fs.readFile(join(auditDir, "summary.json")),
    ),
    sourceRecoveryCandidatesSha256: digest(
      await fs.readFile(join(auditDir, "private-recovered-candidates.json")),
    ),
    freezeHash: digest(
      await fs.readFile(join(frozenDir, "references/freeze.json")),
    ),
    primaryResultsReplaced: false,
    items,
  };
  await save(join(supplementaryDir, "private-mapping.json"), mapping);
  const packetItems = [];
  for (const item of items) {
    const c = manifest.cases.find((x) => x.id === item.job.caseId),
      assetPath = `assets/${item.scoringId}.png`;
    await fs.copyFile(
      join(frozenDir, c.imagePath),
      join(supplementaryDir, "reviewer", assetPath),
    );
    packetItems.push({
      scoringId: item.scoringId,
      assetPath,
      context: c.evidence.context,
      description: item.effectiveDescription,
      requiredFacts: c.requiredFacts,
    });
  }
  await fs.writeFile(
    join(supplementaryDir, "reviewer/scoring-packet.md"),
    finalize(packetMarkdown(packetItems), true),
  );
  await fs.writeFile(join(supplementaryDir, "COMPLETE"), "complete\n");
  return {
    base,
    sourceDir,
    primaryScoringDir,
    supplementaryDir,
    auditDir,
    frozenDir,
  };
}

test("narrow recovery accepts only one surplus brace and an exact semantic object", () => {
  for (const value of [
    { concern: true, suggestion: 'A chart with "braces" }.' },
    { suggestion: "A chart.", concern: true },
  ]) {
    assert.deepEqual(
      recoverExtraClosingBrace(JSON.stringify(value) + "}").value,
      value,
    );
    assert.deepEqual(
      recoverExtraClosingBrace("```json\n" + JSON.stringify(value) + "}\n```")
        .value,
      value,
    );
  }
  for (const raw of [
    '{"concern":true,"suggestion":"A chart."}',
    '{"concern":true,"suggestion":"A chart."}}}',
    'prose {"concern":true,"suggestion":"A chart."}}',
    '{"concern":true,"concern":true,"suggestion":"A chart."}}',
    '{"concern":true,"suggestion":"A chart.","extra":1}}',
    '{"concern":true,"suggestion":null}}',
  ]) {
    assert.throws(() => recoverExtraClosingBrace(raw));
  }
});

test("offline recovery adds scores without rewriting primary availability or original evidence", async (t) => {
  const options = await fixture(t),
    outputDir = join(options.base, "report");
  const sourcePath = join(options.sourceDir, "attempts.jsonl"),
    before = await fs.readFile(sourcePath);
  const { report } = await analyzeRecovery({ ...options, outputDir });
  assert.deepEqual(report.primaryExecution, {
    jobs: 24,
    validResponses: 21,
    formatFailures: 3,
    totalRequests: 24,
  });
  assert.equal(report.primaryResultsReplaced, false);
  assert.equal(report.partBChanged, false);
  assert.equal(report.additionalModelRequests, 0);
  assert.equal(report.commonCasesBeforeRecovery, 4);
  assert.equal(report.commonCasesAfterRecovery, 6);
  for (const strategy of strategies) {
    const c = report.comparison[strategy];
    assert.equal(c.withFormatRecovery.scoredDescriptions, 6);
    assert.equal(
      c.primaryMatchedCaseCoverage,
      c.originalMatchedCasesRecheckedCoverage,
    );
    if (strategy !== "largest-practical") {
      assert.equal(c.primary.scoredDescriptions, 5);
      assert.ok(
        Math.abs(c.withFormatRecovery.requiredFactCoverage - 8 / 9) < 1e-9,
      );
      assert.ok(
        c.coverageDifference < 0,
        "recovery need not improve mean quality",
      );
    } else assert.equal(c.coverageDifference, 0);
  }
  assert.deepEqual(await fs.readFile(sourcePath), before);
  assert.equal(
    await fs.readFile(join(outputDir, "COMPLETE"), "utf8"),
    "complete\n",
  );
  assert.deepEqual(await load(join(outputDir, "summary.json")), report);
  await assert.rejects(
    analyzeRecovery({ ...options, outputDir }),
    /already exists/,
  );
  await assert.rejects(
    analyzeRecovery({
      ...options,
      outputDir: join(options.sourceDir, "report"),
    }),
    /protected/,
  );
  const alias = join(options.base, "source-link");
  await fs.symlink(options.sourceDir, alias);
  await assert.rejects(
    analyzeRecovery({ ...options, outputDir: join(alias, "report") }),
    /protected/,
  );
});

test("altered wording, facts, images, unresolved marks, and lineage fail closed", async (t) => {
  const options = await fixture(t),
    packetPath = join(options.supplementaryDir, "reviewer/scoring-packet.md");
  const packet = await fs.readFile(packetPath, "utf8");
  for (const altered of [
    packet.replace("A line chart.\n", "A fabricated chart.\n"),
    packet.replace("| A line chart. |", "| A different fact. |"),
    packet.replace("| Yes |", "| Unsure |"),
  ]) {
    assert.notEqual(altered, packet);
    await fs.writeFile(packetPath, altered);
    await assert.rejects(analyzeRecovery(options));
  }
  await fs.writeFile(packetPath, packet);
  const mappingPath = join(options.supplementaryDir, "private-mapping.json"),
    mapping = await load(mappingPath);
  const asset = join(
      options.supplementaryDir,
      `reviewer/assets/${mapping.items[0].scoringId}.png`,
    ),
    bytes = await fs.readFile(asset);
  await fs.writeFile(asset, "altered");
  await assert.rejects(analyzeRecovery(options), /frozen evidence/);
  await fs.writeFile(asset, bytes);
  await save(mappingPath, { ...mapping, sourceAttemptsSha256: "wrong" });
  await assert.rejects(analyzeRecovery(options), /lineage/);
  await save(mappingPath, {
    ...mapping,
    items: [mapping.items[0], mapping.items[0], mapping.items[2]],
  });
  await assert.rejects(analyzeRecovery(options), /Duplicate/);
});
