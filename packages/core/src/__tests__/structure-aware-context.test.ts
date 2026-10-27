import { describe, expect, it } from "vitest";
import type { IGeneralCell, IImageCandidate } from "../types.js";
import { extractImageCandidates } from "../utils/image-utils.js";
import { selectStructureAwareContext } from "../utils/context-selection.js";

const cells: IGeneralCell[] = [
  { cellIndex: 0, type: "markdown", source: "# Sales" },
  { cellIndex: 1, type: "markdown", source: "Parent introduction" },
  { cellIndex: 2, type: "markdown", source: "## Quarterly revenue" },
  { cellIndex: 3, type: "markdown", source: "Before" },
  { cellIndex: 4, type: "markdown", source: "![](sales.png)" },
  { cellIndex: 5, type: "markdown", source: "After" },
  { cellIndex: 6, type: "code", source: "plot(sales)" },
  { cellIndex: 7, type: "markdown", source: "## Regional revenue" },
  { cellIndex: 8, type: "markdown", source: "Other topic" },
];
const candidate: IImageCandidate = {
  cellIndex: 4,
  sourceType: "markdown-inline",
  src: "sales.png",
  altState: "empty",
  offsets: { start: 0, end: 14 },
};

describe("selectStructureAwareContext", () => {
  it("selects the nearest section, Markdown, and code without parent or peer context", () => {
    const original = structuredClone(cells);
    const context = selectStructureAwareContext(candidate, cells, 1000);

    expect(context).toEqual({
      strategy: "structure-aware",
      cells: [
        { cellIndex: 4, text: "![](sales.png)", reason: "current-cell" },
        {
          cellIndex: 2,
          text: "## Quarterly revenue",
          reason: "section-heading",
        },
        { cellIndex: 3, text: "Before", reason: "same-section-markdown" },
        { cellIndex: 5, text: "After", reason: "same-section-markdown" },
        { cellIndex: 6, text: "plot(sales)", reason: "nearby-code" },
      ],
      truncated: false,
      characterCount: 56,
    });
    expect(cells).toEqual(original);
  });

  it.each([
    { budget: 0, texts: [""], truncated: true },
    { budget: 5, texts: ["![](s"], truncated: true },
    { budget: 16, texts: ["![](sales.png)", "##"], truncated: true },
    {
      budget: 56,
      texts: [
        "![](sales.png)",
        "## Quarterly revenue",
        "Before",
        "After",
        "plot(sales)",
      ],
      truncated: false,
    },
  ])(
    "preserves selection priority with budget $budget",
    ({ budget, texts, truncated }) => {
      const context = selectStructureAwareContext(candidate, cells, budget);

      expect(context.cells.map((cell) => cell.text)).toEqual(texts);
      expect(context.characterCount).toBe(budget);
      expect(context.truncated).toBe(truncated);
    },
  );

  it("uses producing code once for output images without selecting another code cell", () => {
    const notebook: IGeneralCell[] = [
      ...cells.slice(0, 7),
      { cellIndex: 7, type: "code", source: "another_plot()" },
    ];
    const context = selectStructureAwareContext(
      {
        cellIndex: 6,
        sourceType: "code-output",
        src: "dGVzdA==",
        mimeType: "image/png",
        altState: "missing",
      },
      notebook,
      1000,
    );

    expect(context.cells[0]).toEqual({
      cellIndex: 6,
      text: "plot(sales)",
      reason: "current-cell",
    });
    expect(context.cells.filter((cell) => cell.cellIndex === 6)).toHaveLength(
      1,
    );
    expect(context.cells.some((cell) => cell.reason === "nearby-code")).toBe(
      false,
    );
  });

  it.each(["## Peer", "# Parent peer"])(
    "stops at %s but allows a deeper subsection",
    (boundary) => {
      const notebook: IGeneralCell[] = [
        { cellIndex: 0, type: "markdown", source: "## Sales" },
        { cellIndex: 1, type: "markdown", source: "```\n# Example\n```" },
        { cellIndex: 2, type: "markdown", source: "![](sales.png)" },
        { cellIndex: 3, type: "markdown", source: "### Details" },
        { cellIndex: 4, type: "markdown", source: "Relevant detail" },
        { cellIndex: 5, type: "markdown", source: boundary },
        { cellIndex: 6, type: "code", source: "unrelated()" },
      ];

      const context = selectStructureAwareContext(
        { ...candidate, cellIndex: 2 },
        notebook,
        1000,
      );

      expect(context.cells.map((cell) => cell.cellIndex)).toEqual([2, 0, 1, 4]);
      expect(context.cells[1].reason).toBe("section-heading");
    },
  );

  it.each(["\n", "\r\n"])(
    "uses image offsets for sections inside one cell with line ending %j",
    (lineEnding) => {
      const notebook: IGeneralCell[] = [
        { cellIndex: 0, type: "markdown", source: "# Notebook" },
        { cellIndex: 1, type: "markdown", source: "Parent introduction" },
        {
          cellIndex: 2,
          type: "markdown",
          source: [
            "## Revenue",
            "",
            "![](sales.png)",
            "",
            "## Ages",
            "",
            "![](ages.png)",
          ].join(lineEnding),
        },
        { cellIndex: 3, type: "markdown", source: "Age discussion" },
        { cellIndex: 4, type: "code", source: "plot(ages)" },
        { cellIndex: 5, type: "markdown", source: "## Next section" },
      ];
      const [revenue, ages] = extractImageCandidates(notebook);

      const revenueContext = selectStructureAwareContext(
        revenue,
        notebook,
        1000,
      );
      const agesContext = selectStructureAwareContext(ages, notebook, 1000);

      expect(revenueContext.cells.map((cell) => cell.cellIndex)).toEqual([2]);
      expect(agesContext.cells.map((cell) => cell.cellIndex)).toEqual([
        2, 3, 4,
      ]);
      // Full current-cell text remains intentionally included for either image.
      expect(revenueContext.cells[0].text).toBe(notebook[2].source);
      expect(agesContext.cells[0].text).toBe(notebook[2].source);
    },
  );

  it("recognizes Setext headings without treating a math block as a heading", () => {
    const notebook: IGeneralCell[] = [
      { cellIndex: 0, type: "markdown", source: "Revenue\n=======" },
      { cellIndex: 1, type: "markdown", source: "$$\nx = y\n---\n$$" },
      { cellIndex: 2, type: "markdown", source: "![](sales.png)" },
    ];

    const context = selectStructureAwareContext(
      { ...candidate, cellIndex: 2 },
      notebook,
      1000,
    );

    expect(context.cells[1]).toEqual({
      cellIndex: 0,
      text: "Revenue\n=======",
      reason: "section-heading",
    });
  });

  it("keeps preamble context before the first heading and supports non-positional indices", () => {
    const notebook: IGeneralCell[] = [
      { cellIndex: 10, type: "markdown", source: "![](sales.png)" },
      { cellIndex: 20, type: "markdown", source: "Introduction" },
      { cellIndex: 30, type: "markdown", source: "# Another section" },
      { cellIndex: 40, type: "code", source: "unrelated()" },
    ];

    const context = selectStructureAwareContext(
      { ...candidate, cellIndex: 10 },
      notebook,
      1000,
    );

    expect(context.cells.map((cell) => cell.cellIndex)).toEqual([10, 20]);
  });

  it.each([-1, 1.5])("rejects invalid budget %s", (budget) => {
    expect(() => selectStructureAwareContext(candidate, cells, budget)).toThrow(
      /nonnegative integer/,
    );
  });

  it("rejects a missing current cell", () => {
    expect(() =>
      selectStructureAwareContext({ ...candidate, cellIndex: 99 }, cells, 1000),
    ).toThrow(/no cell found/);
  });

  it("requires a usable image offset when the current Markdown cell has headings", () => {
    const notebook: IGeneralCell[] = [
      {
        cellIndex: 4,
        type: "markdown",
        source: "## Revenue\n\n![](sales.png)",
      },
    ];

    expect(() =>
      selectStructureAwareContext(
        { ...candidate, offsets: undefined },
        notebook,
        1000,
      ),
    ).toThrow(/image source offsets/);
    expect(() =>
      selectStructureAwareContext(
        { ...candidate, offsets: { start: -1, end: 0 } },
        notebook,
        1000,
      ),
    ).toThrow(/image source offsets/);
  });
});
