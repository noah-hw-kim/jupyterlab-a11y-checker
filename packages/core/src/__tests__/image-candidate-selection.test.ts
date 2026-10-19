import { describe, it, expect } from "vitest";
import type { ICellIssue, IGeneralCell } from "../types.js";
import { extractImageCandidates } from "../utils/image-utils.js";
import {
  findImageCandidateForIssue,
  findCurrentCodeOutputCandidate,
} from "../utils/image-candidate-selection.js";

describe("findImageCandidateForIssue", () => {
  it("selects the second image in a Markdown cell", () => {
    const cell: IGeneralCell = {
      cellIndex: 0,
      type: "markdown",
      source: "![](first.png)\n\n![](second.png)",
    };
    const candidates = extractImageCandidates([cell]);
    const targetMarkup = "![](second.png)";
    const start = cell.source.indexOf(targetMarkup);
    const end = start + targetMarkup.length;

    const issue: ICellIssue = {
      cellIndex: 0,
      cellType: "markdown",
      violationId: "image-missing-alt",
      issueContentRaw: targetMarkup,
      metadata: { offsetStart: start, offsetEnd: end },
    };

    const result = findImageCandidateForIssue(issue, cell, candidates);

    expect(result).toBeDefined();
    expect(result?.src).toBe("second.png");
    expect(result?.offsets).toEqual({ start, end });
  });

  it("rejects a finding when the image markup has changed", () => {
    const originalMarkup = "![](old.png)";
    const cell: IGeneralCell = {
      cellIndex: 0,
      type: "markdown",
      source: originalMarkup,
    };
    const issue: ICellIssue = {
      cellIndex: 0,
      cellType: "markdown",
      violationId: "image-missing-alt",
      issueContentRaw: originalMarkup,
      metadata: {
        offsetStart: 0,
        offsetEnd: originalMarkup.length,
      },
    };

    cell.source = "![](new.png)";
    const candidates = extractImageCandidates([cell]);

    const result = findImageCandidateForIssue(issue, cell, candidates);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].offsets).toEqual({
      start: 0,
      end: originalMarkup.length,
    });
    expect(result).toBeUndefined();
  });
});

describe("findCurrentCodeOutputCandidate", () => {
  function createCell(): IGeneralCell {
    return {
      cellIndex: 2,
      type: "code",
      source: "display(first_image, second_image)",
      outputs: [
        { output_type: "display_data", data: { "image/png": "first-payload" } },
        {
          output_type: "display_data",
          data: { "image/png": "second-payload" },
        },
      ],
    };
  }

  it("selects the second output independently from the first", () => {
    const cell = createCell();
    const selected = extractImageCandidates([cell])[1];
    const result = findCurrentCodeOutputCandidate(selected, cell);
    expect(result?.outputIndex).toBe(1);
    expect(result?.src).toBe("second-payload");
  });

  it("accepts output index zero", () => {
    const cell = createCell();
    const selected = extractImageCandidates([cell])[0];
    expect(findCurrentCodeOutputCandidate(selected, cell)?.outputIndex).toBe(0);
  });

  it("rejects changed image data at the same output index", () => {
    const cell = createCell();
    const selected = extractImageCandidates([cell])[1];
    cell.outputs![1].data!["image/png"] = "changed-payload";
    expect(findCurrentCodeOutputCandidate(selected, cell)).toBeUndefined();
  });

  it("rejects a removed output", () => {
    const cell = createCell();
    const selected = extractImageCandidates([cell])[1];
    cell.outputs = [];
    expect(findCurrentCodeOutputCandidate(selected, cell)).toBeUndefined();
  });

  it("rejects an output from a different cell", () => {
    const cell = createCell();
    const selected = extractImageCandidates([cell])[1];
    cell.cellIndex = 3;
    expect(findCurrentCodeOutputCandidate(selected, cell)).toBeUndefined();
  });
});
