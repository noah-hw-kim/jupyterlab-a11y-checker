import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  readdir,
  stat,
  symlink,
  cp,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { marked } from "marked";
import { exportScoring, packetMarkdown } from "../export-scoring.mjs";
import { runEvaluation, selectProviderResponse } from "../runner.mjs";

const frozenDir = resolve("test_files/benchmark");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
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
async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), "a11ylens-scoring-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const sourceDir = join(base, "source");
  let clock = Date.parse("2026-11-01T12:00:00Z");
  // Explicit per-case/strategy generation gives complete valid history without
  // guessing case IDs from prompt text or copying private live-run artifacts.
  for (const id of [
    "case-01",
    "case-02",
    "case-03",
    "case-04",
    "case-05",
    "case-06",
  ]) {
    for (const strategy of strategies) {
      const retryCase = id === "case-02" && strategy === "fixed-window";
      let attempts = 0;
      const deps = {
        env,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
        send: async () => {
          clock += 100;
          attempts++;
          const result =
            id === "case-05" ||
            id === "case-06" ||
            (id === "case-02" && strategy === "minimal")
              ? { concern: false, suggestion: null }
              : { concern: true, suggestion: "Exact synthetic replacement." };
          const unavailable =
            id === "case-06" && strategy === "largest-practical";
          return {
            httpStatus: retryCase && attempts === 1 ? 503 : 200,
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
      const options = {
        outputDir: sourceDir,
        experimentId: "synthetic-scoring",
        cases: [id],
        strategies: [strategy],
      };
      await runEvaluation(options, deps);
      if (retryCase) await runEvaluation(options, deps);
    }
  }
  const bound = await Promise.all(
    [
      "experiment.json",
      "attempts.jsonl",
      "prompts/generation.json",
      "prompts/validation.json",
    ].map(async (path) => [path, hash(await readFile(join(sourceDir, path)))]),
  );
  return {
    base,
    sourceDir,
    outputDir: join(base, "packet"),
    assertPreserved: async () => {
      for (const [path, expected] of bound)
        assert.equal(hash(await readFile(join(sourceDir, path))), expected);
    },
  };
}
const options = (f, extra = {}) => ({
  sourceDir: f.sourceDir,
  frozenDir,
  outputDir: f.outputDir,
  seed: 42,
  ...extra,
});
async function events(f) {
  return (await readFile(join(f.sourceDir, "attempts.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
}

test("exports exact replacement/retained/empty descriptions and excludes unavailable content", async (t) => {
  const f = await fixture(t);
  const result = await exportScoring(options(f));
  assert.equal(result.itemCount, 23);
  assert.equal(result.unavailableCount, 1);
  assert.ok((await stat(join(f.outputDir, "COMPLETE"))).isFile());
  const map = JSON.parse(
    await readFile(join(f.outputDir, "private-mapping.json"), "utf8"),
  );
  const find = (id, strategy = "minimal") =>
    map.items.find((i) => i.caseId === id && i.strategy === strategy);
  assert.equal(
    find("case-01").effectiveDescription,
    "Exact synthetic replacement.",
  );
  assert.equal(
    find("case-05").effectiveDescription,
    "Line chart showing quarterly revenue increasing steadily across five quarters.",
  );
  assert.equal(find("case-05").effectiveSource, "retained-existing-alt");
  assert.equal(find("case-02").effectiveDescription, "");
  assert.equal(find("case-02").effectiveSource, "missed-improvement-empty");
  const unavailable = find("case-06", "largest-practical");
  assert.equal(unavailable.availability, "unavailable");
  const packet = await readFile(
    join(f.outputDir, "reviewer/scoring-packet.md"),
    "utf8",
  );
  assert.ok(!packet.includes(`Review Item: ${unavailable.scoringId}`));
  assert.equal(map.items.length, 24);
  assert.equal(find("case-02", "fixed-window").availability, "available");
  assert.equal(
    map.sourceSnapshotSha256,
    hash(await readFile(join(f.sourceDir, "experiment.json"))),
  );
  await f.assertPreserved();
});

test("rejects incomplete source states, raw/parsed corruption and incomplete JSONL", async (t) => {
  const f = await fixture(t);
  const path = join(f.sourceDir, "attempts.jsonl");
  const original = await readFile(path, "utf8");
  const data = await events(f);
  await writeFile(
    path,
    data
      .filter(
        (e) => !(e.job.caseId === "case-03" && e.job.strategy === "minimal"),
      )
      .map(JSON.stringify)
      .join("\n") + "\n",
  );
  await assert.rejects(exportScoring(options(f)), /incomplete/);
  await writeFile(path, original.trimEnd());
  await assert.rejects(exportScoring(options(f)), /incomplete final line/);
  const finish = data.find(
    (e) =>
      e.event === "attempt-finished" &&
      e.outcome === "succeeded" &&
      e.parsed?.value?.concern,
  );
  finish.parsed.value.suggestion = "Not the raw model output.";
  await writeFile(path, data.map(JSON.stringify).join("\n") + "\n");
  await assert.rejects(exportScoring(options(f)), /event validation/);
  await assert.rejects(stat(f.outputDir), { code: "ENOENT" });
});

test("verifies snapshot fingerprint and frozen manifest bytes", async (t) => {
  const f = await fixture(t);
  const path = join(f.sourceDir, "experiment.json"),
    original = await readFile(path, "utf8");
  const snapshot = JSON.parse(original);
  snapshot.codeSnapshotSha256 = "0".repeat(64);
  await writeFile(path, JSON.stringify(snapshot));
  await assert.rejects(exportScoring(options(f)), /fingerprint/);
  await writeFile(path, original);
  const copy = join(f.base, "frozen");
  await cp(frozenDir, copy, { recursive: true });
  const manifestPath = join(copy, "references/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.cases[0].requiredFacts[0] = "Altered rubric";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(
    exportScoring(options(f, { frozenDir: copy })),
    /hash mismatch/,
  );
  await f.assertPreserved();
});

test("renders descriptions literally and escapes fact-table markup", () => {
  const text =
    "# Heading\n<b>HTML</b>\n```\n| pipe |\nminimal is a legitimate description word";
  const markdown = packetMarkdown([
    {
      scoringId: "ITEM-01",
      assetPath: "assets/ITEM-01.png",
      context: text,
      description: text,
      requiredFacts: ["Fact | column <b>HTML</b> *bold*\nnext"],
    },
  ]);
  const html = marked.parse(markdown);
  assert.ok(!html.includes("<h1>Heading</h1>"));
  assert.ok(!html.includes("<b>HTML</b>"));
  assert.ok(!html.includes("<strong>bold</strong>"));
  assert.ok(html.includes("&lt;b&gt;HTML&lt;/b&gt;"));
  assert.ok(markdown.includes(text));
  const table = marked.lexer(markdown).find((token) => token.type === "table");
  assert.equal(table.rows[0].length, 3);
});

test("creates deterministic opaque assets and preserves existing reviews", async (t) => {
  const f = await fixture(t);
  await exportScoring(options(f));
  const second = join(f.base, "second");
  await exportScoring(options(f, { outputDir: second }));
  const packet = await readFile(
    join(f.outputDir, "reviewer/scoring-packet.md"),
    "utf8",
  );
  assert.equal(
    packet,
    await readFile(join(second, "reviewer/scoring-packet.md"), "utf8"),
  );
  const assets = await readdir(join(f.outputDir, "reviewer/assets"));
  assert.equal(assets.length, 23);
  assert.ok(assets.every((p) => /^ITEM-\d+\.png$/.test(p)));
  assert.ok(!packet.includes("private-mapping"));
  const map = JSON.parse(
    await readFile(join(f.outputDir, "private-mapping.json"), "utf8"),
  );
  for (const item of map.items.filter((x) => x.availability === "available")) {
    const manifest = JSON.parse(
      await readFile(join(frozenDir, "references/manifest.json"), "utf8"),
    );
    const entry = manifest.cases.find((c) => c.id === item.caseId);
    assert.deepEqual(
      await readFile(
        join(f.outputDir, "reviewer/assets", item.scoringId + ".png"),
      ),
      await readFile(join(frozenDir, entry.imagePath)),
    );
  }
  const before = hash(
    await readFile(join(f.outputDir, "private-mapping.json")),
  );
  await assert.rejects(exportScoring(options(f)), /already exists/);
  assert.equal(
    hash(await readFile(join(f.outputDir, "private-mapping.json"))),
    before,
  );
  await f.assertPreserved();
});

test("rejects malformed seeds and protected/symlinked output paths", async (t) => {
  const f = await fixture(t);
  for (const seed of ["-1", "1.2", "NaN", "4294967296", "1x", NaN, -1, 1.1])
    await assert.rejects(
      exportScoring(options(f, { seed })),
      /unsigned 32-bit/,
    );
  await assert.rejects(
    exportScoring(options(f, { outputDir: f.sourceDir })),
    /overlap/,
  );
  await assert.rejects(
    exportScoring(options(f, { outputDir: f.base })),
    /overlap/,
  );
  const alias = join(f.base, "source-alias");
  await symlink(f.sourceDir, alias, "dir");
  await assert.rejects(
    exportScoring(options(f, { outputDir: join(alias, "not-created/packet") })),
    /overlap|protected/,
  );
  const frozenAlias = join(f.base, "frozen-alias");
  await symlink(frozenDir, frozenAlias, "dir");
  await assert.rejects(
    exportScoring(
      options(f, { outputDir: join(frozenAlias, "not-created/packet") }),
    ),
    /overlap|protected/,
  );
  await f.assertPreserved();
});
