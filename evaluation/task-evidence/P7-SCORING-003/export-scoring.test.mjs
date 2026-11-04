import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exportScoring, packetMarkdown, ScoringExporterError } from "./export-scoring.mjs";

const fixtureRoot = new URL("./fixtures/", import.meta.url);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "scoring-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source");
  const frozen = join(root, "frozen");
  await cp(new URL("source/", fixtureRoot), source, { recursive: true });
  await cp(new URL("frozen/", fixtureRoot), frozen, { recursive: true });
  const attemptsPath = join(source, "attempts.jsonl");
  const records = (await readFile(attemptsPath, "utf8")).trim().split("\n").map(JSON.parse);
  const target = records.find((record) =>
    record.event === "attempt-finished" &&
    record.job.caseId === "case-02" &&
    record.job.strategy === "minimal" &&
    record.outcome === "succeeded"
  );
  const response = records.find((record) =>
    record.event === "response-received" && record.attemptId === target.attemptId
  );
  const noImprovement = JSON.stringify({ concern: false, suggestion: null });
  response.response.rawContent = noImprovement;
  target.parsed.value = { concern: false, suggestion: null };
  const unavailable = records.find((record) =>
    record.event === "attempt-finished" &&
    record.job.caseId === "case-06" &&
    record.job.strategy === "largest-practical" &&
    record.outcome === "succeeded"
  );
  unavailable.outcome = "model-output-error";
  unavailable.parsed = null;
  unavailable.error = {
    kind: "parse", httpStatus: 200, message: "fixture unavailable", retryable: false,
  };
  await writeFile(attemptsPath, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  return { root, source, frozen };
}

test("exports complete fixture with retry, exact text, empty route, and unavailable exclusion", async (t) => {
  const paths = await fixture(t);
  const output = join(paths.root, "out");
  const result = await exportScoring({ sourceDir: paths.source, frozenDir: paths.frozen, outputDir: output, seed: "42" });
  assert.equal(result.itemCount + result.unavailableCount, 24);
  const mapping = JSON.parse(await readFile(join(output, "private-mapping.json"), "utf8"));
  assert.equal(mapping.items.find((item) => item.caseId === "case-05" && item.strategy === "minimal").effectiveDescription, "Line chart showing quarterly revenue increasing steadily across five quarters.");
  assert.equal(mapping.items.find((item) => item.caseId === "case-02" && item.strategy === "minimal").effectiveDescription, "");
  assert.equal(result.unavailableCount, 1);
  assert.equal((await stat(join(output, "COMPLETE"))).isFile(), true);
});

test("rejects incomplete/corrupt source and preserves source bytes", async (t) => {
  const paths = await fixture(t);
  const before = await readFile(join(paths.source, "attempts.jsonl"));
  await assert.rejects(() => exportScoring({ sourceDir: paths.source, frozenDir: paths.frozen, outputDir: join(paths.root, "bad"), seed: "1.2" }), ScoringExporterError);
  await writeFile(join(paths.source, "attempts.jsonl"), Buffer.concat([before, Buffer.from("{")]));
  await assert.rejects(() => exportScoring({ sourceDir: paths.source, frozenDir: paths.frozen, outputDir: join(paths.root, "bad2") }), /Invalid source JSONL/);
  assert.deepEqual(await readFile(join(paths.source, "experiment.json")), await readFile(new URL("source/experiment.json", fixtureRoot)));
});

test("renders supplied text as literal fenced content and escaped cells", () => {
  const markdown = packetMarkdown([{ scoringId: "ITEM-01", assetPath: "assets/ITEM-01.png", context: "# heading\n<b>HTML</b>\n| pipe |", description: "text\n# not a heading\n`code`", requiredFacts: ["fact | pipe"] }]);
  assert.match(markdown, /```text\n# heading\n<b>HTML<\/b>\n\| pipe \|\n```/);
  assert.match(markdown, /```text\ntext\n# not a heading\n`code`\n```/);
  assert.match(markdown, /\| fact \\| pipe \| \| \|/);
});

test("uses deterministic opaque assets, stable IDs, and protects existing output", async (t) => {
  const paths = await fixture(t);
  const first = await exportScoring({ sourceDir: paths.source, frozenDir: paths.frozen, outputDir: join(paths.root, "one"), seed: 7 });
  const second = await exportScoring({ sourceDir: paths.source, frozenDir: paths.frozen, outputDir: join(paths.root, "two"), seed: 7 });
  assert.equal(await readFile(join(first.output, "reviewer/scoring-packet.md"), "utf8"), await readFile(join(second.output, "reviewer/scoring-packet.md"), "utf8"));
  assert.equal((await stat(join(first.output, "reviewer/assets/ITEM-01.png"))).isFile(), true);
  await assert.rejects(() => exportScoring({ sourceDir: paths.source, frozenDir: paths.frozen, outputDir: first.output, seed: 7 }), /nonempty/);
  for (const bad of ["-1", "1.2", "NaN", "4294967296"]) await assert.rejects(() => exportScoring({ sourceDir: paths.source, frozenDir: paths.frozen, outputDir: join(paths.root, `bad-${bad}`), seed: bad }), /unsigned 32-bit/);
});
