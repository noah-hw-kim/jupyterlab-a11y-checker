import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { exportScoring } from "../export-scoring.mjs";
import {
  runEvaluation,
  runValidation,
  selectProviderResponse,
} from "../runner.mjs";
import {
  analyzeScoring,
  parseScoringPacket,
  formatSummaryMarkdown,
  ScoringAnalyzerError,
} from "../analyze-scoring.mjs";

const frozenDir = resolve("test_files/benchmark");
const strategies = [
  "minimal",
  "fixed-window",
  "structure-aware",
  "largest-practical",
];
const env = {
  A11YLENS_MODEL_ENDPOINT: "https://example.test/v1/chat/completions",
  A11YLENS_API_KEY: "offline-only-key",
};

const validPacketSample = `# Blinded Human Scoring Packet

---

## Review Item: ITEM-01

![Chart](assets/ITEM-01.png)

**Approved context**

\`\`\`text
Context text
\`\`\`

**Description to score**

\`\`\`text
Line chart showing revenue increasing across five quarters.
\`\`\`

| Fact | Conveyed? Yes / No / Unsure | Exact supporting words or explanation |
| --- | --- | --- |
| A line chart. | Yes | "Line chart" |
| Quarterly revenue. | Yes | "revenue" |
| Revenue increases across five quarters. | No | Missing five quarters detail |

### Unsupported factual assertions

| Quoted assertion | Evidence showing it is unsupported/incorrect |
| --- | --- |
| None | |

### Other defects for validation analysis

| Defect | Present? Yes / No / Unsure | Evidence |
| --- | --- | --- |
| Visual claim conflicts with the image | No | |
| Description contradicts approved notebook context | No | |
| Important image content is missing | Yes | Missing peak detail |
| Wording is unnecessarily repetitive or irrelevant | No | |

### Finalization

- Uncertainties and resolution: None
- Reviewer identifier: author
- Finalized date: 2026-11-03
- All Unsure entries resolved before unblinding: Yes
`;

