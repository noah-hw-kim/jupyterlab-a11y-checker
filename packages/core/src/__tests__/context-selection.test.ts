import { describe, expect, it } from "vitest";
import type { IGeneralCell, IImageCandidate } from "../types.js";
import {
  selectFixedWindowContext,
  selectLargestPracticalContext,
  selectMinimalContext,
} from "../utils/context-selection.js";

const candidate: IImageCandidate = {
  cellIndex: 4,
  sourceType: "markdown-inline",
  src: "chart.png",
  altState: "missing",
};

describe("selectMinimalContext", () => {
  it("selects only the matching cell by identity without changing inputs", () => {
    const cells: IGeneralCell[] = [
      { cellIndex: 3, type: "markdown", source: "Previous discussion" },
      { cellIndex: 4, type: "markdown", source: "Sales chart" },
      { cellIndex: 5, type: "code", source: "print('next cell')" },
    ];
    const originalCells = structuredClone(cells);
    const originalCandidate = structuredClone(candidate);

    expect(selectMinimalContext(candidate, cells, 20)).toEqual({
      strategy: "minimal",
      cells: [{ cellIndex: 4, text: "Sales chart", reason: "current-cell" }],
      truncated: false,
      characterCount: 11,
    });
    expect(cells).toEqual(originalCells);
    expect(candidate).toEqual(originalCandidate);
  });

  it.each([
    {
      source: "Sales chart",
      budget: 11,
      text: "Sales chart",
      truncated: false,
    },
    { source: "Sales chart", budget: 5, text: "Sales", truncated: true },
    { source: "Sales chart", budget: 0, text: "", truncated: true },
    { source: "", budget: 5, text: "", truncated: false },
    { source: "", budget: 0, text: "", truncated: false },
  ])(
    "selects '$text' from '$source' with budget $budget (truncated: $truncated)",
    ({ source, budget, text, truncated }) => {
      const cell: IGeneralCell = { cellIndex: 4, type: "code", source };

      expect(selectMinimalContext(candidate, [cell], budget)).toEqual({
        strategy: "minimal",
        cells: [{ cellIndex: 4, text, reason: "current-cell" }],
        truncated,
        characterCount: text.length,
      });
    },
  );

  it.each([-1, 1.5, NaN, Infinity])("rejects invalid budget %s", (budget) => {
    const cell: IGeneralCell = {
      cellIndex: 4,
      type: "markdown",
      source: "Sales chart",
    };

    expect(() => selectMinimalContext(candidate, [cell], budget)).toThrow(
      /characterBudget must be a nonnegative integer/,
    );
  });

  it("rejects a missing current cell instead of selecting another cell", () => {
    const cells: IGeneralCell[] = [
      { cellIndex: 3, type: "markdown", source: "Another cell" },
    ];

    expect(() => selectMinimalContext(candidate, cells, 20)).toThrow(
      /no cell found with cellIndex 4/,
    );
  });
});

