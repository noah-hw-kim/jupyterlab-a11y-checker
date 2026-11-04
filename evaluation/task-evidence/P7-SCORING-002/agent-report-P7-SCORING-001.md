# Agent report

Task ID: `P7-SCORING-001`

Status: Proposal completed. Stopped for review before implementation.

---

## 1. Executive Summary & Learning Purpose

Task `P7-SCORING-001` designs a minimal, offline scoring exporter CLI (`evaluation/export-scoring.mjs`) to generate blinded human-evaluation packets and private unblinding keys from saved Part A generation experiments.

### High Learning Importance:

- **Blinded Experimental Methodology:** Understanding how cognitive biases (e.g. confirmation bias for our own _Structure-aware_ strategy or anchoring on model names) undermine evaluation validity, and how to construct rigorous double-blind evaluation protocols in software engineering.
- **Strict Data Boundary Separation:** Cryptographically decoupling the public evaluation materials (which rater eyes inspect) from private lineage keys (`mapping.json`), ensuring zero metadata leakage (no strategy names, cell indices, attempt IDs, tokens, latencies, or automated validator judgments).
- **Measurement Mapping Contracts:** Accurately translating complex multi-state machine execution outcomes into deterministic human-evaluation inputs:
  - `concern: true` $\rightarrow$ evaluate proposed replacement alt text.
  - `concern: false` with existing alt $\rightarrow$ evaluate original existing alt text.
  - `concern: false` with missing/empty alt $\rightarrow$ empty description `""` (strictly 0% fact coverage, penalizing missed improvements).
  - `outcome !== "succeeded"` $\rightarrow$ explicit `N/A` (never fabricated as hallucination-free or zero-coverage text).
- **Hermetic CLI Architecture:** Writing a standalone Node script with zero external dependencies, zero live network calls, zero mutations to source experiments, and 100% deterministic reproducibility via seeded pseudo-random shuffling.

---

## 2. Review of Handoff Context & Blinding Caveats

Per [`docs/evaluation-protocol.md`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/docs/evaluation-protocol.md) and [`evaluation/agent-handoff.md`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/evaluation/agent-handoff.md):

1. **Validator Judgments Kept Out of Primary Scoring:**
   - Part B automated quality checks were implemented and verified offline in `P7-VALIDATION-004`.
   - However, **no live validator calls have been run, and no validator judgments are exposed to human scoring**. The human rater is the primary ground-truth measurement; automated validation is a secondary screening comparison.
2. **Honesty About Development Blinding Limitations:**
   - The primary rater (the project author) has already designed and reviewed the 6 development cases during benchmark construction and prompt tuning.
   - Repeated figures (e.g., the quarterly revenue chart in Cases 01, 02, 03, and 05) and distinctive model phrasing create natural recognition cues.
   - We must honestly disclose this in our evaluation report as a single-rater exploratory study limitation. Blinded shuffling eliminates immediate cognitive bias between conditions, but cannot claim perfect clinical blinding on familiar development cases. Held-out cases (Cases 07–24) remain completely ungenerated and uninspected.
3. **Repeated Strategy Outputs:**
   - Multiple strategies may produce identical suggestions (e.g., _Fixed-window_ and _Largest-practical_ on Case 05).
   - In accordance with the protocol, repeated outputs are **kept as separate scored items** rather than deduplicated, preserving statistical balance and acknowledging rater dependence.

---

## 3. Data Architecture & Exporter Contracts

### 3.1 Input Contracts

The exporter takes three validated inputs:

1. **Source Generation Experiment:** Path to `<sourceDir>` (e.g. `evaluation/runs/dev-gemini35-v2`).
   - Must contain valid `experiment.json` and `attempts.jsonl`.
   - Verified via `planEvaluationResume` to ensure start/finish event validity and raw/parsed agreement.
2. **Frozen Benchmark References:** `test_files/benchmark/references/manifest.json` and `freeze.json`.
   - Verified against `benchmarkFreezeSha256` recorded in the source snapshot.