function fillPacketMarkdown(rawMarkdown, customizeItem = () => ({})) {
  const parts = rawMarkdown.split(/^## Review Item:[ \t]*/m);
  const header = parts[0];
  const filledBlocks = parts.slice(1).map((block) => {
    const scoringId = block.slice(0, block.indexOf("\n")).trim();
    const isEmptyDesc = block.includes("*(Empty description)*");
    const custom = customizeItem(scoringId, isEmptyDesc) ?? {};
    const factMark = isEmptyDesc ? "No" : (custom.factMark ?? "Yes");
    const factEvidence = isEmptyDesc
      ? ""
      : (custom.factEvidence ?? '"quoted supporting words"');

    const [beforeUnsup, afterUnsup] = block.split(
      "### Unsupported factual assertions",
    );
    const [unsupPart, afterDefects] = afterUnsup.split(
      "### Other defects for validation analysis",
    );
    const [defectsPart, finalPart] = afterDefects.split("### Finalization");

    const filledFacts = beforeUnsup.replace(
      /^(\| [^|]+ \|) \| \|$/gm,
      (_, col1) => `${col1} ${factMark} | ${factEvidence} |`,
    );

    const unsupTable = custom.unsupportedRow
      ? unsupPart.replace("| | |", custom.unsupportedRow)
      : unsupPart.replace("| | |", "| None | |");

    const d33Mark = custom.importantMissing ? "Yes" : "No";
    const d33Ev = custom.importantMissing ? "Missing major chart trend" : "";
    const filledDefects = defectsPart
      .replace(
        "| Visual claim conflicts with the image | | |",
        "| Visual claim conflicts with the image | No | |",
      )
      .replace(
        "| Description contradicts approved notebook context | | |",
        "| Description contradicts approved notebook context | No | |",
      )
      .replace(
        "| Important image content is missing | | |",
        `| Important image content is missing | ${d33Mark} | ${d33Ev} |`,
      )
      .replace(
        "| Wording is unnecessarily repetitive or irrelevant | | |",
        "| Wording is unnecessarily repetitive or irrelevant | No | |",
      );

    const filledFinal = finalPart
      .replace(
        "- Uncertainties and resolution: ",
        "- Uncertainties and resolution: None",
      )
      .replace("- Reviewer identifier: ", "- Reviewer identifier: author")
      .replace("- Finalized date: ", "- Finalized date: 2026-11-03")
      .replace(
        "- All Unsure entries resolved before unblinding: ",
        "- All Unsure entries resolved before unblinding: Yes",
      );

    return (
      `## Review Item: ${filledFacts}` +
      `### Unsupported factual assertions${unsupTable}` +
      `### Other defects for validation analysis${filledDefects}` +
      `### Finalization${filledFinal}`
    );
  });

  return header + filledBlocks.join("");
}

test("parseScoringPacket parses finalized items and rejects blank finalization fields, missing fact evidence, or Unsure marks", () => {
  const map = parseScoringPacket(validPacketSample);
  assert.equal(map.size, 1);
  const item = map.get("ITEM-01");
  assert.equal(item.factsYes, 2);
  assert.equal(item.factsTotal, 3);
  assert.ok(Math.abs(item.factCoverage - 2 / 3) < 1e-9);
  assert.equal(item.defects.importantContentMissing, true);

  // Empty reviewer identifier (must not consume next line)
  assert.throws(
    () =>
      parseScoringPacket(
        validPacketSample.replace(
          "- Reviewer identifier: author",
          "- Reviewer identifier: ",
        ),
      ),
    ScoringAnalyzerError,
  );

  // Empty finalized date (must not consume next line)
  assert.throws(
    () =>
      parseScoringPacket(
        validPacketSample.replace(
          "- Finalized date: 2026-11-03",
          "- Finalized date: ",
        ),
      ),
    ScoringAnalyzerError,
  );

  // Empty uncertainties note (must not consume next line)
  assert.throws(
    () =>
      parseScoringPacket(
        validPacketSample.replace(
          "- Uncertainties and resolution: None",
          "- Uncertainties and resolution: ",
        ),
      ),
    ScoringAnalyzerError,
  );

  // Missing fact evidence on non-empty description
  assert.throws(
    () =>
      parseScoringPacket(
        validPacketSample.replace(
          '| A line chart. | Yes | "Line chart" |',
          "| A line chart. | Yes | |",
        ),
      ),
    ScoringAnalyzerError,
  );

  // Unresolved Unsure fact mark
  assert.throws(
    () =>
      parseScoringPacket(
        validPacketSample.replace(
          '| A line chart. | Yes | "Line chart" |',
          "| A line chart. | Unsure | Need to check |",
        ),
      ),
    ScoringAnalyzerError,
  );
});

test("parseScoringPacket counts distinct unsupported assertions and requires evidence", () => {
  const withUnsupported = validPacketSample.replace(
    "| None | |",
    '| "projected to double in Q6" | Q6 is not in the chart or context |\n| "dropped in Q2" | Chart shows Q2 rose from 12k to 18k |',
  );
  const map = parseScoringPacket(withUnsupported);
  const item = map.get("ITEM-01");
  assert.equal(item.unsupportedClaimCount, 2);
  assert.equal(item.hasUnsupportedClaim, true);

  assert.throws(
    () =>
      parseScoringPacket(
        validPacketSample.replace(
          "| None | |",
          '| "projected to double in Q6" | |',
        ),
      ),
    ScoringAnalyzerError,
  );
});

test("analyzeScoring computes Part A/B metrics, F1=0 when TP=0, and separates missing facts from Part B quality defects", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "a11ylens-analyze-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const sourceDir = join(base, "source");
  const validationDir = join(base, "validation");
  const scoringDir = join(base, "scoring");
  const analysisOutDir = join(base, "analysis");
  let clock = Date.parse("2026-11-01T12:00:00Z");

  // Create synthetic generation run:
  // - minimal: make weak cases (03, 04) return concern: false (FN=2) and acceptable cases (05, 06) return concern: true (FP=2) -> TP=0, FP=2, FN=2 -> F1 must be 0, not null!
  // - minimal on case-02 (missing-empty): return concern: false -> missed-improvement-empty (fact coverage 0)
  // - largest-practical on case-06: malformed JSON -> unavailable
  // - structure-aware: concern: true on 01..04, concern: false on 05..06
  for (const id of [
    "case-01",
    "case-02",
    "case-03",
    "case-04",
    "case-05",
    "case-06",
  ]) {
    for (const strategy of strategies) {
      const deps = {
        env,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
        send: async () => {
          clock += 100;
          let result;
          if (strategy === "minimal") {
            if (id === "case-02" || id === "case-03" || id === "case-04") {
              result = { concern: false, suggestion: null };
            } else {
              result = {
                concern: true,
                suggestion: "Minimal synthetic replacement.",
              };
            }
          } else {
            result =
              id === "case-05" || id === "case-06"
                ? { concern: false, suggestion: null }
                : {
                    concern: true,
                    suggestion: "Standard synthetic replacement.",
                  };
          }
          const unavailable =
            id === "case-06" && strategy === "largest-practical";
          return {
            httpStatus: 200,
            retryAfter: null,
            response: selectProviderResponse({
              model: "gemini-3.5-flash-lite",
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: unavailable
                      ? "invalid JSON"
                      : JSON.stringify(result),
                  },
                },
              ],
            }),
          };
        },
      };
      await runEvaluation(
        {
          outputDir: sourceDir,
          experimentId: "synthetic-gen",
          cases: [id],
          strategies: [strategy],
        },
        deps,
      );
    }
  }

  // Run Part B validation on the 4 eligible structure-aware replacements:
  // - case-01: validator flags (grounded: false)
  // - case-02, case-03, case-04: validator passes
  await runValidation(
    {
      sourceId: "synthetic-gen",
      sourceDir,
      outputDir: validationDir,
      experimentId: "synthetic-val",
    },
    {
      env,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      send: async (req) => {
        clock += 100;
        const isCase01 = JSON.stringify(req).includes("case-01");
        const valResult = isCase01
          ? {
              grounded: false,
              contextConsistent: true,
              informative: true,
              concise: true,
              noUnsupportedClaims: true,
              reasons: ["Off-grid value flagged."],
            }
          : {
              grounded: true,
              contextConsistent: true,
              informative: true,
              concise: true,
              noUnsupportedClaims: true,
              reasons: [],
            };
        return {
          httpStatus: 200,
          retryAfter: null,
          response: selectProviderResponse({
            model: "gemini-3.5-flash-lite",
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(valResult) },
              },
            ],
          }),
        };
      },
    },
  );

  // Export scoring packet
  await exportScoring({
    sourceDir,
    frozenDir,
    outputDir: scoringDir,
    seed: 7,
  });

  const mapping = JSON.parse(
    await readFile(join(scoringDir, "private-mapping.json"), "utf8"),
  );
  const saCase02Item = mapping.items.find(
    (i) => i.strategy === "structure-aware" && i.caseId === "case-02",
  ).scoringId;
  const saCase04Item = mapping.items.find(
    (i) => i.strategy === "structure-aware" && i.caseId === "case-04",
  ).scoringId;

  // Fill packet:
  // - On saCase02Item: mark factMark = "No" (missing reference facts) BUT no Section 2/3 quality defects!
  //   This tests that Part B does NOT treat a missing reference fact alone as a quality defect.
  // - On saCase04Item: mark importantMissing = true (Section 3.3 quality defect).
  const packetPath = join(scoringDir, "reviewer", "scoring-packet.md");
  const rawMd = await readFile(packetPath, "utf8");
  const filledMd = fillPacketMarkdown(rawMd, (scoringId) => {
    if (scoringId === saCase02Item) {
      return { factMark: "No", factEvidence: "Omitted fact, but still valid" };
    }
    if (scoringId === saCase04Item) {
      return {
        factMark: "No",
        factEvidence: "Omitted fact",
        importantMissing: true,
      };
    }
    return {};
  });
  await writeFile(packetPath, filledMd, "utf8");

  const { report } = await analyzeScoring({
    scoringDir,
    sourceDir,
    validationDir,
    frozenDir,
    outputDir: analysisOutDir,
  });

  // Verify minimal F1 is 0 (TP=0, TN=0, FP=2, FN=2)
  const minDet = report.partA.byStrategy.minimal.primary.semanticDetection;
  assert.equal(minDet.tp, 0);
  assert.equal(minDet.fp, 2);
  assert.equal(minDet.fn, 2);
  assert.equal(minDet.precision, 0);
  assert.equal(minDet.recall, 0);
  assert.equal(minDet.f1, 0);

  // Verify largest-practical has 5/6 valid responses and commonValidCaseCount is 5
  assert.equal(report.partA.commonValidCaseCount, 5);
  assert.equal(
    report.partA.byStrategy["largest-practical"].primary.validResponseNumerator,
    5,
  );

  // Verify Part B separates missing reference facts (case-02) from quality defects (case-04):
  // - case-01: human OK, validator flagged -> correctSuggestionsFlagged = 1
  // - case-02: human has missing facts (0/3) but NO quality defect, validator passed -> passes (NOT problem-missed!)
  // - case-03: human OK, validator passed -> passes
  // - case-04: human has quality defect (3.3 Yes), validator passed -> problemsMissed = 1
  assert.equal(report.partB.summary.correctSuggestionsFlagged, 1);
  assert.equal(report.partB.summary.passes, 2);
  assert.equal(report.partB.summary.problemsMissed, 1);
  assert.equal(report.partB.summary.problemsFlagged, 0);

  const c02 = report.partB.cases.find((c) => c.caseId === "case-02");
  assert.equal(c02.humanEvidence.hasMissingReferenceFact, true);
  assert.equal(c02.humanEvidence.humanHasQualityDefect, false);
  assert.equal(c02.comparisonOutcome, "pass");
});