describe("selectFixedWindowContext", () => {
  const notebook: IGeneralCell[] = [
    { cellIndex: 0, type: "markdown", source: "Cell 0 intro" },
    { cellIndex: 1, type: "code", source: "import pandas as pd" },
    { cellIndex: 2, type: "markdown", source: "Cell 2 discussion" },
    { cellIndex: 3, type: "code", source: "data = [1, 2, 3]" },
    { cellIndex: 4, type: "markdown", source: "Sales chart ![](chart.png)" },
    { cellIndex: 5, type: "markdown", source: "Cell 5 analysis" },
    { cellIndex: 6, type: "code", source: "print('done')" },
    { cellIndex: 7, type: "markdown", source: "Cell 7 conclusion" },
  ];

  it("selects a full 5-cell window centered around current cell in notebook order", () => {
    const originalNotebook = structuredClone(notebook);
    const originalCandidate = structuredClone(candidate);

    const result = selectFixedWindowContext(candidate, notebook, 1000);

    expect(result).toEqual({
      strategy: "fixed-window",
      cells: [
        { cellIndex: 2, text: "Cell 2 discussion", reason: "preceding-cell" },
        { cellIndex: 3, text: "data = [1, 2, 3]", reason: "preceding-cell" },
        {
          cellIndex: 4,
          text: "Sales chart ![](chart.png)",
          reason: "current-cell",
        },
        { cellIndex: 5, text: "Cell 5 analysis", reason: "following-cell" },
        { cellIndex: 6, text: "print('done')", reason: "following-cell" },
      ],
      truncated: false,
      characterCount:
        "Cell 2 discussion".length +
        "data = [1, 2, 3]".length +
        "Sales chart ![](chart.png)".length +
        "Cell 5 analysis".length +
        "print('done')".length,
    });

    expect(notebook).toEqual(originalNotebook);
    expect(candidate).toEqual(originalCandidate);
  });

  it("handles start-of-notebook boundary (cell 0)", () => {
    const firstCellCandidate: IImageCandidate = {
      cellIndex: 0,
      sourceType: "markdown-inline",
      src: "intro.png",
      altState: "missing",
    };

    const result = selectFixedWindowContext(firstCellCandidate, notebook, 1000);

    expect(result.cells).toEqual([
      { cellIndex: 0, text: "Cell 0 intro", reason: "current-cell" },
      { cellIndex: 1, text: "import pandas as pd", reason: "following-cell" },
      { cellIndex: 2, text: "Cell 2 discussion", reason: "following-cell" },
    ]);
    expect(result.truncated).toBe(false);
  });

  it("handles end-of-notebook boundary (last cell)", () => {
    const lastCellCandidate: IImageCandidate = {
      cellIndex: 7,
      sourceType: "markdown-inline",
      src: "conclusion.png",
      altState: "missing",
    };

    const result = selectFixedWindowContext(lastCellCandidate, notebook, 1000);

    expect(result.cells).toEqual([
      { cellIndex: 5, text: "Cell 5 analysis", reason: "preceding-cell" },
      { cellIndex: 6, text: "print('done')", reason: "preceding-cell" },
      { cellIndex: 7, text: "Cell 7 conclusion", reason: "current-cell" },
    ]);
    expect(result.truncated).toBe(false);
  });

  it("handles notebooks smaller than 5 cells", () => {
    const smallNotebook: IGeneralCell[] = [
      { cellIndex: 0, type: "markdown", source: "Only cell 0" },
      { cellIndex: 1, type: "markdown", source: "Only cell 1" },
    ];
    const candidateOne: IImageCandidate = {
      cellIndex: 1,
      sourceType: "markdown-inline",
      src: "one.png",
      altState: "missing",
    };

    const result = selectFixedWindowContext(candidateOne, smallNotebook, 500);

    expect(result.cells).toEqual([
      { cellIndex: 0, text: "Only cell 0", reason: "preceding-cell" },
      { cellIndex: 1, text: "Only cell 1", reason: "current-cell" },
    ]);
    expect(result.truncated).toBe(false);
  });

  it("prioritizes current cell first, then closer neighbors, then outer neighbors on budget limits", () => {
    const currentLen = "Sales chart ![](chart.png)".length; // 26 chars
    const neighborMinus1Len = "data = [1, 2, 3]".length; // 16 chars

    // Budget fits current cell and only 5 chars of neighbor -1
    const tightBudget = currentLen + 5;
    const result = selectFixedWindowContext(candidate, notebook, tightBudget);

    expect(result.truncated).toBe(true);
    expect(result.characterCount).toBe(tightBudget);
    expect(result.cells).toEqual([
      { cellIndex: 3, text: "data ", reason: "preceding-cell" },
      {
        cellIndex: 4,
        text: "Sales chart ![](chart.png)",
        reason: "current-cell",
      },
    ]);
  });

  it("truncates current cell when budget is smaller than current cell length", () => {
    const result = selectFixedWindowContext(candidate, notebook, 5);

    expect(result.truncated).toBe(true);
    expect(result.characterCount).toBe(5);
    expect(result.cells).toEqual([
      { cellIndex: 4, text: "Sales", reason: "current-cell" },
    ]);
  });

  it.each([-1, 1.5, NaN, Infinity])(
    "rejects invalid characterBudget %s",
    (budget) => {
      expect(() =>
        selectFixedWindowContext(candidate, notebook, budget),
      ).toThrow(/characterBudget must be a nonnegative integer/);
    },
  );

  it("rejects candidate cell not found in cells list", () => {
    const missingCandidate: IImageCandidate = {
      cellIndex: 999,
      sourceType: "markdown-inline",
      src: "lost.png",
      altState: "missing",
    };

    expect(() =>
      selectFixedWindowContext(missingCandidate, notebook, 1000),
    ).toThrow(/no cell found with cellIndex 999/);
  });
});