3. **Shuffling Seed:** Deterministic integer seed (defaults to the source experiment's `orderSeed` or CLI `--seed`).

### 3.2 Effective Description Selection Rules

| Generation Result (`attempts.jsonl`)        | Case State (`manifest.json`)               | Effective Description to Score         | Classification in Mapping  |
| :------------------------------------------ | :----------------------------------------- | :------------------------------------- | :------------------------- |
| `concern: true`, valid `suggestion`         | Any                                        | Exact `finish.parsed.value.suggestion` | `proposed-replacement`     |
| `concern: false`                            | `expectedAltState: "present"`, nonempty    | Exact `case.existingAltText`           | `retained-existing-alt`    |
| `concern: false`                            | `expectedAltState: "missing"` or `"empty"` | `""` (Empty string; conveys 0 facts)   | `missed-improvement-empty` |
| `outcome !== "succeeded"` (exhausted/error) | Any                                        | `"N/A (Job unavailable)"`              | `unavailable-error`        |

### 3.3 Output Files

The exporter creates an isolated output directory (e.g., `evaluation/scoring/dev-gemini35-v2/`):

1. **`scoring-packet.md` (Public Reviewer Packet):**
   - Follows [`docs/evaluation-scoring-template.md`](file:///home/orrijoa61b/projects/jupyterlab-a11y-checker/docs/evaluation-scoring-template.md).
   - Contains 24 items shuffled deterministically with opaque IDs (`ITEM-01` to `ITEM-24`).
   - Contains: inline image link, approved context (`evidence.context`), required facts, and the effective description.
   - **Zero Leaked Metadata:** No strategy names (`minimal`, `structure-aware`, etc.), no cell indices, no token counts, no latency numbers, no model IDs, and no validator checks.
2. **`mapping.json` (Private Key):**
   - Stores the exact cryptographic binding:
     - `scoringId` $\rightarrow$ `{ caseId, strategy, sourceAttemptId, effectiveSource, shouldImprove }`.
     - Source experiment ID, source snapshot hash, and source attempts log SHA-256.
   - Kept strictly separate from the scoring packet and consulted only after human scoring is finalized.

---

## 4. Concrete Sample Review Item & Mapping Entry

### Sample Entry in `scoring-packet.md` (Item 07)

```markdown
## Review Item: ITEM-07

![Chart Asset](../../test_files/benchmark/assets/case-05.png)

> **Approved Context:** "The chart shows quarterly revenue in thousands of dollars across five consecutive quarters."

> **Description to Score:**
> "Quarterly revenue line chart."

### Required Facts

| Fact                                                | Conveyed? (Yes / No / Unsure) | Exact Supporting Words or Explanation |
| :-------------------------------------------------- | :---------------------------- | :------------------------------------ |
| **Fact 1:** A line chart.                           |                               |                                       |
| **Fact 2:** Quarterly revenue.                      |                               |                                       |
| **Fact 3:** Revenue increases across five quarters. |                               |                                       |

### Unsupported Factual Assertions

| Quoted Assertion | Evidence Showing It Is Unsupported / Incorrect |
| :--------------- | :--------------------------------------------- |
| _(None)_         |                                                |

### Other Defects for Validation Analysis

| Defect                                            | Present? (Yes / No / Unsure) | Evidence |
| :------------------------------------------------ | :--------------------------- | :------- |
| Visual claim conflicts with the image             |                              |          |
| Description contradicts approved notebook context |                              |          |
| Important image content is missing                |                              |          |
| Wording is unnecessarily repetitive or irrelevant |                              |          |

### Item Finalization

- **Uncertainties and Resolution:** None
- **Reviewer ID:** reviewer-author
- **Date Finalized:**
- **All Unsure Entries Resolved:** Yes / No

---
```

### Corresponding Entry in `mapping.json`

```json
{
  "scoringId": "ITEM-07",
  "caseId": "case-05",
  "strategy": "minimal",
  "sourceAttemptId": "50ae0c0e-aaa0-4cc8-89b4-b04446efcfd9",
  "effectiveDescription": "Quarterly revenue line chart.",
  "effectiveSource": "retained-existing-alt",
  "modelConcern": false,
  "shouldImprove": false,
  "category": "acceptable"
}
```

---

## 5. Concrete Proposed Implementation Diff (`evaluation/export-scoring.mjs`)

```javascript
#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import {
  openSync,
  closeSync,
  fsyncSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseEvaluationConfig,
  planEvaluationResume,
} from "@berkeley-dsep-infra/a11y-checker-core";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export class ScoringExporterError extends Error {}
const fail = (msg) => {
  throw new ScoringExporterError(msg);
};
const sha = (val) => createHash("sha256").update(val).digest("hex");
const key = (job) => JSON.stringify([job.caseId, job.strategy, job.stage]);
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fail(`Cannot read valid JSON from ${path}`);
  }
};

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

export function shuffle(items, seed) {
  let state = seed >>> 0;
  const result = [...items];
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

export function buildScoringPacketMarkdown(items, root, outDir) {
  let md = `# Blinded Human Scoring Packet\n\n`;
  md += `**Protocol Reference:** \`docs/evaluation-protocol.md\`\n`;
  md += `**Template Reference:** \`docs/evaluation-scoring-template.md\`\n\n`;
  md += `### Instructions for Reviewer:\n`;
  md += `1. Review each item below in sequence.\n`;
  md += `2. For each required fact, mark Yes / No / Unsure in the table and cite exact words.\n`;
  md += `3. List any distinct unsupported claims found in the text.\n`;
  md += `4. Check for other concrete quality defects.\n`;
  md += `5. Resolve all Unsure entries before unblinding.\n\n`;
  md += `---\n\n`;

  for (const item of items) {
    const relImagePath = relative(
      outDir,
      resolve(root, "test_files/benchmark", item.imagePath),
    );
    md += `## Review Item: ${item.scoringId}\n\n`;
    md += `![Chart Asset](${relImagePath})\n\n`;
    md += `> **Approved Context:** "${item.approvedContext}"\n\n`;
    md += `> **Description to Score:**\n`;
    if (item.effectiveDescription === "") {
      md += `> *(Empty description - no text provided)*\n\n`;
    } else {
      md += `> "${item.effectiveDescription}"\n\n`;
    }

    md += `### Required Facts\n\n`;
    md += `| Fact | Conveyed? (Yes / No / Unsure) | Exact Supporting Words or Explanation |\n`;
    md += `| :--- | :--- | :--- |\n`;
    for (let f = 0; f < item.requiredFacts.length; f++) {
      md += `| **Fact ${f + 1}:** ${item.requiredFacts[f]} | | |\n`;
    }
    md += `\n`;

    md += `### Unsupported Factual Assertions\n\n`;
    md += `| Quoted Assertion | Evidence Showing It Is Unsupported / Incorrect |\n`;
    md += `| :--- | :--- |\n`;
    md += `| *(None)* | |\n\n`;

    md += `### Other Defects for Validation Analysis\n\n`;
    md += `| Defect | Present? (Yes / No / Unsure) | Evidence |\n`;
    md += `| :--- | :--- | :--- |\n`;
    md += `| Visual claim conflicts with the image | | |\n`;
    md += `| Description contradicts approved notebook context | | |\n`;
    md += `| Important image content is missing | | |\n`;
    md += `| Wording is unnecessarily repetitive or irrelevant | | |\n\n`;

    md += `### Item Finalization\n`;
    md += `- **Uncertainties and Resolution:** None\n`;
    md += `- **Reviewer ID:** \n`;
    md += `- **Date Finalized:** \n`;
    md += `- **All Unsure Entries Resolved:** Yes / No\n\n`;
    md += `---\n\n`;
  }
  return md;
}

export async function exportScoring(options = {}) {
  const root = resolve(options.root ?? ROOT);
  const sourceId = options.sourceId ?? options.source;
  if (!sourceId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sourceId)) {
    fail("Provide a valid source generation experiment ID.");
  }
  const sourceDir = resolve(root, "evaluation/runs", sourceId);
  if (!existsSync(sourceDir)) {
    fail(`Source experiment directory does not exist: ${sourceDir}`);
  }

  const sourceSnapshotPath = join(sourceDir, "experiment.json");
  const sourceAttemptsPath = join(sourceDir, "attempts.jsonl");
  if (!existsSync(sourceSnapshotPath) || !existsSync(sourceAttemptsPath)) {
    fail("Source experiment is missing experiment.json or attempts.jsonl.");
  }
  const sourceSnapshot = readJson(sourceSnapshotPath);
  const sourceConfig = parseEvaluationConfig(sourceSnapshot.config);

  const benchmarkDir = resolve(root, "test_files/benchmark");
  const freezePath = join(benchmarkDir, "references/freeze.json");
  const manifestPath = join(benchmarkDir, "references/manifest.json");
  const freeze = readJson(freezePath);
  const manifest = readJson(manifestPath);

  if (sourceSnapshot.benchmarkFreezeSha256 !== sha(readFileSync(freezePath))) {
    fail("Source benchmark freeze hash does not match current benchmark.");
  }

  const rawRecords = readFileSync(sourceAttemptsPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const sourcePlan = planEvaluationResume(
    {
      experimentId: sourceSnapshot.experimentId,
      fingerprint: sourceSnapshot.fingerprint,
      config: sourceConfig,
      jobs: sourceSnapshot.generationJobs,
    },
    sourceConfig,
    rawRecords,
    Date.now(),
  );

  const cases = manifest.cases.filter((c) => c.split === sourceConfig.split);
  const rawItems = [];

  for (const job of sourceSnapshot.generationJobs) {
    const caseEntry = cases.find((c) => c.id === job.caseId);
    if (!caseEntry) fail(`Case ${job.caseId} not found in manifest.`);

    const planned = sourcePlan.jobs.find((j) => key(j.job) === key(job));
    const finishes = rawRecords.filter(
      (e) => e.event === "attempt-finished" && key(e.job) === key(job),
    );
    const lastFinish = finishes.at(-1);

    let effectiveDescription = "";
    let effectiveSource = "unknown";
    let modelConcern = null;

    if (!planned || planned.status !== "succeeded" || !lastFinish) {
      effectiveDescription = "N/A (Job unavailable)";
      effectiveSource = "unavailable-error";
    } else {
      const parsed = lastFinish.parsed?.value;
      modelConcern = parsed?.concern ?? null;
      if (parsed?.concern === true) {
        effectiveDescription = parsed.suggestion ?? "";
        effectiveSource = "proposed-replacement";
      } else {
        if (
          caseEntry.expectedAltState === "missing" ||
          caseEntry.expectedAltState === "empty" ||
          !caseEntry.existingAltText
        ) {
          effectiveDescription = "";
          effectiveSource = "missed-improvement-empty";
        } else {
          effectiveDescription = caseEntry.existingAltText;
          effectiveSource = "retained-existing-alt";
        }
      }
    }

    rawItems.push({
      caseId: job.caseId,
      strategy: job.strategy,
      sourceAttemptId: lastFinish?.attemptId ?? null,
      imagePath: caseEntry.imagePath,
      approvedContext: caseEntry.evidence?.context ?? "",
      requiredFacts: caseEntry.requiredFacts ?? [],
      effectiveDescription,
      effectiveSource,
      modelConcern,
      shouldImprove: caseEntry.shouldImprove,
      category: caseEntry.category,
    });
  }

  const seed = options.seed ?? sourceConfig.orderSeed ?? 20261028;
  const shuffled = shuffle(rawItems, seed);

  const packetItems = [];
  const mappingItems = [];

  for (let idx = 0; idx < shuffled.length; idx++) {
    const item = shuffled[idx];
    const scoringId = `ITEM-${String(idx + 1).padStart(2, "0")}`;

    packetItems.push({
      scoringId,
      imagePath: item.imagePath,
      approvedContext: item.approvedContext,
      requiredFacts: item.requiredFacts,
      effectiveDescription: item.effectiveDescription,
    });

    mappingItems.push({
      scoringId,
      caseId: item.caseId,
      strategy: item.strategy,
      sourceAttemptId: item.sourceAttemptId,
      effectiveDescription: item.effectiveDescription,
      effectiveSource: item.effectiveSource,
      modelConcern: item.modelConcern,
      shouldImprove: item.shouldImprove,
      category: item.category,
    });
  }

  const outDir = resolve(
    options.outputDir ?? join(root, "evaluation/scoring", sourceId),
  );

  if (options.dryRun) {
    return {
      dryRun: true,
      sourceExperimentId: sourceSnapshot.experimentId,
      itemCount: packetItems.length,
      sampleItem: packetItems[0],
      outDir,
    };
  }

  if (outDir === sourceDir || outDir.startsWith(sourceDir + sep)) {
    fail("Output directory must not overlap with source experiment directory.");
  }
  if (outDir === benchmarkDir || outDir.startsWith(benchmarkDir + sep)) {
    fail("Output directory must not overlap with benchmark directory.");
  }

  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const packetPath = join(outDir, "scoring-packet.md");
  const mappingPath = join(outDir, "mapping.json");

  if (existsSync(packetPath) || existsSync(mappingPath)) {
    fail("Scoring packet or mapping already exists in output directory.");
  }

  const markdownContent = buildScoringPacketMarkdown(packetItems, root, outDir);
  durableNew(packetPath, markdownContent);

  const mappingContent =
    JSON.stringify(
      {
        schemaVersion: 1,
        sourceExperimentId: sourceSnapshot.experimentId,
        sourceFingerprint: sourceSnapshot.fingerprint,
        sourceAttemptsSha256: sha(readFileSync(sourceAttemptsPath)),
        seed,
        createdAt: new Date().toISOString(),
        items: mappingItems,
      },
      null,
      2,
    ) + "\n";
  durableNew(mappingPath, mappingContent);
  syncDirectory(outDir);

  return {
    dryRun: false,
    sourceExperimentId: sourceSnapshot.experimentId,
    itemCount: packetItems.length,
    packetPath,
    mappingPath,
  };
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      strict: true,
      options: {
        source: { type: "string" },
        output: { type: "string" },
        seed: { type: "string" },
        "dry-run": { type: "boolean", default: false },
      },
    }));
  } catch {
    throw new ScoringExporterError(
      "Invalid arguments. Use --source, --output, --seed, and/or --dry-run.",
    );
  }
  const result = await exportScoring({
    sourceId: values.source,
    outputDir: values.output,
    seed: values.seed ? parseInt(values.seed, 10) : undefined,
    dryRun: values["dry-run"],
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof ScoringExporterError ? err.message : err);
    process.exitCode = 1;
  });
}
```

---

## 6. Concrete Proposed Test Diff (`evaluation/__tests__/export-scoring.test.mjs`)

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportScoring, shuffle } from "../export-scoring.mjs";
import { runEvaluation, selectProviderResponse } from "../runner.mjs";

const env = {
  A11YLENS_MODEL_ENDPOINT: "https://example.test/v1/chat/completions",
  A11YLENS_API_KEY: "offline-test-key",
};

function setupSyntheticSource(baseDir) {
  const sourceDir = join(baseDir, "dev-source");
  let clock = Date.parse("2026-10-29T12:00:00.000Z");
  return runEvaluation(
    {
      outputDir: sourceDir,
      experimentId: "dev-synth",
      cases: ["case-01", "case-05"],
      strategies: ["minimal", "structure-aware"],
    },
    {
      env,
      now: () => clock,
      sleep: async () => {},
      send: async (args) => {
        clock += 100;
        const isCase05 = JSON.stringify(args.body).includes("case-05");
        const res = isCase05
          ? { concern: false, suggestion: null }
          : { concern: true, suggestion: "Synthetic replacement alt text." };
        return {
          httpStatus: 200,
          retryAfter: null,
          response: selectProviderResponse({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(res) },
              },
            ],
            model: "gemini-3.5-flash-lite",
            id: "source-res",
          }),
        };
      },
    },
  ).then(() => sourceDir);
}

test("exporter dry run does not write files and returns sample item", async (t) => {
  const baseDir = mkdtempSync(join(tmpdir(), "export-scoring-"));
  t.after(() => rmSync(baseDir, { recursive: true, force: true }));
  const sourceDir = await setupSyntheticSource(baseDir);
  const outDir = join(baseDir, "scoring-out");

  const res = await exportScoring({
    sourceId: "dev-synth",
    root: undefined,
    outputDir: outDir,
    dryRun: true,
  });

  assert.equal(res.dryRun, true);
  assert.equal(res.itemCount, 4);
  assert.ok(res.sampleItem.scoringId.startsWith("ITEM-"));
});

test("effective description correctly maps replacement vs retained existing alt", async (t) => {
  const baseDir = mkdtempSync(join(tmpdir(), "export-scoring-"));
  t.after(() => rmSync(baseDir, { recursive: true, force: true }));
  const sourceDir = await setupSyntheticSource(baseDir);
  const outDir = join(baseDir, "scoring-out");

  const res = await exportScoring({
    sourceId: "dev-synth",
    outputDir: outDir,
    seed: 42,
  });

  const mapping = JSON.parse(readFileSync(res.mappingPath, "utf8"));
  const case01Item = mapping.items.find((i) => i.caseId === "case-01");
  const case05Item = mapping.items.find((i) => i.caseId === "case-05");

  assert.equal(
    case01Item.effectiveDescription,
    "Synthetic replacement alt text.",
  );
  assert.equal(case01Item.effectiveSource, "proposed-replacement");

  assert.equal(
    case05Item.effectiveDescription,
    "Quarterly revenue line chart.",
  );
  assert.equal(case05Item.effectiveSource, "retained-existing-alt");
});

test("scoring packet strictly leaks no strategy or provider metadata", async (t) => {
  const baseDir = mkdtempSync(join(tmpdir(), "export-scoring-"));
  t.after(() => rmSync(baseDir, { recursive: true, force: true }));
  const sourceDir = await setupSyntheticSource(baseDir);
  const outDir = join(baseDir, "scoring-out");

  const res = await exportScoring({
    sourceId: "dev-synth",
    outputDir: outDir,
  });

  const packetMd = readFileSync(res.packetPath, "utf8");
  for (const forbidden of [
    "minimal",
    "structure-aware",
    "fixed-window",
    "largest-practical",
    "gemini",
    "tokens",
    "latency",
    "attemptId",
  ]) {
    assert.ok(
      !packetMd.includes(forbidden),
      `Packet must not leak '${forbidden}'`,
    );
  }
});

test("shuffling is deterministic for a given seed and repeatable", async () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const shuffled1 = shuffle(items, 12345);
  const shuffled2 = shuffle(items, 12345);
  assert.deepEqual(shuffled1, shuffled2);
});
```

---

## 7. Verification & Offline Command Plan

Once implemented, the workflow will be verified using these offline commands:

1. **Unit Tests:**
   ```bash
   node --test evaluation/__tests__/export-scoring.test.mjs
   ```
2. **Dry Run on Live `dev-gemini35-v2` Data:**
   ```bash
   node evaluation/export-scoring.mjs --source dev-gemini35-v2 --dry-run
   ```
   - Confirms that all 24 development jobs are planned, exactly 18 have replacement suggestions, and 6 have retained existing alts.
3. **Packet Generation:**
   ```bash
   node evaluation/export-scoring.mjs --source dev-gemini35-v2 --output evaluation/scoring/dev-gemini35-v2
   ```
   - Generates `scoring-packet.md` and `mapping.json`.

---

## 8. Unresolved Questions & Assumptions

1. **Inline Image Rendering in Markdown:** In VS Code and JupyterLab markdown viewers, relative paths (`../../test_files/benchmark/assets/case-01.png`) render the chart image directly above the scoring table.
2. **Reviewer Workflow:** Scoring can be done directly by typing `Yes` / `No` in the markdown table in the IDE.
3. **Ready for Review:** Antigravity has stopped turns. No production code has been modified.