test("analyzeScoring rejects tampered descriptions or reference facts in scoring-packet.md", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "a11ylens-tamper-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const sourceDir = join(base, "source");
  const scoringDir = join(base, "scoring");
  let clock = Date.parse("2026-11-01T12:00:00Z");

  for (const id of [
    "case-01",
    "case-02",
    "case-03",
    "case-04",
    "case-05",
    "case-06",
  ]) {
    for (const strategy of strategies) {
      await runEvaluation(
        {
          outputDir: sourceDir,
          experimentId: "synthetic-tamper",
          cases: [id],
          strategies: [strategy],
        },
        {
          env,
          now: () => clock,
          sleep: async (ms) => {
            clock += ms;
          },
          send: async () => {
            clock += 50;
            return {
              httpStatus: 200,
              retryAfter: null,
              response: selectProviderResponse({
                model: "gemini-3.5-flash-lite",
                choices: [
                  {
                    finish_reason: "stop",
                    message: {
                      content: JSON.stringify({
                        concern: true,
                        suggestion: "Authentic description.",
                      }),
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

  await exportScoring({
    sourceDir,
    frozenDir,
    outputDir: scoringDir,
    seed: 11,
  });

  const packetPath = join(scoringDir, "reviewer", "scoring-packet.md");
  const cleanFilled = fillPacketMarkdown(await readFile(packetPath, "utf8"));

  // 1. Tamper with a description inside scoring-packet.md
  await writeFile(
    packetPath,
    cleanFilled.replace("Authentic description.", "Tampered description."),
    "utf8",
  );
  await assert.rejects(
    () => analyzeScoring({ scoringDir, sourceDir, frozenDir }),
    ScoringAnalyzerError,
  );

  // 2. Tamper with a reference fact inside scoring-packet.md
  await writeFile(
    packetPath,
    cleanFilled.replace("| A line chart. |", "| An altered fact. |"),
    "utf8",
  );
  await assert.rejects(
    () => analyzeScoring({ scoringDir, sourceDir, frozenDir }),
    ScoringAnalyzerError,
  );
});

test("formatSummaryMarkdown marks unavailable token usage explicitly without inventing zeros", () => {
  const dummySlice = (tokStatus) => ({
    primary: {
      validResponseNumerator: 6,
      validResponseDenominator: 6,
      validResponseRate: 1,
      usableDescriptionNumerator: 6,
      usableDescriptionDenominator: 6,
      usableDescriptionRate: 1,
      requiredFactCoverage: 0.9,
      commonCaseFactCoverage: 0.9,
      totalFactsConveyed: 16,
      totalFactsRequired: 18,
      unsupportedOutputNumerator: 0,
      unsupportedOutputDenominator: 6,
      unsupportedOutputRate: 0,
      unsupportedClaimCount: 0,
      semanticDetection: {
        eligibleCases: 4,
        validDecisions: 4,
        tp: 0,
        tn: 0,
        fp: 2,
        fn: 2,
        precision: 0,
        recall: 0,
        f1: 0,
      },
      missingEmptyRemediation: { totalCases: 2, remediatedCount: 2 },
    },
    secondary: {
      avgSelectedSourceChars: 100,
      avgFormattedContextChars: 150,
      tokenUsage: {
        status: tokStatus,
        reportedJobs: tokStatus === "available" ? 6 : 0,
        avgPromptTokens: tokStatus === "available" ? 1000 : null,
        avgCompletionTokens: tokStatus === "available" ? 50 : null,
        avgTotalTokens: tokStatus === "available" ? 1050 : null,
      },
      avgTerminalLatencyMs: 1200,
      totalLatencyMs: 7200,
      totalRequestsSent: 6,
      firstAttemptSuccessCount: 6,
      eventualSuccessCount: 6,
      parseFailureCount: 0,
      constraintValidNumerator: 4,
      constraintValidDenominator: 4,
      constraintValidRate: 1,
    },
  });

  const md = formatSummaryMarkdown({
    sourceExperimentId: "test-exp",
    partA: {
      totalCases: 6,
      commonValidCaseCount: 6,
      byStrategy: {
        minimal: dummySlice("unavailable"),
        "fixed-window": dummySlice("available"),
        "structure-aware": dummySlice("available"),
        "largest-practical": dummySlice("available"),
      },
    },
    partB: null,
  });

  assert.match(md, /\| `minimal` \| 100 \| 150 \| unavailable \|/);
  assert.match(md, /\| `structure-aware` \| 100 \| 150 \| 1050 \|/);
  assert.match(md, /0\.00 \(0\.00 \/ 0\.00\)/);
});


test("parseScoringPacket rejects None mixed with an unsupported assertion in either order", () => {
  const assertion = '| "projected to double in Q6" | Q6 is not in the chart or context |';
  for (const rows of ["| None | |\n" + assertion, assertion + "\n| None | | "]) {
    assert.throws(
      () => parseScoringPacket(validPacketSample.replace("| None | |", rows)),
      /cannot mix None with quoted unsupported assertions/,
    );
  }
});