describe("selectLargestPracticalContext", () => {
  const notebook: IGeneralCell[] = [
    { cellIndex: 0, type: "markdown", source: "Cell 0 intro" },
    { cellIndex: 1, type: "code", source: "import pandas as pd" },
    { cellIndex: 2, type: "markdown", source: "Sales chart ![](chart.png)" },
    { cellIndex: 3, type: "code", source: "print('done')" },
  ];
  const candidateTwo: IImageCandidate = {
    cellIndex: 2,
    sourceType: "markdown-inline",
    src: "chart.png",
    altState: "missing",
  };

  it("selects all notebook cells when budget is large enough", () => {
    const originalNotebook = structuredClone(notebook);
    const originalCandidate = structuredClone(candidateTwo);

    const totalChars = notebook.reduce((sum, c) => sum + c.source.length, 0);
    const result = selectLargestPracticalContext(
      candidateTwo,
      notebook,
      totalChars + 100,
    );

    expect(result).toEqual({
      strategy: "largest-practical",
      cells: [
        { cellIndex: 0, text: "Cell 0 intro", reason: "preceding-cell" },
        { cellIndex: 1, text: "import pandas as pd", reason: "preceding-cell" },
        {
          cellIndex: 2,
          text: "Sales chart ![](chart.png)",
          reason: "current-cell",
        },
        { cellIndex: 3, text: "print('done')", reason: "following-cell" },
      ],
      truncated: false,
      characterCount: totalChars,
    });

    expect(notebook).toEqual(originalNotebook);
    expect(candidateTwo).toEqual(originalCandidate);
  });

  it("prioritizes current cell first, then fills from cell 0 onwards", () => {
    const currentLen = "Sales chart ![](chart.png)".length; // 26 chars
    const cell0Len = "Cell 0 intro".length; // 12 chars

    // Budget fits current cell + cell 0 + 5 chars of cell 1
    const budget = currentLen + cell0Len + 5;
    const result = selectLargestPracticalContext(
      candidateTwo,
      notebook,
      budget,
    );

    expect(result.truncated).toBe(true);
    expect(result.characterCount).toBe(budget);
    expect(result.cells).toEqual([
      { cellIndex: 0, text: "Cell 0 intro", reason: "preceding-cell" },
      { cellIndex: 1, text: "impor", reason: "preceding-cell" },
      {
        cellIndex: 2,
        text: "Sales chart ![](chart.png)",
        reason: "current-cell",
      },
    ]);
  });

  it("truncates current cell when budget is smaller than current cell length", () => {
    const result = selectLargestPracticalContext(candidateTwo, notebook, 5);

    expect(result.truncated).toBe(true);
    expect(result.characterCount).toBe(5);
    expect(result.cells).toEqual([
      { cellIndex: 2, text: "Sales", reason: "current-cell" },
    ]);
  });

  it("skips empty cells without wasting budget", () => {
    const notebookWithEmpty: IGeneralCell[] = [
      { cellIndex: 0, type: "markdown", source: "" },
      { cellIndex: 1, type: "markdown", source: "Intro" },
      candidateTwo
        ? { cellIndex: 2, type: "markdown", source: "Image" }
        : null!,
    ];

    const result = selectLargestPracticalContext(
      candidateTwo,
      notebookWithEmpty,
      100,
    );

    expect(result.cells).toEqual([
      { cellIndex: 1, text: "Intro", reason: "preceding-cell" },
      { cellIndex: 2, text: "Image", reason: "current-cell" },
    ]);
    expect(result.truncated).toBe(false);
  });

  it.each([-1, 1.5, NaN, Infinity])(
    "rejects invalid characterBudget %s",
    (budget) => {
      expect(() =>
        selectLargestPracticalContext(candidateTwo, notebook, budget),
      ).toThrow(/characterBudget must be a nonnegative integer/);
    },
  );

  it("rejects candidate cell not found in cells list", () => {
    const missingCandidate: IImageCandidate = {
      cellIndex: 999,
      sourceType: "markdown-inline",
      src: "missing.png",
      altState: "missing",
    };

    expect(() =>
      selectLargestPracticalContext(missingCandidate, notebook, 1000),
    ).toThrow(/no cell found with cellIndex 999/);
  });
});
