import { describe, expect, it } from "vitest";
import type { IContextPackage } from "../types.js";
import { formatContext } from "../utils/context-formatting.js";
import { selectMinimalContext } from "../utils/context-selection.js";

describe("formatContext", () => {
  it.each(["Sales chart", ""])(
    "preserves single-cell text exactly: %j",
    (text) => {
      const context: IContextPackage = {
        strategy: "minimal",
        cells: [{ cellIndex: 4, text, reason: "current-cell" }],
        truncated: false,
        characterCount: text.length,
      };

      expect(formatContext(context)).toBe(text);
    },
  );

  it("labels multiple entries and preserves selected order without mutation", () => {
    const context: IContextPackage = {
      strategy: "structure-aware",
      cells: [
        { cellIndex: 4, text: "Sales chart", reason: "current-cell" },
        { cellIndex: 2, text: "# Revenue", reason: "section-heading" },
      ],
      truncated: false,
      characterCount: 20,
    };
    const original = structuredClone(context);

    expect(formatContext(context)).toBe(
      "Cell 4 — current-cell\nSales chart\n\n" +
        "Cell 2 — section-heading\n# Revenue",
    );
    expect(context).toEqual(original);
  });

  it("preserves empty text selected by a zero budget", () => {
    const context = selectMinimalContext(
      {
        cellIndex: 4,
        sourceType: "markdown-inline",
        src: "chart.png",
        altState: "empty",
      },
      [{ cellIndex: 4, type: "markdown", source: "Sales chart" }],
      0,
    );

    expect(formatContext(context)).toBe("");
  });
});
