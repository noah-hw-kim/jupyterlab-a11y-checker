import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IEvaluationCase } from "../types.js";
import { rawIpynbToGeneralCells } from "../parsers.js";
import { extractImageCandidates } from "../utils/image-utils.js";
import {
  selectFixedWindowContext,
  selectLargestPracticalContext,
  selectMinimalContext,
  selectStructureAwareContext,
} from "../utils/context-selection.js";

const root = fileURLToPath(
  new URL("../../../../test_files/benchmark/", import.meta.url),
);
const manifest = JSON.parse(
  readFileSync(resolve(root, "references/manifest.json"), "utf8"),
) as { schemaVersion: number; cases: IEvaluationCase[] };
const cases = manifest.cases;

describe("benchmark fixtures (offline, without model calls)", () => {
  it("meets the split, category, source, and context-sensitivity requirements", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(cases).toHaveLength(24);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(24);
    expect(cases.filter((entry) => entry.split === "development")).toHaveLength(
      6,
    );
    expect(cases.filter((entry) => entry.split === "held-out")).toHaveLength(
      18,
    );
    for (const category of ["missing-empty", "weak", "acceptable"]) {
      const group = cases.filter((entry) => entry.category === category);
      expect(group).toHaveLength(8);
      expect(
        group.filter((entry) => entry.sourceType === "code-output"),
      ).toHaveLength(4);
    }
    expect(
      cases.filter((entry) => entry.sourceType === "code-output"),
    ).toHaveLength(12);
    expect(
      cases.filter((entry) => entry.contextSensitive).length,
    ).toBeGreaterThanOrEqual(12);
  });

  it.each(cases)(
    "$id resolves to exactly its intended image and alt state",
    (entry) => {
      const notebookPath = resolve(root, entry.notebookPath);
      const notebook = JSON.parse(readFileSync(notebookPath, "utf8"));
      const cells = rawIpynbToGeneralCells(notebook);
      const candidates = extractImageCandidates(cells);
      expect(candidates).toHaveLength(1);
      const [candidate] = candidates;
      expect(candidate).toMatchObject({
        cellIndex: entry.cellIndex,
        sourceType: entry.sourceType,
        altState: entry.expectedAltState,
      });
      expect(candidate.existingAltText).toBe(entry.existingAltText);
      const bytes = readFileSync(resolve(root, entry.imagePath));
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

      if (entry.sourceType === "code-output") {
        expect(candidate.outputIndex).toBe(entry.outputIndex);
        expect(Buffer.from(candidate.src, "base64")).toEqual(bytes);
      } else {
        expect(resolve(dirname(notebookPath), candidate.src)).toBe(
          resolve(root, entry.imagePath),
        );
      }

      expect(entry.requiredFacts.length).toBeGreaterThanOrEqual(2);
      expect(entry.requiredFacts.length).toBeLessThanOrEqual(4);
      expect(entry.prohibitedClaims.length).toBeGreaterThan(0);
      expect(entry.shouldImprove).toBe(entry.category !== "acceptable");
      expect(
        entry.contextCellIndices.every(
          (index) => cells[index]?.type === "markdown",
        ),
      ).toBe(true);
      expect(cells.map((cell) => cell.source).join("\n")).not.toMatch(
        /shouldImprove|requiredFacts|prohibitedClaims|weak alt text|acceptable alt text|manual review|verification guide/i,
      );
      if (entry.category === "acceptable") {
        expect(
          entry.existingAltText!.trim().split(/\s+/u).length,
        ).toBeLessThanOrEqual(40);
      }
    },
  );

  it("supports all four selectors and keeps unrelated sections out of structure-aware context", () => {
    for (const entry of cases) {
      const notebook = JSON.parse(
        readFileSync(resolve(root, entry.notebookPath), "utf8"),
      );
      const cells = rawIpynbToGeneralCells(notebook);
      const [candidate] = extractImageCandidates(cells);
      for (const select of [
        selectMinimalContext,
        selectFixedWindowContext,
        selectLargestPracticalContext,
        selectStructureAwareContext,
      ]) {
        const context = select(candidate, cells, 128);
        expect(context.characterCount).toBeLessThanOrEqual(128);
        expect(
          context.cells.filter((cell) => cell.reason === "current-cell"),
        ).toHaveLength(1);
      }
      const context = selectStructureAwareContext(candidate, cells, 10_000);
      expect(context.cells.some((cell) => cell.cellIndex === 1)).toBe(true);
      expect(context.cells.some((cell) => cell.cellIndex >= 5)).toBe(false);
    }
  });

  it("matches the integrity snapshot without treating unreviewed annotations as frozen", () => {
    const freeze = JSON.parse(
      readFileSync(resolve(root, "references/freeze.json"), "utf8"),
    );
    expect(["pending-author-review", "frozen"]).toContain(freeze.status);
    expect(freeze.caseCount).toBe(24);
    const expectedPaths = [
      "references/manifest.json",
      ...cases.flatMap((entry) => [entry.notebookPath, entry.imagePath]),
    ].sort();
    expect(Object.keys(freeze.files).sort()).toEqual(expectedPaths);
    for (const [path, expectedHash] of Object.entries(freeze.files)) {
      const actualHash = createHash("sha256")
        .update(readFileSync(resolve(root, path)))
        .digest("hex");
      expect(actualHash, path).toBe(expectedHash);
    }
    if (freeze.status === "frozen") {
      expect(
        cases.every((entry) => entry.annotationStatus === "reviewed"),
      ).toBe(true);
    }
  });
});
